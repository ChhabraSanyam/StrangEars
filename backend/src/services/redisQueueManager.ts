import { redisClient } from '../config/redis';
import { QueueEntry, MatchResult } from './matchingService';
import { v4 as uuidv4 } from 'uuid';

export class RedisQueueManager {
  private readonly VENTER_QUEUE_KEY = 'queue:venters';
  private readonly LISTENER_QUEUE_KEY = 'queue:listeners';
  private readonly QUEUE_ENTRY_PREFIX = 'queue_entry:';
  private readonly QUEUE_TIMEOUT = 5 * 60; // 5 minutes in seconds

  /**
   * Add a user to the appropriate queue
   */
  async addToQueue(socketId: string, userType: 'venter' | 'listener'): Promise<void> {
    try {
      const client = await redisClient.getClient();
      const entry: QueueEntry = {
        socketId,
        type: userType,
        joinedAt: new Date()
      };

      // Store queue entry data
      const entryKey = this.getQueueEntryKey(socketId);
      await client.setex(entryKey, this.QUEUE_TIMEOUT, JSON.stringify(entry));

      // Add to appropriate queue
      const queueKey = userType === 'venter' ? this.VENTER_QUEUE_KEY : this.LISTENER_QUEUE_KEY;
      await client.lpush(queueKey, socketId);

      console.log(`Added ${userType} ${socketId} to Redis queue`);
    } catch (error) {
      console.error('Error adding to Redis queue:', error);
      throw new Error('Failed to add to queue');
    }
  }

  /**
   * Remove a user from their queue
   */
  async removeFromQueue(socketId: string): Promise<boolean> {
    try {
      const client = await redisClient.getClient();
      
      // Get queue entry to determine which queue to remove from
      const entryKey = this.getQueueEntryKey(socketId);
      const entryData = await client.get(entryKey);
      
      if (!entryData) {
        return false; // Entry not found
      }

      const entry = JSON.parse(entryData) as QueueEntry;
      const queueKey = entry.type === 'venter' ? this.VENTER_QUEUE_KEY : this.LISTENER_QUEUE_KEY;

      // Remove from queue and delete entry
      const [removedFromQueue, deletedEntry] = await Promise.all([
        client.lrem(queueKey, 0, socketId), // Remove all occurrences
        client.del(entryKey)
      ]);

      console.log(`Removed ${entry.type} ${socketId} from Redis queue`);
      return removedFromQueue > 0 || deletedEntry > 0;
    } catch (error) {
      console.error('Error removing from Redis queue:', error);
      return false;
    }
  }

