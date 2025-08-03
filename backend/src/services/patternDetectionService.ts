import { v4 as uuidv4 } from 'uuid';
import { database } from '../config/database';
import { 
  UserPattern, 
  UserRestriction, 
  CreateUserPatternData, 
  CreateUserRestrictionData,
  PatternAnalysis 
} from '../models/UserPattern';

class PatternDetectionService {
  /**
   * Record a user pattern when they are reported
   */
  async recordUserPattern(patternData: CreateUserPatternData): Promise<UserPattern> {
    const pattern: UserPattern = {
      id: uuidv4(),
      socketId: patternData.socketId,
      sessionId: patternData.sessionId,
      reportedAt: new Date(),
      reportType: patternData.reportType,
      reporterType: patternData.reporterType
    };

    const sql = `
      INSERT INTO user_patterns (id, socket_id, session_id, report_type, reporter_type, reported_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      pattern.id,
      pattern.socketId,
      pattern.sessionId,
      pattern.reportType,
      pattern.reporterType,
      pattern.reportedAt.toISOString()
    ];

    await database.run(sql, params);
    return pattern;
  }

  /**
   * Analyze user patterns to determine risk level and recommended action
   */
  async analyzeUserPattern(socketId: string): Promise<PatternAnalysis> {
    // Get all patterns for this user
    const allPatterns = await this.getUserPatterns(socketId);
    
    // Calculate time-based metrics
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const reportsInLast24Hours = allPatterns.filter(p => p.reportedAt >= last24Hours).length;
    const reportsInLastWeek = allPatterns.filter(p => p.reportedAt >= lastWeek).length;

    // Calculate report type distribution
    const reportTypes: Record<string, number> = {};
    allPatterns.forEach(pattern => {
      reportTypes[pattern.reportType] = (reportTypes[pattern.reportType] || 0) + 1;
    });

    // Calculate average time between reports
    let averageTimeBetweenReports = 0;
    if (allPatterns.length > 1) {
      const sortedPatterns = allPatterns.sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime());
      let totalTimeDiff = 0;
      for (let i = 1; i < sortedPatterns.length; i++) {
        totalTimeDiff += sortedPatterns[i].reportedAt.getTime() - sortedPatterns[i - 1].reportedAt.getTime();
      }
      averageTimeBetweenReports = totalTimeDiff / (sortedPatterns.length - 1) / (60 * 1000); // in minutes
    }

    // Determine risk level and recommended action
    const { riskLevel, recommendedAction } = this.calculateRiskLevel(
      allPatterns.length,
      reportsInLast24Hours,
      reportsInLastWeek,
      reportTypes,
      averageTimeBetweenReports
    );

    return {
      socketId,
      totalReports: allPatterns.length,
      reportsInLast24Hours,
      reportsInLastWeek,
      reportTypes,
      averageTimeBetweenReports,
      riskLevel,
      recommendedAction
    };
  }

  /**
   * Calculate risk level based on various factors
   */
  private calculateRiskLevel(
    totalReports: number,
    reportsInLast24Hours: number,
    reportsInLastWeek: number,
    reportTypes: Record<string, number>,
    averageTimeBetweenReports: number
  ): { riskLevel: PatternAnalysis['riskLevel'], recommendedAction: PatternAnalysis['recommendedAction'] } {
    let riskScore = 0;

    // Base score from total reports
    riskScore += Math.min(totalReports * 10, 50);

    // Recent activity penalty
    riskScore += reportsInLast24Hours * 20;
    riskScore += reportsInLastWeek * 5;

    // Serious report types get higher penalties
    const seriousTypes = ['harassment', 'inappropriate_behavior'];
    const seriousReports = seriousTypes.reduce((sum, type) => sum + (reportTypes[type] || 0), 0);
    riskScore += seriousReports * 15;

    // Frequent reporting (short time between reports) increases risk
    if (averageTimeBetweenReports > 0 && averageTimeBetweenReports < 60) { // Less than 1 hour between reports
      riskScore += 25;
    } else if (averageTimeBetweenReports < 24 * 60) { // Less than 1 day between reports
      riskScore += 10;
    }

    // Determine risk level and action
    if (riskScore >= 80) {
      return { riskLevel: 'critical', recommendedAction: 'permanent_ban' };
    } else if (riskScore >= 50) {
      return { riskLevel: 'high', recommendedAction: 'temporary_ban' };
    } else if (riskScore >= 25) {
      return { riskLevel: 'medium', recommendedAction: 'warning' };
    } else {
      return { riskLevel: 'low', recommendedAction: 'none' };
    }
  }

  /**
   * Get all patterns for a specific user
   */
  async getUserPatterns(socketId: string): Promise<UserPattern[]> {
    const sql = `
      SELECT id, socket_id as socketId, session_id as sessionId, 
             report_type as reportType, reporter_type as reporterType, reported_at as reportedAt
      FROM user_patterns 
      WHERE socket_id = ?
      ORDER BY reported_at DESC
    `;

    const rows = await database.all<any>(sql, [socketId]);
    
    return rows.map(row => ({
      ...row,
      reportedAt: new Date(row.reportedAt)
    }));
  }

  /**
   * Create a user restriction
   */
  async createUserRestriction(restrictionData: CreateUserRestrictionData): Promise<UserRestriction> {
    // First, deactivate any existing active restrictions for this user
    await this.deactivateUserRestrictions(restrictionData.socketId);

    const restriction: UserRestriction = {
      id: uuidv4(),
      socketId: restrictionData.socketId,
      restrictionType: restrictionData.restrictionType,
      startTime: new Date(),
      endTime: restrictionData.durationMinutes 
        ? new Date(Date.now() + restrictionData.durationMinutes * 60 * 1000)
        : undefined,
      reason: restrictionData.reason,
      reportCount: restrictionData.reportCount,
      isActive: true
    };

    const sql = `
      INSERT INTO user_restrictions (id, socket_id, restriction_type, start_time, end_time, reason, report_count, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      restriction.id,
      restriction.socketId,
      restriction.restrictionType,
      restriction.startTime.toISOString(),
      restriction.endTime?.toISOString() || null,
      restriction.reason,
      restriction.reportCount,
      restriction.isActive ? 1 : 0
    ];

    await database.run(sql, params);
    return restriction;
  }

