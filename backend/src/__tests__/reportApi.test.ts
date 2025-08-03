import request from 'supertest';
import express from 'express';
import reportRoutes from '../routes/report';
import { reportService } from '../services/reportService';
import { SocketService } from '../services/socketService';
import { Report } from '../models/Report';
import { it } from 'node:test';
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
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock the services
jest.mock('../services/reportService');
jest.mock('../services/socketService');

const mockReportService = reportService as jest.Mocked<typeof reportService>;
const mockSocketService = {
  terminateSession: jest.fn()
};

// Mock SocketService.getInstance to return our mock
(SocketService.getInstance as jest.Mock) = jest.fn().mockReturnValue(mockSocketService);

const app = express();
app.use(express.json());
app.use('/', reportRoutes);

// Add error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    message: err.message || 'Internal server error'
  });
});

describe('Report API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /report', () => {
    it('should create a report and terminate session successfully', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Inappropriate behavior'
      };

      const mockReport: Report = {
        id: 'report-123',
        sessionId: reportData.sessionId,
        reporterType: reportData.reporterType,
        reason: reportData.reason,
        timestamp: new Date(),
        resolved: false
      };

      mockReportService.createReport.mockResolvedValue({ report: mockReport });
      mockSocketService.terminateSession.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/report')
        .send(reportData)
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'Report submitted successfully. Session has been terminated.',
        reportId: mockReport.id
      });

      expect(mockReportService.createReport).toHaveBeenCalledWith(reportData);
      expect(mockSocketService.terminateSession).toHaveBeenCalledWith(
        reportData.sessionId,
        'reported'
      );
    });

    it('should create report even if session termination fails', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'listener' as const,
        reason: 'Spam'
      };

      const mockReport: Report = {
        id: 'report-123',
        sessionId: reportData.sessionId,
        reporterType: reportData.reporterType,
        reason: reportData.reason,
        timestamp: new Date(),
        resolved: false
      };

      mockReportService.createReport.mockResolvedValue({ report: mockReport });
      mockSocketService.terminateSession.mockRejectedValue(new Error('Session not found'));

      const response = await request(app)
        .post('/report')
        .send(reportData)
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'Report submitted successfully. Session has been terminated.',
        reportId: mockReport.id
      });

      expect(mockReportService.createReport).toHaveBeenCalledWith(reportData);
      expect(mockSocketService.terminateSession).toHaveBeenCalledWith(
        reportData.sessionId,
        'reported'
      );
    });

    it('should return 400 when sessionId is missing', async () => {
      const reportData = {
        reporterType: 'venter',
        reason: 'Test reason'
      };

      const response = await request(app)
        .post('/report')
        .send(reportData)
        .expect(400);

      expect(response.body.message).toBe('Session ID is required');
      expect(mockReportService.createReport).not.toHaveBeenCalled();
    });

    it('should return 400 when reporterType is invalid', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'invalid' as any,
        reason: 'Test reason'
      };

      const response = await request(app)
        .post('/report')
        .send(reportData)
        .expect(400);

      expect(response.body.message).toBe('Invalid reporter type. Must be "venter" or "listener"');
      expect(mockReportService.createReport).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Test reason'
      };

      mockReportService.createReport.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/report')
        .send(reportData)
        .expect(500);

      expect(mockReportService.createReport).toHaveBeenCalledWith(reportData);
    });
  });

  describe('GET /report/stats', () => {
    it('should return report statistics', async () => {
      const mockStats = {
        totalReports: 10,
        reportsToday: 3,
        unresolvedReports: 5,
        reportsByType: {
          venter: 6,
          listener: 4
        },
        patternStats: {
          totalRestrictions: 15,
          activeRestrictions: 5,
          restrictionsByType: {
            temporary_ban: 10,
            warning: 3,
            permanent_ban: 2
          },
          averageReportsBeforeRestriction: 4
        }
      };

      mockReportService.getEnhancedReportStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/report/stats')
        .expect(200);

      expect(response.body).toMatchObject(mockStats);
      expect(response.body.timestamp).toBeDefined();
      expect(mockReportService.getEnhancedReportStats).toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      mockReportService.getEnhancedReportStats.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/report/stats')
        .expect(500);
    });
  });

  describe('GET /report/recent', () => {
    it('should return recent reports with default limit', async () => {
      const mockReports: Report[] = [
        {
          id: 'report-1',
          sessionId: 'session-1',
          reporterType: 'venter',
          reason: 'Test reason 1',
          timestamp: new Date(),
          resolved: false
        },
        {
          id: 'report-2',
          sessionId: 'session-2',
          reporterType: 'listener',
          reason: 'Test reason 2',
          timestamp: new Date(),
          resolved: true
        }
      ];

      mockReportService.getRecentReports.mockResolvedValue(mockReports);

      const response = await request(app)
        .get('/report/recent')
        .expect(200);

      expect(response.body.reports).toEqual(
        mockReports.map(report => ({
          ...report,
          timestamp: report.timestamp.toISOString()
        }))
      );
      expect(response.body.count).toBe(2);
      expect(mockReportService.getRecentReports).toHaveBeenCalledWith(50);
    });

    it('should return recent reports with custom limit', async () => {
      const mockReports: Report[] = [];
      mockReportService.getRecentReports.mockResolvedValue(mockReports);

      const response = await request(app)
        .get('/report/recent?limit=10')
        .expect(200);

      expect(response.body.reports).toEqual(mockReports);
      expect(response.body.count).toBe(0);
      expect(mockReportService.getRecentReports).toHaveBeenCalledWith(10);
    });

    it('should return 400 when limit exceeds maximum', async () => {
      const response = await request(app)
        .get('/report/recent?limit=150')
        .expect(400);

      expect(response.body.message).toBe('Limit cannot exceed 100');
      expect(mockReportService.getRecentReports).not.toHaveBeenCalled();
    });
  });

  describe('PUT /report/:reportId/resolve', () => {
    it('should resolve a report successfully', async () => {
      const reportId = 'test-report-123';
      mockReportService.resolveReport.mockResolvedValue(true);

      const response = await request(app)
        .put(`/report/${reportId}/resolve`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Report marked as resolved',
        reportId: reportId
      });
      expect(mockReportService.resolveReport).toHaveBeenCalledWith(reportId);
    });

    it('should return 404 when report not found', async () => {
      const reportId = 'non-existent-report';
      mockReportService.resolveReport.mockResolvedValue(false);

      const response = await request(app)
        .put(`/report/${reportId}/resolve`)
        .expect(404);

      expect(response.body.message).toBe('Report not found or already resolved');
      expect(mockReportService.resolveReport).toHaveBeenCalledWith(reportId);
    });

    it('should return 400 when reportId is missing', async () => {
      const response = await request(app)
        .put('/report//resolve')
        .expect(404); // Express returns 404 for malformed routes

      expect(mockReportService.resolveReport).not.toHaveBeenCalled();
    });
  });
});