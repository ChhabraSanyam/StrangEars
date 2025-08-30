import { v4 as uuidv4 } from 'uuid';
import { reportService } from './reportService';

export interface QueueEntry {
  socketId: string;
  type: 'venter' | 'listener';
  joinedAt: Date;
  timeoutId?: NodeJS.Timeout;
}

export interface MatchResult {
  sessionId: string;
  venterSocketId: string;
  listenerSocketId: string;
}

class MatchingService {
  private venterQueue: QueueEntry[] = [];
  private listenerQueue: QueueEntry[] = [];
  private QUEUE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private socketService: any = null; // Will be set by SocketService
  private useRedis: boolean = false;
  private redisQueueManager: any = null;

  constructor() {
    this.initializeRedisQueue();
  }

  private async initializeRedisQueue(): Promise<void> {
    try {
      const { redisQueueManager } = await import('./redisQueueManager');
      this.redisQueueManager = redisQueueManager;
      
      // Test Redis queue operations
      const isHealthy = await this.redisQueueManager.healthCheck();
      if (!isHealthy) {
        console.warn('Redis queue health check failed, falling back to in-memory queues');
        this.useRedis = false;
      } else {
        console.log('Redis queue manager initialized successfully');
        this.useRedis = true;
      }
    } catch (error) {
      console.error('Failed to initialize Redis queue manager, using in-memory fallback:', error);
      this.useRedis = false;
    }
  }

  /**
   * Set the socket service reference for notifications
   */
  public setSocketService(socketService: any): void {
    this.socketService = socketService;
  }

