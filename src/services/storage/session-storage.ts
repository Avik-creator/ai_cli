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
    // Create sessions table
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

    // Create messages table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id 
      ON messages(session_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at 
      ON sessions(updated_at DESC)
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
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const sessionStorage = new SessionStorage();

// Export the class for testing or custom instances
export { SessionStorage };