  /**
   * Check if a user is currently restricted
   */
  async isUserRestricted(socketId: string): Promise<UserRestriction | null> {
    const sql = `
      SELECT id, socket_id as socketId, restriction_type as restrictionType,
             start_time as startTime, end_time as endTime, reason, report_count as reportCount, is_active as isActive
      FROM user_restrictions 
      WHERE socket_id = ? AND is_active = 1
      ORDER BY start_time DESC
      LIMIT 1
    `;

    const row = await database.get<any>(sql, [socketId]);
    
    if (!row) {
      return null;
    }

    const restriction: UserRestriction = {
      ...row,
      startTime: new Date(row.startTime),
      endTime: row.endTime ? new Date(row.endTime) : undefined,
      isActive: Boolean(row.isActive)
    };

    // Check if temporary restriction has expired
    if (restriction.endTime && restriction.endTime <= new Date()) {
      await this.deactivateRestriction(restriction.id);
      return null;
    }

    return restriction;
  }

  /**
   * Deactivate a specific restriction
   */
  async deactivateRestriction(restrictionId: string): Promise<boolean> {
    const sql = 'UPDATE user_restrictions SET is_active = 0 WHERE id = ?';
    const result = await database.run(sql, [restrictionId]);
    return result.changes > 0;
  }

  /**
   * Deactivate all active restrictions for a user
   */
  async deactivateUserRestrictions(socketId: string): Promise<number> {
    const sql = 'UPDATE user_restrictions SET is_active = 0 WHERE socket_id = ? AND is_active = 1';
    const result = await database.run(sql, [socketId]);
    return result.changes;
  }

