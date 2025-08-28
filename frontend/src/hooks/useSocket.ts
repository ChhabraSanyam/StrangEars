import { useEffect, useCallback, useRef, useState } from "react";
import { socketService } from "../services/socketService";
import { Message, ConnectionStatus, ChatEventHandlers } from "../types/chat";

interface UseSocketOptions {
  onMessage?: (message: Message) => void;
  onSessionJoined?: (
    sessionId: string,
    userRole: "venter" | "listener"
  ) => void;
  onSessionEnded?: (reason: string, endedBy?: "venter" | "listener") => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onUserJoined?: (otherUserName?: string, otherUserPhoto?: string) => void;
  onUserLeft?: () => void;
  onError?: (error: string) => void;
  onMatchFound?: (sessionId: string, userType: "venter" | "listener") => void;
  onUserTyping?: (isTyping: boolean) => void;
  onSpamWarning?: (message: string) => void;
  onMessageBlocked?: (message: string, timeRemaining?: number) => void;
}

interface SocketState {
  connectionStatus: ConnectionStatus;
  socketId: string | undefined;
  currentSessionId: string | null;
  userRole: "venter" | "listener" | null;
  isConnected: boolean;
}

export const useSocket = (options: UseSocketOptions = {}) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [socketState, setSocketState] = useState<SocketState>(() => ({
    connectionStatus: socketService.getConnectionStatus(),
    socketId: socketService.getSocketId(),
    currentSessionId: socketService.getCurrentSessionId(),
    userRole: socketService.getUserRole(),
    isConnected: socketService.isConnected(),
  }));

  const updateSocketState = useCallback(() => {
    setSocketState({
      connectionStatus: socketService.getConnectionStatus(),
      socketId: socketService.getSocketId(),
      currentSessionId: socketService.getCurrentSessionId(),
      userRole: socketService.getUserRole(),
      isConnected: socketService.isConnected(),
    });
  }, []);

  useEffect(() => {
    const handlers: ChatEventHandlers = {
      onMessage: (message) => optionsRef.current.onMessage?.(message),
      onSessionJoined: (sessionId, userRole) => {
        updateSocketState();
        optionsRef.current.onSessionJoined?.(sessionId, userRole);
      },
      onSessionEnded: (reason, endedBy) => {
        updateSocketState();
        optionsRef.current.onSessionEnded?.(reason, endedBy);
      },
      onConnectionStatusChange: (status) => {
        updateSocketState();
        optionsRef.current.onConnectionStatusChange?.(status);
      },
      onUserJoined: (otherUserName?: string, otherUserPhoto?: string) => {
        optionsRef.current.onUserJoined?.(otherUserName, otherUserPhoto);
      },
      onUserLeft: () => optionsRef.current.onUserLeft?.(),
      onError: (error) => optionsRef.current.onError?.(error),
      onMatchFound: (sessionId, userType) => optionsRef.current.onMatchFound?.(sessionId, userType),
      onUserTyping: (isTyping) => optionsRef.current.onUserTyping?.(isTyping),
      onSpamWarning: (message) => optionsRef.current.onSpamWarning?.(message),
      onMessageBlocked: (message, timeRemaining) => optionsRef.current.onMessageBlocked?.(message, timeRemaining),
    };

    socketService.setEventHandlers(handlers);

    // Initial state update
    updateSocketState();

    return () => {
      socketService.removeEventHandlers();
    };
  }, [updateSocketState]);

  const connect = useCallback(() => {
    socketService.connect();
    updateSocketState();
  }, [updateSocketState]);

  const disconnect = useCallback(() => {
    socketService.disconnect();
    updateSocketState();
  }, [updateSocketState]);

  const joinSession = useCallback(
    (sessionId: string, userRole: "venter" | "listener", username?: string, profilePhoto?: File | null) => {
      socketService.joinSession(sessionId, userRole, username, profilePhoto || undefined);
    },
    []
  );

  const sendMessage = useCallback((sessionId: string, content: string) => {
    socketService.sendMessage(sessionId, content);
  }, []);

  const endSession = useCallback((sessionId: string) => {
    socketService.endSession(sessionId);
  }, []);

  const sendTypingStatus = useCallback((sessionId: string, isTyping: boolean) => {
    socketService.sendTypingStatus(sessionId, isTyping);
  }, []);

  return {
    connect,
    disconnect,
    joinSession,
    sendMessage,
    endSession,
    sendTypingStatus,
    ...socketState,
    socketId: socketState.socketId,
  };
};
