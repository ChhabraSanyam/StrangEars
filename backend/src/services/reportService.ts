import { v4 as uuidv4 } from 'uuid';
import { database } from '../config/database';
import { Report, CreateReportData, ReportStats } from '../models/Report';
import { patternDetectionService } from './patternDetectionService';
import { UserRestriction, PatternAnalysis } from '../models/UserPattern';

class ReportService {
  /**
   * Create a new report and process pattern detection
   */
  async createReport(reportData: CreateReportData & { reportedUserSessionId?: string }): Promise<{
    report: Report;
    restriction?: UserRestriction;
    analysis?: PatternAnalysis;
  }> {
    const report: Report = {
      id: uuidv4(),
      sessionId: reportData.sessionId,
      reporterType: reportData.reporterType,
      reason: reportData.reason || 'No reason provided',
      timestamp: new Date(),
      resolved: false,
      reporterUsername: reportData.reporterUsername,
      reportedUsername: reportData.reportedUsername
    };

    const sql = `
      INSERT INTO reports (id, session_id, reporter_type, reason, timestamp, resolved, reporter_username, reported_username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      report.id,
      report.sessionId,
      report.reporterType,
      report.reason,
      report.timestamp.toISOString(),
      report.resolved,
      report.reporterUsername || null,
      report.reportedUsername || null
    ];

    await database.run(sql, params);

    // Process pattern detection if we have the reported user's userSessionId
    let restriction: UserRestriction | undefined;
    let analysis: PatternAnalysis | undefined;

    if (reportData.reportedUserSessionId) {
      try {
        // Determine report type from reason
        const reportType = this.categorizeReportReason(reportData.reason || '');
        
        const result = await patternDetectionService.processReportAndApplyRestrictionsByUserSessionId(
          reportData.reportedUserSessionId,
          reportData.sessionId,
          reportType,
          reportData.reporterType
        );

        restriction = result.restriction;
        analysis = result.analysis;
      } catch (error) {
        console.error('Error processing pattern detection:', error);
        // Continue without pattern detection if it fails
      }
    } else {
      console.warn('No userSessionId provided for pattern detection, skipping restriction processing');
    }

    return { report, restriction, analysis };
  }

  /**
   * Categorize report reason into report type for pattern detection
   */
  private categorizeReportReason(reason: string): 'inappropriate_behavior' | 'spam' | 'harassment' | 'other' {
    const lowerReason = reason.toLowerCase();
    
    if (lowerReason.includes('harassment') || lowerReason.includes('harass') || lowerReason.includes('threat')) {
      return 'harassment';
    } else if (lowerReason.includes('spam') || lowerReason.includes('repeated') || lowerReason.includes('flooding')) {
      return 'spam';
    } else if (lowerReason.includes('inappropriate') || lowerReason.includes('offensive') || lowerReason.includes('abuse')) {
      return 'inappropriate_behavior';
    } else {
      return 'other';
    }
  }

  /**
   * Get all reports for a specific session
   */
  async getReportsBySession(sessionId: string): Promise<Report[]> {
    const sql = `
      SELECT id, session_id as sessionId, reporter_type as reporterType, 
             reason, timestamp, resolved, reporter_username as reporterUsername,
             reported_username as reportedUsername
      FROM reports 
      WHERE session_id = ?
      ORDER BY timestamp DESC
    `;

    const rows = await database.all<any>(sql, [sessionId]);
    
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
      resolved: Boolean(row.resolved)
    }));
  }

  /**
   * Get report statistics
   */
  async getReportStats(): Promise<ReportStats> {
    // Total reports
    const totalResult = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports'
    );
    const totalReports = totalResult?.count || 0;

    // Reports today
    const todayResult = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM reports 
       WHERE DATE(timestamp) = CURRENT_DATE`
    );
    const reportsToday = todayResult?.count || 0;

    // Unresolved reports
    const unresolvedResult = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports WHERE resolved = false'
    );
    const unresolvedReports = unresolvedResult?.count || 0;

    // Reports by type
    const venterResult = await database.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM reports WHERE reporter_type = 'venter'"
    );
    const listenerResult = await database.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM reports WHERE reporter_type = 'listener'"
    );

    return {
      totalReports,
      reportsToday,
      unresolvedReports,
      reportsByType: {
        venter: venterResult?.count || 0,
        listener: listenerResult?.count || 0
      }
    };
  }

  /**
   * Mark a report as resolved
   */
  async resolveReport(reportId: string): Promise<boolean> {
    const sql = 'UPDATE reports SET resolved = true WHERE id = ?';
    const result = await database.run(sql, [reportId]);
    return result.changes > 0;
  }

  /**
   * Get recent reports (for admin/moderation purposes)
   */
  async getRecentReports(limit: number = 50): Promise<Report[]> {
    const sql = `
      SELECT id, session_id as sessionId, reporter_type as reporterType, 
             reason, timestamp, resolved, reporter_username as reporterUsername,
             reported_username as reportedUsername
      FROM reports 
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = await database.all<any>(sql, [limit]);
    
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
      resolved: Boolean(row.resolved)
    }));
  }

  /**
   * Check if a session has been reported before
   */
  async hasSessionBeenReported(sessionId: string): Promise<boolean> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports WHERE session_id = ?',
      [sessionId]
    );
    return (result?.count || 0) > 0;
  }

  /**
   * Check if a user is currently restricted by userSessionId
   */
  async isUserRestrictedByUserSessionId(userSessionId: string): Promise<UserRestriction | null> {
    return await patternDetectionService.isUserRestrictedByUserSessionId(userSessionId);
  }

  /**
   * Get pattern analysis for a user by userSessionId
   */
  async getUserPatternAnalysisByUserSessionId(userSessionId: string): Promise<PatternAnalysis> {
    return await patternDetectionService.analyzeUserPatternByUserSessionId(userSessionId);
  }

  /**
   * Get enhanced report statistics including pattern detection data
   */
  async getEnhancedReportStats(): Promise<ReportStats & {
    patternStats: {
      totalRestrictions: number;
      activeRestrictions: number;
      restrictionsByType: Record<string, number>;
      averageReportsBeforeRestriction: number;
    };
  }> {
    const basicStats = await this.getReportStats();
    const patternStats = await patternDetectionService.getRestrictionStats();

    return {
      ...basicStats,
      patternStats
    };
  }

  /**
   * Clean up expired restrictions (should be called periodically)
   */
  async cleanupExpiredRestrictions(): Promise<number> {
    return await patternDetectionService.cleanupExpiredRestrictions();
  }
}

export const reportService = new ReportService();