export interface Report {
  id: string;
  sessionId: string;
  reporterType: 'venter' | 'listener';
  reason?: string;
  timestamp: Date;
  resolved: boolean;
}

export interface CreateReportData {
  sessionId: string;
  reporterType: 'venter' | 'listener';
  reason?: string;
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