/**
 * 讀取 ~/.local/share/opencode/opencode.db 中的 tool call 資料
 * Tool calls 存在 part 表，type = "tool"
 */

import type sqlite3 from "sqlite3";

export interface ToolCallEntry {
  id: string;
  messageId: string;
  sessionId: string;
  toolName: string;
  callId: string;
  status: "completed" | "running" | "error" | string;
  input: Record<string, unknown>;
  output: string;
  timeCreated: number;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  data: string;
}

type Sqlite3Namespace = { Database: typeof sqlite3.Database; verbose?: (mode: unknown) => unknown };

import * as os from "os";

const DEFAULT_DB_PATH = `${process.env.HOME || os.homedir()}/.local/share/opencode/opencode.db`;

export class ToolCallStore {
  private dbPath: string;
  private sqlite3Module: Sqlite3Namespace | null = null;
  private sqlite3LoadError: string | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? DEFAULT_DB_PATH;
  }

  private async loadSqlite3(): Promise<Sqlite3Namespace> {
    if (this.sqlite3Module) return this.sqlite3Module;
    if (this.sqlite3LoadError) throw new Error(this.sqlite3LoadError);
    try {
      const mod = await import("sqlite3");
      const ns: Sqlite3Namespace = mod.default ?? mod;
      this.sqlite3Module = ns;
      return ns;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.sqlite3LoadError = `Failed to load sqlite3: ${message}`;
      throw new Error(this.sqlite3LoadError);
    }
  }

  private async openDb(): Promise<sqlite3.Database> {
    const Sqlite3 = await this.loadSqlite3();
    return new Promise((resolve, reject) => {
      const db = new Sqlite3.Database(this.dbPath, (err: Error | null) => {
        if (err) reject(err);
        else resolve(db as sqlite3.Database);
      });
    });
  }

  private dbAll(db: sqlite3.Database, sql: string, params?: unknown[]): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params ?? [], (err: Error | null, rows: unknown[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  private dbClose(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
      db.close((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async testConnection(): Promise<boolean> {
    const db = await this.openDb();
    try {
      await this.dbAll(db, "SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得指定 session 的所有 tool call（或最近 50 筆） */
  async getToolCalls(sessionId?: string): Promise<ToolCallEntry[]> {
    const db = await this.openDb();
    try {
      const sql = sessionId
        ? `SELECT id, message_id, session_id, time_created, data FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'tool' ORDER BY time_created DESC`
        : `SELECT id, message_id, session_id, time_created, data FROM part WHERE json_extract(data, '$.type') = 'tool' ORDER BY time_created DESC LIMIT 50`;
      const params = sessionId ? [sessionId] : [];
      const rows = (await this.dbAll(db, sql, params)) as PartRow[];

      return rows.map((row) => {
        const data = JSON.parse(row.data || "{}");
        return {
          id: row.id,
          messageId: row.message_id,
          sessionId: row.session_id,
          toolName: data.tool || "unknown",
          callId: data.callID || "",
          status: data.state?.status || "unknown",
          input: data.state?.input || {},
          output: data.state?.output || "",
          timeCreated: row.time_created,
        };
      });
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得 tool call 總數 */
  async getToolCallCount(sessionId?: string): Promise<number> {
    const db = await this.openDb();
    try {
      const sql = sessionId
        ? `SELECT COUNT(*) as count FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'tool'`
        : `SELECT COUNT(*) as count FROM part WHERE json_extract(data, '$.type') = 'tool'`;
      const params = sessionId ? [sessionId] : [];
      const rows = (await this.dbAll(db, sql, params)) as Array<{ count: number }>;
      return rows[0]?.count ?? 0;
    } finally {
      await this.dbClose(db);
    }
  }
}