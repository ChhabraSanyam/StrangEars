import { redisClient } from '../config/redis';
import { ChatSession, Message } from '../models/ChatSession';

export class RedisSessionStorage {
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSION_PREFIX = 'user_session:';
  private readonly SESSION_EXPIRY = 2 * 60 * 60; // 2 hours in seconds

  /**
   * Store a chat session in Redis with automatic expiration
   */
  async storeSession(session: ChatSession): Promise<void> {
    try {
      const client = await redisClient.getClient();
      const sessionKey = this.getSessionKey(session.id);
      
      // Store only essential session data to minimize memory usage
      const minimalSession = {
        id: session.id,
        venterSocketId: session.venterSocketId,
        listenerSocketId: session.listenerSocketId,
        status: session.status,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        // Store only last 20 messages to save memory
        messages: session.messages.slice(-20)
      };
      
      const sessionData = JSON.stringify(minimalSession);
      await client.setex(sessionKey, this.SESSION_EXPIRY, sessionData);

      // Store user-to-session mappings for quick lookup
      const venterKey = this.getUserSessionKey(session.venterSocketId);
      const listenerKey = this.getUserSessionKey(session.listenerSocketId);
      
      await Promise.all([
        client.setex(venterKey, this.SESSION_EXPIRY, session.id),
        client.setex(listenerKey, this.SESSION_EXPIRY, session.id)
      ]);

      console.log(`Session ${session.id} stored in Redis`);
    } catch (error) {
      console.error('Error storing session in Redis:', error);
      throw new Error('Failed to store session in Redis');
    }
  }

  /**
   * Retrieve a chat session from Redis
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const client = await redisClient.getClient();
      const sessionKey = this.getSessionKey(sessionId);
      
      const sessionData = await client.get(sessionKey);
      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData) as ChatSession;
      
      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      if (session.endedAt) {
        session.endedAt = new Date(session.endedAt);
      }
      
      // Convert message timestamps back to Date objects
      session.messages = session.messages.map(message => ({
        ...message,
        timestamp: new Date(message.timestamp)
      }));

      return session;
    } catch (error) {
      console.error('Error retrieving session from Redis:', error);
      return null;
    }
  }

  /**
   * Get session by user socket ID
   */
  async getSessionByUser(socketId: string): Promise<ChatSession | null> {
    try {
      const client = await redisClient.getClient();
      const userSessionKey = this.getUserSessionKey(socketId);
      
      const sessionId = await client.get(userSessionKey);
      if (!sessionId) {
        return null;
      }

      return await this.getSession(sessionId);
    } catch (error) {
      console.error('Error retrieving session by user from Redis:', error);
      return null;
    }
  }

  /**
   * Update session data in Redis
   */
  async updateSession(session: ChatSession): Promise<void> {
    try {
      const client = await redisClient.getClient();
      const sessionKey = this.getSessionKey(session.id);
      
      // Check if session exists
      const exists = await client.exists(sessionKey);
      if (!exists) {
        throw new Error(`Session ${session.id} does not exist in Redis`);
      }

      // Update session data
      const sessionData = JSON.stringify(session);
      await client.setex(sessionKey, this.SESSION_EXPIRY, sessionData);

      console.log(`Session ${session.id} updated in Redis`);
    } catch (error) {
      console.error('Error updating session in Redis:', error);
      throw new Error('Failed to update session in Redis');
    }
  }

  /**
   * Add a message to a session
   */
  async addMessage(sessionId: string, message: Omit<Message, 'sessionId'>): Promise<Message | null> {
    try {
      const session = await this.getSession(sessionId);
      if (!session || session.status !== 'active') {
        return null;
      }

      const fullMessage: Message = {
        ...message,
        sessionId
      };

      session.messages.push(fullMessage);
      await this.updateSession(session);

      return fullMessage;
    } catch (error) {
      console.error('Error adding message to session:', error);
      return null;
    }
  }

  /**
   * End a chat session
   */
  async endSession(sessionId: string, endedBy?: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      session.status = 'ended';
      session.endedAt = new Date();

      await this.updateSession(session);
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }

