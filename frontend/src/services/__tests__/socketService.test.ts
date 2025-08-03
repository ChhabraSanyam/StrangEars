import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, ChatEventHandlers } from '../../types/chat';

// Create a mock socket instance
let mockSocket: Partial<Socket>;
let mockIo: Mock;

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn()
}));

describe('SocketService Integration Tests', () => {
  let eventHandlers: Partial<ChatEventHandlers>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh mock socket for each test
    mockSocket = {
      id: 'test-socket-id',
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    };

    // Mock io function
    mockIo = vi.mocked(io);
    mockIo.mockReturnValue(mockSocket as Socket);

    // Setup event handlers
    eventHandlers = {
      onMessage: vi.fn(),
      onSessionJoined: vi.fn(),
      onSessionEnded: vi.fn(),
      onConnectionStatusChange: vi.fn(),
      onUserJoined: vi.fn(),
      onUserLeft: vi.fn(),
      onError: vi.fn()
    };
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Socket Service Initialization', () => {
    it('should initialize socket with correct configuration', async () => {
      // Import the service to trigger initialization
      await import('../socketService');
      
      expect(mockIo).toHaveBeenCalledWith(
        'http://localhost:5001',
        expect.objectContaining({
          autoConnect: false,
          reconnection: false,
          timeout: 10000,
          transports: ['websocket', 'polling']
        })
      );
    });

    it('should set up event listeners on socket', async () => {
      await import('../socketService');
      
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('session-joined', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('receive-message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('user-joined', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('user-left', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('session-ended', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('Event Handling', () => {
    it('should handle session joined event', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const sessionJoinedHandler = onCallback.mock.calls.find(call => call[0] === 'session-joined')?.[1];
      
      if (sessionJoinedHandler) {
        const sessionData = { sessionId: 'test-session', userRole: 'venter' as const };
        sessionJoinedHandler(sessionData);
        expect(eventHandlers.onSessionJoined).toHaveBeenCalledWith('test-session', 'venter');
      }
    });

    it('should handle received messages', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const messageHandler = onCallback.mock.calls.find(call => call[0] === 'receive-message')?.[1];
      
      if (messageHandler) {
        const message: Message = {
          id: 'msg-1',
          sessionId: 'test-session',
          sender: 'listener',
          content: 'Hello there',
          timestamp: new Date()
        };
        
        messageHandler(message);
        expect(eventHandlers.onMessage).toHaveBeenCalledWith(message);
      }
    });

    it('should handle connection status changes', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const connectHandler = onCallback.mock.calls.find(call => call[0] === 'connect')?.[1];
      
      if (connectHandler) {
        connectHandler();
        expect(eventHandlers.onConnectionStatusChange).toHaveBeenCalledWith('connected');
      }
    });

    it('should handle user events', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      
      const userJoinedHandler = onCallback.mock.calls.find(call => call[0] === 'user-joined')?.[1];
      if (userJoinedHandler) {
        userJoinedHandler();
        expect(eventHandlers.onUserJoined).toHaveBeenCalled();
      }

      const userLeftHandler = onCallback.mock.calls.find(call => call[0] === 'user-left')?.[1];
      if (userLeftHandler) {
        userLeftHandler();
        expect(eventHandlers.onUserLeft).toHaveBeenCalled();
      }
    });
  });

  describe('Message Processing', () => {
    it('should convert timestamp strings to Date objects', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const messageHandler = onCallback.mock.calls.find(call => call[0] === 'receive-message')?.[1];
      
      if (messageHandler) {
        const message = {
          id: 'msg-1',
          sessionId: 'test-session',
          sender: 'listener',
          content: 'Hello there',
          timestamp: '2023-01-01T12:00:00.000Z'
        };
        
        messageHandler(message);
        
        expect(eventHandlers.onMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            timestamp: expect.any(Date)
          })
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle socket errors', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const errorHandler = onCallback.mock.calls.find(call => call[0] === 'error')?.[1];
      
      if (errorHandler) {
        errorHandler({ message: 'Socket error occurred' });
        expect(eventHandlers.onError).toHaveBeenCalledWith('Socket error occurred');
      }
    });

    it('should handle connection errors', async () => {
      const { socketService } = await import('../socketService');
      socketService.setEventHandlers(eventHandlers);
      
      const onCallback = vi.mocked(mockSocket.on);
      const errorHandler = onCallback.mock.calls.find(call => call[0] === 'connect_error')?.[1];
      
      if (errorHandler) {
        const error = new Error('Connection failed');
        errorHandler(error);
        expect(eventHandlers.onConnectionStatusChange).toHaveBeenCalledWith('disconnected');
        expect(eventHandlers.onError).toHaveBeenCalledWith('Connection error: Connection failed');
      }
    });
  });

  describe('Service API', () => {
    it('should provide utility methods', async () => {
      const { socketService } = await import('../socketService');
      
      // Test initial state
      expect(socketService.getConnectionStatus()).toBe('disconnected');
      expect(socketService.getCurrentSessionId()).toBeNull();
      expect(socketService.getUserRole()).toBeNull();
      expect(socketService.isConnected()).toBe(false);
    });

    it('should allow setting and removing event handlers', async () => {
      const { socketService } = await import('../socketService');
      
      socketService.setEventHandlers(eventHandlers);
      socketService.removeEventHandlers();
      
      // This test mainly ensures the methods exist and don't throw
      expect(true).toBe(true);
    });
  });
});