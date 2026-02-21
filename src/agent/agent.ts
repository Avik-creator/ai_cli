import chalk from "chalk";
import { text, isCancel } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask, toolDescriptions } from "../tools/index.ts";
import { getCurrentProvider } from "../config/env.ts";
import { PROVIDERS } from "../config/providers.ts";
import { sessionManager } from "../services/session-manager.ts";
import type { CoreMessage } from "ai";
import type { ToolSet } from "../tools/index.ts";
import { buildSystemPrompt } from "./prompts.ts";
import { runPlanExecution } from "./plan-executor.ts";
import { processMessage } from "./message-handler.ts";
import { isSlashCommand, executeSlashCommand, type SlashCommandContext } from "./slash-commands.ts";
import { createPanel, formatCommandRows, formatList, renderPromptDock, renderWordmark } from "../utils/tui.ts";

interface RunAgentOptions {
  mode?: string;
  singlePrompt?: string | null;
  sessionId?: string | null;
  switchModel?: boolean;
  modelId?: string;
  planId?: string | null;
}

function renderResumedHistory(messages: CoreMessage[]): void {
  const history = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-6);

  if (history.length === 0) {
    return;
  }

  const lines = history.map((message) => {
    const roleLabel = message.role === "user"
      ? chalk.hex("#00e2ff")("you")
      : chalk.gray("agentic");

    const contentRaw = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
      ? message.content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
              return part.text;
            }
            return "";
          })
          .join(" ")
      : "";

    const compact = contentRaw.replace(/\s+/g, " ").trim();
    const preview = compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
    return `${roleLabel}${chalk.gray(" > ")}${chalk.white(preview)}`;
  });

  console.log(chalk.gray("resumed context"));
  for (const line of lines) {
    console.log(line);
  }
  console.log(chalk.gray("─".repeat(56)));
}

export async function runAgent(options: RunAgentOptions = {}): Promise<void> {
  const { mode = "all", singlePrompt = null, planId = null } = options;

  if (planId) {
    await runPlanExecution(planId);
    return;
  }

  try {
    await aiService.initialize();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(createPanel("❌ Initialization Error", chalk.red(errorMessage), { tone: "error" }));
    console.log(
      chalk.yellow("\nRun 'agentic config setup' to configure your API keys.\n") +
      chalk.gray("You need AI_GATEWAY_API_KEY from https://vercel.com/ai-gateway\n")
    );
    process.exit(1);
  }

  const tools = getToolsForTask(mode);
  const toolNames = Object.keys(tools);

  if (!singlePrompt) {
    console.clear();
    renderWordmark("agentic");
  }

  let currentSession = options.sessionId 
    ? sessionManager.getSession(options.sessionId)
    : null;
  
  let currentSessionId = options.sessionId || (currentSession?.id || null);

  if (options.sessionId && !currentSession) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
    console.log(chalk.yellow(`Session not found: ${options.sessionId}`));
    console.log(chalk.gray(`Started new session ${currentSessionId.slice(0, 8)}...`));
  }

  let messages: CoreMessage[];
  const currentModel = aiService.getModelId();
  
  if (currentSessionId) {
    if (options.switchModel && options.modelId) {
      console.log(chalk.yellow("\n🔄 Switching model, generating context summary...\n"));
      await sessionManager.summarizeForModelSwitch(currentSessionId, currentModel);
    }
    messages = sessionManager.loadSessionWithSummary(currentSessionId, currentModel);
    if (messages.length <= 1) {
      messages = [{
        role: "system",
        content: await buildSystemPrompt(),
      }];
    }
  } else {
    messages = [{
      role: "system",
      content: await buildSystemPrompt(),
    }];
  }

  if (options.sessionId && currentSession) {
    renderResumedHistory(messages);
  }

  if (singlePrompt) {
    await processMessage(singlePrompt, messages, tools, null);
    return;
  }

  if (!currentSessionId) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
  }

  const personality = sessionManager.getActivePersonality();
  console.log(chalk.gray(`session ${currentSessionId?.slice(0, 8)}...  •  personality ${personality}`));

  while (true) {
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModel = aiService.getModelId();
    renderPromptDock({
      hint: chalk.hex("#6f7277")('"Fix a TODO in the codebase"'),
      agentLabel: "agentic (assistant)",
      modelLabel: currentModel,
      toolsLabel: `${toolNames.length} tools`,
      providerLabel: provider.name,
      shortcuts: "ctrl+t variants   tab agents   ctrl+p commands",
    });

    const userInput = await text({
      message: chalk.hex("#00e2ff")("›"),
      placeholder: "Ask anything... (/help for commands)",
      validate: (val: string) => {
        if (!val || val.trim().length === 0) {
          return "Please enter a message";
        }
      },
    });

    if (isCancel(userInput)) {
      if (currentSessionId) {
        console.log(chalk.yellow("\n👋 Goodbye!") + chalk.gray("\n\nTo continue this session later, run:\n"));
        console.log(chalk.cyan(`  agentic -s ${currentSessionId}\n`));
      } else {
        console.log(chalk.yellow("\n👋 Goodbye!\n"));
      }
      process.exit(0);
    }

    const input = (userInput as string).trim();

    if (isSlashCommand(input)) {
      const slashContext: SlashCommandContext = {
        messages,
        sessionId: currentSessionId,
        mode,
      };
      const result = await executeSlashCommand(input, slashContext);
      
      if (result.output) {
        console.log(result.output);
      }
      
      if (result.clearMessages) {
        messages.length = 1;
        messages[0] = {
          role: "system",
          content: await buildSystemPrompt(),
        };
      }
      
      if (result.modelChanged) {
        messages[0] = {
          role: "system",
          content: await buildSystemPrompt(),
        };
      }
      
      if (result.exit) {
        break;
      }
      
      if (result.newSessionId) {
        currentSessionId = result.newSessionId;
      }
      
      continue;
    }

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      if (currentSessionId) {
        console.log(chalk.yellow("\n👋 Goodbye!") + chalk.gray("\n\nTo continue this session later, run:\n"));
        console.log(chalk.cyan(`  agentic -s ${currentSessionId}\n`));
      } else {
        console.log(chalk.yellow("\n👋 Goodbye!\n"));
      }
      break;
    }

    if (input.toLowerCase() === "help") {
      showHelp();
      continue;
    }

    if (input.toLowerCase() === "clear") {
      messages.length = 1;
      console.log(chalk.gray("Conversation cleared.\n"));
      continue;
    }

    if (input.toLowerCase() === "tools") {
      showTools();
      continue;
    }

    await processMessage(input, messages, tools, currentSessionId);
  }
}