  /**
   * Process a report and apply automatic restrictions if needed
   */
  async processReportAndApplyRestrictions(
    reportedSocketId: string,
    sessionId: string,
    reportType: 'inappropriate_behavior' | 'spam' | 'harassment' | 'other',
    reporterType: 'venter' | 'listener'
  ): Promise<{ restriction?: UserRestriction; analysis: PatternAnalysis }> {
    // Record the pattern
    await this.recordUserPattern({
      socketId: reportedSocketId,
      sessionId,
      reportType,
      reporterType
    });

    // Analyze the user's pattern
    const analysis = await this.analyzeUserPattern(reportedSocketId);

    // Apply restriction if recommended
    let restriction: UserRestriction | undefined;
    if (analysis.recommendedAction !== 'none') {
      const restrictionData: CreateUserRestrictionData = {
        socketId: reportedSocketId,
        restrictionType: analysis.recommendedAction,
        reason: `Automatic restriction applied due to ${analysis.totalReports} reports. Risk level: ${analysis.riskLevel}`,
        reportCount: analysis.totalReports
      };

      // Set duration for temporary bans
      if (analysis.recommendedAction === 'temporary_ban') {
        // Progressive ban duration based on report count
        if (analysis.totalReports <= 3) {
          restrictionData.durationMinutes = 30; // 30 minutes
        } else if (analysis.totalReports <= 5) {
          restrictionData.durationMinutes = 2 * 60; // 2 hours
        } else if (analysis.totalReports <= 8) {
          restrictionData.durationMinutes = 24 * 60; // 24 hours
        } else {
          restrictionData.durationMinutes = 7 * 24 * 60; // 7 days
        }
      }

      restriction = await this.createUserRestriction(restrictionData);
    }

    return { restriction, analysis };
  }

  /**
   * Get restriction statistics for admin dashboard
   */
  async getRestrictionStats(): Promise<{
    totalRestrictions: number;
    activeRestrictions: number;
    restrictionsByType: Record<string, number>;
    averageReportsBeforeRestriction: number;
  }> {
    // Total restrictions
    const totalResult = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_restrictions'
    );
    const totalRestrictions = totalResult?.count || 0;

    // Active restrictions
    const activeResult = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_restrictions WHERE is_active = 1'
    );
    const activeRestrictions = activeResult?.count || 0;

    // Restrictions by type
    const typeResults = await database.all<{ restriction_type: string; count: number }>(
      'SELECT restriction_type, COUNT(*) as count FROM user_restrictions GROUP BY restriction_type'
    );
    const restrictionsByType: Record<string, number> = {};
    typeResults.forEach(row => {
      restrictionsByType[row.restriction_type] = row.count;
    });

    // Average reports before restriction
    const avgResult = await database.get<{ avg: number }>(
      'SELECT AVG(report_count) as avg FROM user_restrictions'
    );
    const averageReportsBeforeRestriction = Math.round(avgResult?.avg || 0);

    return {
      totalRestrictions,
      activeRestrictions,
      restrictionsByType,
      averageReportsBeforeRestriction
    };
  }

  /**
   * Clean up expired restrictions (called periodically)
   */
  async cleanupExpiredRestrictions(): Promise<number> {
    const sql = `
      UPDATE user_restrictions 
      SET is_active = 0 
      WHERE is_active = 1 
        AND end_time IS NOT NULL 
        AND end_time <= datetime('now')
    `;
    
    const result = await database.run(sql);
    return result.changes;
  }

  /**
   * Get recent patterns for admin review
   */
  async getRecentPatterns(limit: number = 50): Promise<UserPattern[]> {
    const sql = `
      SELECT id, socket_id as socketId, session_id as sessionId, 
             report_type as reportType, reporter_type as reporterType, reported_at as reportedAt
      FROM user_patterns 
      ORDER BY reported_at DESC
      LIMIT ?
    `;

    const rows = await database.all<any>(sql, [limit]);
    
    return rows.map(row => ({
      ...row,
      reportedAt: new Date(row.reportedAt)
    }));
  }

  /**
   * Get active restrictions for admin review
   */
  async getActiveRestrictions(): Promise<UserRestriction[]> {
    const sql = `
      SELECT id, socket_id as socketId, restriction_type as restrictionType,
             start_time as startTime, end_time as endTime, reason, report_count as reportCount, is_active as isActive
      FROM user_restrictions 
      WHERE is_active = 1
      ORDER BY start_time DESC
    `;

    const rows = await database.all<any>(sql);
    
    return rows.map(row => ({
      ...row,
      startTime: new Date(row.startTime),
      endTime: row.endTime ? new Date(row.endTime) : undefined,
      isActive: Boolean(row.isActive)
    }));
  }
}

export const patternDetectionService = new PatternDetectionService();