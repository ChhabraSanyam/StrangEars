export interface Message {
  id: string;
  sessionId: string;
  sender: 'venter' | 'listener';
  senderName?: string;
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  venterSocketId: string;
  listenerSocketId: string;
  venterName?: string;
  listenerName?: string;
  createdAt: Date;
  endedAt?: Date;
  status: 'active' | 'ended';
  messages: Message[];
}

export class ChatSessionManager {
  private sessions: Map<string, ChatSession> = new Map();
  private userSessions: Map<string, string> = new Map(); // socketId -> sessionId
  private useRedis: boolean = false;
  private redisSessionStorage: any = null;

  constructor(useRedis: boolean = false) {
    this.useRedis = useRedis;
    if (useRedis) {
      // Lazy load Redis storage to avoid circular dependencies
      this.initializeRedisStorage();
    }
  }

  private async initializeRedisStorage(): Promise<void> {
    try {
      const { redisSessionStorage } = await import('../services/redisSessionStorage');
      this.redisSessionStorage = redisSessionStorage;
      
      // Test Redis connection
      const isHealthy = await this.redisSessionStorage.healthCheck();
      if (!isHealthy) {
        console.warn('Redis health check failed, falling back to in-memory storage');
        this.useRedis = false;
      } else {
        console.log('Redis session storage initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize Redis storage, using in-memory fallback:', error);
      this.useRedis = false;
    }
  }

  /**
   * Create a new chat session between a venter and listener
   */
  async createSession(sessionId: string, venterSocketId: string, listenerSocketId: string, venterName?: string, listenerName?: string): Promise<ChatSession> {
    const session: ChatSession = {
      id: sessionId,
      venterSocketId,
      listenerSocketId,
      venterName,
      listenerName,
      createdAt: new Date(),
      status: 'active',
      messages: []
    };

    if (this.useRedis && this.redisSessionStorage) {
      try {
        await this.redisSessionStorage.storeSession(session);
        return session;
      } catch (error) {
        console.error('Failed to store session in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory storage
    this.sessions.set(sessionId, session);
    this.userSessions.set(venterSocketId, sessionId);
    this.userSessions.set(listenerSocketId, sessionId);

    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        const session = await this.redisSessionStorage.getSession(sessionId);
        return session || undefined;
      } catch (error) {
        console.error('Failed to get session from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    return this.sessions.get(sessionId);
  }

  /**
   * Get session by user socket ID
   */
  async getSessionByUser(socketId: string): Promise<ChatSession | undefined> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        const session = await this.redisSessionStorage.getSessionByUser(socketId);
        return session || undefined;
      } catch (error) {
        console.error('Failed to get session by user from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const sessionId = this.userSessions.get(socketId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  /**
   * Add a message to a session
   */
  async addMessage(sessionId: string, message: Omit<Message, 'sessionId'>): Promise<Message | null> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.addMessage(sessionId, message);
      } catch (error) {
        console.error('Failed to add message to Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return null;
    }

    const fullMessage: Message = {
      ...message,
      sessionId
    };

    session.messages.push(fullMessage);

    return fullMessage;
  }

  /**
   * End a chat session
   */
  async endSession(sessionId: string, endedBy?: string): Promise<boolean> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.endSession(sessionId, endedBy);
      } catch (error) {
        console.error('Failed to end session in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'ended';
    session.endedAt = new Date();

    return true;
  }

  /**
   * Clean up a session (remove from storage)
   */
  async cleanupSession(sessionId: string): Promise<boolean> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.deleteSession(sessionId);
      } catch (error) {
        console.error('Failed to cleanup session in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove user session mappings
    this.userSessions.delete(session.venterSocketId);
    this.userSessions.delete(session.listenerSocketId);

    // Remove session
    this.sessions.delete(sessionId);

    return true;
  }

  /**
   * Clean up sessions for a disconnected user
   */
  async cleanupUserSessions(socketId: string): Promise<string[]> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.cleanupUserSessions(socketId);
      } catch (error) {
        console.error('Failed to cleanup user sessions in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const cleanedSessions: string[] = [];
    const sessionId = this.userSessions.get(socketId);
    
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        // End the session if it's still active
        if (session.status === 'active') {
          await this.endSession(sessionId, socketId);
        }
        
        // Clean up the session
        await this.cleanupSession(sessionId);
        cleanedSessions.push(sessionId);
      }
    }

    return cleanedSessions;
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<ChatSession[]> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.getActiveSessions();
      } catch (error) {
        console.error('Failed to get active sessions from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    return Array.from(this.sessions.values()).filter(session => session.status === 'active');
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
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.getSessionStats();
      } catch (error) {
        console.error('Failed to get session stats from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const allSessions = Array.from(this.sessions.values());
    const activeSessions = allSessions.filter(s => s.status === 'active');
    const endedSessions = allSessions.filter(s => s.status === 'ended');
    const totalMessages = allSessions.reduce((sum, session) => sum + session.messages.length, 0);

    return {
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      endedSessions: endedSessions.length,
      totalMessages
    };
  }

  /**
   * Check if a user is in an active session
   */
  async isUserInSession(socketId: string): Promise<boolean> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.isUserInSession(socketId);
      } catch (error) {
        console.error('Failed to check user session in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const sessionId = this.userSessions.get(socketId);
    if (!sessionId) return false;
    
    const session = this.sessions.get(sessionId);
    return session?.status === 'active' || false;
  }

  /**
   * Get the other participant in a session
   */
  async getOtherParticipant(sessionId: string, currentSocketId: string): Promise<string | null> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.getOtherParticipant(sessionId, currentSocketId);
      } catch (error) {
        console.error('Failed to get other participant from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.venterSocketId === currentSocketId) {
      return session.listenerSocketId;
    } else if (session.listenerSocketId === currentSocketId) {
      return session.venterSocketId;
    }

    return null;
  }

  /**
   * Get user role in session
   */
  async getUserRole(sessionId: string, socketId: string): Promise<'venter' | 'listener' | null> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.getUserRole(sessionId, socketId);
      } catch (error) {
        console.error('Failed to get user role from Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.venterSocketId === socketId) {
      return 'venter';
    } else if (session.listenerSocketId === socketId) {
      return 'listener';
    }

    return null;
  }

  /**
   * Auto-cleanup old ended sessions (called periodically)
   */
  async cleanupOldSessions(maxAgeMinutes: number = 60): Promise<number> {
    if (this.useRedis && this.redisSessionStorage) {
      try {
        return await this.redisSessionStorage.cleanupOldSessions(maxAgeMinutes);
      } catch (error) {
        console.error('Failed to cleanup old sessions in Redis, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'ended' && session.endedAt && session.endedAt < cutoffTime) {
        await this.cleanupSession(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}