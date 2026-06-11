/**
 * 讀取 ~/.local/share/opencode/opencode.db 中的真實 token usage 資料
 * 使用 sqlite3 npm 套件（跨平台相容，有 prebuilt binaries）
 *
 * sqlite3 是 native module，用 dynamic import 避免載入失敗時影響整個 plugin
 */

import type sqlite3 from "sqlite3";

export interface TimelineEntry {
  id: string;
  sessionId: string;
  type: "message" | "tool";
  timestamp: number;
  // Message fields
  agent?: string;
  model?: string;
  provider?: string;
  role?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: number;
  // Tool fields
  toolName?: string;
  callId?: string;
  status?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  // Common
  messageId?: string;
}

export interface MessagePart {
  type: string;
  text: string;
  time?: { start: number; end: number };
}

export interface RealTokenUsageEntry {
  id: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  model: string;
  provider: string;
  displayModel: string;
  timestamp: number;
  role: string;
  agent: string;
  partTypes: string[];
}

export interface AccumulatedTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
}

export interface SessionStats {
  id: string;
  title: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  data: string;
}

interface SessionIdRow {
  id: string;
}

interface SessionRow {
  id: string;
  title: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  cost: number;
}

// Type for the loaded sqlite3 module (handles ESM/CJS interop)
// At runtime, dynamic import returns { default: { Database, ... } }
// We store the resolved namespace object and type it loosely to avoid
// ESM/CJS type mismatches between compile-time and runtime.
type Sqlite3Namespace = {
  Database: typeof sqlite3.Database;
  verbose?: (mode: unknown) => unknown;
};

import * as os from "os";

const DEFAULT_DB_PATH = `${process.env.HOME || os.homedir()}/.local/share/opencode/opencode.db`;

