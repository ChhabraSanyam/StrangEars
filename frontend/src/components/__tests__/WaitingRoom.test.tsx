import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WaitingRoom from '../WaitingRoom';

describe('WaitingRoom', () => {
  const defaultProps = {
    userType: 'venter' as const,
    estimatedWaitTime: 60,
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders waiting room with correct user type message', () => {
    render(<WaitingRoom {...defaultProps} />);
    
    expect(screen.getByText('Looking for someone ready to listen...')).toBeInTheDocument();
    expect(screen.getByText('StrangEars')).toBeInTheDocument();
  });

  it('renders correct message for listener type', () => {
    render(<WaitingRoom {...defaultProps} userType="listener" />);
    
    expect(screen.getByText('Finding someone who needs a caring ear...')).toBeInTheDocument();
  });

  it('displays estimated wait time correctly', () => {
    render(<WaitingRoom {...defaultProps} estimatedWaitTime={90} />);
    
    expect(screen.getAllByText(/~1m 30s remaining/)).toHaveLength(2); // Main display + live region
  });

  it('displays "Any moment now" when wait time is 0 or less', () => {
    render(<WaitingRoom {...defaultProps} estimatedWaitTime={0} />);
    
    expect(screen.getAllByText(/Any moment now.../)).toHaveLength(2); // Main display + live region
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<WaitingRoom {...defaultProps} onCancel={onCancel} />);
    
    const cancelButton = screen.getByText('Cancel & Go Back');
    fireEvent.click(cancelButton);
    
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('updates elapsed time counter', async () => {
    render(<WaitingRoom {...defaultProps} />);
    
    // Initially should show 0s
    expect(screen.getByText(/You've been waiting for 0s/)).toBeInTheDocument();
    
    // Wait for timer to update (need to wait a bit more than 1 second)
    await waitFor(
      () => {
        expect(screen.getByText(/You've been waiting for [1-9]/)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('cycles through encouraging messages', async () => {
    render(<WaitingRoom {...defaultProps} />);
    
    // Should start with first message
    expect(screen.getByText("Finding someone who's ready to connect...")).toBeInTheDocument();
    
    // Wait for message to change (messages change every 4 seconds)
    await waitFor(
      () => {
        expect(screen.getByText("Your conversation partner is just around the corner...")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('has proper accessibility attributes', () => {
    render(<WaitingRoom {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel matching and return to main page/i });
    expect(cancelButton).toBeInTheDocument();
    
    // Check for live region by class since it doesn't have role="status"
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
  });

  it('formats time correctly for different durations', () => {
    const { rerender } = render(<WaitingRoom {...defaultProps} estimatedWaitTime={30} />);
    expect(screen.getAllByText(/~30s remaining/)).toHaveLength(2);
    
    rerender(<WaitingRoom {...defaultProps} estimatedWaitTime={120} />);
    expect(screen.getAllByText(/~2m 0s remaining/)).toHaveLength(2);
    
    rerender(<WaitingRoom {...defaultProps} estimatedWaitTime={150} />);
    expect(screen.getAllByText(/~2m 30s remaining/)).toHaveLength(2);
  });
});