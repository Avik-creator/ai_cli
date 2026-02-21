import { sessionStorage, type ChatSession, type SessionMessage, type SessionSummary } from "./storage/session-storage.js";
import { userPreferences, PERSONALITIES, type PersonalityId } from "./storage/user-preferences.js";
import { contextManager } from "./context-manager.js";
import { randomUUID } from "crypto";
import type { CoreMessage } from "ai";

function generateSessionId(): string {
  return randomUUID();
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

class SessionManager {
  createNewSession(mode: string = "all", title?: string): ChatSession {
    const id = generateSessionId();
    const sessionTitle = title || "New Chat";
    return sessionStorage.createSession(id, sessionTitle, mode);
  }

  getSession(sessionId: string): ChatSession | null {
    return sessionStorage.getSession(sessionId);
  }

  listSessions(limit?: number): ChatSession[] {
    return sessionStorage.listSessions(limit);
  }

  deleteSession(sessionId: string): void {
    sessionStorage.deleteSession(sessionId);
  }

  updateSessionTitle(sessionId: string, title: string): void {
    sessionStorage.updateSession(sessionId, title);
  }

  getSessionMessages(sessionId: string): SessionMessage[] {
    return sessionStorage.getMessages(sessionId);
  }

  addSessionMessage(
    sessionId: string,
    role: "system" | "user" | "assistant",
    content: string
  ): SessionMessage {
    return sessionStorage.addMessage(sessionId, role, content);
  }

  loadSessionAsMessages(sessionId: string): CoreMessage[] {
    const messages = sessionStorage.getMessages(sessionId);
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    } as CoreMessage));
  }

  loadSessionWithSummary(sessionId: string, currentModel: string): CoreMessage[] {
    const activeMessages = sessionStorage.getActiveMessages(sessionId);
    const latestSummary = sessionStorage.getLatestSummary(sessionId);
    
    const messages: CoreMessage[] = [];
    
    if (latestSummary) {
      const contextPrompt = contextManager.buildContextPrompt(latestSummary.content);
      messages.push({
        role: "system",
        content: contextPrompt,
      });
    }
    
    for (const msg of activeMessages) {
      if (msg.role !== "system") {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
    
    return messages;
  }

  async summarizeForModelSwitch(sessionId: string, currentModel: string): Promise<string | null> {
    return await contextManager.summarizeAndCompact(sessionId, currentModel);
  }

  getLatestSummary(sessionId: string): SessionSummary | null {
    return sessionStorage.getLatestSummary(sessionId);
  }

  clearSession(sessionId: string): void {
    sessionStorage.clearMessages(sessionId);
  }

  getSessionCount(): number {
    return sessionStorage.getSessionCount();
  }

  getActivePersonality(): PersonalityId {
    const personality = userPreferences.getPreference("personality");
    if (personality && personality in PERSONALITIES) {
      return personality as PersonalityId;
    }
    return "friendly";
  }

  setActivePersonality(personalityId: PersonalityId): void {
    if (PERSONALITIES[personalityId]) {
      userPreferences.setPreference("personality", personalityId);
    }
  }

  getPersonalityPromptAddition(): string {
    const personality = this.getActivePersonality();
    return PERSONALITIES[personality]?.systemPromptAddition || "";
  }

  getPreference(key: string): string | null {
    return userPreferences.getPreference(key);
  }

  setPreference(key: string, value: string): void {
    userPreferences.setPreference(key, value);
  }

  getAllPreferences(): Record<string, string> {
    return userPreferences.getAllPreferences();
  }

  formatSessionList(sessions: ChatSession[]): string {
    if (sessions.length === 0) {
      return "No sessions found.";
    }
    
    const rows = sessions.map((session) => {
      const dateStr = formatDate(session.updatedAt);
      const title = session.title || "Untitled";
      const mode = session.mode || "all";
      const count = session.messageCount;
      return {
        id: `${session.id.slice(0, 8)}...`,
        title,
        mode,
        count: `${count} msgs`,
        date: dateStr,
      };
    });

    const idWidth = Math.max(...rows.map((row) => row.id.length), 0) + 2;
    const titleWidth = Math.min(Math.max(...rows.map((row) => row.title.length), 12), 34) + 2;
    const modeWidth = Math.max(...rows.map((row) => row.mode.length), 0) + 2;
    const countWidth = Math.max(...rows.map((row) => row.count.length), 0) + 2;

    return rows
      .map((row, index) => {
        const clippedTitle = row.title.length > titleWidth - 2 ? `${row.title.slice(0, titleWidth - 5)}...` : row.title;
        return `${String(index + 1).padStart(2, "0")}. ${row.id.padEnd(idWidth)}${clippedTitle.padEnd(titleWidth)}${row.mode.padEnd(modeWidth)}${row.count.padEnd(countWidth)}${row.date}`;
      })
      .join("\n");
  }
}

export const sessionManager = new SessionManager();
export { SessionManager, formatDate };
