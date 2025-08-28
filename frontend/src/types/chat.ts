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
  createdAt: Date;
  status: 'active' | 'ended';
  messages: Message[];
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ChatEventHandlers {
  onMessage: (message: Message) => void;
  onSessionJoined: (sessionId: string, userRole: 'venter' | 'listener') => void;
  onSessionEnded: (reason: string, endedBy?: 'venter' | 'listener') => void;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  onUserJoined: (otherUserName?: string, otherUserPhoto?: string) => void;
  onUserLeft: () => void;
  onError: (error: string) => void;
  onMatchFound: (sessionId: string, userType: 'venter' | 'listener') => void;
  onUserTyping: (isTyping: boolean) => void;
  onSpamWarning: (message: string) => void;
  onMessageBlocked: (message: string, timeRemaining?: number) => void;
}

export interface JoinSessionData {
  sessionId: string;
  userType: 'venter' | 'listener';
  username?: string;
  profilePhoto?: string; // Base64 encoded image
}

export interface SendMessageData {
  sessionId: string;
  content: string;
}

export interface EndSessionData {
  sessionId: string;
}

export interface TypingData {
  sessionId: string;
  isTyping: boolean;
}

export interface UserProfileData {
  username?: string;
  profilePhoto?: string; // Base64 encoded image
}