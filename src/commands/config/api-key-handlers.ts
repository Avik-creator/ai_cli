import chalk from "chalk";
import boxen from "boxen";
import { password, confirm, isCancel, intro, outro } from "@clack/prompts";
import {
  getStoredKeys,
  storeApiKey,
  getApiKey,
  getCurrentProvider,
  getProviderApiKey,
  KEYS_FILE,
} from "../../config/env.ts";
import { PROVIDERS } from "../../config/providers.ts";
import fs from "fs/promises";

export async function setupAction(): Promise<void> {
  intro(chalk.bold.cyan("🔑 agentic CLI - API Key Setup"));

  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  console.log(chalk.bold(`\nCurrent Provider: ${provider.name}`));
  const changeProvider = await confirm({
    message: "Change provider?",
    initialValue: false,
  });

  if (!isCancel(changeProvider) && changeProvider) {
    const { providerSetAction } = await import("./provider-handlers.js");
    await providerSetAction();
    const newProvider = await getCurrentProvider();
    const newProviderObj = PROVIDERS[newProvider];
    if (!newProviderObj) {
      outro(chalk.red("Provider setup failed"));
      return;
    }
  }

  const finalProvider = await getCurrentProvider();
  const finalProviderObj = PROVIDERS[finalProvider];

  const providerApiKey = await getProviderApiKey(finalProvider);
  if (!providerApiKey) {
    console.log(chalk.bold(`\n${finalProviderObj.name} API Key`));
    console.log(chalk.gray(finalProviderObj.description));
    console.log(chalk.gray(`Get one at: ${finalProviderObj.link}`));

    const value = await password({
      message: `Enter ${finalProviderObj.apiKeyName}:`,
      validate: (val) => {
        if (!val) {
          return "API key is required";
        }
      },
    });

    if (isCancel(value)) {
      outro(chalk.yellow("Setup cancelled"));
      return;
    }

    await storeApiKey(finalProviderObj.apiKeyName, value as string);
    console.log(chalk.green(`✓ ${finalProviderObj.apiKeyName} saved`));
  } else {
    console.log(chalk.green(`✓ ${finalProviderObj.apiKeyName} already configured`));
  }

  const optionalKeys = [
    {
      name: "EXA_API_KEY",
      label: "Exa Search API Key",
      description: "Required for web search functionality",
      link: "https://exa.ai",
    },
    {
      name: "GITHUB_TOKEN",
      label: "GitHub Personal Access Token",
      description: "Required for PR review functionality",
      link: "https://github.com/settings/tokens",
    },
  ];

  for (const keyConfig of optionalKeys) {
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
      message: `Enter ${keyConfig.label} (optional, press Enter to skip):`,
    });

    if (isCancel(value)) {
      console.log(chalk.yellow("Setup cancelled"));
      return;
    }

    if (value) {
      await storeApiKey(keyConfig.name, value as string);
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

export async function setAction(keyName: string, value: string): Promise<void> {
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

export async function listAction(): Promise<void> {
  const storedKeys = await getStoredKeys();
  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  console.log(chalk.bold("\n🔑 Configured API Keys:\n"));

  console.log(chalk.cyan("Current Provider:"));
  console.log(chalk.white(`  ${provider.name} (${provider.id})`));
  console.log("");

  const providerKey = provider.apiKeyName;
  const fromEnv = process.env[providerKey];
  const fromStored = storedKeys[providerKey];
  const value = fromEnv || fromStored;

  if (value) {
    const source = fromEnv ? chalk.blue("(env)") : chalk.gray("(stored)");
    const masked = value.substring(0, 8) + "..." + value.substring(value.length - 4);
    console.log(chalk.green(`  ✓ ${providerKey}`));
    console.log(chalk.gray(`    ${masked} ${source}`));
  } else {
    console.log(chalk.yellow(`  ✗ ${providerKey}`));
    console.log(chalk.gray(`    Not configured`));
  }

  const optionalKeys = ["EXA_API_KEY", "GITHUB_TOKEN"];
  console.log(chalk.gray("\nOptional Keys:"));
  for (const name of optionalKeys) {
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

export async function removeAction(keyName: string): Promise<void> {
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
