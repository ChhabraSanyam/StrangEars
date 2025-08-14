import sqlite3 from 'sqlite3';
import path from 'path';

// Conditional import for PostgreSQL
let Pool: any;
try {
  Pool = require('pg').Pool;
} catch (error) {
  // pg not installed, will use SQLite only
}

// Enable verbose mode for debugging in development
const sqlite = sqlite3.verbose();

class Database {
  private db: sqlite3.Database | null = null;
  private pgPool: any = null;
  private isPostgres: boolean = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    // Use PostgreSQL in production if DATABASE_URL is provided and pg is available
    if (process.env.DATABASE_URL && Pool) {
      this.isPostgres = true;
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        statement_timeout: 30000,
        query_timeout: 30000,
      });
      
      this.pgPool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err);
      });
      
      console.log('Connected to PostgreSQL database');
      this.validateConnection();
      return;
    }

    // Fallback to SQLite for local development
    const dbPath = process.env.NODE_ENV === 'test' 
      ? ':memory:' 
      : process.env.NODE_ENV === 'production' 
        ? ':memory:'
        : path.join(process.cwd(), 'data', 'strangears.db');

    this.db = new sqlite.Database(dbPath, (err: Error | null) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private async validateConnection(): Promise<void> {
    if (!this.pgPool) return;
    
    try {
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      await this.initializePostgresTables();
    } catch (error) {
      console.error('Failed to validate PostgreSQL connection:', error);
      throw error;
    }
  }

  private async initializePostgresTables(): Promise<void> {
    if (!this.pgPool) return;

    try {
      // Create reports table
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY CHECK (length(id) <= 36),
          session_id TEXT NOT NULL CHECK (length(session_id) <= 100),
          reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
          reason TEXT CHECK (length(reason) <= 1000),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT FALSE
        )
      `);

      // Create user_patterns table
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS user_patterns (
          id TEXT PRIMARY KEY CHECK (length(id) <= 36),
          socket_id TEXT NOT NULL CHECK (length(socket_id) <= 100),
          session_id TEXT NOT NULL CHECK (length(session_id) <= 100),
          report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_behavior', 'spam', 'harassment', 'other')),
          reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
          reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create user_restrictions table
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS user_restrictions (
          id TEXT PRIMARY KEY CHECK (length(id) <= 36),
          socket_id TEXT NOT NULL CHECK (length(socket_id) <= 100),
          restriction_type TEXT NOT NULL CHECK (restriction_type IN ('temporary_ban', 'warning', 'permanent_ban')),
          start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_time TIMESTAMP,
          reason TEXT NOT NULL CHECK (length(reason) <= 1000),
          report_count INTEGER NOT NULL DEFAULT 1 CHECK (report_count >= 0 AND report_count <= 1000),
          is_active BOOLEAN DEFAULT TRUE
        )
      `);

      // Create indexes
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_user_patterns_socket_id ON user_patterns(socket_id)',
        'CREATE INDEX IF NOT EXISTS idx_user_patterns_reported_at ON user_patterns(reported_at)',
        'CREATE INDEX IF NOT EXISTS idx_user_patterns_report_type ON user_patterns(report_type)',
        'CREATE INDEX IF NOT EXISTS idx_user_restrictions_socket_id ON user_restrictions(socket_id)',
        'CREATE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_user_restrictions_end_time ON user_restrictions(end_time)'
      ];

      for (const indexSql of indexes) {
        await this.pgPool.query(indexSql);
      }

      console.log('PostgreSQL tables and indexes initialized');
    } catch (error) {
      console.error('Error initializing PostgreSQL tables:', error);
    }
  }

  private initializeTables(): void {
    if (!this.db) return;

    const tables = [
      {
        name: 'reports',
        sql: `CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
          reason TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT FALSE
        )`
      },
      {
        name: 'user_patterns',
        sql: `CREATE TABLE IF NOT EXISTS user_patterns (
          id TEXT PRIMARY KEY,
          socket_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_behavior', 'spam', 'harassment', 'other')),
          reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
          reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'user_restrictions',
        sql: `CREATE TABLE IF NOT EXISTS user_restrictions (
          id TEXT PRIMARY KEY,
          socket_id TEXT NOT NULL,
          restriction_type TEXT NOT NULL CHECK (restriction_type IN ('temporary_ban', 'warning', 'permanent_ban')),
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME,
          reason TEXT NOT NULL,
          report_count INTEGER NOT NULL DEFAULT 1,
          is_active BOOLEAN DEFAULT TRUE
        )`
      }
    ];

    tables.forEach(table => {
      this.db!.run(table.sql, (err: Error | null) => {
        if (err) {
          console.error(`Error creating ${table.name} table:`, err.message);
        } else {
          console.log(`${table.name} table initialized`);
        }
      });
    });

    setTimeout(() => this.createIndexes(), 100);
  }

  private createIndexes(): void {
    if (!this.db) return;

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_socket_id ON user_patterns(socket_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_reported_at ON user_patterns(reported_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_report_type ON user_patterns(report_type)',
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_socket_id ON user_restrictions(socket_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_end_time ON user_restrictions(end_time)'
    ];

    indexes.forEach((indexSql, i) => {
      this.db!.run(indexSql, (err: Error | null) => {
        if (err) {
          console.error(`Error creating index ${i + 1}:`, err.message);
        }
      });
    });
  }

  private isValidSql(sql: string): boolean {
    const trimmedSql = sql.trim().toLowerCase();
    
    const allowedOperations = [
      'select', 'insert', 'update', 'delete', 
      'create table', 'create index', 'drop index'
    ];
    
    const isAllowed = allowedOperations.some(op => trimmedSql.startsWith(op));
    
    const dangerousKeywords = [
      'drop table', 'drop database', 'truncate', 'alter table',
      'grant', 'revoke', 'exec', 'execute', 'sp_', 'xp_',
      'union', '--', '/*', '*/', 'script', 'javascript'
    ];
    
    const hasDangerousKeywords = dangerousKeywords.some(keyword => 
      trimmedSql.includes(keyword)
    );
    
    return isAllowed && !hasDangerousKeywords;
  }

  private convertSqliteToPostgres(sql: string): string {
    return sql
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      .replace(/DATE\('now'\)/g, 'CURRENT_DATE')
      .replace(/\?/g, (_match, offset, string) => {
        const beforeMatch = string.substring(0, offset);
        const paramNumber = (beforeMatch.match(/\?/g) || []).length + 1;
        return `$${paramNumber}`;
      });
  }

  public async run(sql: string, params: any[] = []): Promise<any> {
    if (this.isPostgres && this.pgPool) {
      if (!this.isValidSql(sql)) {
        throw new Error('Invalid SQL statement');
      }
      
      const pgSql = this.convertSqliteToPostgres(sql);
      
      try {
        const result = await this.pgPool.query(pgSql, params);
        return { changes: result.rowCount };
      } catch (error) {
        console.error('Database query error:', error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function(err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (this.isPostgres && this.pgPool) {
      if (!this.isValidSql(sql)) {
        throw new Error('Invalid SQL statement');
      }
      
      const pgSql = this.convertSqliteToPostgres(sql);
      
      try {
        const result = await this.pgPool.query(pgSql, params);
        return result.rows[0] as T;
      } catch (error) {
        console.error('Database query error:', error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(sql, params, (err: Error | null, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.isPostgres && this.pgPool) {
      if (!this.isValidSql(sql)) {
        throw new Error('Invalid SQL statement');
      }
      
      const pgSql = this.convertSqliteToPostgres(sql);
      
      try {
        const result = await this.pgPool.query(pgSql, params);
        return result.rows as T[];
      } catch (error) {
        console.error('Database query error:', error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    if (!this.isPostgres || !this.pgPool) {
      throw new Error('Transactions only supported with PostgreSQL');
    }

    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (this.isPostgres && this.pgPool) {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        return true;
      } else if (this.db) {
        return new Promise((resolve) => {
          this.db!.get('SELECT 1', (err: Error | null) => {
            resolve(!err);
          });
        });
      }
      return false;
    } catch {
      return false;
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isPostgres && this.pgPool) {
        this.pgPool.end().then(() => {
          console.log('PostgreSQL connection closed');
          resolve();
        }).catch(reject);
        return;
      }

      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

// Create singleton instance
export const database = new Database();