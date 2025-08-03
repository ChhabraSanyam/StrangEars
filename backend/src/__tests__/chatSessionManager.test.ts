import { ChatSessionManager, ChatSession, Message } from '../models/ChatSession';
import { v4 as uuidv4 } from 'uuid';

describe('ChatSessionManager', () => {
  let sessionManager: ChatSessionManager;
  let sessionId: string;
  let venterSocketId: string;
  let listenerSocketId: string;

  beforeEach(() => {
    sessionManager = new ChatSessionManager();
    sessionId = uuidv4();
    venterSocketId = 'venter-socket-123';
    listenerSocketId = 'listener-socket-456';
  });

  describe('Session Creation', () => {
    it('should create a new session', () => {
      const session = sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);

      expect(session.id).toBe(sessionId);
      expect(session.venterSocketId).toBe(venterSocketId);
      expect(session.listenerSocketId).toBe(listenerSocketId);
      expect(session.status).toBe('active');
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.endedAt).toBeUndefined();
    });

    it('should track user sessions', () => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);

      const venterSession = sessionManager.getSessionByUser(venterSocketId);
      const listenerSession = sessionManager.getSessionByUser(listenerSocketId);

      expect(venterSession?.id).toBe(sessionId);
      expect(listenerSession?.id).toBe(sessionId);
    });
  });

  describe('Session Retrieval', () => {
    beforeEach(() => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
    });

    it('should get session by ID', () => {
      const session = sessionManager.getSession(sessionId);
      expect(session?.id).toBe(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent');
      expect(session).toBeUndefined();
    });

    it('should get session by user socket ID', () => {
      const venterSession = sessionManager.getSessionByUser(venterSocketId);
      const listenerSession = sessionManager.getSessionByUser(listenerSocketId);

      expect(venterSession?.id).toBe(sessionId);
      expect(listenerSession?.id).toBe(sessionId);
    });

    it('should return undefined for user not in session', () => {
      const session = sessionManager.getSessionByUser('unknown-socket');
      expect(session).toBeUndefined();
    });
  });

  describe('Message Management', () => {
    beforeEach(() => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
    });

    it('should add message to active session', () => {
      const messageData = {
        id: uuidv4(),
        sender: 'venter' as const,
        content: 'Hello, I need to talk',
        timestamp: new Date()
      };

      const message = sessionManager.addMessage(sessionId, messageData);

      expect(message).not.toBeNull();
      expect(message?.sessionId).toBe(sessionId);
      expect(message?.content).toBe(messageData.content);
      expect(message?.sender).toBe('venter');

      const session = sessionManager.getSession(sessionId);
      expect(session?.messages).toHaveLength(1);
      expect(session?.messages[0]).toEqual(message);
    });

    it('should not add message to non-existent session', () => {
      const messageData = {
        id: uuidv4(),
        sender: 'venter' as const,
        content: 'Hello',
        timestamp: new Date()
      };

      const message = sessionManager.addMessage('non-existent', messageData);
      expect(message).toBeNull();
    });

    it('should not add message to ended session', () => {
      // End the session first
      sessionManager.endSession(sessionId);

      const messageData = {
        id: uuidv4(),
        sender: 'venter' as const,
        content: 'Hello',
        timestamp: new Date()
      };

      const message = sessionManager.addMessage(sessionId, messageData);
      expect(message).toBeNull();
    });

    it('should handle multiple messages', () => {
      const messages = [
        { id: uuidv4(), sender: 'venter' as const, content: 'Hello', timestamp: new Date() },
        { id: uuidv4(), sender: 'listener' as const, content: 'Hi there', timestamp: new Date() },
        { id: uuidv4(), sender: 'venter' as const, content: 'How are you?', timestamp: new Date() }
      ];

      messages.forEach(msg => {
        sessionManager.addMessage(sessionId, msg);
      });

      const session = sessionManager.getSession(sessionId);
      expect(session?.messages).toHaveLength(3);
      expect(session?.messages.map(m => m.content)).toEqual(['Hello', 'Hi there', 'How are you?']);
    });
  });

  describe('Session Termination', () => {
    beforeEach(() => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
    });

    it('should end an active session', () => {
      const result = sessionManager.endSession(sessionId, venterSocketId);
      expect(result).toBe(true);

      const session = sessionManager.getSession(sessionId);
      expect(session?.status).toBe('ended');
      expect(session?.endedAt).toBeInstanceOf(Date);
    });

    it('should return false for non-existent session', () => {
      const result = sessionManager.endSession('non-existent');
      expect(result).toBe(false);
    });

    it('should handle ending already ended session', () => {
      sessionManager.endSession(sessionId);
      const result = sessionManager.endSession(sessionId);
      expect(result).toBe(true); // Should still return true as session exists
    });
  });

  describe('Session Cleanup', () => {
    beforeEach(() => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
    });

    it('should cleanup session', () => {
      const result = sessionManager.cleanupSession(sessionId);
      expect(result).toBe(true);

      // Session should be removed
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
      expect(sessionManager.getSessionByUser(venterSocketId)).toBeUndefined();
      expect(sessionManager.getSessionByUser(listenerSocketId)).toBeUndefined();
    });

    it('should return false for non-existent session cleanup', () => {
      const result = sessionManager.cleanupSession('non-existent');
      expect(result).toBe(false);
    });

    it('should cleanup user sessions on disconnect', () => {
      const cleanedSessions = sessionManager.cleanupUserSessions(venterSocketId);
      expect(cleanedSessions).toEqual([sessionId]);

      // Session should be ended and cleaned up
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
    });

    it('should handle cleanup for user not in session', () => {
      const cleanedSessions = sessionManager.cleanupUserSessions('unknown-socket');
      expect(cleanedSessions).toEqual([]);
    });
  });

  describe('Session Queries', () => {
    beforeEach(() => {
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
    });

    it('should get active sessions', () => {
      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe(sessionId);

      // End session and check again
      sessionManager.endSession(sessionId);
      const activeAfterEnd = sessionManager.getActiveSessions();
      expect(activeAfterEnd).toHaveLength(0);
    });

    it('should check if user is in session', () => {
      expect(sessionManager.isUserInSession(venterSocketId)).toBe(true);
      expect(sessionManager.isUserInSession(listenerSocketId)).toBe(true);
      expect(sessionManager.isUserInSession('unknown-socket')).toBe(false);

      // End session and check again
      sessionManager.endSession(sessionId);
      expect(sessionManager.isUserInSession(venterSocketId)).toBe(false);
    });

    it('should get other participant', () => {
      const otherForVenter = sessionManager.getOtherParticipant(sessionId, venterSocketId);
      const otherForListener = sessionManager.getOtherParticipant(sessionId, listenerSocketId);

      expect(otherForVenter).toBe(listenerSocketId);
      expect(otherForListener).toBe(venterSocketId);

      const otherForUnknown = sessionManager.getOtherParticipant(sessionId, 'unknown');
      expect(otherForUnknown).toBeNull();
    });

    it('should get user role', () => {
      const venterRole = sessionManager.getUserRole(sessionId, venterSocketId);
      const listenerRole = sessionManager.getUserRole(sessionId, listenerSocketId);
      const unknownRole = sessionManager.getUserRole(sessionId, 'unknown');

      expect(venterRole).toBe('venter');
      expect(listenerRole).toBe('listener');
      expect(unknownRole).toBeNull();
    });
  });

  describe('Session Statistics', () => {
    it('should return correct statistics', () => {
      // Initially no sessions
      let stats = sessionManager.getSessionStats();
      expect(stats.totalSessions).toBe(0);
      expect(stats.activeSessions).toBe(0);
      expect(stats.endedSessions).toBe(0);
      expect(stats.totalMessages).toBe(0);

      // Create a session
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
      stats = sessionManager.getSessionStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.activeSessions).toBe(1);
      expect(stats.endedSessions).toBe(0);

      // Add messages
      sessionManager.addMessage(sessionId, {
        id: uuidv4(),
        sender: 'venter',
        content: 'Hello',
        timestamp: new Date()
      });
      sessionManager.addMessage(sessionId, {
        id: uuidv4(),
        sender: 'listener',
        content: 'Hi',
        timestamp: new Date()
      });

      stats = sessionManager.getSessionStats();
      expect(stats.totalMessages).toBe(2);

      // End session
      sessionManager.endSession(sessionId);
      stats = sessionManager.getSessionStats();
      expect(stats.activeSessions).toBe(0);
      expect(stats.endedSessions).toBe(1);
    });
  });

  describe('Auto Cleanup', () => {
    it('should cleanup old ended sessions', () => {
      // Create and end a session
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
      sessionManager.endSession(sessionId);

      // Manually set endedAt to an old date
      const session = sessionManager.getSession(sessionId);
      if (session) {
        session.endedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      }

      // Run cleanup with 1 hour max age
      const cleanedCount = sessionManager.cleanupOldSessions(60);
      expect(cleanedCount).toBe(1);

      // Session should be removed
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
    });

    it('should not cleanup recent ended sessions', () => {
      // Create and end a session
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);
      sessionManager.endSession(sessionId);

      // Run cleanup with 2 hour max age (session just ended)
      const cleanedCount = sessionManager.cleanupOldSessions(120);
      expect(cleanedCount).toBe(0);

      // Session should still exist
      expect(sessionManager.getSession(sessionId)).toBeDefined();
    });

    it('should not cleanup active sessions', () => {
      // Create an active session
      sessionManager.createSession(sessionId, venterSocketId, listenerSocketId);

      // Run cleanup
      const cleanedCount = sessionManager.cleanupOldSessions(0);
      expect(cleanedCount).toBe(0);

      // Session should still exist
      expect(sessionManager.getSession(sessionId)).toBeDefined();
    });
  });
});