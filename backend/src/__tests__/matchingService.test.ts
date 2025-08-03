
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { matchingService, QueueEntry, MatchResult } from '../services/matchingService';
import { reportService } from '../services/reportService';

// Mock the report service
jest.mock('../services/reportService', () => ({
  reportService: {
    isUserRestricted: jest.fn()
  }
}));

const mockReportService = reportService as jest.Mocked<typeof reportService>;

describe('MatchingService', () => {
  beforeEach(() => {
    // Clear queues before each test
    matchingService['venterQueue'] = [];
    matchingService['listenerQueue'] = [];
    // Reset mocks
    jest.clearAllMocks();
    // Default to no restrictions
    mockReportService.isUserRestricted.mockResolvedValue(null);
  });

  afterEach(() => {
    // Clear any remaining timeouts
    matchingService['venterQueue'].forEach(entry => {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    });
    matchingService['listenerQueue'].forEach(entry => {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    });
  });

  describe('addToQueue', () => {
    it('should add venter to queue when no listeners available', async () => {
      const result = await matchingService.addToQueue('venter1', 'venter');
      
      expect(result).toBeNull();
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(0);
    });

    it('should add listener to queue when no venters available', async () => {
      const result = await matchingService.addToQueue('listener1', 'listener');
      
      expect(result).toBeNull();
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(1);
    });

    it('should create match when venter joins and listener is waiting', async () => {
      // Add listener first
      await matchingService.addToQueue('listener1', 'listener');
      
      // Add venter - should create match
      const result = await matchingService.addToQueue('venter1', 'venter');
      
      expect(result).not.toBeNull();
      expect(result!.venterSocketId).toBe('venter1');
      expect(result!.listenerSocketId).toBe('listener1');
      expect(result!.sessionId).toBeDefined();
      
      // Queues should be empty after match
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(0);
    });

    it('should create match when listener joins and venter is waiting', async () => {
      // Add venter first
      await matchingService.addToQueue('venter1', 'venter');
      
      // Add listener - should create match
      const result = await matchingService.addToQueue('listener1', 'listener');
      
      expect(result).not.toBeNull();
      expect(result!.venterSocketId).toBe('venter1');
      expect(result!.listenerSocketId).toBe('listener1');
      expect(result!.sessionId).toBeDefined();
      
      // Queues should be empty after match
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(0);
    });

    it('should follow FIFO order for matching', async () => {
      // Add multiple listeners
      await matchingService.addToQueue('listener1', 'listener');
      await matchingService.addToQueue('listener2', 'listener');
      
      // Add venter - should match with first listener
      const result = await matchingService.addToQueue('venter1', 'venter');
      
      expect(result).not.toBeNull();
      expect(result!.listenerSocketId).toBe('listener1');
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(1); // listener2 still waiting
    });

    it('should reject restricted users from joining queue', async () => {
      const mockRestriction = {
        id: 'restriction123',
        socketId: 'restricted-user',
        restrictionType: 'temporary_ban' as const,
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: true
      };

      mockReportService.isUserRestricted.mockResolvedValue(mockRestriction);

      await expect(matchingService.addToQueue('restricted-user', 'venter'))
        .rejects.toThrow('User is currently restricted: Multiple reports');

      expect(mockReportService.isUserRestricted).toHaveBeenCalledWith('restricted-user');
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
    });

    it('should allow unrestricted users to join queue', async () => {
      mockReportService.isUserRestricted.mockResolvedValue(null);

      const result = await matchingService.addToQueue('unrestricted-user', 'venter');

      expect(result).toBeNull(); // No match, but added to queue
      expect(mockReportService.isUserRestricted).toHaveBeenCalledWith('unrestricted-user');
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
    });

    it('should continue with matching if restriction check fails', async () => {
      mockReportService.isUserRestricted.mockRejectedValue(new Error('Database error'));

      const result = await matchingService.addToQueue('user-with-check-error', 'venter');

      expect(result).toBeNull(); // No match, but added to queue
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
    });
  });

  describe('removeFromQueue', () => {
    it('should remove venter from queue', async () => {
      await matchingService.addToQueue('venter1', 'venter');
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
      
      const removed = await matchingService.removeFromQueue('venter1');
      
      expect(removed).toBe(true);
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
    });

    it('should remove listener from queue', async () => {
      await matchingService.addToQueue('listener1', 'listener');
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(1);
      
      const removed = await matchingService.removeFromQueue('listener1');
      
      expect(removed).toBe(true);
      expect((await matchingService.getQueueStats()).listenersWaiting).toBe(0);
    });

    it('should return false when trying to remove non-existent user', async () => {
      const removed = await matchingService.removeFromQueue('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear timeout when removing user from queue', async () => {
      await matchingService.addToQueue('venter1', 'venter');
      const entry = matchingService['venterQueue'][0];
      const timeoutId = entry.timeoutId;
      
      expect(timeoutId).toBeDefined();
      
      const removed = await matchingService.removeFromQueue('venter1');
      expect(removed).toBe(true);
      
      // Timeout should be cleared (we can't directly test this, but the function should not throw)
    });
  });

  describe('getQueueStats', () => {
    it('should return correct queue statistics', async () => {
      await matchingService.addToQueue('venter1', 'venter');
      await matchingService.addToQueue('venter2', 'venter');
      await matchingService.addToQueue('venter3', 'venter');
      await matchingService.addToQueue('listener1', 'listener');
      
      const stats = await matchingService.getQueueStats();
      
      // After adding 3 venters and 1 listener, one match should be made
      // leaving 2 venters and 0 listeners waiting
      expect(stats.ventersWaiting).toBe(2);
      expect(stats.listenersWaiting).toBe(0);
      expect(stats.totalWaiting).toBe(2);
    });

    it('should return zero stats for empty queues', async () => {
      const stats = await matchingService.getQueueStats();
      
      expect(stats.ventersWaiting).toBe(0);
      expect(stats.listenersWaiting).toBe(0);
      expect(stats.totalWaiting).toBe(0);
    });
  });

  describe('getEstimatedWaitTime', () => {
    it('should return 0 wait time when opposite type is available', async () => {
      await matchingService.addToQueue('listener1', 'listener');
      
      const waitTime = await matchingService.getEstimatedWaitTime('venter');
      expect(waitTime).toBe(0);
    });

    it('should return minimum 30 seconds when no opposite type available', async () => {
      const waitTime = await matchingService.getEstimatedWaitTime('venter');
      expect(waitTime).toBe(30);
    });

    it('should calculate wait time based on queue position', async () => {
      // Add multiple venters
      await matchingService.addToQueue('venter1', 'venter');
      await matchingService.addToQueue('venter2', 'venter');
      
      const waitTime = await matchingService.getEstimatedWaitTime('venter');
      expect(waitTime).toBe(30); // 2 * 15 = 30, but minimum is 30
      
      // Add more venters
      await matchingService.addToQueue('venter3', 'venter');
      await matchingService.addToQueue('venter4', 'venter');
      
      const longerWaitTime = await matchingService.getEstimatedWaitTime('venter');
      expect(longerWaitTime).toBe(60); // 4 * 15 = 60
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should remove expired entries from queues', async () => {
      // Mock a very short timeout for testing
      const originalTimeout = matchingService['QUEUE_TIMEOUT'];
      matchingService['QUEUE_TIMEOUT'] = 100; // 100ms
      
      await matchingService.addToQueue('venter1', 'venter');
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
      
      // Wait for timeout and cleanup
      await new Promise(resolve => setTimeout(resolve, 150));
      await matchingService.cleanupExpiredEntries();
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
      
      // Restore original timeout
      matchingService['QUEUE_TIMEOUT'] = originalTimeout;
    });
  });

  describe('timeout handling', () => {
    it('should automatically remove users after timeout', async () => {
      // Mock a very short timeout for testing
      const originalTimeout = matchingService['QUEUE_TIMEOUT'];
      matchingService['QUEUE_TIMEOUT'] = 100; // 100ms
      
      await matchingService.addToQueue('venter1', 'venter');
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(1);
      
      // Wait for automatic timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      expect((await matchingService.getQueueStats()).ventersWaiting).toBe(0);
      
      // Restore original timeout
      matchingService['QUEUE_TIMEOUT'] = originalTimeout;
    });
  });
});