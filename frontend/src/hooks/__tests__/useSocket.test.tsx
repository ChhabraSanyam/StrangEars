import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../useSocket';
import { socketService } from '../../services/socketService';

// Mock the socket service
vi.mock('../../services/socketService', () => ({
  socketService: {
    setEventHandlers: vi.fn(),
    removeEventHandlers: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinSession: vi.fn(),
    sendMessage: vi.fn(),
    endSession: vi.fn(),
    getConnectionStatus: vi.fn(() => 'disconnected'),
    getSocketId: vi.fn(() => 'test-socket-id'),
    getCurrentSessionId: vi.fn(() => null),
    getUserRole: vi.fn(() => null),
    isConnected: vi.fn(() => false)
  }
}));

describe('useSocket Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should set up event handlers on mount', () => {
    const onMessage = vi.fn();
    const onConnectionStatusChange = vi.fn();

    renderHook(() => useSocket({
      onMessage,
      onConnectionStatusChange
    }));

    expect(socketService.setEventHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        onMessage: expect.any(Function),
        onConnectionStatusChange: expect.any(Function)
      })
    );
  });

  it('should remove event handlers on unmount', () => {
    const { unmount } = renderHook(() => useSocket());

    unmount();

    expect(socketService.removeEventHandlers).toHaveBeenCalled();
  });

  it('should provide socket service methods', () => {
    const { result } = renderHook(() => useSocket());

    expect(result.current).toHaveProperty('connect');
    expect(result.current).toHaveProperty('disconnect');
    expect(result.current).toHaveProperty('joinSession');
    expect(result.current).toHaveProperty('sendMessage');
    expect(result.current).toHaveProperty('endSession');
  });

  it('should provide socket service state', () => {
    const { result } = renderHook(() => useSocket());

    // The hook should call the socket service methods to get state
    expect(socketService.getConnectionStatus).toHaveBeenCalled();
    expect(socketService.getSocketId).toHaveBeenCalled();
    expect(socketService.getCurrentSessionId).toHaveBeenCalled();
    expect(socketService.getUserRole).toHaveBeenCalled();
    expect(socketService.isConnected).toHaveBeenCalled();

    // Check that the hook provides the expected properties
    expect(result.current).toHaveProperty('connectionStatus');
    expect(result.current).toHaveProperty('socketId');
    expect(result.current).toHaveProperty('currentSessionId');
    expect(result.current).toHaveProperty('userRole');
    expect(result.current).toHaveProperty('isConnected');
  });

  it('should call socket service methods when hook methods are called', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      result.current.connect();
    });
    expect(socketService.connect).toHaveBeenCalled();

    act(() => {
      result.current.disconnect();
    });
    expect(socketService.disconnect).toHaveBeenCalled();

    act(() => {
      result.current.joinSession('test-session', 'venter');
    });
    expect(socketService.joinSession).toHaveBeenCalledWith('test-session', 'venter');

    act(() => {
      result.current.sendMessage('test-session', 'Hello world');
    });
    expect(socketService.sendMessage).toHaveBeenCalledWith('test-session', 'Hello world');

    act(() => {
      result.current.endSession('test-session');
    });
    expect(socketService.endSession).toHaveBeenCalledWith('test-session');
  });

  it('should call event handlers when provided', () => {
    const onMessage = vi.fn();
    const onSessionJoined = vi.fn();
    const onError = vi.fn();

    renderHook(() => useSocket({
      onMessage,
      onSessionJoined,
      onError
    }));

    // Get the handlers that were set
    const setEventHandlersCall = vi.mocked(socketService.setEventHandlers).mock.calls[0];
    const handlers = setEventHandlersCall[0];

    // Simulate events
    const mockMessage = {
      id: 'msg-1',
      sessionId: 'test-session',
      sender: 'venter' as const,
      content: 'Hello',
      timestamp: new Date()
    };

    handlers.onMessage?.(mockMessage);
    expect(onMessage).toHaveBeenCalledWith(mockMessage);

    handlers.onSessionJoined?.('test-session', 'venter');
    expect(onSessionJoined).toHaveBeenCalledWith('test-session', 'venter');

    handlers.onError?.('Test error');
    expect(onError).toHaveBeenCalledWith('Test error');
  });
});