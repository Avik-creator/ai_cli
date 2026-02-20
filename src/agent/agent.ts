import chalk from "chalk";
import boxen from "boxen";
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

interface RunAgentOptions {
  mode?: string;
  singlePrompt?: string | null;
  sessionId?: string | null;
  switchModel?: boolean;
  modelId?: string;
  planId?: string | null;
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
    console.log(
      boxen(chalk.red(`❌ ${errorMessage}`), {
        padding: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
    console.log(
      chalk.yellow("\nRun 'agentic config setup' to configure your API keys.\n") +
      chalk.gray("You need AI_GATEWAY_API_KEY from https://vercel.com/ai-gateway\n")
    );
    process.exit(1);
  }

  const tools = getToolsForTask(mode);
  const toolNames = Object.keys(tools);

  if (!singlePrompt) {
    const currentModel = aiService.getModelId();
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];

    console.log(
      boxen(
        chalk.bold.cyan("🚀 agentic AI Agent\n\n") +
        chalk.gray("An agentic assistant for development tasks\n") +
        chalk.gray(`Provider: ${chalk.white(provider.name)} | `) +
        chalk.gray(`Mode: ${chalk.white(mode)} | Tools: ${chalk.white(toolNames.length)}\n`) +
        chalk.gray(`Model: ${chalk.white(currentModel)}`),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "double",
          borderColor: "cyan",
        }
      )
    );

    console.log(
      boxen(
        `${chalk.gray("Available tools:")}\n` +
        toolNames.map((t) => chalk.cyan(`  • ${t}`)).join("\n") +
        `\n\n${chalk.gray('Type "help" for commands, "exit" to quit')}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "gray",
          dimBorder: true,
        }
      )
    );
  }

  let currentSession = options.sessionId 
    ? sessionManager.getSession(options.sessionId)
    : null;
  
  let currentSessionId = options.sessionId || (currentSession?.id || null);

  if (options.sessionId && !currentSession) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
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

  if (singlePrompt) {
    await processMessage(singlePrompt, messages, tools, null);
    return;
  }

  if (!currentSessionId) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
  }

  const personality = sessionManager.getActivePersonality();
  console.log(chalk.gray(`Session: ${currentSessionId?.slice(0, 8)}... | Personality: ${personality}`));

  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Ask me anything...",
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
  console.log(
    boxen(
      `${chalk.bold.cyan("Commands:")}\n\n` +
      `${chalk.yellow("help")}    - Show this help message\n` +
      `${chalk.yellow("tools")}   - List available tools\n` +
      `${chalk.yellow("clear")}   - Clear conversation history\n` +
      `${chalk.yellow("exit")}    - Exit the agent\n\n` +
      `${chalk.bold.cyan("Examples:")}\n\n` +
      `${chalk.gray('• "Search for React best practices"')}\n` +
      `${chalk.gray('• "Review PR https://github.com/owner/repo/pull/123"')}\n` +
      `${chalk.gray('• "Create a new Express API project"')}\n` +
      `${chalk.gray('• "Read package.json and explain the dependencies"')}\n` +
      `${chalk.gray('• "Run npm test and fix any failing tests"')}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
        title: "💡 Help",
      }
    )
  );
}

function showTools(): void {
  let output = "";
  for (const category of toolDescriptions) {
    output += `${chalk.bold.cyan(category.category)}\n`;
    for (const tool of category.tools) {
      output += `  ${chalk.yellow(tool.name.padEnd(16))} ${chalk.gray(tool.description)}\n`;
    }
    output += "\n";
  }

  console.log(
    boxen(output.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
      title: "🛠️  Available Tools",
    })
  );
}