  /**
   * Delete a session and all associated data
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const client = await redisClient.getClient();
      
      // Get session to find user mappings
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      // Delete session and user mappings
      const sessionKey = this.getSessionKey(sessionId);
      const venterKey = this.getUserSessionKey(session.venterSocketId);
      const listenerKey = this.getUserSessionKey(session.listenerSocketId);

      const deletedCount = await client.del(sessionKey, venterKey, listenerKey);
      
      console.log(`Session ${sessionId} deleted from Redis (${deletedCount} keys removed)`);
      return deletedCount > 0;
    } catch (error) {
      console.error('Error deleting session from Redis:', error);
      return false;
    }
  }

  /**
   * Clean up sessions for a disconnected user
   */
  async cleanupUserSessions(socketId: string): Promise<string[]> {
    try {
      const cleanedSessions: string[] = [];
      const session = await this.getSessionByUser(socketId);
      
      if (session) {
        // End the session if it's still active
        if (session.status === 'active') {
          await this.endSession(session.id, socketId);
        }
        
        // Delete the session data
        await this.deleteSession(session.id);
        cleanedSessions.push(session.id);
      }

      return cleanedSessions;
    } catch (error) {
      console.error('Error cleaning up user sessions:', error);
      return [];
    }
  }

  /**
   * Get all active sessions (for monitoring/stats)
   */
  async getActiveSessions(): Promise<ChatSession[]> {
    try {
      const client = await redisClient.getClient();
      const pattern = this.getSessionKey('*');
      const keys = await client.keys(pattern);
      
      const sessions: ChatSession[] = [];
      
      for (const key of keys) {
        const sessionData = await client.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData) as ChatSession;
          
          // Convert date strings back to Date objects
          session.createdAt = new Date(session.createdAt);
          if (session.endedAt) {
            session.endedAt = new Date(session.endedAt);
          }
          
          // Convert message timestamps
          session.messages = session.messages.map(message => ({
            ...message,
            timestamp: new Date(message.timestamp)
          }));

          if (session.status === 'active') {
            sessions.push(session);
          }
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    endedSessions: number;
    totalMessages: number;
  }> {
    try {
      const client = await redisClient.getClient();
      const pattern = this.getSessionKey('*');
      const keys = await client.keys(pattern);
      
      let totalSessions = 0;
      let activeSessions = 0;
      let endedSessions = 0;
      let totalMessages = 0;

      for (const key of keys) {
        const sessionData = await client.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData) as ChatSession;
          totalSessions++;
          
          if (session.status === 'active') {
            activeSessions++;
          } else {
            endedSessions++;
          }
          
          totalMessages += session.messages.length;
        }
      }

      return {
        totalSessions,
        activeSessions,
        endedSessions,
        totalMessages
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        endedSessions: 0,
        totalMessages: 0
      };
    }
  }

  /**
   * Check if a user is in an active session
   */
  async isUserInSession(socketId: string): Promise<boolean> {
    try {
      const session = await this.getSessionByUser(socketId);
      return session?.status === 'active' || false;
    } catch (error) {
      console.error('Error checking if user is in session:', error);
      return false;
    }
  }

  /**
   * Get the other participant in a session
   */
  async getOtherParticipant(sessionId: string, currentSocketId: string): Promise<string | null> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return null;

      if (session.venterSocketId === currentSocketId) {
        return session.listenerSocketId;
      } else if (session.listenerSocketId === currentSocketId) {
        return session.venterSocketId;
      }

      return null;
    } catch (error) {
      console.error('Error getting other participant:', error);
      return null;
    }
  }

  /**
   * Get user role in session
   */
  async getUserRole(sessionId: string, socketId: string): Promise<'venter' | 'listener' | null> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return null;

      if (session.venterSocketId === socketId) {
        return 'venter';
      } else if (session.listenerSocketId === socketId) {
        return 'listener';
      }

      return null;
    } catch (error) {
      console.error('Error getting user role:', error);
      return null;
    }
  }

  /**
   * Auto-cleanup old ended sessions
   */
  async cleanupOldSessions(maxAgeMinutes: number = 30): Promise<number> {
    try {
      const client = await redisClient.getClient();
      const pattern = this.getSessionKey('*');
      const keys = await client.keys(pattern);
      
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
      let cleanedCount = 0;

      for (const key of keys) {
        const sessionData = await client.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData) as ChatSession;
          const endedAt = session.endedAt ? new Date(session.endedAt) : null;
          const createdAt = new Date(session.createdAt);
          
          // Clean up ended sessions or very old active sessions
          const shouldCleanup = 
            (session.status === 'ended' && endedAt && endedAt < cutoffTime) ||
            (createdAt < new Date(Date.now() - 2 * 60 * 60 * 1000)); // 2 hours max
          
          if (shouldCleanup) {
            await this.deleteSession(session.id);
            cleanedCount++;
          }
        }
      }

      console.log(`Cleaned up ${cleanedCount} old sessions from Redis`);
      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      return 0;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    return redisClient.healthCheck();
  }

  // Private helper methods
  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }

  private getUserSessionKey(socketId: string): string {
    return `${this.USER_SESSION_PREFIX}${socketId}`;
  }
}

// Export singleton instance
export const redisSessionStorage = new RedisSessionStorage();
export default redisSessionStorage;