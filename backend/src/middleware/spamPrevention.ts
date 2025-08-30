import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';

interface SpamTracker {
  messageHistory: { content: string; timestamp: Date }[];
  lastMessages: Date[];
  lastViolation: Date;
  violations: number;
  sessionId?: string; // Track current session
  warningsSent: number;
}

class SpamPreventionService {
  private spamTrackers = new Map<string, SpamTracker>();
  private readonly MAX_DUPLICATE_MESSAGES = 5;
  private readonly DUPLICATE_WINDOW_MS = 1 * 60 * 1000; // 1 minute
  private readonly MAX_RAPID_MESSAGES = 10; // 10
  private readonly RAPID_FIRE_WINDOW_MS = 30 * 1000; // 30 seconds
  private readonly MAX_VIOLATIONS = 5; // 5
  private readonly VIOLATION_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
  private readonly MESSAGE_HISTORY_LIMIT = 20; // 20
  private readonly MAX_WARNINGS = 2;

  constructor() {
    // Clean up old spam trackers every 5 minutes
    setInterval(() => {
      this.cleanupOldTrackers();
    }, 5 * 60 * 1000);
  }

  // Check if a message should be allowed
  public checkMessage(identifier: string, content: string, sessionId?: string): { 
    allowed: boolean; 
    reason?: string; 
    action?: 'warn' | 'block' | 'restrict';
    timeRemaining?: number;
  } {
    const tracker = this.getOrCreateTracker(identifier);
    const now = new Date();
    const normalizedContent = this.normalizeContent(content);

    // Reset tracker if new session
    if (sessionId && tracker.sessionId !== sessionId) {
      this.resetTrackerForNewSession(tracker, sessionId);
    }

    // Check if user is currently in cooldown
    if (this.isInCooldown(tracker, now)) {
      const timeRemaining = this.getCooldownTimeRemaining(tracker, now);
      return {
        allowed: false,
        reason: `Please wait ${Math.ceil(timeRemaining / 1000)} seconds before sending another message`,
        action: 'restrict',
        timeRemaining
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
  public checkAPISpam(identifier: string): {
    allowed: boolean;
    reason?: string;
    timeRemaining?: number;
  } {
    const tracker = this.getOrCreateTracker(identifier);
    const now = new Date();

    // Check if user is in cooldown
    if (this.isInCooldown(tracker, now)) {
      const timeRemaining = this.getCooldownTimeRemaining(tracker, now);
      return {
        allowed: false,
        reason: `API access temporarily restricted. Please wait ${Math.ceil(timeRemaining / 1000)} seconds.`,
        timeRemaining
      };
    }

    return { allowed: true };
  }

  // Record a spam violation
  public recordViolation(tracker: SpamTracker, timestamp: Date = new Date()): void {
    tracker.violations++;
    tracker.lastViolation = timestamp;
  }

  // Reset tracker for new session
  private resetTrackerForNewSession(tracker: SpamTracker, sessionId: string): void {
    tracker.sessionId = sessionId;
    tracker.messageHistory = [];
    tracker.lastMessages = [];
    tracker.warningsSent = 0;
    // Keep violations but reduce them by half for new session
    tracker.violations = Math.floor(tracker.violations / 2);
  }

  // Check if user is currently in cooldown
  private isInCooldown(tracker: SpamTracker, now: Date): boolean {
    if (tracker.violations < this.MAX_VIOLATIONS) {
      return false;
    }

    // Check if cooldown period has passed
    const timeSinceLastViolation = now.getTime() - tracker.lastViolation.getTime();
    return timeSinceLastViolation < this.VIOLATION_COOLDOWN_MS;
  }

  // Get remaining cooldown time
  private getCooldownTimeRemaining(tracker: SpamTracker, now: Date): number {
    const timeSinceLastViolation = now.getTime() - tracker.lastViolation.getTime();
    return Math.max(0, this.VIOLATION_COOLDOWN_MS - timeSinceLastViolation);
  }

  // Check for duplicate messages
  private checkDuplicateMessage(tracker: SpamTracker, content: string, now: Date): {
    allowed: boolean;
    reason?: string;
    action?: 'warn' | 'block'
  } {
    // Clean old messages outside the duplicate window
    tracker.messageHistory = tracker.messageHistory.filter(
      msg => now.getTime() - msg.timestamp.getTime() < this.DUPLICATE_WINDOW_MS
    );
    
    // Count duplicates within the time window
    const recentDuplicates = tracker.messageHistory.filter(msg => msg.content === content).length;
    
    if (recentDuplicates >= this.MAX_DUPLICATE_MESSAGES) {
      
      // First time - give a warning
      if (tracker.warningsSent < this.MAX_WARNINGS) {
        tracker.warningsSent++;
        return {
          allowed: true, // Allow but warn
          reason: `Please avoid repeating the same message. Warning ${tracker.warningsSent}/${this.MAX_WARNINGS}`,
          action: 'warn'
        };
      }
      
      return {
        allowed: false,
        reason: `Too many duplicate messages. Please wait before sending similar content.`,
        action: 'block'
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
      
      // First time - give a warning
      if (tracker.warningsSent < this.MAX_WARNINGS) {
        tracker.warningsSent++;
        return {
          allowed: true, // Allow but warn
          reason: `You're sending messages quickly. Please slow down. Warning ${tracker.warningsSent}/${this.MAX_WARNINGS}`,
          action: 'warn'
        };
      }
      
      return {
        allowed: false,
        reason: `Sending messages too quickly. Please wait a moment before sending another message.`,
        action: 'block'
      };
    }

    return { allowed: true };
  }

  // Update tracker with new message
  private updateTracker(tracker: SpamTracker, content: string, timestamp: Date): void {
    // Add to message history with timestamp
    tracker.messageHistory.push({ content, timestamp });
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
        lastViolation: new Date(0),
        violations: 0,
        warningsSent: 0
      };
      this.spamTrackers.set(identifier, tracker);
    }

    return tracker;
  }

  // Clean up old trackers
  private cleanupOldTrackers(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.VIOLATION_COOLDOWN_MS * 3; // Keep for 3x the cooldown period

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

  // Reset spam tracking for a user (useful when session ends)
  public resetUserTracking(identifier: string): void {
    const tracker = this.spamTrackers.get(identifier);
    if (tracker) {
      // Soft reset - keep some violation history but reset session-specific data
      tracker.messageHistory = [];
      tracker.lastMessages = [];
      tracker.warningsSent = 0;
      tracker.sessionId = undefined;
      // Reduce violations by half
      tracker.violations = Math.floor(tracker.violations / 2);
    }
  }

  // Clear all tracking for a user (complete reset)
  public clearUserTracking(identifier: string): void {
    this.spamTrackers.delete(identifier);
  }

  // Get spam prevention stats
  public getSpamStats() {
    const stats = {
      totalTrackedUsers: this.spamTrackers.size,
      usersInCooldown: 0,
      totalViolations: 0,
      recentViolations: 0,
      totalWarnings: 0
    };

    const now = new Date();
    const recentWindow = now.getTime() - (60 * 60 * 1000); // 1 hour

    for (const tracker of this.spamTrackers.values()) {
      if (this.isInCooldown(tracker, now)) {
        stats.usersInCooldown++;
      }
      stats.totalViolations += tracker.violations;
      stats.totalWarnings += tracker.warningsSent;
      if (tracker.lastViolation.getTime() > recentWindow) {
        stats.recentViolations++;
      }
    }

    return stats;
  }

  // Get user spam status
  public getUserSpamStatus(identifier: string): {
    isInCooldown: boolean;
    violations: number;
    warningsSent: number;
    cooldownEndsAt?: Date;
    timeRemaining?: number;
  } {
    const tracker = this.spamTrackers.get(identifier);
    
    if (!tracker) {
      return {
        isInCooldown: false,
        violations: 0,
        warningsSent: 0
      };
    }

    const now = new Date();
    const isInCooldown = this.isInCooldown(tracker, now);
    const timeRemaining = isInCooldown ? this.getCooldownTimeRemaining(tracker, now) : 0;
    
    return {
      isInCooldown,
      violations: tracker.violations,
      warningsSent: tracker.warningsSent,
      cooldownEndsAt: isInCooldown ? 
        new Date(tracker.lastViolation.getTime() + this.VIOLATION_COOLDOWN_MS) : 
        undefined,
      timeRemaining
    };
  }
}

// Singleton instance
export const spamPreventionService = new SpamPreventionService();

// Express middleware for API spam prevention
export const apiSpamPrevention = (req: Request, res: Response, next: NextFunction) => {
  const identifier = req.ip || 'unknown';

  const { allowed, reason } = spamPreventionService.checkAPISpam(identifier);

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
export const checkSocketMessageSpam = (socket: Socket, content: string, sessionId?: string): {
  allowed: boolean;
  reason?: string;
  action?: 'warn' | 'block' | 'restrict';
  timeRemaining?: number;
} => {
  const identifier = socket.id;
  return spamPreventionService.checkMessage(identifier, content, sessionId);
};

// Reset spam tracking when session ends
export const resetSpamTrackingForSocket = (socketId: string): void => {
  spamPreventionService.resetUserTracking(socketId);
};

// Clear all spam tracking for a socket
export const clearSpamTrackingForSocket = (socketId: string): void => {
  spamPreventionService.clearUserTracking(socketId);
};