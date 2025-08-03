import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

// Enable verbose mode for debugging in development
const sqlite = sqlite3.verbose();

class Database {
  private db: sqlite3.Database | null = null;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const dbPath = process.env.NODE_ENV === 'test' 
      ? ':memory:' 
      : path.join(process.cwd(), 'data', 'strangears.db');

    this.db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    if (!this.db) return;

    // Create reports table
    const createReportsTable = `
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT FALSE
      )
    `;

    this.db.run(createReportsTable, (err) => {
      if (err) {
        console.error('Error creating reports table:', err.message);
      } else {
        console.log('Reports table initialized');
      }
    });

    // Create user_patterns table for tracking reported user behavior
    const createUserPatternsTable = `
      CREATE TABLE IF NOT EXISTS user_patterns (
        id TEXT PRIMARY KEY,
        socket_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_behavior', 'spam', 'harassment', 'other')),
        reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
        reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createUserPatternsTable, (err) => {
      if (err) {
        console.error('Error creating user_patterns table:', err.message);
      } else {
        console.log('User patterns table initialized');
      }
    });

    // Create user_restrictions table for tracking temporary bans and warnings
    const createUserRestrictionsTable = `
      CREATE TABLE IF NOT EXISTS user_restrictions (
        id TEXT PRIMARY KEY,
        socket_id TEXT NOT NULL,
        restriction_type TEXT NOT NULL CHECK (restriction_type IN ('temporary_ban', 'warning', 'permanent_ban')),
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        reason TEXT NOT NULL,
        report_count INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE
      )
    `;

    this.db.run(createUserRestrictionsTable, (err) => {
      if (err) {
        console.error('Error creating user_restrictions table:', err.message);
      } else {
        console.log('User restrictions table initialized');
      }
    });

    // Create indexes after all tables are created
    setTimeout(() => this.createIndexes(), 100);
  }

  private createIndexes(): void {
    if (!this.db) return;

    const indexes = [
      // Reports table indexes
      'CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp)',
      
      // User patterns table indexes
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_socket_id ON user_patterns(socket_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_reported_at ON user_patterns(reported_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_patterns_report_type ON user_patterns(report_type)',
      
      // User restrictions table indexes
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_socket_id ON user_restrictions(socket_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_user_restrictions_end_time ON user_restrictions(end_time)'
    ];

    indexes.forEach((indexSql, i) => {
      this.db!.run(indexSql, (err) => {
        if (err) {
          console.error(`Error creating index ${i + 1}:`, err.message);
        }
      });
    });
  }

  public getDatabase(): sqlite3.Database | null {
    return this.db;
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
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