function showHelp(): void {
  const commandSection = formatCommandRows([
    { command: "help", description: "Show this help panel" },
    { command: "tools", description: "List available tools" },
    { command: "clear", description: "Clear conversation history" },
    { command: "exit", description: "Exit the agent" },
  ]);

  const slashSection = formatCommandRows([
    { command: "/model", description: "Change AI model interactively" },
    { command: "/provider", description: "Change AI provider" },
    { command: "/clear", description: "Clear conversation (same as clear)" },
    { command: "/compact", description: "Summarize and compact context" },
    { command: "/sessions", description: "List chat sessions" },
    { command: "/config", description: "View/modify configuration" },
    { command: "/info", description: "Show session info" },
    { command: "/exit", description: "Exit the agent" },
  ]);

  const examples = [
    '"Search for React best practices"',
    '"Review PR https://github.com/owner/repo/pull/123"',
    '"Create a new Express API project"',
    '"Read package.json and explain the dependencies"',
    '"Run npm test and fix any failing tests"',
  ];

  console.log(
    createPanel(
      "💡 Help",
      `${chalk.bold.white("Commands")}\n${commandSection}\n\n` +
        `${chalk.bold.white("Slash Commands")}\n${slashSection}\n\n` +
        `${chalk.bold.white("Examples")}\n${formatList(examples, "gray")}`,
      {
        tone: "neutral",
        margin: 1,
      }
    )
  );
}

function showTools(): void {
  const sections = toolDescriptions
    .map((category) => {
      const rows = formatCommandRows(
        category.tools.map((tool) => ({
          command: tool.name,
          description: tool.description,
        }))
      );
      return `${chalk.bold.cyan(category.category)}\n${rows}`;
    })
    .join("\n\n");

  console.log(
    createPanel("🛠️ Available Tools", sections, {
      tone: "neutral",
      margin: 1,
    })
  );
}
