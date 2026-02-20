import { sessionStorage, type SessionMessage } from "./storage/session-storage.js";
import { aiService } from "./ai.service.js";
import chalk from "chalk";
import boxen from "boxen";

const COMPACTION_PROMPT = `Provide a detailed summary of our conversation so far for continuing with a new AI model. 

Focus on:
1. What we've accomplished so far
2. What we're currently working on
3. Which files we've modified or created
4. What the next steps are
5. Any important context or preferences mentioned

This summary will be used by a new model to continue our conversation seamlessly. Be concise but include all important details.`;

interface SummaryResult {
  summary: string;
  success: boolean;
  error?: string;
}

async function generateSummary(messages: SessionMessage[]): Promise<SummaryResult> {
  const conversationMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content.substring(0, 500)}`)
    .join("\n\n");

  if (conversationMessages.length < 100) {
    return {
      summary: "Conversation just started, no significant history to summarize.",
      success: true,
    };
  }

  try {
    const summaryMessages = [
      {
        role: "system" as const,
        content: COMPACTION_PROMPT,
      },
      {
        role: "user" as const,
        content: `Please summarize this conversation:\n\n${conversationMessages}`,
      },
    ];

    let fullResponse = "";

    await aiService.sendMessage(
      summaryMessages,
      (chunk) => {
        fullResponse += chunk;
      },
      {},
      undefined,
      { maxSteps: 3 }
    );

    return {
      summary: fullResponse,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      summary: "",
      success: false,
      error: errorMessage,
    };
  }
}

async function summarizeAndCompact(
  sessionId: string,
  currentModel: string
): Promise<string | null> {
  const messages = sessionStorage.getMessages(sessionId);
  
  if (messages.length < 4) {
    return null;
  }

  console.log(chalk.yellow("\n📝 Generating conversation summary for context switch...\n"));

  const result = await generateSummary(messages);

  if (!result.success || !result.summary) {
    console.log(chalk.red("Failed to generate summary:"), result.error);
    return null;
  }

  sessionStorage.saveSummary(sessionId, result.summary, currentModel);

  const lastMessageId = messages[messages.length - 1]?.id;
  if (lastMessageId) {
    sessionStorage.compactMessages(sessionId, lastMessageId);
  }

  console.log(chalk.green("✓ Summary saved for context continuation"));

  return result.summary;
}

function buildContextPrompt(summary: string): string {
  return `## Previous Conversation Summary

${summary}

---

You are continuing a previous conversation. Use this summary to understand the context and continue seamlessly.`;
}

export const contextManager = {
  summarizeAndCompact,
  buildContextPrompt,
  generateSummary,
};

export { COMPACTION_PROMPT };
