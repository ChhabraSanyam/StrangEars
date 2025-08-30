import { v4 as uuidv4 } from 'uuid';

const USER_SESSION_DATA_KEY = 'strangears_user_session_data';

interface UserSessionData {
  userSessionId: string;
  username?: string;
}

/**
 * Utility class for managing persistent user session data (ID and username)
 * This data persists across browser refreshes and is used for reports and restrictions
 */
export class UserSessionIdManager {
  private static instance: UserSessionIdManager;
  private sessionData: UserSessionData | null = null;

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): UserSessionIdManager {
    if (!UserSessionIdManager.instance) {
      UserSessionIdManager.instance = new UserSessionIdManager();
    }
    return UserSessionIdManager.instance;
  }

  /**
   * Get the current user session ID, creating one if it doesn't exist
   */
  public getUserSessionId(): string {
    if (!this.sessionData) {
      this.generateNewUserSessionId();
    }
    return this.sessionData!.userSessionId;
  }

  /**
   * Get the current username
   */
  public getUsername(): string {
    return this.sessionData?.username || '';
  }

  /**
   * Set the username and save to storage
   */
  public setUsername(username: string): void {
    if (!this.sessionData) {
      this.generateNewUserSessionId();
    }
    this.sessionData!.username = username;
    this.saveToStorage();
  }

  /**
   * Generate a new user session ID and save it to localStorage
   */
  public generateNewUserSessionId(): string {
    const userSessionId = uuidv4();
    this.sessionData = {
      userSessionId,
      username: this.sessionData?.username // Preserve existing username if any
    };
    this.saveToStorage();
    return userSessionId;
  }

  /**
   * Clear the current user session data (useful for testing or user logout)
   */
  public clearUserSessionId(): void {
    this.sessionData = null;
    localStorage.removeItem(USER_SESSION_DATA_KEY);
  }

  /**
   * Load user session data from localStorage
   */
  private loadFromStorage(): void {
    try {
      // Try to load new format first
      const storedData = localStorage.getItem(USER_SESSION_DATA_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (parsed.userSessionId && this.isValidUuid(parsed.userSessionId)) {
          this.sessionData = parsed;
          return;
        }
      }

      // Fallback: migrate from old format
      const oldStoredId = localStorage.getItem('strangears_user_session_id');
      if (oldStoredId && this.isValidUuid(oldStoredId)) {
        this.sessionData = { userSessionId: oldStoredId };
        this.saveToStorage(); // Save in new format
        localStorage.removeItem('strangears_user_session_id'); // Clean up old format
      }
    } catch (error) {
      console.warn('Failed to load user session data from localStorage:', error);
    }
  }

  /**
   * Save user session data to localStorage
   */
  private saveToStorage(): void {
    try {
      if (this.sessionData) {
        localStorage.setItem(USER_SESSION_DATA_KEY, JSON.stringify(this.sessionData));
      }
    } catch (error) {
      console.warn('Failed to save user session data to localStorage:', error);
    }
  }

  /**
   * Validate if a string is a valid UUID
   */
  private isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

// Export singleton instance
export const userSessionIdManager = UserSessionIdManager.getInstance();