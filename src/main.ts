#!/usr/bin/env bun

import dotenv from "dotenv";
import chalk from "chalk";
import { Command } from "commander";
import {
  chatCommand,
  searchCommand,
  askCommand,
  reviewCommand,
  generateCommand,
  runCommand,
  fixCommand,
  sessionsCommand,
} from "./commands/chat.command.js";
import { configCommand } from "./commands/config.command.js";
import { modelCommand } from "./commands/model.command.js";
import { preferencesCommand } from "./commands/preferences.command.js";
import { planCommand } from "./commands/plan.command.js";
import { skillsCommand } from "./commands/skills.command.js";
import { runAgent } from "./agent/agent.js";

dotenv.config();

function formatTopLevelError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

process.on("unhandledRejection", (reason: unknown) => {
  console.error(chalk.red("\n❌ Error:"), formatTopLevelError(reason));
  if (process.env.AGENTIC_VERBOSE_ERRORS === "1") {
    console.error(reason);
  }
});

process.on("uncaughtException", (error: Error) => {
  console.error(chalk.red("\n❌ Error:"), formatTopLevelError(error));
  if (process.env.AGENTIC_VERBOSE_ERRORS === "1") {
    console.error(error.stack);
  }
  process.exit(1);
});

async function main(): Promise<void> {
  const program = new Command("agentic");

  program
    .version("1.0.0")
    .description(
      "agentic CLI - An agentic assistant for development tasks"
    );

  // Add all commands
  program.addCommand(chatCommand);
  program.addCommand(searchCommand);
  program.addCommand(askCommand);
  program.addCommand(reviewCommand);
  program.addCommand(generateCommand);
  program.addCommand(runCommand);
  program.addCommand(fixCommand);
  program.addCommand(sessionsCommand);
  program.addCommand(configCommand);
  program.addCommand(modelCommand);
  program.addCommand(preferencesCommand);
  program.addCommand(planCommand);
  program.addCommand(skillsCommand);

  // Default action - start interactive chat
  program.action(async (options) => {
    await runAgent({ 
      mode: "all",
      sessionId: options.session || null 
    });
  });

  // Add global option for session
  program.option("-s, --session <session-id>", "Continue an existing session");

  await program.parseAsync();
}

main().catch((error: unknown) => {
  console.error(chalk.red("\n❌ Error:"), formatTopLevelError(error));
  if (process.env.AGENTIC_VERBOSE_ERRORS === "1") {
    console.error(error instanceof Error ? error.stack : error);
  }
  process.exit(1);
});
