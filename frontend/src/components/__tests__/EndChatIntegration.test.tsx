import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatInterface, { Message } from '../ChatInterface';

// Mock the socket service
const mockEndSession = vi.fn();
const mockSendMessage = vi.fn();

vi.mock('../../services/socketService', () => ({
  socketService: {
    endSession: mockEndSession,
    sendMessage: mockSendMessage,
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinSession: vi.fn(),
    setEventHandlers: vi.fn(),
    removeEventHandlers: vi.fn(),
    getConnectionStatus: () => 'connected',
    getSocketId: () => 'test-socket-id',
    getCurrentSessionId: () => 'test-session',
    getUserRole: () => 'venter',
    isConnected: () => true,
  }
}));

describe('End Chat Functionality', () => {
  const defaultProps = {
    sessionId: 'test-session-123',
    userRole: 'venter' as const,
    messages: [] as Message[],
    onSendMessage: vi.fn(),
    onEndChat: vi.fn(),
    connectionStatus: 'connected' as const,
    otherUserConnected: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display end chat button', () => {
    render(<ChatInterface {...defaultProps} />);
    
    const endChatButton = screen.getByLabelText('End chat session');
    expect(endChatButton).toBeInTheDocument();
    expect(endChatButton).toHaveTextContent('End Chat');
  });

  it('should call onEndChat when end chat button is clicked', () => {
    const mockOnEndChat = vi.fn();
    render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
    
    const endChatButton = screen.getByLabelText('End chat session');
    fireEvent.click(endChatButton);
    
    expect(mockOnEndChat).toHaveBeenCalledTimes(1);
  });

  it('should show end chat button even when disconnected', () => {
    render(<ChatInterface {...defaultProps} connectionStatus="disconnected" />);
    
    const endChatButton = screen.getByLabelText('End chat session');
    expect(endChatButton).toBeInTheDocument();
    expect(endChatButton).not.toBeDisabled();
  });

  it('should show appropriate connection status when other user disconnects', () => {
    render(<ChatInterface {...defaultProps} otherUserConnected={false} />);
    
    expect(screen.getByText('Waiting for other user...')).toBeInTheDocument();
  });

  it('should show session ID in header', () => {
    render(<ChatInterface {...defaultProps} />);
    
    expect(screen.getByText('Session: test-ses...')).toBeInTheDocument();
  });

  it('should show user role correctly', () => {
    render(<ChatInterface {...defaultProps} userRole="venter" />);
    
    expect(screen.getByText('You are: Stranger 1')).toBeInTheDocument();
  });

  it('should show listener role correctly', () => {
    render(<ChatInterface {...defaultProps} userRole="listener" />);
    
    expect(screen.getByText('You are: Stranger 2')).toBeInTheDocument();
  });

  it('should handle session termination gracefully', async () => {
    const mockOnEndChat = vi.fn();
    render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
    
    const endChatButton = screen.getByLabelText('End chat session');
    fireEvent.click(endChatButton);
    
    await waitFor(() => {
      expect(mockOnEndChat).toHaveBeenCalled();
    });
  });

  it('should show welcome message for venter', () => {
    render(<ChatInterface {...defaultProps} userRole="venter" messages={[]} />);
    
    expect(screen.getByText(/Feel free to share what's on your mind/)).toBeInTheDocument();
  });

  it('should show welcome message for listener', () => {
    render(<ChatInterface {...defaultProps} userRole="listener" messages={[]} />);
    
    expect(screen.getByText(/Thank you for being here to listen/)).toBeInTheDocument();
  });
});