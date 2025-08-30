export interface Report {
  id: string;
  sessionId: string;
  reporterType: 'venter' | 'listener';
  reason?: string;
  timestamp: Date;
  resolved: boolean;
  reporterUsername?: string;
  reportedUsername?: string;
}

export interface CreateReportData {
  sessionId: string;
  reporterType: 'venter' | 'listener';
  reason?: string;
  reporterUsername?: string;
  reportedUsername?: string;
}

export interface ReportStats {
  totalReports: number;
  reportsToday: number;
  unresolvedReports: number;
  reportsByType: {
    venter: number;
    listener: number;
  };
}