import { sessionStorage, type ChatSession, type SessionMessage } from "./storage/session-storage.js";
import { userPreferences, PERSONALITIES, type PersonalityId } from "./storage/user-preferences.js";
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
    
    const lines: string[] = [];
    for (const session of sessions) {
      const dateStr = formatDate(session.updatedAt);
      const title = session.title || "Untitled";
      const mode = session.mode || "all";
      const count = session.messageCount;
      lines.push(`${session.id.slice(0, 8)}... | ${title} (${mode}) | ${count} msgs | ${dateStr}`);
    }
    return lines.join("\n");
  }
}

export const sessionManager = new SessionManager();
export { SessionManager, formatDate };
