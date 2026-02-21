import chalk from "chalk";
import boxen from "boxen";
import { select, isCancel, confirm, text, multiselect } from "@clack/prompts";
import { config, AVAILABLE_MODELS, getModelsByProvider, getCurrentProvider, setCurrentProvider } from "../config/env.ts";
import { PROVIDERS, PROVIDER_MODELS, type Model } from "../config/providers.ts";
import { getCustomModels } from "../config/custom-models.ts";
import { aiService } from "../services/ai.service.ts";
import { sessionManager } from "../services/session-manager.ts";
import { PERSONALITIES } from "../services/storage/user-preferences.js";
import { getPlanningProgress } from "./planning-state.ts";
import { createPanel, formatCommandRows, formatList } from "../utils/tui.ts";
import type { CoreMessage } from "ai";

export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  execute: (args: string, context: SlashCommandContext) => Promise<SlashCommandResult>;
}

export interface SlashCommandContext {
  messages: CoreMessage[];
  sessionId: string | null;
  mode: string;
}

export interface SlashCommandResult {
  handled: boolean;
  exit?: boolean;
  clearMessages?: boolean;
  newSessionId?: string;
  modelChanged?: boolean;
  output?: string;
}

const slashCommands: SlashCommand[] = [];

export function registerSlashCommand(command: SlashCommand): void {
  slashCommands.push(command);
}

export function getSlashCommands(): SlashCommand[] {
  return slashCommands;
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  const normalizedName = name.startsWith("/") ? name.slice(1) : name;
  return slashCommands.find(
    (cmd) => cmd.name === normalizedName || cmd.aliases?.includes(normalizedName)
  );
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

function messageContentToText(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .join(" ")
    .trim();
}

async function resolveModelForProvider(providerId: string, currentModelId: string): Promise<string> {
  const customModels = await getCustomModels();

  if (providerId === "gateway") {
    return currentModelId || AVAILABLE_MODELS[0]?.id || "openai/gpt-5-mini";
  }

  if (providerId === "openrouter") {
    return currentModelId || PROVIDER_MODELS.openrouter?.[0]?.id || "openai/gpt-4o-mini";
  }

  const providerModels = PROVIDER_MODELS[providerId] || [];
  const customForProvider = customModels.filter((m) => m.provider === providerId);

  const modelSupported =
    providerModels.some((m) => m.id === currentModelId) ||
    customForProvider.some((m) => m.id === currentModelId);

  if (modelSupported) {
    return currentModelId;
  }

  return providerModels[0]?.id || customForProvider[0]?.id || currentModelId;
}

async function applyProviderChange(providerId: string): Promise<SlashCommandResult> {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return {
      handled: true,
      output: chalk.red(`Unknown provider: ${providerId}`) +
        chalk.gray(`\nAvailable: ${Object.keys(PROVIDERS).join(", ")}`),
    };
  }

  await setCurrentProvider(providerId);

  const nextModelId = await resolveModelForProvider(providerId, config.getModel());
  await config.setModel(nextModelId);

  try {
    await aiService.setModel(nextModelId);
    return {
      handled: true,
      modelChanged: true,
      output: chalk.green(`✓ Provider changed to: ${chalk.white(provider.name)}`) +
        chalk.gray(`\n  ${provider.description}`) +
        chalk.gray(`\n  Model: ${chalk.white(nextModelId)}`),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      handled: true,
      modelChanged: true,
      output: chalk.yellow(`Provider set to ${provider.name}, but model initialization failed.`) +
        chalk.gray(`\n  ${errMsg}`),
    };
  }
}

export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const commandName = parts[0].slice(1);
  const args = parts.slice(1).join(" ");

  const command = getSlashCommand(commandName);

  if (!command) {
    return {
      handled: true,
      output: chalk.red(`Unknown command: /${commandName}`) + 
        chalk.gray(`\nType ${chalk.cyan("/help")} to see available commands.`),
    };
  }

  return await command.execute(args, context);
}

