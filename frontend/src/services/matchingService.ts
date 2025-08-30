import { userSessionIdManager } from '../utils/userSessionId';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export interface MatchRequest {
  userType: 'venter' | 'listener';
}

export interface QueuedResponse {
  status: 'queued';
  socketId: string;
  userType: 'venter' | 'listener';
  estimatedWaitTime: number;
  queueStats: {
    ventersWaiting: number;
    listenersWaiting: number;
    totalWaiting: number;
  };
  timestamp: string;
}

export interface MatchedResponse {
  status: 'matched';
  sessionId: string;
  userType: 'venter' | 'listener';
  match: {
    venterSocketId: string;
    listenerSocketId: string;
  };
  timestamp: string;
}

export interface CancelResponse {
  message: string;
  socketId: string;
  timestamp: string;
}

export interface QueueStats {
  ventersWaiting: number;
  listenersWaiting: number;
  totalWaiting: number;
  timestamp: string;
}

export type MatchResponse = QueuedResponse | MatchedResponse;

class MatchingApiService {
  /**
   * Request a match with another user
   */
  async requestMatch(userType: 'venter' | 'listener', socketId: string): Promise<MatchResponse> {
    try {
      const userSessionId = userSessionIdManager.getUserSessionId();
      const response = await fetch(`${API_BASE_URL}/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userType, socketId, userSessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to request match');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel a pending match request
   */
  async cancelMatch(socketId: string): Promise<CancelResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/match/${socketId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel match');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get current queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const response = await fetch(`${API_BASE_URL}/match/stats`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get queue stats');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
}

export const matchingApiService = new MatchingApiService();