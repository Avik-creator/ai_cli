import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".agentic-cli");
const PREFS_DB_PATH = join(CONFIG_DIR, "preferences.db");

if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export type PersonalityId = "calm" | "senior" | "friendly" | "concise" | "professional" | "mentor";

export interface Personality {
  id: PersonalityId;
  name: string;
  description: string;
  systemPromptAddition: string;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  calm: {
    id: "calm",
    name: "Calm",
    description: "Peaceful, patient, and measured responses",
    systemPromptAddition: `You are calm and measured in your responses. 
- Speak in a relaxed, unhurried manner
- Take time to explain concepts thoroughly
- Avoid urgency or pressure
- Be patient with questions
- Use gentle, soothing language`,
  },
  senior: {
    id: "senior",
    name: "Senior Developer",
    description: "Experienced mentor with high standards",
    systemPromptAddition: `You are a senior developer with years of experience.
- Provide expert-level guidance with depth
- Point out best practices and potential issues
- Expect quality code and explain why
- Share industry insights and patterns
- Be direct but constructive with feedback`,
  },
  friendly: {
    id: "friendly",
    name: "Friendly Companion",
    description: "Warm, approachable, and encouraging",
    systemPromptAddition: `You are a friendly, approachable companion.
- Use warm, conversational language
- Show enthusiasm about helping
- Encourage and motivate the user
- Include friendly emojis occasionally
- Be personable while remaining helpful`,
  },
  concise: {
    id: "concise",
    name: "Concise",
    description: "Brief, to-the-point responses",
    systemPromptAddition: `You are concise and efficient.
- Give direct answers without lengthy explanations
- Keep responses short and actionable
- Skip unnecessary details unless asked
- Be efficient with the user's time`,
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "Business-appropriate, formal responses",
    systemPromptAddition: `You are professional and business-appropriate.
- Use formal but clear language
- Maintain a business-like tone
- Be thorough and accurate
- Focus on deliverables and results
- Keep opinions minimal, facts prominent`,
  },
  mentor: {
    id: "mentor",
    name: "Mentor",
    description: "Educational focus with teaching approach",
    systemPromptAddition: `You are a mentor focused on teaching and growth.
- Explain your reasoning
- Guide users to find solutions themselves
- Provide learning context and resources
- Break down complex topics step-by-step
- Encourage questions and curiosity`,
  },
};

export interface UserPreferences {
  id?: number;
  key: string;
  value: string;
  updatedAt?: string;
}

export interface ModelPreference {
  provider: string;
  modelId: string;
}

class UserPreferencesStore {
  private db: Database;

  constructor() {
    this.db = new Database(PREFS_DB_PATH);
    this.initialize();
  }

  private initialize(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS model_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT UNIQUE NOT NULL,
        model_id TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  getPreference(key: string): string | null {
    const result = this.db.query<{ value: string }, [string]>(
      `SELECT value FROM preferences WHERE key = ?`
    ).get(key);
    return result?.value ?? null;
  }

  setPreference(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
      [key, value, now, value, now]
    );
  }

  getAllPreferences(): Record<string, string> {
    const results = this.db.query<{ key: string; value: string }, []>(
      `SELECT key, value FROM preferences`
    ).all();
    
    const prefs: Record<string, string> = {};
    for (const row of results) {
      prefs[row.key] = row.value;
    }
    return prefs;
  }

  deletePreference(key: string): void {
    this.db.run(`DELETE FROM preferences WHERE key = ?`, [key]);
  }

  getModelPreference(provider: string): string | null {
    const result = this.db.query<{ model_id: string }, [string]>(
      `SELECT model_id FROM model_preferences WHERE provider = ?`
    ).get(provider);
    return result?.model_id ?? null;
  }

  setModelPreference(provider: string, modelId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO model_preferences (provider, model_id, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET model_id = ?, updated_at = ?`,
      [provider, modelId, now, modelId, now]
    );
  }

  getAllModelPreferences(): ModelPreference[] {
    const results = this.db.query<{ provider: string; model_id: string }, []>(
      `SELECT provider, model_id FROM model_preferences`
    ).all();
    
    return results.map(r => ({
      provider: r.provider,
      modelId: r.model_id,
    }));
  }

  deleteModelPreference(provider: string): void {
    this.db.run(`DELETE FROM model_preferences WHERE provider = ?`, [provider]);
  }

  close(): void {
    this.db.close();
  }
}

export const userPreferences = new UserPreferencesStore();
export { UserPreferencesStore };
