import { reportService } from '../services/reportService';
import { database } from '../config/database';
import { patternDetectionService } from '../services/patternDetectionService';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
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
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock the database and pattern detection service
jest.mock('../config/database', () => ({
  database: {
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn()
  }
}));

jest.mock('../services/patternDetectionService', () => ({
  patternDetectionService: {
    processReportAndApplyRestrictions: jest.fn(),
    isUserRestricted: jest.fn(),
    analyzeUserPattern: jest.fn(),
    getRestrictionStats: jest.fn(),
    cleanupExpiredRestrictions: jest.fn()
  }
}));

const mockDatabase = database as jest.Mocked<typeof database>;
const mockPatternDetectionService = patternDetectionService as jest.Mocked<typeof patternDetectionService>;

describe('ReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createReport', () => {
    it('should create a report successfully without pattern detection', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Inappropriate behavior'
      };

      mockDatabase.run.mockResolvedValue({ changes: 1 } as any);

      const result = await reportService.createReport(reportData);

      expect(result.report).toMatchObject({
        sessionId: reportData.sessionId,
        reporterType: reportData.reporterType,
        reason: reportData.reason,
        resolved: false
      });
      expect(result.report.id).toBeDefined();
      expect(result.report.timestamp).toBeInstanceOf(Date);
      expect(result.restriction).toBeUndefined();
      expect(result.analysis).toBeUndefined();
      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reports'),
        expect.arrayContaining([
          result.report.id,
          reportData.sessionId,
          reportData.reporterType,
          reportData.reason,
          result.report.timestamp.toISOString(),
          0
        ])
      );
    });

    it('should create a report with pattern detection when reportedSocketId provided', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Inappropriate behavior',
        reportedSocketId: 'socket123'
      };

      const mockRestriction = {
        id: 'restriction123',
        socketId: 'socket123',
        restrictionType: 'temporary_ban' as const,
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: true
      };

      const mockAnalysis = {
        socketId: 'socket123',
        totalReports: 3,
        reportsInLast24Hours: 2,
        reportsInLastWeek: 3,
        reportTypes: { inappropriate_behavior: 3 },
        averageTimeBetweenReports: 120,
        riskLevel: 'high' as const,
        recommendedAction: 'temporary_ban' as const
      };

      mockDatabase.run.mockResolvedValue({ changes: 1 } as any);
      mockPatternDetectionService.processReportAndApplyRestrictions.mockResolvedValue({
        restriction: mockRestriction,
        analysis: mockAnalysis
      });

      const result = await reportService.createReport(reportData);

      expect(result.report).toMatchObject({
        sessionId: reportData.sessionId,
        reporterType: reportData.reporterType,
        reason: reportData.reason,
        resolved: false
      });
      expect(result.restriction).toEqual(mockRestriction);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(mockPatternDetectionService.processReportAndApplyRestrictions).toHaveBeenCalledWith(
        'socket123',
        'test-session-123',
        'inappropriate_behavior',
        'venter'
      );
    });

    it('should create a report with default reason when none provided', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'listener' as const
      };

      mockDatabase.run.mockResolvedValue({ changes: 1 } as any);

      const result = await reportService.createReport(reportData);

      expect(result.report.reason).toBe('No reason provided');
    });

    it('should handle pattern detection errors gracefully', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Inappropriate behavior',
        reportedSocketId: 'socket123'
      };

      mockDatabase.run.mockResolvedValue({ changes: 1 } as any);
      mockPatternDetectionService.processReportAndApplyRestrictions.mockRejectedValue(
        new Error('Pattern detection failed')
      );

      const result = await reportService.createReport(reportData);

      expect(result.report).toBeDefined();
      expect(result.restriction).toBeUndefined();
      expect(result.analysis).toBeUndefined();
    });
  });

  describe('getReportsBySession', () => {
    it('should return reports for a specific session', async () => {
      const sessionId = 'test-session-123';
      const mockReports = [
        {
          id: 'report-1',
          sessionId: sessionId,
          reporterType: 'venter',
          reason: 'Test reason',
          timestamp: '2023-01-01T00:00:00.000Z',
          resolved: 0
        }
      ];

      mockDatabase.all.mockResolvedValue(mockReports);

      const result = await reportService.getReportsBySession(sessionId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'report-1',
        sessionId: sessionId,
        reporterType: 'venter',
        reason: 'Test reason',
        resolved: false
      });
      expect(result[0].timestamp).toBeInstanceOf(Date);
      expect(mockDatabase.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [sessionId]
      );
    });

    it('should return empty array when no reports found', async () => {
      mockDatabase.all.mockResolvedValue([]);

      const result = await reportService.getReportsBySession('non-existent-session');

      expect(result).toEqual([]);
    });
  });

  describe('getReportStats', () => {
    it('should return correct report statistics', async () => {
      mockDatabase.get
        .mockResolvedValueOnce({ count: 10 }) // total reports
        .mockResolvedValueOnce({ count: 3 })  // reports today
        .mockResolvedValueOnce({ count: 5 })  // unresolved reports
        .mockResolvedValueOnce({ count: 6 })  // venter reports
        .mockResolvedValueOnce({ count: 4 }); // listener reports

      const result = await reportService.getReportStats();

      expect(result).toEqual({
        totalReports: 10,
        reportsToday: 3,
        unresolvedReports: 5,
        reportsByType: {
          venter: 6,
          listener: 4
        }
      });
    });

    it('should handle null database responses', async () => {
      mockDatabase.get.mockResolvedValue(undefined);

      const result = await reportService.getReportStats();

      expect(result).toEqual({
        totalReports: 0,
        reportsToday: 0,
        unresolvedReports: 0,
        reportsByType: {
          venter: 0,
          listener: 0
        }
      });
    });
  });

  describe('resolveReport', () => {
    it('should resolve a report successfully', async () => {
      const reportId = 'test-report-123';
      mockDatabase.run.mockResolvedValue({ changes: 1 } as any);

      const result = await reportService.resolveReport(reportId);

      expect(result).toBe(true);
      expect(mockDatabase.run).toHaveBeenCalledWith(
        'UPDATE reports SET resolved = 1 WHERE id = ?',
        [reportId]
      );
    });

    it('should return false when report not found', async () => {
      const reportId = 'non-existent-report';
      mockDatabase.run.mockResolvedValue({ changes: 0 } as any);

      const result = await reportService.resolveReport(reportId);

      expect(result).toBe(false);
    });
  });

  describe('hasSessionBeenReported', () => {
    it('should return true when session has been reported', async () => {
      const sessionId = 'test-session-123';
      mockDatabase.get.mockResolvedValue({ count: 1 });

      const result = await reportService.hasSessionBeenReported(sessionId);

      expect(result).toBe(true);
      expect(mockDatabase.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM reports WHERE session_id = ?',
        [sessionId]
      );
    });

    it('should return false when session has not been reported', async () => {
      const sessionId = 'test-session-123';
      mockDatabase.get.mockResolvedValue({ count: 0 });

      const result = await reportService.hasSessionBeenReported(sessionId);

      expect(result).toBe(false);
    });

    it('should return false when database returns null', async () => {
      const sessionId = 'test-session-123';
      mockDatabase.get.mockResolvedValue(undefined);

      const result = await reportService.hasSessionBeenReported(sessionId);

      expect(result).toBe(false);
    });
  });

  describe('isUserRestricted', () => {
    it('should return restriction when user is restricted', async () => {
      const socketId = 'socket123';
      const mockRestriction = {
        id: 'restriction123',
        socketId: 'socket123',
        restrictionType: 'temporary_ban' as const,
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        reason: 'Multiple reports',
        reportCount: 3,
        isActive: true
      };

      mockPatternDetectionService.isUserRestricted.mockResolvedValue(mockRestriction);

      const result = await reportService.isUserRestricted(socketId);

      expect(result).toEqual(mockRestriction);
      expect(mockPatternDetectionService.isUserRestricted).toHaveBeenCalledWith(socketId);
    });

    it('should return null when user is not restricted', async () => {
      const socketId = 'socket123';
      mockPatternDetectionService.isUserRestricted.mockResolvedValue(null);

      const result = await reportService.isUserRestricted(socketId);

      expect(result).toBeNull();
    });
  });

  describe('getUserPatternAnalysis', () => {
    it('should return pattern analysis for user', async () => {
      const socketId = 'socket123';
      const mockAnalysis = {
        socketId: 'socket123',
        totalReports: 3,
        reportsInLast24Hours: 2,
        reportsInLastWeek: 3,
        reportTypes: { inappropriate_behavior: 3 },
        averageTimeBetweenReports: 120,
        riskLevel: 'high' as const,
        recommendedAction: 'temporary_ban' as const
      };

      mockPatternDetectionService.analyzeUserPattern.mockResolvedValue(mockAnalysis);

      const result = await reportService.getUserPatternAnalysis(socketId);

      expect(result).toEqual(mockAnalysis);
      expect(mockPatternDetectionService.analyzeUserPattern).toHaveBeenCalledWith(socketId);
    });
  });

  describe('getEnhancedReportStats', () => {
    it('should return enhanced report statistics with pattern data', async () => {
      const basicStats = {
        totalReports: 10,
        reportsToday: 3,
        unresolvedReports: 5,
        reportsByType: {
          venter: 6,
          listener: 4
        }
      };

      const patternStats = {
        totalRestrictions: 15,
        activeRestrictions: 5,
        restrictionsByType: {
          temporary_ban: 10,
          warning: 3,
          permanent_ban: 2
        },
        averageReportsBeforeRestriction: 4
      };

      mockDatabase.get
        .mockResolvedValueOnce({ count: 10 }) // total reports
        .mockResolvedValueOnce({ count: 3 })  // reports today
        .mockResolvedValueOnce({ count: 5 })  // unresolved reports
        .mockResolvedValueOnce({ count: 6 })  // venter reports
        .mockResolvedValueOnce({ count: 4 }); // listener reports

      mockPatternDetectionService.getRestrictionStats.mockResolvedValue(patternStats);

      const result = await reportService.getEnhancedReportStats();

      expect(result).toEqual({
        ...basicStats,
        patternStats
      });
    });
  });

  describe('cleanupExpiredRestrictions', () => {
    it('should clean up expired restrictions', async () => {
      mockPatternDetectionService.cleanupExpiredRestrictions.mockResolvedValue(3);

      const result = await reportService.cleanupExpiredRestrictions();

      expect(result).toBe(3);
      expect(mockPatternDetectionService.cleanupExpiredRestrictions).toHaveBeenCalled();
    });
  });
});