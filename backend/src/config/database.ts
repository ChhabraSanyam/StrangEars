import { Pool, PoolClient } from "pg";
import sqlite3 from "sqlite3";
import { promisify } from "util";

interface DatabaseAdapter {
  run(sql: string, params?: any[]): Promise<any>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  transaction<T>(callback: (client?: any) => Promise<T>): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

class PostgreSQLAdapter implements DatabaseAdapter {
  private pgPool: Pool;
  private lastHealthCheck: { result: boolean; timestamp: number } | null = null;
  private healthCheckCacheDuration = 30000; // 30 seconds

  constructor(connectionString: string) {
    this.pgPool = new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      max: 10, // Reduced from 20
      min: 2, // Keep minimum connections alive
      idleTimeoutMillis: 300000, // 5 minutes instead of 30 seconds
      connectionTimeoutMillis: 5000, // Increased timeout
      statement_timeout: 30000,
      query_timeout: 30000,
      acquireTimeoutMillis: 60000, // Add acquire timeout
    });

    this.pgPool.on("error", (err: Error) => {
      console.error("PostgreSQL connection error:", err);
    });

    // Add connection event logging (only in development)
    if (process.env.NODE_ENV === "development") {
      this.pgPool.on("connect", () => {
        console.log("New PostgreSQL connection established");
      });
      
      this.pgPool.on("remove", () => {
        console.log("PostgreSQL connection removed from pool");
      });
    }
  }

  private convertSqliteToPostgres(sql: string): string {
    return sql.replace(/\?/g, (_match, offset, string) => {
      const beforeMatch = string.substring(0, offset);
      const paramNumber = (beforeMatch.match(/\?/g) || []).length + 1;
      return `$${paramNumber}`;
    });
  }

  async run(sql: string, params: any[] = []): Promise<any> {
    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return { changes: result.rowCount };
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return result.rows[0] as T;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return result.rows as T[];
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pgPool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    // Return cached result if still valid
    const now = Date.now();
    if (this.lastHealthCheck && (now - this.lastHealthCheck.timestamp) < this.healthCheckCacheDuration) {
      return this.lastHealthCheck.result;
    }

    try {
      const client = await this.pgPool.connect();
      await client.query("SELECT 1");
      client.release();
      this.lastHealthCheck = { result: true, timestamp: now };
      return true;
    } catch {
      this.lastHealthCheck = { result: false, timestamp: now };
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pgPool.end();
  }
}

class SQLiteAdapter implements DatabaseAdapter {
  private db: sqlite3.Database;
  private runAsync: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  private getAsync: (sql: string, params?: any[]) => Promise<any>;
  private allAsync: (sql: string, params?: any[]) => Promise<any[]>;

  constructor() {
    this.db = new sqlite3.Database(":memory:");
    this.runAsync = promisify(this.db.run.bind(this.db));
    this.getAsync = promisify(this.db.get.bind(this.db));
    this.allAsync = promisify(this.db.all.bind(this.db));
  }

