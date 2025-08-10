import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';

interface SpamTracker {
  messageHistory: string[];
  lastMessages: Date[];
  duplicateCount: number;
  rapidFireCount: number;
  lastViolation: Date;
  violations: number;
}

class SpamPreventionService {
  private spamTrackers = new Map<string, SpamTracker>();
  private readonly MAX_DUPLICATE_MESSAGES = 3;
  private readonly DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RAPID_MESSAGES = 10;
  private readonly RAPID_FIRE_WINDOW_MS = 30 * 1000; // 30 seconds
  private readonly MAX_VIOLATIONS = 5;
  private readonly VIOLATION_RESET_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MESSAGE_HISTORY_LIMIT = 20;

  constructor() {
    // Clean up old spam trackers every 10 minutes
    setInterval(() => {
      this.cleanupOldTrackers();
    }, 10 * 60 * 1000);
  }

  // Check if a message should be allowed
  public checkMessage(identifier: string, content: string): { 
    allowed: boolean; 
    reason?: string; 
    action?: 'warn' | 'block' | 'restrict' 
  } {
    const tracker = this.getOrCreateTracker(identifier);
    const now = new Date();
    const normalizedContent = this.normalizeContent(content);

    // Check if user is currently restricted due to violations
    if (this.isRestricted(tracker, now)) {
      return {
        allowed: false,
        reason: 'Temporarily restricted due to spam violations',
        action: 'restrict'
      };
    }

    // Check for duplicate messages
    const duplicateCheck = this.checkDuplicateMessage(tracker, normalizedContent, now);
    if (!duplicateCheck.allowed) {
      this.recordViolation(tracker, now);
      return duplicateCheck;
    }

    // Check for rapid fire messaging
    const rapidFireCheck = this.checkRapidFire(tracker, now);
    if (!rapidFireCheck.allowed) {
      this.recordViolation(tracker, now);
      return rapidFireCheck;
    }

    // Message is allowed - update tracker
    this.updateTracker(tracker, normalizedContent, now);
    return { allowed: true };
  }

  // Check for suspicious patterns in API requests
  public checkAPISpam(identifier: string, endpoint: string): {
    allowed: boolean;
    reason?: string;
  } {
    const tracker = this.getOrCreateTracker(identifier);
    const now = new Date();

    // Check if user is restricted
    if (this.isRestricted(tracker, now)) {
      return {
        allowed: false,
        reason: 'API access temporarily restricted due to spam violations'
      };
    }

    return { allowed: true };
  }

  // Record a spam violation
  public recordViolation(tracker: SpamTracker, timestamp: Date = new Date()): void {
    tracker.violations++;
    tracker.lastViolation = timestamp;
  }

  // Check if user is currently restricted
  private isRestricted(tracker: SpamTracker, now: Date): boolean {
    if (tracker.violations < this.MAX_VIOLATIONS) {
      return false;
    }

    // Check if restriction period has passed
    const timeSinceLastViolation = now.getTime() - tracker.lastViolation.getTime();
    return timeSinceLastViolation < this.VIOLATION_RESET_MS;
  }

  // Check for duplicate messages
  private checkDuplicateMessage(tracker: SpamTracker, content: string, now: Date): {
    allowed: boolean;
    reason?: string;
    action?: 'warn' | 'block'
  } {
    // Count recent duplicate messages
    const recentDuplicates = tracker.messageHistory.filter(msg => msg === content).length;
    
    if (recentDuplicates >= this.MAX_DUPLICATE_MESSAGES) {
      tracker.duplicateCount++;
      return {
        allowed: false,
        reason: `Duplicate message detected. Please avoid repeating the same message.`,
        action: tracker.duplicateCount > 1 ? 'block' : 'warn'
      };
    }

    return { allowed: true };
  }

  // Check for rapid fire messaging
  private checkRapidFire(tracker: SpamTracker, now: Date): {
    allowed: boolean;
    reason?: string;
    action?: 'warn' | 'block'
  } {
    // Clean old timestamps
    tracker.lastMessages = tracker.lastMessages.filter(
      timestamp => now.getTime() - timestamp.getTime() < this.RAPID_FIRE_WINDOW_MS
    );

    if (tracker.lastMessages.length >= this.MAX_RAPID_MESSAGES) {
      tracker.rapidFireCount++;
      return {
        allowed: false,
        reason: `Sending messages too quickly. Please slow down.`,
        action: tracker.rapidFireCount > 2 ? 'block' : 'warn'
      };
    }

    return { allowed: true };
  }

