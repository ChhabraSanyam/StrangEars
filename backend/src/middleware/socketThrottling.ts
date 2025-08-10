import { Socket } from 'socket.io';

interface ConnectionTracker {
  connections: number;
  lastConnection: Date;
  messageCount: number;
  lastMessage: Date;
  violations: number;
}

class SocketThrottlingService {
  private connectionTracker = new Map<string, ConnectionTracker>();
  private readonly MAX_CONNECTIONS_PER_IP = 5;
  private readonly CONNECTION_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_MESSAGES_PER_MINUTE = 60;
  private readonly MESSAGE_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_VIOLATIONS = 3;
  private readonly VIOLATION_RESET_MS = 15 * 60 * 1000; // 15 minutes

  constructor() {
    // Clean up old tracking data every 5 minutes
    setInterval(() => {
      this.cleanupOldTrackers();
    }, 5 * 60 * 1000);
  }

  // Check if a new connection should be allowed
  public checkConnectionLimit(ip: string): { allowed: boolean; reason?: string } {
    const tracker = this.getOrCreateTracker(ip);
    const now = new Date();

    // Reset connection count if window has passed
    if (now.getTime() - tracker.lastConnection.getTime() > this.CONNECTION_WINDOW_MS) {
      tracker.connections = 0;
    }

    // Check violation count
    if (tracker.violations >= this.MAX_VIOLATIONS) {
      return {
        allowed: false,
        reason: `IP temporarily blocked due to ${this.MAX_VIOLATIONS} violations. Try again later.`
      };
    }

    // Check connection limit
    if (tracker.connections >= this.MAX_CONNECTIONS_PER_IP) {
      tracker.violations++;
      return {
        allowed: false,
        reason: `Too many connections from this IP. Maximum ${this.MAX_CONNECTIONS_PER_IP} connections per minute.`
      };
    }

    // Allow connection and update tracker
    tracker.connections++;
    tracker.lastConnection = now;
    return { allowed: true };
  }

  // Check if a message should be allowed
  public checkMessageLimit(ip: string): { allowed: boolean; reason?: string } {
    const tracker = this.getOrCreateTracker(ip);
    const now = new Date();

    // Reset message count if window has passed
    if (now.getTime() - tracker.lastMessage.getTime() > this.MESSAGE_WINDOW_MS) {
      tracker.messageCount = 0;
    }

    // Check violation count
    if (tracker.violations >= this.MAX_VIOLATIONS) {
      return {
        allowed: false,
        reason: `IP temporarily blocked due to violations.`
      };
    }

    // Check message limit
    if (tracker.messageCount >= this.MAX_MESSAGES_PER_MINUTE) {
      tracker.violations++;
      return {
        allowed: false,
        reason: `Too many messages from this IP. Maximum ${this.MAX_MESSAGES_PER_MINUTE} messages per minute.`
      };
    }

    // Allow message and update tracker
    tracker.messageCount++;
    tracker.lastMessage = now;
    return { allowed: true };
  }

  // Record a violation for an IP
  public recordViolation(ip: string): void {
    const tracker = this.getOrCreateTracker(ip);
    tracker.violations++;
  }

  // Get connection stats for an IP
  public getConnectionStats(ip: string): ConnectionTracker | null {
    return this.connectionTracker.get(ip) || null;
  }

  private getOrCreateTracker(ip: string): ConnectionTracker {
    let tracker = this.connectionTracker.get(ip);
    
    if (!tracker) {
      tracker = {
        connections: 0,
        lastConnection: new Date(0),
        messageCount: 0,
        lastMessage: new Date(0),
        violations: 0
      };
      this.connectionTracker.set(ip, tracker);
    }

    return tracker;
  }

  private cleanupOldTrackers(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.VIOLATION_RESET_MS;

    for (const [ip, tracker] of this.connectionTracker.entries()) {
      // Remove trackers that haven't been active and have no recent violations
      const lastActivity = Math.max(
        tracker.lastConnection.getTime(),
        tracker.lastMessage.getTime()
      );

      if (lastActivity < cutoffTime && tracker.violations === 0) {
        this.connectionTracker.delete(ip);
      } else if (lastActivity < cutoffTime) {
        // Reset violations for old trackers
        tracker.violations = 0;
      }
    }
  }

  // Get overall throttling stats
  public getThrottlingStats() {
    const stats = {
      totalTrackedIPs: this.connectionTracker.size,
      violatedIPs: 0,
      activeConnections: 0,
      recentMessages: 0
    };

    const now = new Date();
    const recentWindow = now.getTime() - this.MESSAGE_WINDOW_MS;

    for (const tracker of this.connectionTracker.values()) {
      if (tracker.violations > 0) {
        stats.violatedIPs++;
      }
      if (tracker.lastConnection.getTime() > recentWindow) {
        stats.activeConnections += tracker.connections;
      }
      if (tracker.lastMessage.getTime() > recentWindow) {
        stats.recentMessages += tracker.messageCount;
      }
    }

    return stats;
  }
}

// Singleton instance
export const socketThrottlingService = new SocketThrottlingService();

// Middleware function for Socket.IO
export const socketConnectionThrottle = (socket: Socket, next: (err?: Error) => void) => {
  const ip = socket.handshake.address;
  
  if (!ip) {
    return next(new Error('Unable to determine client IP'));
  }

  const { allowed, reason } = socketThrottlingService.checkConnectionLimit(ip);
  
  if (!allowed) {
    console.warn(`Socket connection throttled for IP ${ip}: ${reason}`);
    return next(new Error(reason));
  }

  next();
};

// Message throttling helper for socket events
export const checkMessageThrottle = (socket: Socket): { allowed: boolean; reason?: string } => {
  const ip = socket.handshake.address;
  
  if (!ip) {
    return {
      allowed: false,
      reason: 'Unable to determine client IP'
    };
  }

  return socketThrottlingService.checkMessageLimit(ip);
};