registerSlashCommand({
  name: "help",
  description: "Show available slash commands",
  aliases: ["h", "?"],
  execute: async () => {
    const commandList = slashCommands
      .map((cmd) => {
        const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map((alias) => `/${alias}`).join(", ")})` : "";
        const usage = cmd.usage ? ` ${cmd.usage}` : "";
        return {
          command: `/${cmd.name}${aliases}${usage}`,
          description: cmd.description,
        };
      });

    const output = createPanel(
      "Slash Commands",
      `${formatCommandRows(commandList)}\n\n${chalk.gray("Usage: /<command> [arguments]")}`,
      {
        tone: "primary",
      }
    );

    return { handled: true, output };
  },
});

registerSlashCommand({
  name: "model",
  description: "Change or view the current AI model",
  usage: "[model-id]",
  execute: async (args, context) => {
    if (args) {
      const modelId = args.trim();
      try {
        await config.setModel(modelId);
        await aiService.setModel(modelId);
        return {
          handled: true,
          modelChanged: true,
          output: chalk.green(`✓ Model changed to: ${chalk.white(modelId)}`),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          handled: true,
          output: chalk.red(`Failed to set model: ${errorMessage}`),
        };
      }
    }

    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModelId = config.getModel();
    const customModels = await getCustomModels();

    console.log(chalk.gray(`\nCurrent model: ${chalk.white(currentModelId)}`));
    console.log(chalk.gray(`Provider: ${chalk.white(provider.name)}\n`));

    let allModels: Model[] = [];

    if (currentProviderId === "gateway") {
      const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider).filter((p): p is string => !!p))].sort();
      
      const providerChoice = await select({
        message: "Select a provider:",
        options: [
          { value: "all", label: chalk.bold("All Models"), hint: "Browse all models" },
          ...providers.map((p) => ({
            value: p,
            label: chalk.bold(p.toUpperCase()),
            hint: `${getModelsByProvider(p).length} models`,
          })),
        ],
      });

      if (isCancel(providerChoice)) {
        return { handled: true, output: chalk.yellow("Model selection cancelled") };
      }

      if (providerChoice === "all") {
        allModels = AVAILABLE_MODELS.slice(0, 50);
      } else {
        allModels = [...getModelsByProvider(providerChoice as string), ...customModels.filter(m => m.provider === providerChoice)];
      }
    } else {
      allModels = [...(PROVIDER_MODELS[currentProviderId] || []), ...customModels.filter(m => m.provider === currentProviderId)];
    }

    if (allModels.length === 0) {
      return { handled: true, output: chalk.yellow("No models available") };
    }

    const modelChoice = await select({
      message: "Select a model:",
      options: allModels.map((m) => ({
        value: m.id,
        label: m.id === currentModelId 
          ? `${chalk.green("✓")} ${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`
          : `${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`,
        hint: m.id === currentModelId ? "current" : undefined,
      })),
    });

    if (isCancel(modelChoice)) {
      return { handled: true, output: chalk.yellow("Model selection cancelled") };
    }

    const selectedModelId = modelChoice as string;
    
    try {
      await config.setModel(selectedModelId);
      await aiService.setModel(selectedModelId);
      return {
        handled: true,
        modelChanged: true,
        output: chalk.green(`✓ Model changed to: ${chalk.white(selectedModelId)}`),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { handled: true, output: chalk.red(`Failed to set model: ${errorMessage}`) };
    }
  },
});

registerSlashCommand({
  name: "provider",
  description: "Change or view the current AI provider",
  usage: "[provider-id]",
  execute: async (args) => {
    if (args) {
      return applyProviderChange(args.trim().toLowerCase());
    }

    const currentProviderId = await getCurrentProvider();
    const providers = Object.values(PROVIDERS);

    const providerChoice = await select({
      message: "Select a provider:",
      options: providers.map((p) => ({
        value: p.id,
        label: p.id === currentProviderId
          ? `${chalk.green("✓")} ${chalk.white(p.name)}`
          : chalk.white(p.name),
        hint: p.id === currentProviderId ? "current" : p.description,
      })),
    });

    if (isCancel(providerChoice)) {
      return { handled: true, output: chalk.yellow("Provider selection cancelled") };
    }

    return applyProviderChange(providerChoice as string);
  },
});

registerSlashCommand({
  name: "clear",
  description: "Clear conversation history",
  aliases: ["cls", "reset"],
  execute: async (_, context) => {
    if (context.sessionId) {
      sessionManager.clearSession(context.sessionId);
    }
    return {
      handled: true,
      clearMessages: true,
      output: chalk.gray("Conversation history cleared."),
    };
  },
});

registerSlashCommand({
  name: "compact",
  description: "Summarize and compact conversation context",
  aliases: ["summarize", "summarise"],
  execute: async (_, context) => {
    if (!context.sessionId) {
      return { handled: true, output: chalk.yellow("No active session to compact") };
    }

    const confirmed = await confirm({
      message: "Compact conversation history into a summary?",
      initialValue: true,
    });

    if (isCancel(confirmed) || !confirmed) {
      return { handled: true, output: chalk.yellow("Compact cancelled") };
    }

    const currentModel = aiService.getModelId();
    const summary = await sessionManager.summarizeForModelSwitch(context.sessionId, currentModel);

    if (summary) {
      return {
        handled: true,
        output: chalk.green("✓ Conversation compacted") +
          chalk.gray(`\n  Summary saved. Future messages will use this context.`),
      };
    }

    return { handled: true, output: chalk.yellow("No messages to compact") };
  },
});

registerSlashCommand({
  name: "sessions",
  description: "List and manage chat sessions",
  aliases: ["session", "history"],
  execute: async (args) => {
    const sessions = sessionManager.listSessions(10);

    if (sessions.length === 0) {
      return { handled: true, output: chalk.yellow("No sessions found.") };
    }

    if (args === "clear" || args === "delete-all") {
      const confirmed = await confirm({
        message: `Delete all ${sessions.length} sessions?`,
        initialValue: false,
      });

      if (isCancel(confirmed) || !confirmed) {
        return { handled: true, output: chalk.yellow("Cancelled") };
      }

      for (const session of sessions) {
        sessionManager.deleteSession(session.id);
      }
      return { handled: true, output: chalk.green(`✓ Deleted ${sessions.length} sessions`) };
    }

    const sessionList = sessions
      .map((s, i) => {
        const date = new Date(s.updatedAt);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `  ${chalk.gray(`${i + 1}.`)} ${chalk.cyan(s.id.slice(0, 8))}... ${chalk.white(s.title || "Untitled")} ${chalk.gray(`(${s.messageCount} msgs)`)} ${chalk.gray(`${dateStr} ${timeStr}`)}`;
      })
      .join("\n");

    const output = boxen(
      `${chalk.bold.cyan("Recent Sessions")}\n\n${sessionList}\n\n` +
      chalk.gray(`Use ${chalk.cyan("agentic -s <session-id>")} to resume a session`),
      {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }
    );

    return { handled: true, output };
  },
});

registerSlashCommand({
  name: "plan-status",
  description: "Show collaboration progress for planning mode",
  aliases: ["pstatus"],
  execute: async (_, context) => {
    if (context.mode !== "plan") {
      return {
        handled: true,
        output: chalk.yellow("This command is only available in plan mode."),
      };
    }

    const progress = getPlanningProgress(context.messages);
    const activeStageIndex = progress.stages.findIndex((stage) => stage.id === progress.currentStage.id);
    const progressBar = progress.stages
      .map((_, index) => {
        if (index < activeStageIndex) return chalk.green("■");
        if (index === activeStageIndex) return chalk.cyan("▣");
        return chalk.gray("□");
      })
      .join(" ");

    const stages = progress.stages
      .map((stage) => {
        if (stage.id === progress.currentStage.id) {
          return `  ${chalk.cyan("➜")} ${chalk.cyan(stage.label)}`;
        }
        if (stage.complete) {
          return `  ${chalk.green("✓")} ${chalk.green(stage.label)}`;
        }
        return `  ${chalk.gray("•")} ${chalk.gray(stage.label)}`;
      })
      .join("\n");

    return {
      handled: true,
      output: boxen(
        `${chalk.bold.cyan("Progress")} ${progressBar} ${chalk.gray(`(${progress.completedCount}/${progress.totalStages} complete)`)}\n` +
        `${chalk.bold.cyan("Turns")} ${chalk.white(`${progress.userTurns} user / ${progress.assistantTurns} assistant`)}\n\n` +
        `${stages}\n\n` +
        `${chalk.yellow("Next")} ${progress.nextStepHint}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "cyan",
          title: "🤝 Plan Status",
        }
      ),
    };
  },
});