  // Update tracker with new message
  private updateTracker(tracker: SpamTracker, content: string, timestamp: Date): void {
    // Add to message history
    tracker.messageHistory.push(content);
    if (tracker.messageHistory.length > this.MESSAGE_HISTORY_LIMIT) {
      tracker.messageHistory.shift();
    }

    // Add to timestamp history
    tracker.lastMessages.push(timestamp);
    if (tracker.lastMessages.length > this.MAX_RAPID_MESSAGES) {
      tracker.lastMessages.shift();
    }
  }

  // Normalize content for comparison
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  // Get or create spam tracker
  private getOrCreateTracker(identifier: string): SpamTracker {
    let tracker = this.spamTrackers.get(identifier);
    
    if (!tracker) {
      tracker = {
        messageHistory: [],
        lastMessages: [],
        duplicateCount: 0,
        rapidFireCount: 0,
        lastViolation: new Date(0),
        violations: 0
      };
      this.spamTrackers.set(identifier, tracker);
    }

    return tracker;
  }

  // Clean up old trackers
  private cleanupOldTrackers(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.VIOLATION_RESET_MS * 2; // Keep for twice the reset period

    for (const [identifier, tracker] of this.spamTrackers.entries()) {
      const lastActivity = Math.max(
        tracker.lastViolation.getTime(),
        tracker.lastMessages.length > 0 ? 
          Math.max(...tracker.lastMessages.map(d => d.getTime())) : 0
      );

      if (lastActivity < cutoffTime) {
        this.spamTrackers.delete(identifier);
      }
    }
  }

  // Get spam prevention stats
  public getSpamStats() {
    const stats = {
      totalTrackedUsers: this.spamTrackers.size,
      restrictedUsers: 0,
      totalViolations: 0,
      recentViolations: 0
    };

    const now = new Date();
    const recentWindow = now.getTime() - (60 * 60 * 1000); // 1 hour

    for (const tracker of this.spamTrackers.values()) {
      if (this.isRestricted(tracker, now)) {
        stats.restrictedUsers++;
      }
      stats.totalViolations += tracker.violations;
      if (tracker.lastViolation.getTime() > recentWindow) {
        stats.recentViolations++;
      }
    }

    return stats;
  }

  // Get user spam status
  public getUserSpamStatus(identifier: string): {
    isRestricted: boolean;
    violations: number;
    duplicateCount: number;
    rapidFireCount: number;
    restrictionEndsAt?: Date;
  } {
    const tracker = this.spamTrackers.get(identifier);
    
    if (!tracker) {
      return {
        isRestricted: false,
        violations: 0,
        duplicateCount: 0,
        rapidFireCount: 0
      };
    }

    const now = new Date();
    const isRestricted = this.isRestricted(tracker, now);
    
    return {
      isRestricted,
      violations: tracker.violations,
      duplicateCount: tracker.duplicateCount,
      rapidFireCount: tracker.rapidFireCount,
      restrictionEndsAt: isRestricted ? 
        new Date(tracker.lastViolation.getTime() + this.VIOLATION_RESET_MS) : 
        undefined
    };
  }
}

// Singleton instance
export const spamPreventionService = new SpamPreventionService();

// Express middleware for API spam prevention
export const apiSpamPrevention = (req: Request, res: Response, next: NextFunction) => {
  const identifier = req.ip || 'unknown';
  const endpoint = req.path;

  const { allowed, reason } = spamPreventionService.checkAPISpam(identifier, endpoint);

  if (!allowed) {
    return res.status(429).json({
      error: 'SpamDetected',
      message: reason,
      code: 429,
      timestamp: new Date()
    });
  }

  next();
};

// Socket message spam prevention helper
export const checkSocketMessageSpam = (socket: Socket, content: string): {
  allowed: boolean;
  reason?: string;
  action?: 'warn' | 'block' | 'restrict';
} => {
  const identifier = socket.id;
  return spamPreventionService.checkMessage(identifier, content);
};