/**
 * Service to map socketId to userSessionId for persistent user tracking
 * This allows us to maintain the persistent userSessionId across socket reconnections
 */

class UserSessionMappingService {
  private static instance: UserSessionMappingService;
  private socketToUserSessionMap: Map<string, string> = new Map();
  private userSessionToSocketMap: Map<string, Set<string>> = new Map();

  private constructor() {}

  public static getInstance(): UserSessionMappingService {
    if (!UserSessionMappingService.instance) {
      UserSessionMappingService.instance = new UserSessionMappingService();
    }
    return UserSessionMappingService.instance;
  }

  /**
   * Map a socketId to a userSessionId
   */
  public mapSocketToUserSession(socketId: string, userSessionId: string): void {
    // Remove any existing mapping for this socket
    this.removeSocketMapping(socketId);

    // Add new mapping
    this.socketToUserSessionMap.set(socketId, userSessionId);
    
    if (!this.userSessionToSocketMap.has(userSessionId)) {
      this.userSessionToSocketMap.set(userSessionId, new Set());
    }
    this.userSessionToSocketMap.get(userSessionId)!.add(socketId);
  }

  /**
   * Get userSessionId by socketId
   */
  public getUserSessionId(socketId: string): string | undefined {
    return this.socketToUserSessionMap.get(socketId);
  }

  /**
   * Get all socketIds for a userSessionId
   */
  public getSocketIds(userSessionId: string): string[] {
    const socketIds = this.userSessionToSocketMap.get(userSessionId);
    return socketIds ? Array.from(socketIds) : [];
  }

  /**
   * Remove mapping for a socketId (when socket disconnects)
   */
  public removeSocketMapping(socketId: string): void {
    const userSessionId = this.socketToUserSessionMap.get(socketId);
    if (userSessionId) {
      this.socketToUserSessionMap.delete(socketId);
      
      const socketIds = this.userSessionToSocketMap.get(userSessionId);
      if (socketIds) {
        socketIds.delete(socketId);
        if (socketIds.size === 0) {
          this.userSessionToSocketMap.delete(userSessionId);
        }
      }
    }
  }

  /**
   * Get the other participant's userSessionId in a session
   */
  public getOtherParticipantUserSessionId(sessionId: string, currentSocketId: string, otherSocketId: string): string | undefined {
    return this.getUserSessionId(otherSocketId);
  }

  /**
   * Clear all mappings (for testing or cleanup)
   */
  public clearAll(): void {
    this.socketToUserSessionMap.clear();
    this.userSessionToSocketMap.clear();
  }

  /**
   * Get mapping statistics
   */
  public getStats(): {
    totalSocketMappings: number;
    totalUserSessions: number;
  } {
    return {
      totalSocketMappings: this.socketToUserSessionMap.size,
      totalUserSessions: this.userSessionToSocketMap.size
    };
  }
}

export const userSessionMappingService = UserSessionMappingService.getInstance();