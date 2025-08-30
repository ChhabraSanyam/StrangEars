const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export interface ReportData {
  sessionId: string;
  reporterType: 'venter' | 'listener';
  reason?: string;
  reporterSocketId?: string;
  reporterUsername?: string;
  reportedUsername?: string;
}

export interface ReportResponse {
  message: string;
  reportId: string;
  timestamp: string;
}

class ReportService {
  /**
   * Submit a report for inappropriate behavior
   */
  async submitReport(reportData: ReportData): Promise<ReportResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error submitting report:', error);
      throw error;
    }
  }
}

export const reportService = new ReportService();
export default reportService;