registerSlashCommand({
  name: "plan-recap",
  description: "Summarize decisions and open questions in planning mode",
  aliases: ["precap"],
  execute: async (_, context) => {
    if (context.mode !== "plan") {
      return {
        handled: true,
        output: chalk.yellow("This command is only available in plan mode."),
      };
    }

    const conversation = context.messages.filter((message) => message.role !== "system");
    if (conversation.length === 0) {
      return {
        handled: true,
        output: chalk.yellow("No planning discussion yet. Start with your project goal first."),
      };
    }

    const transcript = conversation
      .slice(-20)
      .map((message) => `${message.role.toUpperCase()}: ${messageContentToText(message.content)}`)
      .join("\n\n");

    console.log(chalk.gray("Generating planning recap..."));

    try {
      const recapResult = await aiService.generateText([
        {
          role: "user",
          content: `Summarize this planning conversation for a teammate.

Return markdown with exactly these sections:
## Decisions
- ...

## Open Questions
- ...

## Recommended Next Step
- ...

If a section has no items, write "- None".

Conversation:
${transcript}`,
        },
      ]);

      return {
        handled: true,
        output: boxen(recapResult.text.trim(), {
          padding: 1,
          borderStyle: "round",
          borderColor: "magenta",
          title: "📝 Planning Recap",
        }),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        output: chalk.red(`Could not generate recap: ${errMsg}`),
      };
    }
  },
});

