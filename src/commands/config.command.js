import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { text, password, select, confirm, isCancel, intro, outro } from "@clack/prompts";
import {
  getStoredKeys,
  storeApiKey,
  getApiKey,
  CONFIG_DIR,
  KEYS_FILE,
  getCurrentProvider,
  setCurrentProvider,
  getProviderApiKey,
} from "../config/env.js";
import { PROVIDERS, getAllProviders } from "../config/providers.js";
import fs from "fs/promises";

/**
 * Interactive API key setup
 */
async function setupAction() {
  intro(chalk.bold.cyan("🔑 agentic CLI - API Key Setup"));

  const keys = [
    {
      name: "AI_GATEWAY_API_KEY",
      label: "Vercel AI Gateway API Key",
      description: "Required for AI chat functionality (get from Vercel AI Gateway)",
      required: true,
      link: "https://vercel.com/ai-gateway",
    },
    {
      name: "EXA_API_KEY",
      label: "Exa Search API Key",
      description: "Required for web search functionality",
      required: false,
      link: "https://exa.ai",
    },
    {
      name: "GITHUB_TOKEN",
      label: "GitHub Personal Access Token",
      description: "Required for PR review functionality",
      required: false,
      link: "https://github.com/settings/tokens",
    },
  ];

  const storedKeys = await getStoredKeys();

  for (const keyConfig of keys) {
    const existingValue = await getApiKey(keyConfig.name);
    const hasExisting = !!existingValue;

    console.log("");
    console.log(chalk.bold(keyConfig.label));
    console.log(chalk.gray(keyConfig.description));
    console.log(chalk.gray(`Get one at: ${keyConfig.link}`));

    if (hasExisting) {
      console.log(chalk.green("✓ Already configured"));

      const updateKey = await confirm({
        message: "Update this key?",
        initialValue: false,
      });

      if (isCancel(updateKey) || !updateKey) {
        continue;
      }
    }

    const value = await password({
      message: `Enter ${keyConfig.label}:`,
      validate: (val) => {
        if (keyConfig.required && !val) {
          return "This key is required";
        }
      },
    });

    if (isCancel(value)) {
      console.log(chalk.yellow("Setup cancelled"));
      return;
    }

    if (value) {
      await storeApiKey(keyConfig.name, value);
      console.log(chalk.green(`✓ ${keyConfig.label} saved`));
    }
  }

  outro(chalk.green.bold("✨ API keys configured successfully!"));

  console.log(
    boxen(
      chalk.white(
        `Keys are stored in:\n${chalk.cyan(KEYS_FILE)}\n\n` +
        `You can also set keys via environment variables\n` +
        `or run ${chalk.cyan("agentic config set <KEY> <value>")}`
      ),
      {
        padding: 1,
        margin: { top: 1 },
        borderStyle: "round",
        borderColor: "gray",
      }
    )
  );
}

/**
 * Set a specific API key
 */
async function setAction(keyName, value) {
  if (!keyName || !value) {
    console.log(chalk.red("Usage: agentic config set <KEY_NAME> <value>"));
    console.log(chalk.gray("\nAvailable keys:"));
    console.log(chalk.gray("  AI_GATEWAY_API_KEY"));
    console.log(chalk.gray("  EXA_API_KEY"));
    console.log(chalk.gray("  GITHUB_TOKEN"));
    return;
  }

  await storeApiKey(keyName, value);
  console.log(chalk.green(`✓ ${keyName} has been saved`));
}

/**
 * List configured keys
 */
async function listAction() {
  const storedKeys = await getStoredKeys();
  const keyNames = [
    "AI_GATEWAY_API_KEY",
    "EXA_API_KEY",
    "GITHUB_TOKEN",
  ];

  console.log(chalk.bold("\n🔑 Configured API Keys:\n"));

  for (const name of keyNames) {
    const fromEnv = process.env[name];
    const fromStored = storedKeys[name];
    const value = fromEnv || fromStored;

    if (value) {
      const source = fromEnv ? chalk.blue("(env)") : chalk.gray("(stored)");
      const masked = value.substring(0, 8) + "..." + value.substring(value.length - 4);
      console.log(chalk.green(`  ✓ ${name}`));
      console.log(chalk.gray(`    ${masked} ${source}`));
    } else {
      console.log(chalk.yellow(`  ✗ ${name}`));
      console.log(chalk.gray(`    Not configured`));
    }
  }

  console.log(chalk.gray(`\nKeys stored in: ${KEYS_FILE}`));
}

/**
 * Remove a key
 */
async function removeAction(keyName) {
  if (!keyName) {
    console.log(chalk.red("Usage: agentic config remove <KEY_NAME>"));
    return;
  }

  const keys = await getStoredKeys();
  if (keys[keyName]) {
    delete keys[keyName];
    await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), "utf-8");
    console.log(chalk.green(`✓ ${keyName} has been removed`));
  } else {
    console.log(chalk.yellow(`${keyName} was not stored (check env variables)`));
  }
}

/**
 * Show config path
 */
async function pathAction() {
  console.log(chalk.bold("\n📁 Configuration Paths:\n"));
  console.log(`  Config directory: ${chalk.cyan(CONFIG_DIR)}`);
  console.log(`  API keys file:    ${chalk.cyan(KEYS_FILE)}`);
}

/**
 * Config command
 */
export const configCommand = new Command("config")
  .description("Manage API keys and configuration")
  .addCommand(
    new Command("setup")
      .description("Interactive API key setup wizard")
      .action(setupAction)
  )
  .addCommand(
    new Command("set")
      .description("Set a specific API key")
      .argument("<key>", "API key name")
      .argument("<value>", "API key value")
      .action(setAction)
  )
  .addCommand(
    new Command("list")
      .description("List all configured API keys")
      .action(listAction)
  )
  .addCommand(
    new Command("remove")
      .description("Remove a stored API key")
      .argument("<key>", "API key name to remove")
      .action(removeAction)
  )
  .addCommand(
    new Command("path")
      .description("Show configuration file paths")
      .action(pathAction)
  );

// Default action for just "agentic config"
configCommand.action(() => {
  configCommand.help();
});

