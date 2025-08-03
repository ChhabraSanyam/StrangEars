import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { SocketService } from '../services/socketService';

describe('Session Termination Functionality', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let socketService: SocketService;
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

  describe('End Chat Button Functionality', () => {
    const sessionId = 'test-end-chat-session';

    beforeEach((done) => {
      // Set up a complete session with both users joined
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          // Create session in session manager
          socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);
          setTimeout(done, 50); // Wait for session creation
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

    it('should successfully end session when venter clicks end chat', (done) => {
      clientSocket2.on('session-ended', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.endedBy).toBe('venter');
        expect(data.reason).toBe('user_ended');
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket1.emit('end-session', { sessionId });
    });

    it('should successfully end session when listener clicks end chat', (done) => {
      clientSocket1.on('session-ended', (data) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.endedBy).toBe('listener');
        expect(data.reason).toBe('user_ended');
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket2.emit('end-session', { sessionId });
    });

    it('should notify both participants when session ends', (done) => {
      let notificationCount = 0;
      const checkNotifications = (data: any) => {
        expect(data.sessionId).toBe(sessionId);
        expect(data.endedBy).toBe('venter');
        expect(data.reason).toBe('user_ended');
        
        notificationCount++;
        if (notificationCount === 2) {
          done();
        }
      };

      clientSocket1.on('session-ended', checkNotifications);
      clientSocket2.on('session-ended', checkNotifications);

      clientSocket1.emit('end-session', { sessionId });
    });

    it('should clean up session data after ending', (done) => {
      clientSocket1.on('session-ended', () => {
        // Check that session is cleaned up
        setTimeout(() => {
          const users = socketService.getUsersInSession(sessionId);
          expect(users.length).toBe(0);
          done();
        }, 100);
      });

      clientSocket1.emit('end-session', { sessionId });
    });
  });

  describe('Session Termination Edge Cases', () => {
    const sessionId = 'test-edge-cases-session';

    it('should handle end session request for non-existent session', (done) => {
      clientSocket1.on('error', (data) => {
        expect(data.message).toContain('not in specified session');
        done();
      });

      clientSocket1.emit('end-session', { sessionId: 'non-existent-session' });
    });

    it('should handle end session request without session ID', (done) => {
      clientSocket1.on('error', (data) => {
        expect(data.message).toBe('Session ID is required');
        done();
      });

      clientSocket1.emit('end-session', {});
    });

    it('should handle end session request from user not in session', (done) => {
      // Create a session with other users
      const otherSocket1 = Client(`http://localhost:${port}`);
      const otherSocket2 = Client(`http://localhost:${port}`);

      otherSocket1.on('connect', () => {
        otherSocket2.on('connect', () => {
          // Set up session with other sockets
          otherSocket1.emit('join-session', { sessionId, userType: 'venter' });
          otherSocket2.emit('join-session', { sessionId, userType: 'listener' });

          setTimeout(() => {
            // Try to end session from clientSocket1 who is not in the session
            clientSocket1.on('error', (data) => {
              expect(data.message).toContain('not in specified session');
              otherSocket1.disconnect();
              otherSocket2.disconnect();
              done();
            });

            clientSocket1.emit('end-session', { sessionId });
          }, 100);
        });
      });
    });

    it('should handle multiple end session requests gracefully', (done) => {
      // Set up session first
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);
          
          setTimeout(() => {
            let endedCount = 0;
            let errorCount = 0;
            
            const handleSessionEnded = () => {
              endedCount++;
              if (endedCount === 1) {
                // Try to end again - should get an error
                clientSocket2.on('error', (data) => {
                  errorCount++;
                  expect(data.message).toContain('not found');
                  
                  // Should have received one session-ended event and one error
                  expect(endedCount).toBe(1);
                  expect(errorCount).toBe(1);
                  done();
                });
                
                setTimeout(() => {
                  clientSocket2.emit('end-session', { sessionId });
                }, 100);
              }
            };

            clientSocket1.on('session-ended', handleSessionEnded);
            clientSocket2.on('session-ended', handleSessionEnded);

            // End session first time
            clientSocket1.emit('end-session', { sessionId });
          }, 50);
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', { sessionId, userType: 'venter' });
      clientSocket2.emit('join-session', { sessionId, userType: 'listener' });
    });
  });

  describe('Session Termination on Disconnect', () => {
    const sessionId = 'test-disconnect-session';

    it('should end session when venter disconnects', (done) => {
      // Set up session
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);
          
          setTimeout(() => {
            clientSocket2.on('session-ended', (data) => {
              expect(data.sessionId).toBe(sessionId);
              expect(data.endedBy).toBe('venter');
              expect(data.reason).toBe('user_disconnected');
              done();
            });

            // Disconnect venter
            clientSocket1.disconnect();
          }, 50);
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', { sessionId, userType: 'venter' });
      clientSocket2.emit('join-session', { sessionId, userType: 'listener' });
    });

    it('should end session when listener disconnects', (done) => {
      // Set up session
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);
          
          setTimeout(() => {
            clientSocket1.on('session-ended', (data) => {
              expect(data.sessionId).toBe(sessionId);
              expect(data.endedBy).toBe('listener');
              expect(data.reason).toBe('user_disconnected');
              done();
            });

            // Disconnect listener
            clientSocket2.disconnect();
          }, 50);
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', { sessionId, userType: 'venter' });
      clientSocket2.emit('join-session', { sessionId, userType: 'listener' });
    });
  });

  describe('Data Cleanup and Privacy', () => {
    const sessionId = 'test-cleanup-session';

    it('should immediately delete all session data when session ends', (done) => {
      // Set up session with messages
      let joinedCount = 0;
      const checkJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          socketService.notifyMatch(clientSocket1.id || 'socket1', clientSocket2.id || 'socket2', sessionId);
          
          setTimeout(() => {
            // Send some messages
            clientSocket1.emit('send-message', { sessionId, content: 'Test message 1' });
            clientSocket2.emit('send-message', { sessionId, content: 'Test message 2' });
            
            setTimeout(() => {
              // Verify messages exist
              const session = socketService.getSessionManager().getSession(sessionId);
              expect(session?.messages.length).toBe(2);
              
              // End session
              clientSocket1.on('session-ended', () => {
                // Verify all data is cleaned up
                setTimeout(() => {
                  const cleanedSession = socketService.getSessionManager().getSession(sessionId);
                  expect(cleanedSession).toBeUndefined();
                  
                  const users = socketService.getUsersInSession(sessionId);
                  expect(users.length).toBe(0);
                  
                  done();
                }, 200); // Increased timeout to account for cleanup delay
              });
              
              clientSocket1.emit('end-session', { sessionId });
            }, 100);
          }, 50);
        }
      };

      clientSocket1.on('session-joined', checkJoined);
      clientSocket2.on('session-joined', checkJoined);

      clientSocket1.emit('join-session', { sessionId, userType: 'venter' });
      clientSocket2.emit('join-session', { sessionId, userType: 'listener' });
    });
  });
});