  async run(sql: string, params: any[] = []): Promise<any> {
    const result = await this.runAsync(sql, params);
    return { changes: result?.changes || 0 };
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return await this.getAsync(sql, params) as T;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.allAsync(sql, params) as T[];
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.runAsync("BEGIN TRANSACTION");
    try {
      const result = await callback();
      await this.runAsync("COMMIT");
      return result;
    } catch (error) {
      await this.runAsync("ROLLBACK");
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getAsync("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

class Database {
  private adapter!: DatabaseAdapter;
  private usingPostgreSQL: boolean = false;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.connect();
  }

  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  private async connect(): Promise<void> {
    // Try PostgreSQL first
    if (process.env.DATABASE_URL) {
      try {
        console.log("Attempting to connect to PostgreSQL...");
        const pgAdapter = new PostgreSQLAdapter(process.env.DATABASE_URL);
        
        // Test the connection
        const isHealthy = await pgAdapter.healthCheck();
        if (isHealthy) {
          this.adapter = pgAdapter;
          this.usingPostgreSQL = true;
          console.log("Connected to PostgreSQL successfully");
          console.log("Pool configuration:", {
            max: 10,
            min: 2,
            idleTimeoutMillis: 300000,
            connectionTimeoutMillis: 5000
          });
          await this.initializeTables();
          return;
        }
      } catch (error) {
        console.warn("PostgreSQL connection failed:", error instanceof Error ? error.message : String(error));
      }
    } else {
      console.warn("DATABASE_URL not set, skipping PostgreSQL");
    }

    // Fallback to SQLite
    console.log("Falling back to in-memory SQLite...");
    try {
      this.adapter = new SQLiteAdapter();
      this.usingPostgreSQL = false;
      console.log("Connected to SQLite successfully");
      await this.initializeTables();
    } catch (error) {
      console.error("SQLite fallback failed:", error);
      throw new Error("Failed to initialize any database connection");
    }
  }

  private async initializeTables(): Promise<void> {
    try {
      console.log(`Initializing tables for ${this.usingPostgreSQL ? 'PostgreSQL' : 'SQLite'}...`);

      // Create reports table (compatible with both PostgreSQL and SQLite)
      const reportsTableSql = this.usingPostgreSQL 
        ? `CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY CHECK (length(id) <= 36),
            session_id TEXT NOT NULL CHECK (length(session_id) <= 100),
            reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
            reason TEXT CHECK (length(reason) <= 1000),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved BOOLEAN DEFAULT FALSE,
            reporter_username TEXT CHECK (length(reporter_username) <= 100),
            reported_username TEXT CHECK (length(reported_username) <= 100)
          )`
        : `CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
            reason TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved BOOLEAN DEFAULT FALSE,
            reporter_username TEXT,
            reported_username TEXT
          )`;

      await this.adapter.run(reportsTableSql);

      // Create user_patterns table
      const userPatternsTableSql = this.usingPostgreSQL
        ? `CREATE TABLE IF NOT EXISTS user_patterns (
            id TEXT PRIMARY KEY CHECK (length(id) <= 36),
            user_session_id TEXT NOT NULL CHECK (length(user_session_id) <= 36),
            session_id TEXT NOT NULL CHECK (length(session_id) <= 100),
            report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_behavior', 'spam', 'harassment', 'other')),
            reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
            reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )`
        : `CREATE TABLE IF NOT EXISTS user_patterns (
            id TEXT PRIMARY KEY,
            user_session_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_behavior', 'spam', 'harassment', 'other')),
            reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
            reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`;

      await this.adapter.run(userPatternsTableSql);

      // Create user_restrictions table
      const userRestrictionsTableSql = this.usingPostgreSQL
        ? `CREATE TABLE IF NOT EXISTS user_restrictions (
            id TEXT PRIMARY KEY CHECK (length(id) <= 36),
            user_session_id TEXT NOT NULL CHECK (length(user_session_id) <= 36),
            restriction_type TEXT NOT NULL CHECK (restriction_type IN ('temporary_ban', 'warning', 'permanent_ban')),
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            reason TEXT NOT NULL CHECK (length(reason) <= 1000),
            report_count INTEGER NOT NULL DEFAULT 1 CHECK (report_count >= 0 AND report_count <= 1000),
            is_active BOOLEAN DEFAULT TRUE
          )`
        : `CREATE TABLE IF NOT EXISTS user_restrictions (
            id TEXT PRIMARY KEY,
            user_session_id TEXT NOT NULL,
            restriction_type TEXT NOT NULL CHECK (restriction_type IN ('temporary_ban', 'warning', 'permanent_ban')),
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            reason TEXT NOT NULL,
            report_count INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN DEFAULT TRUE
          )`;

      await this.adapter.run(userRestrictionsTableSql);

      // Create indexes (both databases support these)
      const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_user_patterns_user_session_id ON user_patterns(user_session_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_patterns_reported_at ON user_patterns(reported_at)",
        "CREATE INDEX IF NOT EXISTS idx_user_patterns_report_type ON user_patterns(report_type)",
        "CREATE INDEX IF NOT EXISTS idx_user_restrictions_user_session_id ON user_restrictions(user_session_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_user_restrictions_end_time ON user_restrictions(end_time)",
      ];

      for (const indexSql of indexes) {
        try {
          await this.adapter.run(indexSql);
        } catch (error) {
          // Indexes might fail in SQLite if they already exist, that's okay
          console.warn(`Index creation warning: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Perform startup cleanup (only for PostgreSQL to avoid issues with SQLite date functions)
      if (this.usingPostgreSQL) {
        await this.performStartupCleanup();
      }

      console.log("Database tables initialized successfully");
    } catch (error) {
      console.error("Error initializing database tables:", error);
      throw error;
    }
  }

  private async performStartupCleanup(): Promise<void> {
    try {
      console.log("Performing startup cleanup...");

      // Deactivate expired restrictions (PostgreSQL only - uses INTERVAL)
      await this.adapter.run(`
        UPDATE user_restrictions 
        SET is_active = false 
        WHERE is_active = true 
          AND end_time IS NOT NULL 
          AND end_time <= CURRENT_TIMESTAMP
      `);

      // Delete old resolved reports (older than 60 days)
      await this.adapter.run(`
        DELETE FROM reports 
        WHERE resolved = true 
          AND timestamp < CURRENT_TIMESTAMP - INTERVAL '60 days'
      `);

      // Delete old user patterns (older than 30 days)
      await this.adapter.run(`
        DELETE FROM user_patterns 
        WHERE reported_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);

      // Delete old inactive restrictions (older than 90 days)
      await this.adapter.run(`
        DELETE FROM user_restrictions 
        WHERE is_active = false 
          AND start_time < CURRENT_TIMESTAMP - INTERVAL '90 days'
      `);

      console.log("Startup cleanup completed");
    } catch (error) {
      console.error("Startup cleanup failed:", error instanceof Error ? error.message : String(error));
      // Don't throw - let the app continue even if cleanup fails
    }
  }

  private isValidSql(sql: string): boolean {
    const trimmedSql = sql.trim().toLowerCase();

    const allowedOperations = [
      "select",
      "insert",
      "update",
      "delete",
      "create table",
      "create index",
      "drop index",
    ];

    const isAllowed = allowedOperations.some((op) => trimmedSql.startsWith(op));

    const dangerousKeywords = [
      "drop table",
      "drop database",
      "truncate",
      "alter table",
      "grant",
      "revoke",
      "exec",
      "execute",
      "sp_",
      "xp_",
      "union",
      "--",
      "/*",
      "*/",
      "script",
      "javascript",
    ];

    const hasDangerousKeywords = dangerousKeywords.some((keyword) =>
      trimmedSql.includes(keyword)
    );

    return isAllowed && !hasDangerousKeywords;
  }

  public async run(sql: string, params: any[] = []): Promise<any> {
    await this.waitForInit();
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }
    
    // Log queries in development (but limit to avoid spam)
    if (process.env.NODE_ENV === "development" && !sql.includes("SELECT 1")) {
      console.log(`[DB Query] ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`, params?.length ? `[${params.length} params]` : '');
    }
    
    return await this.adapter.run(sql, params);
  }

  public async get<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T | undefined> {
    await this.waitForInit();
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }
    
    // Log queries in development (but limit to avoid spam)
    if (process.env.NODE_ENV === "development" && !sql.includes("SELECT 1")) {
      console.log(`[DB Query] ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`, params?.length ? `[${params.length} params]` : '');
    }
    
    return await this.adapter.get<T>(sql, params);
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.waitForInit();
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }
    
    // Log queries in development (but limit to avoid spam)
    if (process.env.NODE_ENV === "development" && !sql.includes("SELECT 1")) {
      console.log(`[DB Query] ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`, params?.length ? `[${params.length} params]` : '');
    }
    
    return await this.adapter.all<T>(sql, params);
  }

  public async transaction<T>(
    callback: (client?: any) => Promise<T>
  ): Promise<T> {
    await this.waitForInit();
    return await this.adapter.transaction(callback);
  }

  public async healthCheck(): Promise<boolean> {
    await this.waitForInit();
    return await this.adapter.healthCheck();
  }

  public async close(): Promise<void> {
    await this.adapter.close();
  }

  public getDatabaseType(): 'postgresql' | 'sqlite' {
    return this.usingPostgreSQL ? 'postgresql' : 'sqlite';
  }

  public isUsingPostgreSQL(): boolean {
    return this.usingPostgreSQL;
  }
}

// Create singleton instance
export const database = new Database();