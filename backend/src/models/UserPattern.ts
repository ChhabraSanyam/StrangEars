export interface UserPattern {
  id: string;
  socketId: string;
  sessionId: string;
  reportedAt: Date;
  reportType: 'inappropriate_behavior' | 'spam' | 'harassment' | 'other';
  reporterType: 'venter' | 'listener';
}

export interface UserRestriction {
  id: string;
  socketId: string;
  restrictionType: 'temporary_ban' | 'warning' | 'permanent_ban';
  startTime: Date;
  endTime?: Date;
  reason: string;
  reportCount: number;
  isActive: boolean;
}

export interface CreateUserPatternData {
  socketId: string;
  sessionId: string;
  reportType: 'inappropriate_behavior' | 'spam' | 'harassment' | 'other';
  reporterType: 'venter' | 'listener';
}

export interface CreateUserRestrictionData {
  socketId: string;
  restrictionType: 'temporary_ban' | 'warning' | 'permanent_ban';
  durationMinutes?: number;
  reason: string;
  reportCount: number;
}

export interface PatternAnalysis {
  socketId: string;
  totalReports: number;
  reportsInLast24Hours: number;
  reportsInLastWeek: number;
  reportTypes: Record<string, number>;
  averageTimeBetweenReports: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: 'none' | 'warning' | 'temporary_ban' | 'permanent_ban';
}