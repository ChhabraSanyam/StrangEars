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
  
  // Cold start detection and warmup handling
  private coldStartDetected = false;
  private isWarmingUp = false;
  private connectionFailureCount = 0;

  constructor() {
    // Restore session from localStorage if available
    this.restoreSessionFromStorage();
    this.setupSocket();
  }

  private setupSocket(): void {
    const serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';
    
    // Use longer timeout for potential cold starts
    const connectionTimeout = this.coldStartDetected ? 45000 : 20000; // 45s for cold start, 20s normal
    
    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: false, // We'll handle reconnection manually
      timeout: connectionTimeout,
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      // Check if this was a cold start (multiple connection failures)
      if (this.connectionFailureCount >= 2) {
        this.coldStartDetected = true;
        this.isWarmingUp = true;
        console.log('Cold start detected, entering warmup period...');
      }

      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.connectionFailureCount = 0; // Reset failure count on successful connection
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      
      // If warming up, wait before allowing actions
      if (this.isWarmingUp) {
        setTimeout(() => {
          this.isWarmingUp = false;
          console.log('Warmup period completed, backend ready');
          this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
          
          // Reset cold start detection after successful warmup
          setTimeout(() => {
            this.coldStartDetected = false;
            console.log('Cold start detection reset');
          }, 60000); // Reset after 1 minute of stable connection
        }, 3000); // 3 second warmup delay
      }
      
      // Attempt to restore session if we were in one
      if (this.currentSessionId && this.userRole) {
        this.restoreSession(this.currentSessionId, this.userRole);
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
      this.connectionFailureCount++;
      this.connectionStatus = 'disconnected';
      this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
      
      // Show different error messages based on failure count
      if (this.connectionFailureCount >= 2) {
        this.eventHandlers.onError?.('Backend is starting up, please wait...');
      } else {
        this.eventHandlers.onError?.(`Connection error: ${error.message}`);
      }
      
      this.attemptReconnection();
    });

    // Chat events
    this.socket.on('session-joined', (data: { sessionId: string; userType: 'venter' | 'listener' }) => {
      this.currentSessionId = data.sessionId;
      this.userRole = data.userType;
      this.saveSessionToStorage();
      this.eventHandlers.onSessionJoined?.(data.sessionId, data.userType);
    });

    // Session restoration events
    this.socket.on('session-restored', (data: { 
      sessionId: string; 
      userType: 'venter' | 'listener';
      messages: Message[];
      otherUser?: { username?: string; profilePhoto?: string };
      isOtherUserConnected: boolean;
    }) => {
      this.currentSessionId = data.sessionId;
      this.userRole = data.userType;
      this.saveSessionToStorage();
      this.eventHandlers.onSessionRestored?.(
        data.sessionId, 
        data.userType, 
        data.messages, 
        data.otherUser,
        data.isOtherUserConnected
      );
    });

    this.socket.on('session-not-found', () => {
      // Session no longer exists, clear local storage
      this.currentSessionId = null;
      this.userRole = null;
      this.clearSessionFromStorage();
      this.eventHandlers.onSessionNotFound?.();
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
      this.clearSessionFromStorage();
      this.eventHandlers.onSessionEnded?.(data.reason, data.endedBy);
    });

    this.socket.on('match-found', (data: { sessionId: string; userType: 'venter' | 'listener'; timestamp: Date }) => {
      this.currentSessionId = data.sessionId;
      this.userRole = data.userType;
      this.saveSessionToStorage();
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
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.eventHandlers.onError?.('Unable to reconnect to server. Please refresh the page.');
      return;
    }

    this.connectionStatus = 'reconnecting';
    this.eventHandlers.onConnectionStatusChange?.(this.connectionStatus);
    
    // Use longer delays for potential cold starts
    const baseDelay = this.coldStartDetected ? this.reconnectDelay * 2 : this.reconnectDelay;
    
    setTimeout(() => {
      this.reconnectAttempts++;
      
      // Recreate socket with updated timeout if cold start detected
      if (this.coldStartDetected && this.reconnectAttempts === 1) {
        this.setupSocket();
      }
      
      if (this.socket) {
        this.socket.connect();
      }
      
      // Exponential backoff with jitter
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2 + Math.random() * 1000,
        this.maxReconnectDelay
      );
    }, baseDelay);
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
      this.clearSessionFromStorage();
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

    // Clear session from storage when intentionally ending
    this.clearSessionFromStorage();
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

  restoreSession(sessionId: string, userRole: 'venter' | 'listener'): void {
    if (!this.socket || this.connectionStatus !== 'connected') {
      this.eventHandlers.onError?.('Not connected to server');
      return;
    }

    this.socket.emit('restore-session', { sessionId, userType: userRole });
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

  isWarmingUpBackend(): boolean {
    return this.isWarmingUp;
  }

  isColdStartDetected(): boolean {
    return this.coldStartDetected;
  }

  // Session persistence methods
  private saveSessionToStorage(): void {
    if (this.currentSessionId && this.userRole) {
      const sessionData = {
        sessionId: this.currentSessionId,
        userRole: this.userRole,
        timestamp: Date.now()
      };
      localStorage.setItem('chat_session', JSON.stringify(sessionData));
    }
  }

  private restoreSessionFromStorage(): void {
    try {
      const sessionData = localStorage.getItem('chat_session');
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        // Only restore if session is less than 25 minutes old (before Redis expiry)
        const sessionAge = Date.now() - parsed.timestamp;
        const maxAge = 25 * 60 * 1000; // 25 minutes in milliseconds
        
        if (sessionAge < maxAge) {
          this.currentSessionId = parsed.sessionId;
          this.userRole = parsed.userRole;
        } else {
          // Session too old, clear it
          this.clearSessionFromStorage();
        }
      }
    } catch (error) {
      console.error('Error restoring session from storage:', error);
      this.clearSessionFromStorage();
    }
  }

  private clearSessionFromStorage(): void {
    localStorage.removeItem('chat_session');
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
    this.clearSessionFromStorage();
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;