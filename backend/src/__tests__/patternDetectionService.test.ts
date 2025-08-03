import { patternDetectionService } from '../services/patternDetectionService';
import { database } from '../config/database';

// Mock the database
jest.mock('../config/database');

describe('PatternDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordUserPattern', () => {
    it('should record a user pattern successfully', async () => {
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      (database.run as jest.Mock) = mockRun;

      const patternData = {
        socketId: 'socket123',
        sessionId: 'session123',
        reportType: 'inappropriate_behavior' as const,
        reporterType: 'venter' as const
      };

      const result = await patternDetectionService.recordUserPattern(patternData);

      expect(result).toMatchObject({
        socketId: 'socket123',
        sessionId: 'session123',
        reportType: 'inappropriate_behavior',
        reporterType: 'venter'
      });
      expect(result.id).toBeDefined();
      expect(result.reportedAt).toBeInstanceOf(Date);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_patterns'),
        expect.arrayContaining(['socket123', 'session123', 'inappropriate_behavior', 'venter'])
      );
    });
  });

  describe('analyzeUserPattern', () => {
    it('should analyze user pattern with no reports', async () => {
      const mockAll = jest.fn().mockResolvedValue([]);
      (database.all as jest.Mock) = mockAll;

      const result = await patternDetectionService.analyzeUserPattern('socket123');

      expect(result).toEqual({
        socketId: 'socket123',
        totalReports: 0,
        reportsInLast24Hours: 0,
        reportsInLastWeek: 0,
        reportTypes: {},
        averageTimeBetweenReports: 0,
        riskLevel: 'low',
        recommendedAction: 'none'
      });
    });

    it('should analyze user pattern with multiple reports', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

      const mockPatterns = [
        {
          id: '1',
          socketId: 'socket123',
          sessionId: 'session1',
          reportType: 'harassment',
          reporterType: 'venter',
          reportedAt: now
        },
        {
          id: '2',
          socketId: 'socket123',
          sessionId: 'session2',
          reportType: 'inappropriate_behavior',
          reporterType: 'listener',
          reportedAt: yesterday
        },
        {
          id: '3',
          socketId: 'socket123',
          sessionId: 'session3',
          reportType: 'harassment',
          reporterType: 'venter',
          reportedAt: lastWeek
        }
      ];

      const mockAll = jest.fn().mockResolvedValue(mockPatterns);
      (database.all as jest.Mock) = mockAll;

      const result = await patternDetectionService.analyzeUserPattern('socket123');

      expect(result.totalReports).toBe(3);
      expect(result.reportsInLast24Hours).toBe(2);
      expect(result.reportsInLastWeek).toBe(3);
      expect(result.reportTypes).toEqual({
        harassment: 2,
        inappropriate_behavior: 1
      });
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendedAction).toBe('permanent_ban');
    });

    it('should recommend permanent ban for critical risk level', async () => {
      const now = new Date();
      const mockPatterns = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        socketId: 'socket123',
        sessionId: `session${i + 1}`,
        reportType: 'harassment',
        reporterType: 'venter',
        reportedAt: new Date(now.getTime() - i * 60 * 60 * 1000) // 1 hour apart
      }));

      const mockAll = jest.fn().mockResolvedValue(mockPatterns);
      (database.all as jest.Mock) = mockAll;

      const result = await patternDetectionService.analyzeUserPattern('socket123');

      expect(result.totalReports).toBe(10);
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendedAction).toBe('permanent_ban');
    });
  });

  describe('createUserRestriction', () => {
    it('should create a temporary restriction', async () => {
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      (database.run as jest.Mock) = mockRun;

      const restrictionData = {
        socketId: 'socket123',
        restrictionType: 'temporary_ban' as const,
        durationMinutes: 60,
        reason: 'Multiple reports',
        reportCount: 3
      };

      const result = await patternDetectionService.createUserRestriction(restrictionData);

      expect(result).toMatchObject({
        socketId: 'socket123',
        restrictionType: 'temporary_ban',
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: true
      });
      expect(result.id).toBeDefined();
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(mockRun).toHaveBeenCalledTimes(2); // One for deactivation, one for creation
    });

    it('should create a permanent restriction without end time', async () => {
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      (database.run as jest.Mock) = mockRun;

      const restrictionData = {
        socketId: 'socket123',
        restrictionType: 'permanent_ban' as const,
        reason: 'Severe violations',
        reportCount: 10
      };

      const result = await patternDetectionService.createUserRestriction(restrictionData);

      expect(result.restrictionType).toBe('permanent_ban');
      expect(result.endTime).toBeUndefined();
    });
  });

  describe('isUserRestricted', () => {
    it('should return null for unrestricted user', async () => {
      const mockGet = jest.fn().mockResolvedValue(undefined);
      (database.get as jest.Mock) = mockGet;

      const result = await patternDetectionService.isUserRestricted('socket123');

      expect(result).toBeNull();
    });

    it('should return active restriction', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 60 * 1000);

      const mockRestriction = {
        id: 'restriction123',
        socketId: 'socket123',
        restrictionType: 'temporary_ban',
        startTime: now.toISOString(),
        endTime: future.toISOString(),
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: 1
      };

      const mockGet = jest.fn().mockResolvedValue(mockRestriction);
      (database.get as jest.Mock) = mockGet;

      const result = await patternDetectionService.isUserRestricted('socket123');

      expect(result).toMatchObject({
        id: 'restriction123',
        socketId: 'socket123',
        restrictionType: 'temporary_ban',
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: true
      });
      expect(result!.startTime).toBeInstanceOf(Date);
      expect(result!.endTime).toBeInstanceOf(Date);
    });

    it('should deactivate expired restriction and return null', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 60 * 60 * 1000);

      const mockRestriction = {
        id: 'restriction123',
        socketId: 'socket123',
        restrictionType: 'temporary_ban',
        startTime: past.toISOString(),
        endTime: past.toISOString(),
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: 1
      };

      const mockGet = jest.fn().mockResolvedValue(mockRestriction);
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      (database.get as jest.Mock) = mockGet;
      (database.run as jest.Mock) = mockRun;

      const result = await patternDetectionService.isUserRestricted('socket123');

      expect(result).toBeNull();
      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE user_restrictions SET is_active = 0 WHERE id = ?',
        ['restriction123']
      );
    });
  });

  describe('processReportAndApplyRestrictions', () => {
    it('should process report and apply temporary ban for high risk', async () => {
      // Mock recordUserPattern
      const mockRunPattern = jest.fn().mockResolvedValue({ changes: 1 });
      
      // Mock analyzeUserPattern to return high risk
      const mockAllPatterns = jest.fn().mockResolvedValue([
        { reportType: 'harassment', reportedAt: new Date() },
        { reportType: 'harassment', reportedAt: new Date() },
        { reportType: 'inappropriate_behavior', reportedAt: new Date() }
      ]);
      
      // Mock createUserRestriction
      const mockRunRestriction = jest.fn().mockResolvedValue({ changes: 1 });

      (database.run as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({ changes: 1 }) // recordUserPattern
        .mockResolvedValueOnce({ changes: 0 }) // deactivateUserRestrictions
        .mockResolvedValueOnce({ changes: 1 }); // createUserRestriction
      
      (database.all as jest.Mock) = mockAllPatterns;

      const result = await patternDetectionService.processReportAndApplyRestrictions(
        'socket123',
        'session123',
        'harassment',
        'venter'
      );

      expect(result.analysis.totalReports).toBe(3);
      expect(result.analysis.riskLevel).toBe('critical');
      expect(result.restriction).toBeDefined();
      expect(result.restriction!.restrictionType).toBe('permanent_ban');
    });

    it('should process report without applying restriction for low risk', async () => {
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      const mockAll = jest.fn().mockResolvedValue([
        { reportType: 'other', reportedAt: new Date() }
      ]);

      (database.run as jest.Mock) = mockRun;
      (database.all as jest.Mock) = mockAll;

      const result = await patternDetectionService.processReportAndApplyRestrictions(
        'socket123',
        'session123',
        'other',
        'venter'
      );

      expect(result.analysis.totalReports).toBe(1);
      expect(result.analysis.riskLevel).toBe('medium');
      expect(result.restriction).toBeDefined();
      expect(result.restriction!.restrictionType).toBe('warning');
    });
  });

  describe('cleanupExpiredRestrictions', () => {
    it('should clean up expired restrictions', async () => {
      const mockRun = jest.fn().mockResolvedValue({ changes: 3 });
      (database.run as jest.Mock) = mockRun;

      const result = await patternDetectionService.cleanupExpiredRestrictions();

      expect(result).toBe(3);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_restrictions')
      );
    });
  });

  describe('getRestrictionStats', () => {
    it('should return restriction statistics', async () => {
      const mockGet = jest.fn()
        .mockResolvedValueOnce({ count: 15 }) // total
        .mockResolvedValueOnce({ count: 5 })  // active
        .mockResolvedValueOnce({ avg: 3.5 }); // average

      const mockAll = jest.fn().mockResolvedValue([
        { restriction_type: 'temporary_ban', count: 10 },
        { restriction_type: 'warning', count: 3 },
        { restriction_type: 'permanent_ban', count: 2 }
      ]);

      (database.get as jest.Mock) = mockGet;
      (database.all as jest.Mock) = mockAll;

      const result = await patternDetectionService.getRestrictionStats();

      expect(result).toEqual({
        totalRestrictions: 15,
        activeRestrictions: 5,
        restrictionsByType: {
          temporary_ban: 10,
          warning: 3,
          permanent_ban: 2
        },
        averageReportsBeforeRestriction: 4
      });
    });
  });
});