  /**
   * Attempt to match users using FIFO algorithm
   */
  async attemptMatch(requestingUserType: 'venter' | 'listener'): Promise<MatchResult | null> {
    try {
      const client = await redisClient.getClient();
      
      if (requestingUserType === 'venter') {
        // Venter looking for listener
        const [venterCount, listenerCount] = await Promise.all([
          client.llen(this.VENTER_QUEUE_KEY),
          client.llen(this.LISTENER_QUEUE_KEY)
        ]);

        if (venterCount > 0 && listenerCount > 0) {
          // Pop one from each queue
          const [venterSocketId, listenerSocketId] = await Promise.all([
            client.rpop(this.VENTER_QUEUE_KEY),
            client.rpop(this.LISTENER_QUEUE_KEY)
          ]);

          if (venterSocketId && listenerSocketId) {
            // Clean up queue entries
            await Promise.all([
              client.del(this.getQueueEntryKey(venterSocketId)),
              client.del(this.getQueueEntryKey(listenerSocketId))
            ]);

            return {
              sessionId: uuidv4(),
              venterSocketId,
              listenerSocketId
            };
          }
        }
      } else {
        // Listener looking for venter
        const [venterCount, listenerCount] = await Promise.all([
          client.llen(this.VENTER_QUEUE_KEY),
          client.llen(this.LISTENER_QUEUE_KEY)
        ]);

        if (venterCount > 0 && listenerCount > 0) {
          // Pop one from each queue
          const [venterSocketId, listenerSocketId] = await Promise.all([
            client.rpop(this.VENTER_QUEUE_KEY),
            client.rpop(this.LISTENER_QUEUE_KEY)
          ]);

          if (venterSocketId && listenerSocketId) {
            // Clean up queue entries
            await Promise.all([
              client.del(this.getQueueEntryKey(venterSocketId)),
              client.del(this.getQueueEntryKey(listenerSocketId))
            ]);

            return {
              sessionId: uuidv4(),
              venterSocketId,
              listenerSocketId
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error attempting match in Redis:', error);
      return null;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    ventersWaiting: number;
    listenersWaiting: number;
    totalWaiting: number;
  }> {
    try {
      const client = await redisClient.getClient();
      
      const [ventersWaiting, listenersWaiting] = await Promise.all([
        client.llen(this.VENTER_QUEUE_KEY),
        client.llen(this.LISTENER_QUEUE_KEY)
      ]);

      return {
        ventersWaiting,
        listenersWaiting,
        totalWaiting: ventersWaiting + listenersWaiting
      };
    } catch (error) {
      console.error('Error getting queue stats from Redis:', error);
      return {
        ventersWaiting: 0,
        listenersWaiting: 0,
        totalWaiting: 0
      };
    }
  }

  /**
   * Get estimated wait time for a user type
   */
  async getEstimatedWaitTime(userType: 'venter' | 'listener'): Promise<number> {
    try {
      const stats = await this.getQueueStats();
      
      if (userType === 'venter') {
        // If there are listeners available, wait time is minimal
        if (stats.listenersWaiting > 0) return 0;
        // Otherwise, estimate based on queue position
        return Math.max(30, stats.ventersWaiting * 15); // 15 seconds per person ahead
      } else {
        // If there are venters available, wait time is minimal
        if (stats.ventersWaiting > 0) return 0;
        // Otherwise, estimate based on queue position
        return Math.max(30, stats.listenersWaiting * 15); // 15 seconds per person ahead
      }
    } catch (error) {
      console.error('Error getting estimated wait time:', error);
      return 60; // Default to 1 minute
    }
  }

  /**
   * Clean up expired queue entries
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const client = await redisClient.getClient();
      let cleanedCount = 0;

      // Get all queue entries
      const pattern = this.getQueueEntryKey('*');
      const keys = await client.keys(pattern);

      for (const key of keys) {
        const entryData = await client.get(key);
        if (entryData) {
          const entry = JSON.parse(entryData) as QueueEntry;
          const now = new Date();
          const expiredTime = this.QUEUE_TIMEOUT * 1000; // Convert to milliseconds
          
          if (now.getTime() - new Date(entry.joinedAt).getTime() > expiredTime) {
            // Remove from queue and delete entry
            const queueKey = entry.type === 'venter' ? this.VENTER_QUEUE_KEY : this.LISTENER_QUEUE_KEY;
            await Promise.all([
              client.lrem(queueKey, 0, entry.socketId),
              client.del(key)
            ]);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired queue entries from Redis`);
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up expired entries:', error);
      return 0;
    }
  }

  /**
   * Get all queue entries (for debugging/monitoring)
   */
  async getAllQueueEntries(): Promise<{
    venters: QueueEntry[];
    listeners: QueueEntry[];
  }> {
    try {
      const client = await redisClient.getClient();
      
      const [venterSocketIds, listenerSocketIds] = await Promise.all([
        client.lrange(this.VENTER_QUEUE_KEY, 0, -1),
        client.lrange(this.LISTENER_QUEUE_KEY, 0, -1)
      ]);

      const venters: QueueEntry[] = [];
      const listeners: QueueEntry[] = [];

      // Get venter entries
      for (const socketId of venterSocketIds) {
        const entryKey = this.getQueueEntryKey(socketId);
        const entryData = await client.get(entryKey);
        if (entryData) {
          const entry = JSON.parse(entryData) as QueueEntry;
          entry.joinedAt = new Date(entry.joinedAt); // Convert back to Date
          venters.push(entry);
        }
      }

      // Get listener entries
      for (const socketId of listenerSocketIds) {
        const entryKey = this.getQueueEntryKey(socketId);
        const entryData = await client.get(entryKey);
        if (entryData) {
          const entry = JSON.parse(entryData) as QueueEntry;
          entry.joinedAt = new Date(entry.joinedAt); // Convert back to Date
          listeners.push(entry);
        }
      }

      return { venters, listeners };
    } catch (error) {
      console.error('Error getting all queue entries:', error);
      return { venters: [], listeners: [] };
    }
  }

  /**
   * Clear all queues (for testing/maintenance)
   */
  async clearAllQueues(): Promise<void> {
    try {
      const client = await redisClient.getClient();
      
      // Get all queue entries to clean up
      const pattern = this.getQueueEntryKey('*');
      const entryKeys = await client.keys(pattern);

      // Delete all queue entries and clear queues
      const deletePromises = entryKeys.map((key: string) => client.del(key));
      await Promise.all([
        ...deletePromises,
        client.del(this.VENTER_QUEUE_KEY),
        client.del(this.LISTENER_QUEUE_KEY)
      ]);

      console.log('Cleared all Redis queues');
    } catch (error) {
      console.error('Error clearing queues:', error);
      throw new Error('Failed to clear queues');
    }
  }

  /**
   * Health check for Redis queue operations
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await redisClient.getClient();
      
      // Test basic queue operations
      const testKey = 'health_check_queue';
      const testValue = 'test';
      
      await client.lpush(testKey, testValue);
      const result = await client.rpop(testKey);
      
      return result === testValue;
    } catch (error) {
      console.error('Redis queue health check failed:', error);
      return false;
    }
  }

  // Private helper methods
  private getQueueEntryKey(socketId: string): string {
    return `${this.QUEUE_ENTRY_PREFIX}${socketId}`;
  }
}

// Export singleton instance
export const redisQueueManager = new RedisQueueManager();
export default redisQueueManager;