export class TokenStore {
  private dbPath: string;
  private sqlite3Module: Sqlite3Namespace | null = null;
  private sqlite3LoadError: string | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? DEFAULT_DB_PATH;
  }

  // ── sqlite3 lazy loader ────────────────────────────────────

  private async loadSqlite3(): Promise<Sqlite3Namespace> {
    if (this.sqlite3Module) return this.sqlite3Module;
    if (this.sqlite3LoadError) throw new Error(this.sqlite3LoadError);
    try {
      const mod = await import("sqlite3");
      // ESM dynamic import wraps CJS module in { default }
      const ns: Sqlite3Namespace = mod.default ?? mod;
      this.sqlite3Module = ns;
      return ns;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.sqlite3LoadError = `Failed to load sqlite3: ${message}`;
      throw new Error(this.sqlite3LoadError);
    }
  }

  // ── Promise helpers for sqlite3 callback API ────────────────

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

  // ── Public API ─────────────────────────────────────────────

  /** 測試 DB 連線是否正常 */
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

  /**
   * 取得目前 session 的所有 message token usage
   * 如果沒有提供 sessionId，則回傳最近的 20 筆
   */
  async getTokenUsage(sessionId?: string): Promise<RealTokenUsageEntry[]> {
    const db = await this.openDb();
    try {
      const sql = sessionId
        ? `SELECT id, session_id, data FROM message WHERE session_id = ? ORDER BY time_created DESC`
        : `SELECT id, session_id, data FROM message ORDER BY time_created DESC LIMIT 20`;
      const params = sessionId ? [sessionId] : [];
      const rows = (await this.dbAll(db, sql, params)) as MessageRow[];

      // Fetch part types for all messages in one query
      const messageIds = rows.map((r) => r.id);
      let partTypesMap: Map<string, string[]> = new Map();

      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => "?").join(",");
        const partRows = (await this.dbAll(
          db,
          `SELECT message_id, json_extract(data, '$.type') as type FROM part WHERE message_id IN (${placeholders})`,
          messageIds,
        )) as Array<{ message_id: string; type: string }>;

        partRows.forEach((row) => {
          const types = partTypesMap.get(row.message_id) || [];
          if (!types.includes(row.type)) {
            types.push(row.type);
          }
          partTypesMap.set(row.message_id, types);
        });
      }

      return rows.map((row) => {
        const data = JSON.parse(row.data || "{}");
        return {
          id: row.id,
          sessionId: row.session_id,
          inputTokens: data.tokens?.input || 0,
          outputTokens: data.tokens?.output || 0,
          reasoningTokens: data.tokens?.reasoning || 0,
          cacheRead: data.tokens?.cache?.read || 0,
          cacheWrite: data.tokens?.cache?.write || 0,
          totalTokens: data.tokens?.total || 0,
          cost: data.cost || 0,
          model: data.modelID || "unknown",
          provider: data.providerID || "unknown",
          displayModel: data.providerID ? `${data.providerID}/${data.modelID}` : "User Prompt",
          timestamp: data.time?.created || Date.now(),
          role: data.role || "unknown",
          agent: data.agent || "unknown",
          partTypes: partTypesMap.get(row.id) || [],
        };
      });
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得指定 message 的所有 text/reasoning parts */
  async getMessageParts(messageId: string): Promise<MessagePart[]> {
    const db = await this.openDb();
    try {
      const rows = (await this.dbAll(
        db,
        `SELECT data FROM part WHERE message_id = ? AND json_extract(data, '$.type') IN ('text', 'reasoning') ORDER BY time_created`,
        [messageId],
      )) as Array<{ data: string }>;

      return rows.map((row) => {
        const data = JSON.parse(row.data || "{}");
        return {
          type: data.type,
          text: data.text || "",
          time: data.time,
        };
      });
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得 Timeline 資料（合併 message 和 tool call） */
  async getTimelineData(sessionId?: string): Promise<TimelineEntry[]> {
    const db = await this.openDb();
    try {
      // Get messages
      const messageSql = sessionId
        ? `SELECT id, session_id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created`
        : `SELECT id, session_id, data, time_created FROM message ORDER BY time_created DESC LIMIT 50`;
      const messageParams = sessionId ? [sessionId] : [];
      const messageRows = (await this.dbAll(db, messageSql, messageParams)) as Array<{ id: string; session_id: string; data: string; time_created: number }>;

      // Get tool parts
      const toolSql = sessionId
        ? `SELECT id, message_id, session_id, data, time_created FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'tool' ORDER BY time_created`
        : `SELECT id, message_id, session_id, data, time_created FROM part WHERE json_extract(data, '$.type') = 'tool' ORDER BY time_created DESC LIMIT 50`;
      const toolParams = sessionId ? [sessionId] : [];
      const toolRows = (await this.dbAll(db, toolSql, toolParams)) as Array<{ id: string; message_id: string; session_id: string; data: string; time_created: number }>;

      const entries: TimelineEntry[] = [];

      // Process messages
      messageRows.forEach((row) => {
        const data = JSON.parse(row.data || "{}");
        entries.push({
          id: row.id,
          sessionId: row.session_id,
          type: "message",
          timestamp: row.time_created,
          agent: data.agent,
          model: data.modelID,
          provider: data.providerID,
          role: data.role,
          inputTokens: data.tokens?.input || 0,
          outputTokens: data.tokens?.output || 0,
          reasoningTokens: data.tokens?.reasoning || 0,
          cacheRead: data.tokens?.cache?.read || 0,
          cacheWrite: data.tokens?.cache?.write || 0,
          totalTokens: data.tokens?.total || 0,
          cost: data.cost || 0,
        });
      });

      // Process tool calls
      toolRows.forEach((row) => {
        const data = JSON.parse(row.data || "{}");
        entries.push({
          id: row.id,
          sessionId: row.session_id,
          type: "tool",
          timestamp: row.time_created,
          messageId: row.message_id,
          toolName: data.tool || "unknown",
          callId: data.callID || "",
          status: data.state?.status || "unknown",
          toolInput: data.state?.input || {},
          toolOutput: data.state?.output || "",
        });
      });

      // Sort by timestamp descending (newest first)
      entries.sort((a, b) => b.timestamp - a.timestamp);

      return entries;
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得目前執行中的 session ID（最新的非 archived session） */
  async getCurrentSessionId(): Promise<string | null> {
    const db = await this.openDb();
    try {
      const rows = (await this.dbAll(
        db,
        `SELECT id FROM session WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 1`,
      )) as SessionIdRow[];
      return rows[0]?.id ?? null;
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得所有 session 的 token 統計 */
  async getAllSessionStats(): Promise<SessionStats[]> {
    const db = await this.openDb();
    try {
      const rows = (await this.dbAll(
        db,
        `SELECT id, title, model, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost FROM session WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 50`,
      )) as SessionRow[];

      return rows.map((row) => ({
        id: row.id,
        title: row.title || "Untitled",
        model: row.model || "unknown",
        inputTokens: row.tokens_input || 0,
        outputTokens: row.tokens_output || 0,
        reasoningTokens: row.tokens_reasoning || 0,
        cacheRead: row.tokens_cache_read || 0,
        cacheWrite: row.tokens_cache_write || 0,
        totalTokens: (row.tokens_input || 0) + (row.tokens_output || 0) + (row.tokens_reasoning || 0),
        cost: row.cost || 0,
      }));
    } finally {
      await this.dbClose(db);
    }
  }

  /** 取得累積的 token usage（用於 Overview） */
  async getAccumulatedTokenUsage(): Promise<AccumulatedTokens> {
    const sessions = await this.getAllSessionStats();
    return sessions.reduce(
      (acc, s) => ({
        input: acc.input + s.inputTokens,
        output: acc.output + s.outputTokens,
        reasoning: acc.reasoning + s.reasoningTokens,
        cacheRead: acc.cacheRead + s.cacheRead,
        cacheWrite: acc.cacheWrite + s.cacheWrite,
        total: acc.total + s.totalTokens,
        cost: acc.cost + s.cost,
      }),
      {
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        cost: 0,
      } as AccumulatedTokens,
    );
  }
}

// ── Singleton + backward-compatible function exports ──────────

const store = new TokenStore();

export const getTokenUsageFromDb = store.getTokenUsage.bind(store);
export const getCurrentSessionId = store.getCurrentSessionId.bind(store);
export const getAllSessionStats = store.getAllSessionStats.bind(store);
export const getAccumulatedTokenUsage = store.getAccumulatedTokenUsage.bind(store);
export const getTimelineData = store.getTimelineData.bind(store);
export const getMessageParts = store.getMessageParts.bind(store);
