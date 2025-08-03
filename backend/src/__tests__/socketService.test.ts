import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { SocketService } from '../services/socketService';

describe('SocketService', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let socketService: SocketService;
  let serverSocket: any;
  let clientSocket1: ClientSocket;
  let clientSocket2: ClientSocket;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    socketService = new SocketService(io);
    
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach((done) => {
    // Create client connections
    clientSocket1 = Client(`http://localhost:${port}`);
    clientSocket2 = Client(`http://localhost:${port}`);
    
    let connectedCount = 0;
    const checkConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        done();
      }
    };

    clientSocket1.on('connect', checkConnected);
    clientSocket2.on('connect', checkConnected);
  });

  afterEach(() => {
    if (clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should track connected users', () => {
      expect(socketService.getConnectedUserCount()).toBeGreaterThanOrEqual(2);
    });

    it('should handle user disconnection', (done) => {
      const initialCount = socketService.getConnectedUserCount();
      
      clientSocket1.disconnect();
      
      setTimeout(() => {
        expect(socketService.getConnectedUserCount()).toBe(initialCount - 1);
        done();
      }, 100);
    });
  });

  describe('Session Management', () => {
    const sessionId = 'test-session-123';

    it('should handle join-session event', (done) => {
      clientSocket1.emit('join-session', {
        sessionId,
        userType: 'venter'
      });

      clientSocket1.on('session-joined', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.userType).toBe('venter');
        expect(data.timestamp).toBeDefined();
        done();
      });
    });

    it('should reject invalid join-session data', (done) => {
      clientSocket1.emit('join-session', {
        sessionId: '',
        userType: 'invalid'
      });

      clientSocket1.on('error', (data) => {
        expect(data.message).toBe('Invalid session data');
        done();
      });
    });

    it('should notify other users when someone joins', (done) => {
      // First user joins
      clientSocket1.emit('join-session', {
        sessionId,
        userType: 'venter'
      });

      // Wait for first user to join, then set up listener for second user
      clientSocket1.on('session-joined', () => {
        // Second user should be notified when they join
        clientSocket1.on('user-joined', (data) => {
          expect(data.userType).toBe('listener');
          expect(data.timestamp).toBeDefined();
          done();
        });

        // Second user joins
        clientSocket2.emit('join-session', {
          sessionId,
          userType: 'listener'
        });
      });
    });
  });

  describe('Message Handling', () => {
    const sessionId = 'test-session-456';
    const testMessage = 'Hello, this is a test message';

    beforeEach((done) => {
      // Both users join the session
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          done();
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', {
        sessionId,
        userType: 'venter'
      });

      clientSocket2.emit('join-session', {
        sessionId,
        userType: 'listener'
      });
    });

    it('should handle send-message event', (done) => {
      // First, create a session in the session manager
      socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);

      clientSocket2.on('receive-message', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.sender).toBe('venter');
        expect(data.content).toBe(testMessage);
        expect(data.timestamp).toBeDefined();
        expect(data.id).toBeDefined();
        done();
      });

      // Wait a bit for the session to be created
      setTimeout(() => {
        clientSocket1.emit('send-message', {
          sessionId,
          content: testMessage
        });
      }, 50);
    });

    it('should reject empty messages', (done) => {
      clientSocket1.emit('send-message', {
        sessionId,
        content: ''
      });

      clientSocket1.on('error', (data) => {
        expect(data.message).toBe('Message content is required');
        done();
      });
    });

    it('should reject messages from users not in session', (done) => {
      const clientSocket3 = Client(`http://localhost:${port}`);
      
      clientSocket3.on('connect', () => {
        clientSocket3.emit('send-message', {
          sessionId,
          content: testMessage
        });

        clientSocket3.on('error', (data) => {
          expect(data.message).toBe('Invalid session or user not in session');
          clientSocket3.disconnect();
          done();
        });
      });
    });
  });

  describe('Session Termination', () => {
    const sessionId = 'test-session-789';

    beforeEach((done) => {
      // Both users join the session
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          done();
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', {
        sessionId,
        userType: 'venter'
      });

      clientSocket2.emit('join-session', {
        sessionId,
        userType: 'listener'
      });
    });

    it('should handle end-session event', (done) => {
      // First, create a session in the session manager
      socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);

      clientSocket2.on('session-ended', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.endedBy).toBe('venter');
        expect(data.reason).toBe('user_ended');
        expect(data.timestamp).toBeDefined();
        done();
      });

      // Wait a bit for the session to be created
      setTimeout(() => {
        clientSocket1.emit('end-session', {
          sessionId
        });
      }, 50);
    });

    it('should clean up session data after ending', (done) => {
      // First, create a session in the session manager
      socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);

      clientSocket1.on('session-ended', () => {
        // Check that session is cleaned up
        setTimeout(() => {
          const users = socketService.getUsersInSession(sessionId);
          expect(users.length).toBe(0);
          done();
        }, 100);
      });

      // Wait a bit for the session to be created, then end it
      setTimeout(() => {
        clientSocket1.emit('end-session', {
          sessionId
        });
      }, 50);
    });

    it('should clean up session when user disconnects', (done) => {
      // First, create a session in the session manager
      socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);

      clientSocket2.on('session-ended', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.endedBy).toBe('venter');
        expect(data.reason).toBe('user_disconnected');
        expect(data.timestamp).toBeDefined();
        done();
      });

      // Wait a bit for the session to be created, then disconnect
      setTimeout(() => {
        clientSocket1.disconnect();
      }, 50);
    });
  });

  describe('Public Methods', () => {
    it('should return correct connected user count', () => {
      const count = socketService.getConnectedUserCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should return correct session count', () => {
      const count = socketService.getSessionCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should check if user is connected', () => {
      const socketId = clientSocket1.id || 'test-socket-id';
      const isConnected = socketService.isUserConnected(socketId);
      expect(typeof isConnected).toBe('boolean');
    });

    it('should get users in session', () => {
      const sessionId = 'test-session-users';
      const users = socketService.getUsersInSession(sessionId);
      expect(Array.isArray(users)).toBe(true);
    });
  });

  describe('Match Notification', () => {
    it('should notify users about matches', (done) => {
      let notificationCount = 0;
      const checkNotifications = (data: any, expectedUserType: string) => {
        expect(data.sessionId).toBe('match-session-123');
        expect(data.userType).toBe(expectedUserType);
        expect(data.timestamp).toBeDefined();
        
        notificationCount++;
        if (notificationCount === 2) {
          done();
        }
      };

      clientSocket1.on('match-found', (data) => {
        checkNotifications(data, 'venter');
      });

      clientSocket2.on('match-found', (data) => {
        checkNotifications(data, 'listener');
      });

      const socket1Id = clientSocket1.id || 'socket1';
      const socket2Id = clientSocket2.id || 'socket2';
      socketService.notifyMatch(socket1Id, socket2Id, 'match-session-123');
    });
  });
});