registerSlashCommand({
  name: "config",
  description: "View or modify configuration",
  execute: async (args) => {
    const currentProviderId = await getCurrentProvider();
    const currentModelId = config.getModel();
    const provider = PROVIDERS[currentProviderId];

    if (args === "show" || !args) {
      const configInfo = [
        `${chalk.bold("Provider:")} ${chalk.white(provider.name)} (${currentProviderId})`,
        `${chalk.bold("Model:")} ${chalk.white(currentModelId)}`,
        `${chalk.bold("Temperature:")} ${chalk.white(config.temperature)}`,
        `${chalk.bold("Max Tokens:")} ${chalk.white(config.maxTokens)}`,
        `${chalk.bold("Session:")} ${chalk.white(sessionManager.getSessionCount())} saved`,
      ].join("\n");

      const output = boxen(`${chalk.bold.cyan("Current Configuration")}\n\n${configInfo}`, {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
      });

      return { handled: true, output };
    }

    if (args.startsWith("temperature ")) {
      const temp = parseFloat(args.split(" ")[1]);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return { handled: true, output: chalk.red("Temperature must be between 0 and 2") };
      }
      config.temperature = temp;
      return { handled: true, output: chalk.green(`✓ Temperature set to ${temp}`) };
    }

    if (args.startsWith("maxtokens ")) {
      const tokens = parseInt(args.split(" ")[1]);
      if (isNaN(tokens) || tokens < 1) {
        return { handled: true, output: chalk.red("Max tokens must be a positive number") };
      }
      config.maxTokens = tokens;
      return { handled: true, output: chalk.green(`✓ Max tokens set to ${tokens}`) };
    }

    return {
      handled: true,
      output: chalk.yellow("Usage: /config [show|temperature <value>|maxtokens <value>]"),
    };
  },
});

registerSlashCommand({
  name: "exit",
  description: "Exit the agent",
  aliases: ["quit", "q"],
  execute: async (_, context) => {
    if (context.sessionId) {
      return {
        handled: true,
        exit: true,
        output: chalk.yellow("\n👋 Goodbye!") +
          chalk.gray(`\n\nTo continue this session later, run:\n  agentic -s ${context.sessionId}\n`),
      };
    }
    return { handled: true, exit: true, output: chalk.yellow("\n👋 Goodbye!\n") };
  },
});

