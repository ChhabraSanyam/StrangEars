import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { ChatSessionManager } from "../models/ChatSession";
import { matchingService } from "./matchingService";
import { validateSocketData, schemas, filterContent } from "../middleware/validation";
import { checkMessageThrottle } from "../middleware/socketThrottling";
import { checkSocketMessageSpam } from "../middleware/spamPrevention";

export interface SocketUser {
  socketId: string;
  userType: "venter" | "listener";
  username?: string;
  profilePhoto?: string;
  sessionId?: string;
  connectedAt: Date;
}

export class SocketService {
  private static instance: SocketService | null = null;
  private io: Server;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private sessionSockets: Map<string, Set<string>> = new Map(); // sessionId -> Set of socketIds
  private sessionManager: ChatSessionManager;

  constructor(io: Server) {
    this.io = io;
    // Enable Redis for session storage
    this.sessionManager = new ChatSessionManager(true);
    this.setupEventHandlers();
    this.startCleanupInterval();

    // Set up bidirectional reference with matching service
    matchingService.setSocketService(this);

    // Set singleton instance
    SocketService.instance = this;
  }

  public static getInstance(): SocketService | null {
    return SocketService.instance;
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`Socket connected: ${socket.id} from ${socket.handshake.address}`);

      // Track connected user immediately
      const user: SocketUser = {
        socketId: socket.id,
        userType: "venter", // Default, will be updated when joining session
        connectedAt: new Date(),
      };
      this.connectedUsers.set(socket.id, user);

      // Handle user joining (after matching)
      socket.on(
        "join-session",
        (data: { sessionId: string; userType: "venter" | "listener" }) => {
          // Validate input
          const validation = validateSocketData(data, schemas.joinSession);
          if (!validation.isValid) {
            socket.emit("error", { message: validation.error });
            return;
          }
          this.handleJoinSession(socket, validation.sanitizedData);
        }
      );

      // Handle sending messages
      socket.on(
        "send-message",
        (data: { sessionId: string; content: string }) => {
          // Check throttling
          const throttleCheck = checkMessageThrottle(socket);
          if (!throttleCheck.allowed) {
            socket.emit("error", { message: throttleCheck.reason });
            return;
          }

          // Validate input
          const validation = validateSocketData(data, schemas.socketMessage);
          if (!validation.isValid) {
            socket.emit("error", { message: validation.error });
            return;
          }

          // Check for spam
          const spamCheck = checkSocketMessageSpam(socket, validation.sanitizedData.content);
          if (!spamCheck.allowed) {
            socket.emit("error", { 
              message: spamCheck.reason,
              action: spamCheck.action 
            });
            return;
          }

          this.handleSendMessage(socket, validation.sanitizedData);
        }
      );

      // Handle ending session
      socket.on("end-session", (data: { sessionId: string }) => {
        // Validate input
        const validation = validateSocketData(data, schemas.endSession);
        if (!validation.isValid) {
          socket.emit("error", { message: validation.error });
          return;
        }
        this.handleEndSession(socket, validation.sanitizedData);
      });

      // Handle typing events
      socket.on("typing", (data: { sessionId: string; isTyping: boolean }) => {
        // Validate input
        const validation = validateSocketData(data, schemas.typing);
        if (!validation.isValid) {
          return; // Silently fail for typing events
        }
        this.handleTyping(socket, validation.sanitizedData);
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });

