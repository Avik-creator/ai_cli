#!/usr/bin/env bun

import dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import {
  chatCommand,
  searchCommand,
  askCommand,
  reviewCommand,
  generateCommand,
  runCommand,
  fixCommand,
} from "./commands/chat.command.js";
import { configCommand } from "./commands/config.command.js";
import { modelCommand } from "./commands/model.command.js";
import { runAgent } from "./agent/agent.js";

dotenv.config();

async function main() {
  // Display banner
  console.log(
    chalk.cyan(
      figlet.textSync("agentic", {
        font: "Standard",
        horizontalLayout: "default",
      })
    )
  );
  console.log(
    chalk.gray(
      "  An agentic CLI for web search, PR reviews, code generation & more\n"
    )
  );

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
  program.addCommand(configCommand);
  program.addCommand(modelCommand);

  // Default action - start interactive chat
  program.action(async () => {
    await runAgent({ mode: "all" });
  });

  await program.parseAsync();
}

main().catch((error) => {
  console.error(chalk.red("\n❌ Error:"), error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

