import sqlite3 from 'sqlite3';
import path from 'path';

interface PoolConnection {
  db: sqlite3.Database;
  inUse: boolean;
  lastUsed: Date;
  id: string;
}

class DatabaseConnectionPool {
  private connections: PoolConnection[] = [];
  private readonly maxConnections: number;
  private readonly minConnections: number;
  private readonly connectionTimeout: number;
  private readonly idleTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: {
    maxConnections?: number;
    minConnections?: number;
    connectionTimeout?: number;
    idleTimeout?: number;
  } = {}) {
    this.maxConnections = options.maxConnections || 10;
    this.minConnections = options.minConnections || 2;
    this.connectionTimeout = options.connectionTimeout || 30000; // 30 seconds
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes

    this.initializePool();
    this.startCleanupInterval();
  }

  private async initializePool(): Promise<void> {
    // Create minimum number of connections
    for (let i = 0; i < this.minConnections; i++) {
      try {
        const connection = await this.createConnection();
        this.connections.push(connection);
      } catch (error) {
        console.error('Failed to create initial database connection:', error);
      }
    }
  }

  private async createConnection(): Promise<PoolConnection> {
    return new Promise((resolve, reject) => {
      const dbPath = process.env.NODE_ENV === 'test' 
        ? ':memory:' 
        : path.join(process.cwd(), 'data', 'strangears.db');

      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Configure connection for better performance
          db.run('PRAGMA journal_mode = WAL');
          db.run('PRAGMA synchronous = NORMAL');
          db.run('PRAGMA cache_size = 1000');
          db.run('PRAGMA temp_store = MEMORY');
          
          resolve({
            db,
            inUse: false,
            lastUsed: new Date(),
            id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
          });
        }
      });
    });
  }

  public async getConnection(): Promise<PoolConnection> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout: No available connections'));
      }, this.connectionTimeout);

      try {
        // Find available connection
        let connection = this.connections.find(conn => !conn.inUse);

        if (!connection) {
          // Create new connection if under max limit
          if (this.connections.length < this.maxConnections) {
            connection = await this.createConnection();
            this.connections.push(connection);
          } else {
            // Wait for a connection to become available
            const checkInterval = setInterval(() => {
              const availableConn = this.connections.find(conn => !conn.inUse);
              if (availableConn) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                availableConn.inUse = true;
                availableConn.lastUsed = new Date();
                resolve(availableConn);
              }
            }, 100);
            return;
          }
        }

        clearTimeout(timeout);
        connection.inUse = true;
        connection.lastUsed = new Date();
        resolve(connection);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  public releaseConnection(connection: PoolConnection): void {
    connection.inUse = false;
    connection.lastUsed = new Date();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // Run every minute
  }

  private cleanupIdleConnections(): void {
    const now = new Date();
    const connectionsToRemove: number[] = [];

    this.connections.forEach((connection, index) => {
      if (!connection.inUse && 
          now.getTime() - connection.lastUsed.getTime() > this.idleTimeout &&
          this.connections.length > this.minConnections) {
        connectionsToRemove.push(index);
      }
    });

    // Remove idle connections (in reverse order to maintain indices)
    connectionsToRemove.reverse().forEach(index => {
      const connection = this.connections[index];
      connection.db.close((err) => {
        if (err) {
          console.error('Error closing idle database connection:', err);
        }
      });
      this.connections.splice(index, 1);
    });

    if (connectionsToRemove.length > 0) {
      console.log(`Cleaned up ${connectionsToRemove.length} idle database connections`);
    }
  }

  public getPoolStats() {
    const totalConnections = this.connections.length;
    const activeConnections = this.connections.filter(conn => conn.inUse).length;
    const idleConnections = totalConnections - activeConnections;

    return {
      totalConnections,
      activeConnections,
      idleConnections,
      maxConnections: this.maxConnections,
      minConnections: this.minConnections
    };
  }

  public async closeAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const closePromises = this.connections.map(connection => 
      new Promise<void>((resolve) => {
        connection.db.close((err) => {
          if (err) {
            console.error('Error closing database connection:', err);
          }
          resolve();
        });
      })
    );

    await Promise.all(closePromises);
    this.connections = [];
  }
}

// Enhanced Database class with connection pooling
export class PooledDatabase {
  private pool: DatabaseConnectionPool;

  constructor() {
    this.pool = new DatabaseConnectionPool({
      maxConnections: 10,
      minConnections: 2,
      connectionTimeout: 30000,
      idleTimeout: 300000
    });
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    const connection = await this.pool.getConnection();
    
    try {
      return new Promise((resolve, reject) => {
        connection.db.run(sql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this);
          }
        });
      });
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const connection = await this.pool.getConnection();
    
    try {
      return new Promise((resolve, reject) => {
        connection.db.get(sql, params, (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row as T);
          }
        });
      });
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const connection = await this.pool.getConnection();
    
    try {
      return new Promise((resolve, reject) => {
        connection.db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows as T[]);
          }
        });
      });
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  public getPoolStats() {
    return this.pool.getPoolStats();
  }

  public async close(): Promise<void> {
    await this.pool.closeAll();
  }
}

// Create singleton instance
export const pooledDatabase = new PooledDatabase();