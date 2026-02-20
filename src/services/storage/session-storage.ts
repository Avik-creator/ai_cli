/**
 * Session Storage Service - SQLite-based chat persistence
 * Uses Bun's native bun:sqlite for high-performance storage
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".agentic-cli");
const DB_PATH = join(CONFIG_DIR, "sessions.db");

// Ensure config directory exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * Session message structure
 */
export interface SessionMessage {
  id?: number;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  isSummary?: boolean;
  compactedAt?: string;
}

/**
 * Session summary structure
 */
export interface SessionSummary {
  id?: number;
  sessionId: string;
  content: string;
  modelUsed: string;
  createdAt: string;
}

/**
 * Chat session structure
 */
export interface ChatSession {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Session Storage Database
 */
class SessionStorage {
  private db: Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.initialize();
  }

  /**
   * Initialize database tables
   */
  private initialize(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        mode TEXT NOT NULL DEFAULT 'all',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        message_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'summary')),
        content TEXT NOT NULL,
        is_summary INTEGER DEFAULT 0,
        compacted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        content TEXT NOT NULL,
        model_used TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id 
      ON messages(session_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at 
      ON sessions(updated_at DESC)
    `);

    // Migration: Add is_summary column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE messages ADD COLUMN is_summary INTEGER DEFAULT 0`);
    } catch {
      // Column already exists, ignore
    }
    
    try {
      this.db.run(`ALTER TABLE messages ADD COLUMN compacted_at TEXT`);
    } catch {
      // Column already exists, ignore
    }

    // Planning sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS planning_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_activity TEXT NOT NULL DEFAULT (datetime('now')),
        agreed_approach TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        plan_id TEXT
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS planning_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planning_session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (planning_session_id) REFERENCES planning_sessions(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_planning_messages_session_id 
      ON planning_messages(planning_session_id)
    `);
  }

  /**
   * Create a new session
   */
  createSession(id: string, title: string = "New Chat", mode: string = "all"): ChatSession {
    const now = new Date().toISOString();
    
    this.db.run(
      `INSERT INTO sessions (id, title, mode, created_at, updated_at, message_count) 
       VALUES (?, ?, ?, ?, ?, 0)`,
      [id, title, mode, now, now]
    );

    return {
      id,
      title,
      mode,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): ChatSession | null {
    const RowType = this.db.query<{
      id: string;
      title: string;
      mode: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }, [string]>(
      `SELECT * FROM sessions WHERE id = ?`
    ).get(id);

    if (!RowType) return null;

    return {
      id: RowType.id,
      title: RowType.title,
      mode: RowType.mode,
      createdAt: RowType.created_at,
      updatedAt: RowType.updated_at,
      messageCount: RowType.message_count,
    };
  }

  /**
   * List all sessions (most recent first)
   */
  listSessions(limit: number = 50): ChatSession[] {
    const RowType = this.db.query<{
      id: string;
      title: string;
      mode: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }, [number]>(
      `SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`
    ).all(limit);

    return RowType.map((r) => ({
      id: r.id,
      title: r.title,
      mode: r.mode,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: r.message_count,
    }));
  }

  /**
   * Update session metadata
   */
  updateSession(id: string, title?: string, mode?: string): void {
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (mode !== undefined) {
      updates.push("mode = ?");
      params.push(mode);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(new Date().toISOString());
      params.push(id);

      this.db.run(
        `UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }
  }

  /**
   * Delete a session and its messages
   */
  deleteSession(id: string): void {
    this.db.run(`DELETE FROM messages WHERE session_id = ?`, [id]);
    this.db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, role: "system" | "user" | "assistant", content: string): SessionMessage {
    const now = new Date().toISOString();

    const result = this.db.run(
      `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      [sessionId, role, content, now]
    );

    // Update session message count and timestamp
    this.db.run(
      `UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?`,
      [now, sessionId]
    );

    return {
      id: Number(result.lastInsertRowid),
      sessionId,
      role,
      content,
      createdAt: now,
    };
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): SessionMessage[] {
    const results = this.db.query<{
      id: number;
      session_id: string;
      role: "system" | "user" | "assistant";
      content: string;
      created_at: string;
    }, [string]>(
      `SELECT id, session_id as sessionId, role, content, created_at as createdAt 
       FROM messages WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId);

    return results.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  /**
   * Clear all messages from a session (but keep the session)
   */
  clearMessages(sessionId: string): void {
    this.db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
    this.db.run(
      `UPDATE sessions SET message_count = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), sessionId]
    );
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    const result = this.db.query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM sessions`
    ).get();
    return result?.count ?? 0;
  }

  /**
   * Save a session summary
   */
  saveSummary(sessionId: string, content: string, modelUsed: string): SessionSummary {
    const now = new Date().toISOString();

    const result = this.db.run(
      `INSERT INTO session_summaries (session_id, content, model_used, created_at) VALUES (?, ?, ?, ?)`,
      [sessionId, content, modelUsed, now]
    );

    return {
      id: Number(result.lastInsertRowid),
      sessionId,
      content,
      modelUsed,
      createdAt: now,
    };
  }

  /**
   * Get the latest summary for a session
   */
  getLatestSummary(sessionId: string): SessionSummary | null {
    const result = this.db.query<{
      id: number;
      session_id: string;
      content: string;
      model_used: string;
      created_at: string;
    }, [string]>(
      `SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(sessionId);

    if (!result) return null;

    return {
      id: result.id,
      sessionId: result.session_id,
      content: result.content,
      modelUsed: result.model_used,
      createdAt: result.created_at,
    };
  }

  /**
   * Get all summaries for a session
   */
  getSummaries(sessionId: string): SessionSummary[] {
    const results = this.db.query<{
      id: number;
      session_id: string;
      content: string;
      model_used: string;
      created_at: string;
    }, [string]>(
      `SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC`
    ).all(sessionId);

    return results.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      content: r.content,
      modelUsed: r.model_used,
      createdAt: r.created_at,
    }));
  }

  /**
   * Delete old messages before a certain point (for compaction)
   */
  compactMessages(sessionId: string, keepAfterId: number): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE messages SET is_summary = 1, compacted_at = ? 
       WHERE session_id = ? AND id <= ? AND is_summary = 0`,
      [now, sessionId, keepAfterId]
    );
  }

  /**
   * Get active (non-compacted) messages
   */
  getActiveMessages(sessionId: string): SessionMessage[] {
    const results = this.db.query<{
      id: number;
      session_id: string;
      role: "system" | "user" | "assistant" | "summary";
      content: string;
      is_summary: number;
      compacted_at: string | null;
      created_at: string;
    }, [string]>(
      `SELECT * FROM messages WHERE session_id = ? AND (is_summary = 0 OR is_summary IS NULL) ORDER BY created_at ASC`
    ).all(sessionId);

    return results.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role === "summary" ? "assistant" : r.role,
      content: r.content,
      isSummary: r.is_summary === 1,
      compactedAt: r.compacted_at || undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // ========== Planning Session Methods ==========

  createPlanningSession(id: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO planning_sessions (id, started_at, last_activity, status) VALUES (?, ?, ?, 'active')`,
      [id, now, now]
    );
  }

  updatePlanningSession(id: string, agreedApproach?: string, planId?: string, status?: string): void {
    const updates: string[] = [];
    const params: string[] = [];

    if (agreedApproach !== undefined) {
      updates.push("agreed_approach = ?");
      params.push(agreedApproach);
    }
    if (planId !== undefined) {
      updates.push("plan_id = ?");
      params.push(planId);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length > 0) {
      updates.push("last_activity = ?");
      params.push(new Date().toISOString());
      params.push(id);
      this.db.run(`UPDATE planning_sessions SET ${updates.join(", ")} WHERE id = ?`, params);
    }
  }

  getPlanningSession(id: string): { id: string; startedAt: string; lastActivity: string; agreedApproach?: string; status: string; planId?: string } | null {
    const result = this.db.query<{
      id: string;
      started_at: string;
      last_activity: string;
      agreed_approach: string | null;
      status: string;
      plan_id: string | null;
    }, [string]>(`SELECT * FROM planning_sessions WHERE id = ?`).get(id);

    if (!result) return null;
    return {
      id: result.id,
      startedAt: result.started_at,
      lastActivity: result.last_activity,
      agreedApproach: result.agreed_approach || undefined,
      status: result.status,
      planId: result.plan_id || undefined,
    };
  }

  listPlanningSessions(): { id: string; startedAt: string; lastActivity: string; status: string }[] {
    const results = this.db.query<{
      id: string;
      started_at: string;
      last_activity: string;
      status: string;
    }, []>(`SELECT id, started_at, last_activity, status FROM planning_sessions ORDER BY last_activity DESC`).all();

    return results.map(r => ({
      id: r.id,
      startedAt: r.started_at,
      lastActivity: r.last_activity,
      status: r.status,
    }));
  }

  deletePlanningSession(id: string): void {
    this.db.run(`DELETE FROM planning_messages WHERE planning_session_id = ?`, [id]);
    this.db.run(`DELETE FROM planning_sessions WHERE id = ?`, [id]);
  }

  addPlanningMessage(planningSessionId: string, role: "system" | "user" | "assistant", content: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO planning_messages (planning_session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      [planningSessionId, role, content, now]
    );
    this.db.run(
      `UPDATE planning_sessions SET last_activity = ? WHERE id = ?`,
      [now, planningSessionId]
    );
  }

  getPlanningMessages(planningSessionId: string): { role: "system" | "user" | "assistant"; content: string; createdAt: string }[] {
    const results = this.db.query<{
      role: "system" | "user" | "assistant";
      content: string;
      created_at: string;
    }, [string]>(
      `SELECT role, content, created_at FROM planning_messages WHERE planning_session_id = ? ORDER BY created_at ASC`
    ).all(planningSessionId);

    return results.map(r => ({
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }));
  }
}

// Export singleton instance
export const sessionStorage = new SessionStorage();

// Export the class for testing or custom instances
export { SessionStorage };
