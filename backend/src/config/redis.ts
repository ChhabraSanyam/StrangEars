import Redis from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
}

class RedisClient {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  constructor() {
    // Don't connect immediately, wait for first use
  }

  private async connect(): Promise<void> {
    if (this.client) {
      return; // Already initialized
    }

    try {
      const config: RedisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1, // Fail fast for initial connection
        lazyConnect: true,
        connectTimeout: 5000, // 5 second timeout
        commandTimeout: 5000
      };

      this.client = new Redis(config);

      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('error', (error: Error) => {
        console.error('Redis client error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('Redis client connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis client reconnecting...');
      });

      // Test the connection with timeout
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      await this.client.ping();
      console.log('Redis connection established successfully');

    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      // Don't throw error, just mark as disconnected
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }
    }
  }

  public async getClient(): Promise<Redis> {
    if (!this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('Redis client not available');
    }
    return this.client;
  }

  public isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.isConnected = false;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
export default redisClient;