      // Handle connection errors
      socket.on("error", (error) => {
        console.error("Socket error:", error);
      });
    });
  }

  private async handleJoinSession(
    socket: Socket,
    data: { sessionId: string; userType: "venter" | "listener"; username?: string; profilePhoto?: string }
  ): Promise<void> {
    try {
      const { sessionId, userType, username, profilePhoto } = data;

      // Validate input
      if (
        !sessionId ||
        !userType ||
        !["venter", "listener"].includes(userType)
      ) {
        socket.emit("error", { message: "Invalid session data" });
        return;
      }

      // Validate profile photo size if provided
      if (profilePhoto) {
        // Check if base64 string is too large (should be <200KB after optimization)
        if (profilePhoto.length > 200 * 1024) {
          // Continue without the photo to ensure username is processed
          data.profilePhoto = undefined;
        }
      }

      // Update user information
      const user = this.connectedUsers.get(socket.id);
      if (user) {
        user.userType = userType;
        user.username = username;
        user.profilePhoto = profilePhoto;
        user.sessionId = sessionId;
      }

      // Add socket to session group
      if (!this.sessionSockets.has(sessionId)) {
        this.sessionSockets.set(sessionId, new Set());
      }
      this.sessionSockets.get(sessionId)!.add(socket.id);

      // Check if we need to create a session in the session manager
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        // Get the other participants to determine roles
        const sessionSockets = this.sessionSockets.get(sessionId);
        if (sessionSockets && sessionSockets.size === 2) {
          // We have both participants, create the session
          const socketIds = Array.from(sessionSockets);
          const venterSocketId =
            userType === "venter"
              ? socket.id
              : socketIds.find((id) => id !== socket.id);
          const listenerSocketId =
            userType === "listener"
              ? socket.id
              : socketIds.find((id) => id !== socket.id);

          if (venterSocketId && listenerSocketId) {
            const venterUser = this.connectedUsers.get(venterSocketId);
            const listenerUser = this.connectedUsers.get(listenerSocketId);
            await this.sessionManager.createSession(
              sessionId,
              venterSocketId,
              listenerSocketId,
              venterUser?.username,
              listenerUser?.username
            );
          }
        }
      }

      // Join the socket to the session room
      socket.join(sessionId);

      // Notify the user they've joined successfully
      socket.emit("session-joined", {
        sessionId,
        userType,
        timestamp: new Date(),
      });

      // Check how many users are now in the session
      const sessionSockets = this.sessionSockets.get(sessionId);
      const userCount = sessionSockets ? sessionSockets.size : 0;

      if (userCount === 2) {
        // Both users are now in the session - notify each about the other
        // Add a small delay to ensure both users are fully set up
        setTimeout(() => {
          const currentSessionSockets = this.sessionSockets.get(sessionId);
          if (!currentSessionSockets || currentSessionSockets.size !== 2) {
            return;
          }

          const allSocketIds = Array.from(currentSessionSockets);
          const allUsers = allSocketIds.map(id => ({
            socketId: id,
            user: this.connectedUsers.get(id),
            socket: this.io.sockets.sockets.get(id)
          })).filter(item => item.user && item.socket && item.socket.connected);

          if (allUsers.length === 2) {
            const [user1, user2] = allUsers;
            
            // Notify user1 about user2
            user1.socket!.emit("user-joined", {
              userType: user2.user!.userType,
              username: user2.user!.username,
              profilePhoto: user2.user!.profilePhoto,
              timestamp: new Date(),
            });

            // Notify user2 about user1
            user2.socket!.emit("user-joined", {
              userType: user1.user!.userType,
              username: user1.user!.username,
              profilePhoto: user1.user!.profilePhoto,
              timestamp: new Date(),
            });
          }
        }, 50);
      } else {
        // Only notify other participants (if any) about this user joining
        socket.to(sessionId).emit("user-joined", {
          userType,
          username,
          profilePhoto,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("Error handling join-session:", error);
      socket.emit("error", { message: "Failed to join session" });
    }
  }

  private async handleSendMessage(
    socket: Socket,
    data: { sessionId: string; content: string }
  ): Promise<void> {
    try {
      const { sessionId, content } = data;
      const user = this.connectedUsers.get(socket.id);

      // Validate user and session
      if (!user || user.sessionId !== sessionId) {
        socket.emit("error", {
          message: "Invalid session or user not in session",
        });
        return;
      }

      // Filter and validate message content
      const contentFilter = filterContent(content);
      if (!contentFilter.isAllowed) {
        socket.emit("error", { 
          message: contentFilter.reason || "Message content not allowed" 
        });
        return;
      }

      const filteredContent = contentFilter.filteredContent;

      // Add message to session
      const message = await this.sessionManager.addMessage(sessionId, {
        id: uuidv4(),
        sender: user.userType,
        senderName: user.username,
        content: filteredContent,
        timestamp: new Date(),
      });

      if (!message) {
        socket.emit("error", { message: "Session not found or inactive" });
        return;
      }

      // Send message to all participants in the session (including sender for confirmation)
      this.io.to(sessionId).emit("receive-message", message);
    } catch (error) {
      console.error("Error handling send-message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  }

  private async handleEndSession(socket: Socket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const user = this.connectedUsers.get(socket.id);

      // Validate input
      if (!sessionId) {
        socket.emit("error", { message: "Session ID is required" });
        return;
      }

      if (!user) {
        socket.emit("error", { message: "User not found" });
        return;
      }

      // Check if user is in the specified session
      if (user.sessionId !== sessionId) {
        socket.emit("error", { message: "User not in specified session" });
        return;
      }

      // Get session before ending it to access participant info
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        // Session might already be ended or cleaned up
        socket.emit("error", { message: "Session not found or already ended" });
        return;
      }

      // Verify user is actually a participant in this session
      if (
        session.venterSocketId !== socket.id &&
        session.listenerSocketId !== socket.id
      ) {
        socket.emit("error", {
          message: "User not a participant in this session",
        });
        return;
      }

      // End the session in the session manager
      const ended = await this.sessionManager.endSession(sessionId, socket.id);
      if (!ended) {
        socket.emit("error", { message: "Failed to end session" });
        return;
      }



      // Notify all participants that the session is ending
      this.io.to(sessionId).emit("session-ended", {
        sessionId,
        endedBy: user.userType,
        timestamp: new Date(),
        reason: "user_ended",
      });

      // Clean up session immediately after ending
      this.cleanupSession(sessionId);

      // Also clean up from session manager
      await this.sessionManager.cleanupSession(sessionId);

    } catch (error) {
      console.error("Error handling end-session:", error);
      socket.emit("error", { message: "Failed to end session" });
    }
  }

  private handleTyping(socket: Socket, data: { sessionId: string; isTyping: boolean }): void {
    try {
      const { sessionId, isTyping } = data;
      const user = this.connectedUsers.get(socket.id);

      // Validate input
      if (!sessionId || typeof isTyping !== 'boolean') {
        return; // Silently fail for typing events
      }

      if (!user || user.sessionId !== sessionId) {
        return; // Silently fail for typing events
      }

      // Notify other participants in the session about typing status
      socket.to(sessionId).emit("user-typing", { isTyping });
    } catch (error) {
      console.error("Error handling typing:", error);
      // Silently fail for typing events - don't send error to client
    }
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    try {
      const user = this.connectedUsers.get(socket.id);

      if (user && user.sessionId) {
        // Get session before ending it for analytics
        const session = await this.sessionManager.getSession(user.sessionId);
        
        // End the session in the session manager
        await this.sessionManager.endSession(user.sessionId, socket.id);



        // Notify other participants about the disconnection and session end
        socket.to(user.sessionId).emit("session-ended", {
          sessionId: user.sessionId,
          endedBy: user.userType,
          timestamp: new Date(),
          reason: "user_disconnected",
        });

        // Clean up the session if this was an active session
        this.cleanupSession(user.sessionId);
      }

      // Clean up any sessions for this user
      await this.sessionManager.cleanupUserSessions(socket.id);

      // Remove user from connected users
      this.connectedUsers.delete(socket.id);
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  }

  private cleanupSession(sessionId: string): void {
    try {
      const socketIds = this.sessionSockets.get(sessionId);

      if (socketIds) {


        // Remove session from all connected users
        socketIds.forEach((socketId) => {
          const user = this.connectedUsers.get(socketId);
          if (user) {
            user.sessionId = undefined;
          }

          // Make socket leave the session room
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(sessionId);
          }
        });

        // Remove session tracking
        this.sessionSockets.delete(sessionId);

      }
    } catch (error) {
      console.error("Error cleaning up session:", error);
    }
  }

  // Public methods for external services
  public getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  public getSessionCount(): number {
    return this.sessionSockets.size;
  }

  public getUsersInSession(sessionId: string): SocketUser[] {
    const socketIds = this.sessionSockets.get(sessionId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map((socketId) => this.connectedUsers.get(socketId))
      .filter((user): user is SocketUser => user !== undefined);
  }

  public isUserConnected(socketId: string): boolean {
    return this.connectedUsers.has(socketId);
  }

  // Method to notify users about successful matches (called by matching service)
  public async notifyMatch(
    venterSocketId: string,
    listenerSocketId: string,
    sessionId: string
  ): Promise<void> {
    try {
      // Create the session in the session manager
      await this.sessionManager.createSession(
        sessionId,
        venterSocketId,
        listenerSocketId
      );

      // Notify both users about the match
      const matchData = {
        sessionId,
        timestamp: new Date(),
      };

      this.io.to(venterSocketId).emit("match-found", {
        ...matchData,
        userType: "venter",
      });

      this.io.to(listenerSocketId).emit("match-found", {
        ...matchData,
        userType: "listener",
      });
    } catch (error) {
      console.error("Error notifying match:", error);
    }
  }

  // Method to handle match requests and integrate with matching service
  public async handleMatchRequest(
    socketId: string,
    userType: "venter" | "listener"
  ): Promise<{
    status: "matched" | "queued" | "restricted";
    sessionId?: string;
    estimatedWaitTime?: number;
    restrictionInfo?: {
      type: string;
      reason: string;
      endTime?: Date;
    };
  }> {
    try {
      // Add to matching queue
      const match = await matchingService.addToQueue(socketId, userType);

      if (match) {
        // Immediate match found - notify both users
        await this.notifyMatch(
          match.venterSocketId,
          match.listenerSocketId,
          match.sessionId
        );
        return {
          status: "matched",
          sessionId: match.sessionId,
        };
      } else {
        // Added to queue
        const estimatedWaitTime =
          await matchingService.getEstimatedWaitTime(userType);
        return {
          status: "queued",
          estimatedWaitTime,
        };
      }
    } catch (error) {
      // Check if this is a restriction error
      if (error instanceof Error && error.message.includes('restricted')) {
        // Get restriction details
        try {
          const { reportService } = await import('./reportService');
          const restriction = await reportService.isUserRestricted(socketId);
          if (restriction) {
            return {
              status: "restricted",
              restrictionInfo: {
                type: restriction.restrictionType,
                reason: restriction.reason,
                endTime: restriction.endTime
              }
            };
          }
        } catch (restrictionError) {
          console.error("Error getting restriction details:", restrictionError);
        }
        
        // Fallback restriction response
        return {
          status: "restricted",
          restrictionInfo: {
            type: "unknown",
            reason: error.message
          }
        };
      }
      
      console.error("Error handling match request:", error);
      throw error;
    }
  }

  // Start periodic cleanup of old sessions
  private startCleanupInterval(): void {
    // Clean up old ended sessions every 10 minutes (more aggressive for free tier)
    setInterval(async () => {
      await this.sessionManager.cleanupOldSessions(30); // Clean sessions older than 30 minutes
      await matchingService.cleanupExpiredEntries(); // Also clean expired queue entries
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  // Public methods for session management
  public getSessionManager(): ChatSessionManager {
    return this.sessionManager;
  }

  public async getSessionStats() {
    return await this.sessionManager.getSessionStats();
  }

  /**
   * Terminate a session immediately (used for reports and moderation)
   */
  public async terminateSession(sessionId: string, reason: string = 'terminated'): Promise<void> {
    try {
      // Get session before ending it
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        console.warn(`Attempted to terminate non-existent session: ${sessionId}`);
        return;
      }

      // End the session in the session manager
      await this.sessionManager.endSession(sessionId);

      // Notify all participants that the session has been terminated
      this.io.to(sessionId).emit("session-ended", {
        sessionId,
        endedBy: 'system',
        timestamp: new Date(),
        reason: reason,
        message: reason === 'reported' 
          ? 'This session has been terminated due to a report of inappropriate behavior.'
          : 'This session has been terminated by the system.'
      });

      // Clean up session immediately
      this.cleanupSession(sessionId);

      // Also clean up from session manager
      await this.sessionManager.cleanupSession(sessionId);

      console.log(`Session ${sessionId} terminated due to: ${reason}`);
    } catch (error) {
      console.error(`Error terminating session ${sessionId}:`, error);
      throw error;
    }
  }
}
