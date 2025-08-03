import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatInterface, { Message } from '../ChatInterface';

// Mock messages for testing
const mockMessages: Message[] = [
  {
    id: '1',
    sender: 'venter',
    content: 'Hello, I need someone to talk to.',
    timestamp: new Date('2024-01-01T15:30:00')
  },
  {
    id: '2',
    sender: 'listener',
    content: 'I\'m here to listen. What\'s on your mind?',
    timestamp: new Date('2024-01-01T15:31:00')
  }
];

const defaultProps = {
  sessionId: 'test-session-123',
  userRole: 'venter' as const,
  messages: mockMessages,
  onSendMessage: vi.fn(),
  onEndChat: vi.fn(),
  connectionStatus: 'connected' as const,
  otherUserConnected: true
};

describe('ChatInterface', () => {
  it('renders chat interface with session info', () => {
    render(<ChatInterface {...defaultProps} />);
    
    expect(screen.getByText('Anonymous Chat')).toBeInTheDocument();
    expect(screen.getByText((content, element) => {
      return element?.textContent === 'Session: test-ses...';
    })).toBeInTheDocument();
    expect(screen.getByText('You are: Stranger 1')).toBeInTheDocument();
  });

  it('displays messages correctly', () => {
    render(<ChatInterface {...defaultProps} />);
    
    expect(screen.getByText('Hello, I need someone to talk to.')).toBeInTheDocument();
    expect(screen.getByText('I\'m here to listen. What\'s on your mind?')).toBeInTheDocument();
  });

  it('shows correct user identifiers', () => {
    render(<ChatInterface {...defaultProps} />);
    
    // For venter role, they see themselves as "You" and listener as "Stranger 2"
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Stranger 2')).toBeInTheDocument();
  });

  it('shows correct user identifiers for listener role', () => {
    render(<ChatInterface {...defaultProps} userRole="listener" />);
    
    // For listener role, they see themselves as "You" and venter as "Stranger 1"
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Stranger 1')).toBeInTheDocument();
  });

  it('allows sending messages when connected', async () => {
    const mockOnSendMessage = vi.fn();
    render(<ChatInterface {...defaultProps} onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByLabelText('Type your message');
    const sendButton = screen.getByLabelText('Send message');
    
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('sends message on Enter key press', async () => {
    const mockOnSendMessage = vi.fn();
    render(<ChatInterface {...defaultProps} onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByLabelText('Type your message');
    
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not send message on Shift+Enter', async () => {
    const mockOnSendMessage = vi.fn();
    render(<ChatInterface {...defaultProps} onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByLabelText('Type your message');
    
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('disables input when disconnected', () => {
    render(<ChatInterface {...defaultProps} connectionStatus="disconnected" />);
    
    const textarea = screen.getByLabelText('Type your message');
    const sendButton = screen.getByLabelText('Send message');
    
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('shows connection status correctly', () => {
    render(<ChatInterface {...defaultProps} connectionStatus="connecting" />);
    
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('calls onEndChat when end chat button is clicked', () => {
    const mockOnEndChat = vi.fn();
    render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
    
    const endChatButton = screen.getByLabelText('End chat session');
    fireEvent.click(endChatButton);
    
    expect(mockOnEndChat).toHaveBeenCalled();
  });

  it('shows welcome message when no messages exist', () => {
    render(<ChatInterface {...defaultProps} messages={[]} />);
    
    expect(screen.getByText('Welcome to your anonymous chat')).toBeInTheDocument();
    expect(screen.getByText(/Feel free to share what's on your mind/)).toBeInTheDocument();
  });

  it('shows different welcome message for listener role', () => {
    render(<ChatInterface {...defaultProps} userRole="listener" messages={[]} />);
    
    expect(screen.getByText('Welcome to your anonymous chat')).toBeInTheDocument();
    expect(screen.getByText(/Thank you for being here to listen/)).toBeInTheDocument();
  });

  it('enforces character limit', () => {
    render(<ChatInterface {...defaultProps} />);
    
    const textarea = screen.getByLabelText('Type your message');
    const longMessage = 'a'.repeat(1001);
    
    fireEvent.change(textarea, { target: { value: longMessage } });
    
    // HTML maxLength attribute should prevent input beyond 1000 characters
    // In real browsers this works, but in tests we need to check the maxLength attribute
    expect(textarea).toHaveAttribute('maxlength', '1000');
  });

  it('shows character count', () => {
    render(<ChatInterface {...defaultProps} />);
    
    const textarea = screen.getByLabelText('Type your message');
    
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    
    expect(screen.getByText('5/1000 characters')).toBeInTheDocument();
  });

  it('formats timestamps correctly', () => {
    render(<ChatInterface {...defaultProps} />);
    
    // Should show time in HH:MM format (times will be in local timezone)
    // The test dates are in UTC, so we need to check for the formatted local time
    expect(screen.getByText('15:30')).toBeInTheDocument();
    expect(screen.getByText('15:31')).toBeInTheDocument();
  });
});