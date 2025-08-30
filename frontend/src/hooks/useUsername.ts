import { useState, useEffect } from 'react';
import { userSessionIdManager } from '../utils/userSessionId';

/**
 * Hook for username with localStorage persistence using the unified UserSessionIdManager
 */
export const useUsername = () => {
  const [username, setUsername] = useState<string>('');

  // Load saved username on mount
  useEffect(() => {
    setUsername(userSessionIdManager.getUsername());
  }, []);

  // Update username and save to localStorage
  const updateUsername = (newUsername: string) => {
    setUsername(newUsername);
    userSessionIdManager.setUsername(newUsername);
  };

  return {
    username,
    setUsername: updateUsername
  };
};