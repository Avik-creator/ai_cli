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
import { JsonStore } from "../../utils/json-store.ts";
import * as ui from "../../utils/ui.ts";

const apiKeyStore = new JsonStore<Record<string, string>>(KEYS_FILE);

export async function setupAction(): Promise<void> {
  intro(chalk.bold.cyan("🔑 agentic CLI - API Key Setup"));

  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  ui.bold(`\nCurrent Provider: ${provider.name}`);
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
    ui.bold(`\n${finalProviderObj.name} API Key`);
    ui.dim(finalProviderObj.description);
    ui.dim(`Get one at: ${finalProviderObj.link}`);

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
    ui.success(`✓ ${finalProviderObj.apiKeyName} saved`);
  } else {
    ui.success(`✓ ${finalProviderObj.apiKeyName} already configured`);
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

    ui.newline();
    ui.bold(keyConfig.label);
    ui.dim(keyConfig.description);
    ui.dim(`Get one at: ${keyConfig.link}`);

    if (hasExisting) {
      ui.success("✓ Already configured");

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
      ui.warning("Setup cancelled");
      return;
    }

    if (value) {
      await storeApiKey(keyConfig.name, value as string);
      ui.success(`✓ ${keyConfig.label} saved`);
    }
  }

  outro(chalk.green.bold("✨ API keys configured successfully!"));

  ui.infoBox(
    `Keys are stored in:\n${KEYS_FILE}\n\n` +
    `You can also set keys via environment variables\n` +
    `or run agentic config set <KEY> <value>`,
    { borderColor: "gray" }
  );
}

export async function setAction(keyName: string, value: string): Promise<void> {
  if (!keyName || !value) {
    ui.error("Usage: agentic config set <KEY_NAME> <value>");
    ui.dim("\nAvailable keys:");
    ui.dim("  AI_GATEWAY_API_KEY");
    ui.dim("  EXA_API_KEY");
    ui.dim("  GITHUB_TOKEN");
    return;
  }

  await storeApiKey(keyName, value);
  ui.success(`✓ ${keyName} has been saved`);
}

export async function listAction(): Promise<void> {
  const storedKeys = await getStoredKeys();
  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  ui.heading("🔑 Configured API Keys");

  ui.subheading("Current Provider");
  ui.item(`${provider.name} (${provider.id})`);
  ui.newline();

  const providerKey = provider.apiKeyName;
  const fromEnv = process.env[providerKey];
  const fromStored = storedKeys[providerKey];
  const value = fromEnv || fromStored;

  if (value) {
    const source = fromEnv ? chalk.blue("(env)") : chalk.gray("(stored)");
    const masked = ui.maskApiKey(value);
    ui.itemCheck(`${providerKey} ${masked} ${source}`, true);
  } else {
    ui.itemCheck(`${providerKey} - Not configured`, false);
  }

  ui.subheading("Optional Keys");
  const optionalKeys = ["EXA_API_KEY", "GITHUB_TOKEN"];
  for (const name of optionalKeys) {
    const fromEnv = process.env[name];
    const fromStored = storedKeys[name];
    const val = fromEnv || fromStored;

    if (val) {
      const source = fromEnv ? chalk.blue("(env)") : chalk.gray("(stored)");
      const masked = ui.maskApiKey(val);
      ui.itemCheck(`${name} ${masked} ${source}`, true);
    } else {
      ui.itemCheck(`${name} - Not configured`, false);
    }
  }

  ui.dim(`\nKeys stored in: ${KEYS_FILE}`);
}

export async function removeAction(keyName: string): Promise<void> {
  if (!keyName) {
    ui.error("Usage: agentic config remove <KEY_NAME>");
    return;
  }

  const keys = await getStoredKeys();
  if (keys[keyName]) {
    delete keys[keyName];
    await apiKeyStore.save(keys);
    ui.success(`✓ ${keyName} has been removed`);
  } else {
    ui.warning(`${keyName} was not stored (check env variables)`);
  }
}