  /**
   * Add a user to the appropriate queue and attempt to find a match
   */
  public async addToQueue(socketId: string, userType: 'venter' | 'listener', userSessionId?: string): Promise<MatchResult | null> {
    // Check if user is restricted before adding to queue
    if (userSessionId) {
      try {
        const restriction = await reportService.isUserRestrictedByUserSessionId(userSessionId);
        
        if (restriction) {
          console.log(`Blocked restricted user ${userSessionId} from joining queue. Restriction: ${restriction.restrictionType}`);
          
          // Calculate remaining time for temporary restrictions
          let timeRemaining = '';
          if (restriction.endTime) {
            const remainingMs = restriction.endTime.getTime() - Date.now();
            if (remainingMs > 0) {
              const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
              if (remainingMinutes < 60) {
                timeRemaining = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
              } else {
                const remainingHours = Math.ceil(remainingMinutes / 60);
                timeRemaining = `${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
              }
            }
          }
          
          const errorMessage = restriction.restrictionType === 'permanent_ban' 
            ? 'Your account has been permanently restricted due to multiple reports.'
            : `You are temporarily restricted from joining sessions${timeRemaining ? ` for ${timeRemaining}` : ''}. This restriction was applied due to reported behavior.`;
            
          const { AppError } = await import('../middleware/errorHandler');
          throw new AppError(errorMessage, 403);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('restricted')) {
          throw error; // Re-throw restriction errors
        }
        console.warn('Could not check user restriction status:', error);
        // Continue with matching if restriction check fails
      }
    } else {
      console.warn('No userSessionId provided for restriction check, skipping restriction validation');
    }
    if (this.useRedis && this.redisQueueManager) {
      try {
        // Add to Redis queue
        await this.redisQueueManager.addToQueue(socketId, userType);
        
        // Try to match
        const match = await this.redisQueueManager.attemptMatch(userType);
        if (match && this.socketService) {
          // Notify via WebSocket
          await this.socketService.notifyMatch(match.venterSocketId, match.listenerSocketId, match.sessionId);
        }
        return match;
      } catch (error) {
        console.error('Failed to add to Redis queue, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory queue
    const entry: QueueEntry = {
      socketId,
      type: userType,
      joinedAt: new Date()
    };

    // Set timeout for queue cleanup
    entry.timeoutId = setTimeout(() => {
      this.removeFromQueue(socketId);
    }, this.QUEUE_TIMEOUT);

    if (userType === 'venter') {
      this.venterQueue.push(entry);
      // Try to match with a listener
      const match = this.attemptMatch('venter');
      if (match && this.socketService) {
        // Notify via WebSocket
        await this.socketService.notifyMatch(match.venterSocketId, match.listenerSocketId, match.sessionId);
      }
      return match;
    } else {
      this.listenerQueue.push(entry);
      // Try to match with a venter
      const match = this.attemptMatch('listener');
      if (match && this.socketService) {
        // Notify via WebSocket
        await this.socketService.notifyMatch(match.venterSocketId, match.listenerSocketId, match.sessionId);
      }
      return match;
    }
  }

  /**
   * Remove a user from their queue
   */
  public async removeFromQueue(socketId: string): Promise<boolean> {
    if (this.useRedis && this.redisQueueManager) {
      try {
        return await this.redisQueueManager.removeFromQueue(socketId);
      } catch (error) {
        console.error('Failed to remove from Redis queue, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory queue
    // Check venter queue
    const venterIndex = this.venterQueue.findIndex(entry => entry.socketId === socketId);
    if (venterIndex !== -1) {
      const entry = this.venterQueue[venterIndex];
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      this.venterQueue.splice(venterIndex, 1);
      return true;
    }

    // Check listener queue
    const listenerIndex = this.listenerQueue.findIndex(entry => entry.socketId === socketId);
    if (listenerIndex !== -1) {
      const entry = this.listenerQueue[listenerIndex];
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      this.listenerQueue.splice(listenerIndex, 1);
      return true;
    }

    return false;
  }

  /**
   * Attempt to match users using FIFO algorithm
   */
  private attemptMatch(requestingUserType: 'venter' | 'listener'): MatchResult | null {
    if (requestingUserType === 'venter') {
      // Venter looking for listener
      if (this.listenerQueue.length > 0 && this.venterQueue.length > 0) {
        const listener = this.listenerQueue.shift()!;
        const venter = this.venterQueue.shift()!;
        
        // Clear timeouts
        if (listener.timeoutId) clearTimeout(listener.timeoutId);
        if (venter.timeoutId) clearTimeout(venter.timeoutId);

        return {
          sessionId: uuidv4(),
          venterSocketId: venter.socketId,
          listenerSocketId: listener.socketId
        };
      }
    } else {
      // Listener looking for venter
      if (this.venterQueue.length > 0 && this.listenerQueue.length > 0) {
        const venter = this.venterQueue.shift()!;
        const listener = this.listenerQueue.shift()!;
        
        // Clear timeouts
        if (venter.timeoutId) clearTimeout(venter.timeoutId);
        if (listener.timeoutId) clearTimeout(listener.timeoutId);

        return {
          sessionId: uuidv4(),
          venterSocketId: venter.socketId,
          listenerSocketId: listener.socketId
        };
      }
    }

    return null;
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<{
    ventersWaiting: number;
    listenersWaiting: number;
    totalWaiting: number;
  }> {
    if (this.useRedis && this.redisQueueManager) {
      try {
        return await this.redisQueueManager.getQueueStats();
      } catch (error) {
        console.error('Failed to get queue stats from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory queue
    return {
      ventersWaiting: this.venterQueue.length,
      listenersWaiting: this.listenerQueue.length,
      totalWaiting: this.venterQueue.length + this.listenerQueue.length
    };
  }

  /**
   * Get estimated wait time for a user type
   */
  public async getEstimatedWaitTime(userType: 'venter' | 'listener'): Promise<number> {
    if (this.useRedis && this.redisQueueManager) {
      try {
        return await this.redisQueueManager.getEstimatedWaitTime(userType);
      } catch (error) {
        console.error('Failed to get estimated wait time from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory queue
    if (userType === 'venter') {
      // If there are listeners available, wait time is minimal
      if (this.listenerQueue.length > 0) return 0;
      // Otherwise, estimate based on queue position
      return Math.max(30, this.venterQueue.length * 15); // 15 seconds per person ahead
    } else {
      // If there are venters available, wait time is minimal
      if (this.venterQueue.length > 0) return 0;
      // Otherwise, estimate based on queue position
      return Math.max(30, this.listenerQueue.length * 15); // 15 seconds per person ahead
    }
  }

  /**
   * Clean up expired queue entries
   */
  public async cleanupExpiredEntries(): Promise<number> {
    if (this.useRedis && this.redisQueueManager) {
      try {
        return await this.redisQueueManager.cleanupExpiredEntries();
      } catch (error) {
        console.error('Failed to cleanup expired entries from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory queue
    const now = new Date();
    const expiredTime = this.QUEUE_TIMEOUT;
    let cleanedCount = 0;

    // Clean venter queue
    const originalVenterLength = this.venterQueue.length;
    this.venterQueue = this.venterQueue.filter(entry => {
      const isExpired = now.getTime() - entry.joinedAt.getTime() > expiredTime;
      if (isExpired && entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      return !isExpired;
    });
    cleanedCount += originalVenterLength - this.venterQueue.length;

    // Clean listener queue
    const originalListenerLength = this.listenerQueue.length;
    this.listenerQueue = this.listenerQueue.filter(entry => {
      const isExpired = now.getTime() - entry.joinedAt.getTime() > expiredTime;
      if (isExpired && entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      return !isExpired;
    });
    cleanedCount += originalListenerLength - this.listenerQueue.length;

    return cleanedCount;
  }
}

// Export singleton instance
export const matchingService = new MatchingService();