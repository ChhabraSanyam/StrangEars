import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatInterface, { Message } from '../ChatInterface';

describe('End Chat Functionality - Comprehensive Tests', () => {
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

  describe('End Chat Button Visibility and Accessibility', () => {
    it('should display end chat button prominently in header', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toBeInTheDocument();
      expect(endChatButton).toHaveTextContent('End Chat');
      expect(endChatButton).toBeVisible();
    });

    it('should have proper accessibility attributes', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toHaveAttribute('aria-label', 'End chat session');
      expect(endChatButton.tagName).toBe('BUTTON');
    });

    it('should be keyboard accessible', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      
      // Should be focusable (buttons are focusable by default)
      endChatButton.focus();
      expect(document.activeElement).toBe(endChatButton);
    });

    it('should have appropriate styling for visibility', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toHaveClass('bg-red-500');
      expect(endChatButton).toHaveClass('hover:bg-red-600');
      expect(endChatButton).toHaveClass('text-white');
    });
  });

  describe('End Chat Button Behavior', () => {
    it('should call onEndChat when clicked', () => {
      const mockOnEndChat = vi.fn();
      render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      fireEvent.click(endChatButton);
      
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });

    it('should be accessible via keyboard navigation', () => {
      const mockOnEndChat = vi.fn();
      render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      
      // Focus the button
      endChatButton.focus();
      expect(document.activeElement).toBe(endChatButton);
      
      // Buttons automatically handle Enter and Space key activation
      // We'll test that the button is properly focusable and clickable
      fireEvent.click(endChatButton);
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });

    it('should maintain focus management', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      
      // Should be able to receive focus
      endChatButton.focus();
      expect(document.activeElement).toBe(endChatButton);
      
      // Should be able to blur
      endChatButton.blur();
      expect(document.activeElement).not.toBe(endChatButton);
    });

    it('should work regardless of connection status', () => {
      const mockOnEndChat = vi.fn();
      
      // Test with different connection statuses
      const statuses = ['connected', 'connecting', 'disconnected', 'reconnecting'] as const;
      
      statuses.forEach(status => {
        const { unmount } = render(
          <ChatInterface {...defaultProps} connectionStatus={status} onEndChat={mockOnEndChat} />
        );
        
        const endChatButton = screen.getByLabelText('End chat session');
        expect(endChatButton).not.toBeDisabled();
        
        fireEvent.click(endChatButton);
        expect(mockOnEndChat).toHaveBeenCalled();
        
        unmount();
        mockOnEndChat.mockClear();
      });
    });

    it('should work when other user is not connected', () => {
      const mockOnEndChat = vi.fn();
      render(<ChatInterface {...defaultProps} otherUserConnected={false} onEndChat={mockOnEndChat} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).not.toBeDisabled();
      
      fireEvent.click(endChatButton);
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('End Chat Button in Different Scenarios', () => {
    it('should be available for both venter and listener roles', () => {
      // Test venter
      const { rerender } = render(<ChatInterface {...defaultProps} userRole="venter" />);
      expect(screen.getByLabelText('End chat session')).toBeInTheDocument();
      
      // Test listener
      rerender(<ChatInterface {...defaultProps} userRole="listener" />);
      expect(screen.getByLabelText('End chat session')).toBeInTheDocument();
    });

    it('should be available throughout the chat session', () => {
      const messages: Message[] = [
        {
          id: '1',
          sender: 'venter',
          content: 'Hello',
          timestamp: new Date()
        },
        {
          id: '2',
          sender: 'listener',
          content: 'Hi there',
          timestamp: new Date()
        }
      ];

      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByLabelText('End chat session')).toBeInTheDocument();
    });

    it('should maintain consistent position in header', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const header = screen.getByRole('banner');
      const endChatButton = screen.getByLabelText('End chat session');
      
      expect(header).toContainElement(endChatButton);
    });
  });

  describe('Session Information Display', () => {
    it('should display session ID in header', () => {
      render(<ChatInterface {...defaultProps} sessionId="test-session-12345" />);
      
      expect(screen.getByText('Session: test-ses...')).toBeInTheDocument();
    });

    it('should display user role correctly', () => {
      // Test venter role
      const { rerender } = render(<ChatInterface {...defaultProps} userRole="venter" />);
      expect(screen.getByText('You are: Stranger 1')).toBeInTheDocument();
      
      // Test listener role
      rerender(<ChatInterface {...defaultProps} userRole="listener" />);
      expect(screen.getByText('You are: Stranger 2')).toBeInTheDocument();
    });

    it('should show connection status', () => {
      const { rerender } = render(<ChatInterface {...defaultProps} connectionStatus="connected" />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
      
      rerender(<ChatInterface {...defaultProps} connectionStatus="connecting" />);
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      
      rerender(<ChatInterface {...defaultProps} connectionStatus="disconnected" />);
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
    });
  });

  describe('End Chat Integration with Chat Flow', () => {
    it('should not interfere with message sending', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnEndChat = vi.fn();
      
      render(
        <ChatInterface 
          {...defaultProps} 
          onSendMessage={mockOnSendMessage}
          onEndChat={mockOnEndChat}
        />
      );
      
      // Send a message
      const textarea = screen.getByLabelText('Type your message');
      const sendButton = screen.getByLabelText('Send message');
      
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
      expect(mockOnEndChat).not.toHaveBeenCalled();
      
      // Then end chat
      const endChatButton = screen.getByLabelText('End chat session');
      fireEvent.click(endChatButton);
      
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });

    it('should be available even when input is disabled', () => {
      const mockOnEndChat = vi.fn();
      
      render(
        <ChatInterface 
          {...defaultProps} 
          connectionStatus="disconnected"
          onEndChat={mockOnEndChat}
        />
      );
      
      // Input should be disabled
      const textarea = screen.getByLabelText('Type your message');
      expect(textarea).toBeDisabled();
      
      // But end chat should still work
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).not.toBeDisabled();
      
      fireEvent.click(endChatButton);
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Visual Feedback and User Experience', () => {
    it('should have hover effects', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toHaveClass('hover:bg-red-600');
    });

    it('should have focus styles for accessibility', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toHaveClass('focus:outline-none');
      expect(endChatButton).toHaveClass('focus:ring-2');
      expect(endChatButton).toHaveClass('focus:ring-red-500');
    });

    it('should have appropriate button styling', () => {
      render(<ChatInterface {...defaultProps} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      expect(endChatButton).toHaveClass('px-4');
      expect(endChatButton).toHaveClass('py-2');
      expect(endChatButton).toHaveClass('rounded-lg');
      expect(endChatButton).toHaveClass('font-medium');
    });
  });

  describe('Error Handling', () => {
    it('should handle rapid clicking gracefully', async () => {
      const mockOnEndChat = vi.fn();
      render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      
      // Click rapidly multiple times
      fireEvent.click(endChatButton);
      fireEvent.click(endChatButton);
      fireEvent.click(endChatButton);
      
      // Should be called for each click (the parent component should handle deduplication)
      expect(mockOnEndChat).toHaveBeenCalledTimes(3);
    });

    it('should maintain functionality after re-renders', () => {
      const mockOnEndChat = vi.fn();
      const { rerender } = render(<ChatInterface {...defaultProps} onEndChat={mockOnEndChat} />);
      
      // Re-render with new props
      rerender(<ChatInterface {...defaultProps} connectionStatus="connecting" onEndChat={mockOnEndChat} />);
      
      const endChatButton = screen.getByLabelText('End chat session');
      fireEvent.click(endChatButton);
      
      expect(mockOnEndChat).toHaveBeenCalledTimes(1);
    });
  });
});