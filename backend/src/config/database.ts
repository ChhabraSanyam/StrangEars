import { Pool, PoolClient } from "pg";

class Database {
  private pgPool!: Pool;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable must be set");
    }

    this.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 30000,
      query_timeout: 30000,
    });

    this.pgPool.on("error", (err: Error) => {
      console.error("Database connection error:", err);
    });

    this.validateConnection();
  }

  private async validateConnection(): Promise<void> {
    try {
      const client = await this.pgPool.connect();
      await client.query("SELECT NOW()");
      client.release();
      await this.initializeTables();
    } catch (error) {
      console.error("Failed to validate PostgreSQL connection:", error);
      throw error;
    }
  }

  private async initializeTables(): Promise<void> {
    try {
      // Create reports table
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY CHECK (length(id) <= 36),
          session_id TEXT NOT NULL CHECK (length(session_id) <= 100),
          reporter_type TEXT NOT NULL CHECK (reporter_type IN ('venter', 'listener')),
          reason TEXT CHECK (length(reason) <= 1000),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT FALSE,
          reporter_username TEXT CHECK (length(reporter_username) <= 100),
          reported_username TEXT CHECK (length(reported_username) <= 100)
        )
      `);

      // Create user_patterns table
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS user_patterns (
          id TEXT PRIMARY KEY CHECK (length(id) <= 36),
          user_session_id TEXT NOT NULL CHECK (length(user_session_id) <= 36),
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
          user_session_id TEXT NOT NULL CHECK (length(user_session_id) <= 36),
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
        await this.pgPool.query(indexSql);
      }

      // Perform startup cleanup
      await this.performStartupCleanup();
    } catch (error) {
      console.error("Error initializing PostgreSQL tables:", error);
      throw error;
    }
  }

  private async performStartupCleanup(): Promise<void> {
    try {
      // Deactivate expired restrictions
      await this.pgPool.query(`
        UPDATE user_restrictions 
        SET is_active = false 
        WHERE is_active = true 
          AND end_time IS NOT NULL 
          AND end_time <= CURRENT_TIMESTAMP
      `);

      // Delete old resolved reports (older than 60 days)
      await this.pgPool.query(`
        DELETE FROM reports 
        WHERE resolved = true 
          AND timestamp < CURRENT_TIMESTAMP - INTERVAL '60 days'
      `);

      // Delete old user patterns (older than 30 days)
      await this.pgPool.query(`
        DELETE FROM user_patterns 
        WHERE reported_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);

      // Delete old inactive restrictions (older than 90 days)
      await this.pgPool.query(`
        DELETE FROM user_restrictions 
        WHERE is_active = false 
          AND start_time < CURRENT_TIMESTAMP - INTERVAL '90 days'
      `);

    } catch (error) {
      console.error("Startup cleanup failed:", error);
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

  private convertSqliteToPostgres(sql: string): string {
    return sql.replace(/\?/g, (_match, offset, string) => {
      const beforeMatch = string.substring(0, offset);
      const paramNumber = (beforeMatch.match(/\?/g) || []).length + 1;
      return `$${paramNumber}`;
    });
  }

  public async run(sql: string, params: any[] = []): Promise<any> {
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }

    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return { changes: result.rowCount };
  }

  public async get<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T | undefined> {
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }

    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return result.rows[0] as T;
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.isValidSql(sql)) {
      throw new Error("Invalid SQL statement");
    }

    const pgSql = this.convertSqliteToPostgres(sql);
    const result = await this.pgPool.query(pgSql, params);
    return result.rows as T[];
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
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

  public async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pgPool.connect();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pgPool.end();
  }
}

// Create singleton instance
export const database = new Database();
