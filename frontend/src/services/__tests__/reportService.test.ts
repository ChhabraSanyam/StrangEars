import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reportService } from '../reportService';

// Mock fetch
global.fetch = vi.fn();
const mockFetch = fetch as any;

describe('ReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitReport', () => {
    it('should submit a report successfully', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const,
        reason: 'Inappropriate behavior'
      };

      const mockResponse = {
        message: 'Report submitted successfully. Session has been terminated.',
        reportId: 'report-123',
        timestamp: '2023-01-01T00:00:00.000Z'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await reportService.submitReport(reportData);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/report',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reportData),
        }
      );
    });

    it('should handle HTTP errors', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'listener' as const,
        reason: 'Spam'
      };

      const errorResponse = {
        message: 'Session ID is required'
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve(errorResponse)
      });

      await expect(reportService.submitReport(reportData))
        .rejects
        .toThrow('Session ID is required');
    });

    it('should handle network errors', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const
      };

      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(reportService.submitReport(reportData))
        .rejects
        .toThrow('Network error');
    });

    it('should handle malformed JSON responses', async () => {
      const reportData = {
        sessionId: 'test-session-123',
        reporterType: 'venter' as const
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(reportService.submitReport(reportData))
        .rejects
        .toThrow('HTTP error! status: 500');
    });


  });
});