registerSlashCommand({
  name: "tools",
  description: "List available tools",
  aliases: ["tool"],
  execute: async () => {
    const { toolDescriptions } = await import("../tools/index.ts");
    
    const sections = toolDescriptions
      .map((category) => {
        const rows = category.tools.map((tool) => `${chalk.cyan(tool.name)} ${chalk.gray("-")} ${chalk.gray(tool.description)}`);
        return `${chalk.bold.cyan(category.category)}\n${formatList(rows, "gray")}`;
      })
      .join("\n\n");

    return {
      handled: true,
      output: createPanel("🛠️ Available Tools", sections, { tone: "primary" }),
    };
  },
});

registerSlashCommand({
  name: "info",
  description: "Show current session info",
  execute: async (_, context) => {
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModelId = aiService.getModelId();
    const messageCount = context.messages.length - 1;

    const info = [
      `${chalk.bold("Session ID:")} ${chalk.white(context.sessionId?.slice(0, 8) || "none")}...`,
      `${chalk.bold("Mode:")} ${chalk.white(context.mode)}`,
      `${chalk.bold("Provider:")} ${chalk.white(provider.name)}`,
      `${chalk.bold("Model:")} ${chalk.white(currentModelId)}`,
      `${chalk.bold("Messages:")} ${chalk.white(messageCount)}`,
    ].join("\n");

    return {
      handled: true,
      output: boxen(`${chalk.bold.cyan("Session Info")}\n\n${info}`, {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    };
  },
});

registerSlashCommand({
  name: "resume",
  description: "Resume a previous session",
  usage: "[session-id]",
  execute: async (args) => {
    const sessions = sessionManager.listSessions(15);

    if (sessions.length === 0) {
      return { handled: true, output: chalk.yellow("No sessions found to resume.") };
    }

    let selectedSessionId: string | undefined;

    if (args) {
      const partialId = args.trim().toLowerCase();
      selectedSessionId = sessions.find(s => s.id.toLowerCase().startsWith(partialId))?.id;
      
      if (!selectedSessionId) {
        return { handled: true, output: chalk.red(`Session not found: ${args}`) };
      }
    } else {
      const sessionChoice = await select({
        message: "Select a session to resume:",
        options: sessions.map((s, i) => {
          const date = new Date(s.updatedAt);
          const dateStr = date.toLocaleDateString();
          const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return {
            value: s.id,
            label: `${chalk.cyan(s.id.slice(0, 8))}... ${chalk.white(s.title || "Untitled")} ${chalk.gray(`(${s.messageCount} msgs, ${dateStr} ${timeStr})`)}`,
          };
        }),
      });

      if (isCancel(sessionChoice)) {
        return { handled: true, output: chalk.yellow("Resume cancelled") };
      }

      selectedSessionId = sessionChoice as string;
    }

    return {
      handled: true,
      newSessionId: selectedSessionId,
      output: chalk.green(`✓ Resuming session: ${selectedSessionId.slice(0, 8)}...`) +
        chalk.gray(`\n  Run ${chalk.cyan("agentic -s " + selectedSessionId)} to resume this session directly`),
    };
  },
});

registerSlashCommand({
  name: "personality",
  description: "Change the agent's personality",
  execute: async () => {
    const currentPersonality = sessionManager.getActivePersonality();
    
    const personalities = Object.entries(PERSONALITIES) as [string, { name: string; description: string }][];
    
    const choice = await select({
      message: "Select a personality:",
      options: personalities.map(([id, p]) => ({
        value: id,
        label: id === currentPersonality
          ? `${chalk.green("✓")} ${chalk.white(p.name)}`
          : chalk.white(p.name),
        hint: p.description,
      })),
    });

    if (isCancel(choice)) {
      return { handled: true, output: chalk.yellow("Personality change cancelled") };
    }

    const selectedId = choice as string;
    sessionManager.setActivePersonality(selectedId as "calm" | "senior" | "friendly" | "concise" | "professional" | "mentor");
    const selected = PERSONALITIES[selectedId as keyof typeof PERSONALITIES];
    
    return {
      handled: true,
      output: chalk.green(`✓ Personality changed to: ${chalk.white(selected.name)}`) +
        chalk.gray(`\n  ${selected.description}`),
    };
  },
});
