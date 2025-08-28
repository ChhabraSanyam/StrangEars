import { io, Socket } from 'socket.io-client';
import { 
  Message, 
  ConnectionStatus, 
  ChatEventHandlers, 
  JoinSessionData, 
  SendMessageData, 
  EndSessionData,
  TypingData
} from '../types/chat';

class SocketService {
  private socket: Socket | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private eventHandlers: Partial<ChatEventHandlers> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private currentSessionId: string | null = null;
  private userRole: 'venter' | 'listener' | null = null;

  constructor() {
    this.setupSocket();
  }

  private setupSocket(): void {
    const serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';
    
    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: false, // We'll handle reconnection manually
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {

      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      
      // Rejoin session if we were in one
      if (this.currentSessionId && this.userRole) {
        this.joinSession(this.currentSessionId, this.userRole);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionStatus = 'disconnected';
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      
      // Only attempt reconnection for certain disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect
        return;
      }
      
      this.attemptReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.connectionStatus = 'disconnected';
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      this.eventHandlers.onError?.(`Connection error: ${error.message}`);
      
      this.attemptReconnection();
    });

    // Chat events
    this.socket.on('session-joined', (data: { sessionId: string; userType: 'venter' | 'listener' }) => {
      this.currentSessionId = data.sessionId;
      this.userRole = data.userType;
      this.eventHandlers.onSessionJoined?.(data.sessionId, data.userType);
    });

    this.socket.on('receive-message', (message: Message) => {
      // Convert timestamp string to Date object if needed
      if (typeof message.timestamp === 'string') {
        message.timestamp = new Date(message.timestamp);
      }
      this.eventHandlers.onMessage?.(message);
    });

    this.socket.on('user-joined', (data: { userType: 'venter' | 'listener'; username?: string; profilePhoto?: string; timestamp: Date }) => {
      this.eventHandlers.onUserJoined?.(data.username, data.profilePhoto);
    });

    this.socket.on('user-left', () => {
      this.eventHandlers.onUserLeft?.();
    });

    this.socket.on('session-ended', (data: { sessionId: string; endedBy: 'venter' | 'listener'; timestamp: Date; reason: string }) => {
      this.currentSessionId = null;
      this.userRole = null;
      this.eventHandlers.onSessionEnded?.(data.reason, data.endedBy);
    });

    this.socket.on('match-found', (data: { sessionId: string; userType: 'venter' | 'listener'; timestamp: Date }) => {
      this.currentSessionId = data.sessionId;
      this.userRole = data.userType;
      this.eventHandlers.onMatchFound?.(data.sessionId, data.userType);
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown socket error';
      this.eventHandlers.onError?.(errorMessage);
    });

    // Typing events
    this.socket.on('user-typing', (data: { isTyping: boolean }) => {
      this.eventHandlers.onUserTyping?.(data.isTyping);
    });

    // Spam protection events
    this.socket.on('spam-warning', (data: { message: string; action: string; timeRemaining?: number }) => {
      this.eventHandlers.onSpamWarning?.(data.message);
    });

    this.socket.on('message-blocked', (data: { message: string; action: string; timeRemaining?: number }) => {
      this.eventHandlers.onMessageBlocked?.(data.message, data.timeRemaining);
    });
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.eventHandlers.onError?.('Unable to reconnect to server. Please refresh the page.');
      return;
    }

    this.connectionStatus = 'reconnecting';
    this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      
      if (this.socket) {
        this.socket.connect();
      }
      
      // Exponential backoff with jitter
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2 + Math.random() * 1000,
        this.maxReconnectDelay
      );
    }, this.reconnectDelay);
  }

  // Public methods
  connect(): void {
    if (this.socket && this.connectionStatus === 'disconnected') {
      this.connectionStatus = 'connecting';
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      this.socket.connect();
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.currentSessionId = null;
      this.userRole = null;
    }
  }

  joinSession(sessionId: string, userRole: 'venter' | 'listener', username?: string, profilePhoto?: File | null): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      this.eventHandlers.onError?.('Not connected to server');
      return;
    }

    // Convert profile photo to base64 if provided
    if (profilePhoto && profilePhoto instanceof File) {
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const base64Photo = reader.result as string;
          
          // Check if the base64 string is too large (should be very small after optimization)
          if (base64Photo.length > 200 * 1024) { // 200KB base64 limit (≈150KB file)
            console.warn('Profile photo still too large after optimization, sending without photo');
            // Send without photo to ensure username still gets through
            const data: JoinSessionData = { sessionId, userType: userRole, username };
            this.socket!.emit('join-session', data);
            this.eventHandlers.onError?.('Profile photo optimization failed. Joining without photo.');
            return;
          }
          
          console.log(`Transmitting optimized profile photo: ${Math.round(base64Photo.length / 1024)}KB`);
          
          const data: JoinSessionData = { sessionId, userType: userRole, username, profilePhoto: base64Photo };
          this.socket!.emit('join-session', data);
        } catch (error) {
          console.error('Error processing profile photo:', error);
          // Fallback: send without photo to ensure username gets through
          const data: JoinSessionData = { sessionId, userType: userRole, username };
          this.socket!.emit('join-session', data);
          this.eventHandlers.onError?.('Failed to process profile photo. Joining session without photo.');
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading profile photo file');
        // Fallback: send without photo to ensure username gets through
        const data: JoinSessionData = { sessionId, userType: userRole, username };
        this.socket!.emit('join-session', data);
        this.eventHandlers.onError?.('Failed to read profile photo. Joining session without photo.');
      };
      
      reader.readAsDataURL(profilePhoto);
    } else {
      const data: JoinSessionData = { sessionId, userType: userRole, username };
      this.socket.emit('join-session', data);
    }
  }

  sendMessage(sessionId: string, content: string): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      this.eventHandlers.onError?.('Not connected to server');
      return;
    }

    if (!content.trim()) {
      return;
    }

    const data: SendMessageData = { sessionId, content: content.trim() };
    this.socket.emit('send-message', data);
  }

  endSession(sessionId: string): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      this.eventHandlers.onError?.('Not connected to server');
      return;
    }

    const data: EndSessionData = { sessionId };
    this.socket.emit('end-session', data);
  }

  sendTypingStatus(sessionId: string, isTyping: boolean): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      return; // Silently fail for typing events
    }

    const data: TypingData = { sessionId, isTyping };
    this.socket.emit('typing', data);
  }

  // Event handler management
  setEventHandlers(handlers: Partial<ChatEventHandlers>): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  removeEventHandlers(): void {
    this.eventHandlers = {};
  }

  // Getters
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getUserRole(): 'venter' | 'listener' | null {
    return this.userRole;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected' && this.socket?.connected === true;
  }

  // Cleanup
  destroy(): void {
    this.removeEventHandlers();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentSessionId = null;
    this.userRole = null;
    this.connectionStatus = 'disconnected';
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;