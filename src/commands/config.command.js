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
import { spawn } from "child_process";
import fs from "fs/promises";

/**
 * Install a package using bun add
 * Installs in the current project directory
 * For AI SDK 5 compatibility, installs @ai-sdk/* packages at version 2.0.0 or later
 */
function installPackage(packageName) {
  return new Promise((resolve, reject) => {
    // For @ai-sdk packages, ensure we install v2.0.0+ for AI SDK 5 compatibility
    let installCommand = ["add"];
    if (packageName.startsWith("@ai-sdk/")) {
      // Install latest version (which should be 2.0.0+ for AI SDK 5)
      installCommand.push(`${packageName}@latest`);
    } else {
      installCommand.push(packageName);
    }

    const bun = spawn("bun", installCommand, {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(), // Install in current project directory
    });

    bun.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });

    bun.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Select provider
 */
async function providerSetAction(providerId) {
  intro(chalk.bold.cyan("🤖 Provider Selection"));

  const providers = getAllProviders();
  let selectedProvider;

  if (providerId) {
    selectedProvider = PROVIDERS[providerId];
    if (!selectedProvider) {
      console.log(chalk.red(`Provider "${providerId}" not found.`));
      console.log(chalk.gray("\nAvailable providers:"));
      providers.forEach((p) => {
        console.log(chalk.gray(`  - ${p.id}: ${p.name}`));
      });
      return;
    }
  } else {
    const currentProvider = await getCurrentProvider();
    const choice = await select({
      message: "Select an AI provider:",
      options: providers.map((p) => ({
        value: p.id,
        label: `${p.name} ${p.id === currentProvider ? chalk.gray("(current)") : ""}`,
        hint: p.description,
      })),
      initialValue: currentProvider,
    });

    if (isCancel(choice)) {
      outro(chalk.yellow("Provider selection cancelled"));
      return;
    }

    selectedProvider = PROVIDERS[choice];
  }

  // Check if API key is configured
  const apiKey = await getProviderApiKey(selectedProvider.id);
  if (!apiKey) {
    console.log(
      chalk.yellow(
        `\n⚠️  ${selectedProvider.apiKeyName} is not configured.\n` +
        `Run 'agentic config set ${selectedProvider.apiKeyName} <key>' to set it.\n` +
        `Get your API key at: ${selectedProvider.link}`
      )
    );

    const configureNow = await confirm({
      message: "Configure API key now?",
      initialValue: true,
    });

    if (isCancel(configureNow) || !configureNow) {
      outro(chalk.yellow("Provider selection cancelled"));
      return;
    }

    const keyValue = await password({
      message: `Enter ${selectedProvider.apiKeyName}:`,
      validate: (val) => {
        if (!val) {
          return "API key is required";
        }
      },
    });

    if (isCancel(keyValue)) {
      outro(chalk.yellow("Provider selection cancelled"));
      return;
    }

    await storeApiKey(selectedProvider.apiKeyName, keyValue);
    console.log(chalk.green(`✓ ${selectedProvider.apiKeyName} saved`));
  }

  await setCurrentProvider(selectedProvider.id);
  console.log(
    boxen(
      chalk.green(`✅ Provider set to: ${chalk.bold(selectedProvider.name)}\n`) +
      chalk.gray(`Description: ${selectedProvider.description}\n`) +
      chalk.gray(`API Key: ${selectedProvider.apiKeyName}`),
      {
        padding: 1,
        borderStyle: "round",
        borderColor: "green",
      }
    )
  );

  // Check if package needs to be installed
  if (selectedProvider.package) {
    // Try to check if package is installed
    try {
      await import(selectedProvider.importPath);
      console.log(chalk.green(`\n✓ ${selectedProvider.package} is already installed`));
    } catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND" || error.message.includes("Cannot find module")) {
        console.log(
          chalk.yellow(
            `\n⚠️  ${selectedProvider.package} is not installed.`
          )
        );

        const installNow = await confirm({
          message: `Install ${selectedProvider.package} now?`,
          initialValue: true,
        });

        if (isCancel(installNow)) {
          outro(chalk.yellow("Provider configured. Install package manually when ready."));
          return;
        }

        if (installNow) {
          console.log(chalk.cyan(`\nInstalling ${selectedProvider.package}...\n`));
          try {
            await installPackage(selectedProvider.package);
            console.log(chalk.green(`\n✓ ${selectedProvider.package} installed successfully!`));
          } catch (installError) {
            console.log(
              chalk.red(
                `\n❌ Failed to install ${selectedProvider.package}.\n` +
                `Please install manually: ${chalk.cyan(`bun add ${selectedProvider.package}`)}\n` +
                `Error: ${installError.message}`
              )
            );
          }
        } else {
          console.log(
            chalk.yellow(
              `\n⚠️  Install ${selectedProvider.package} manually:\n` +
              chalk.cyan(`  bun add ${selectedProvider.package}`)
            )
          );
        }
      }
    }
  }

  outro(chalk.green("✨ Provider configured!"));
}

/**
 * Show current provider
 */
async function providerCurrentAction() {
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];

  if (!provider) {
    console.log(chalk.red(`Provider "${currentProviderId}" not found.`));
    return;
  }

  const apiKey = await getProviderApiKey(currentProviderId);
  const hasApiKey = !!apiKey;

  console.log(
    boxen(
      `${chalk.bold("Current Provider:")}\n` +
      `${chalk.cyan(provider.name)}\n\n` +
      `${chalk.gray("ID:")} ${provider.id}\n` +
      `${chalk.gray("Description:")} ${provider.description}\n` +
      `${chalk.gray("API Key:")} ${hasApiKey ? chalk.green("✓ Configured") : chalk.red("✗ Not configured")}\n` +
      `${chalk.gray("Package:")} ${provider.package || chalk.gray("Built-in")}`,
      {
        padding: 1,
        borderStyle: "round",
        borderColor: hasApiKey ? "green" : "yellow",
      }
    )
  );

  if (!hasApiKey) {
    console.log(
      chalk.yellow(
        `\n⚠️  Configure API key:\n` +
        chalk.cyan(`  agentic config set ${provider.apiKeyName} <key>\n`) +
        chalk.gray(`  Get it at: ${provider.link}`)
      )
    );
  }
}

/**
 * List all providers
 */
async function providerListAction() {
  console.log(chalk.bold("\n🤖 Available Providers:\n"));

  const currentProviderId = await getCurrentProvider();
  const providers = getAllProviders();

  for (const provider of providers) {
    const isCurrent = provider.id === currentProviderId;
    const apiKey = await getProviderApiKey(provider.id);
    const hasApiKey = !!apiKey;

    const marker = isCurrent ? chalk.green("✓") : " ";
    const status = hasApiKey ? chalk.green("(configured)") : chalk.yellow("(not configured)");

    console.log(
      `${marker} ${chalk.bold(provider.name)} ${isCurrent ? chalk.cyan("(current)") : ""}`
    );
    console.log(chalk.gray(`   ${provider.description}`));
    console.log(chalk.gray(`   API Key: ${provider.apiKeyName} ${status}`));
    if (provider.package) {
      console.log(chalk.gray(`   Package: ${provider.package}`));
    }
    console.log("");
  }
}

/**
 * Interactive API key setup
 */
async function setupAction() {
  intro(chalk.bold.cyan("🔑 agentic CLI - API Key Setup"));

  // First, select or confirm provider
  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  console.log(chalk.bold(`\nCurrent Provider: ${provider.name}`));
  const changeProvider = await confirm({
    message: "Change provider?",
    initialValue: false,
  });

  if (!isCancel(changeProvider) && changeProvider) {
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

  // Configure provider API key
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

    await storeApiKey(finalProviderObj.apiKeyName, value);
    console.log(chalk.green(`✓ ${finalProviderObj.apiKeyName} saved`));
  } else {
    console.log(chalk.green(`✓ ${finalProviderObj.apiKeyName} already configured`));
  }

  // Configure optional keys
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
  const currentProvider = await getCurrentProvider();
  const provider = PROVIDERS[currentProvider];

  console.log(chalk.bold("\n🔑 Configured API Keys:\n"));

  // Show current provider
  console.log(chalk.cyan("Current Provider:"));
  console.log(chalk.white(`  ${provider.name} (${provider.id})`));
  console.log("");

  // Show provider API key
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

  // Show optional keys
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
  )
  .addCommand(
    new Command("provider")
      .description("Manage AI provider")
      .addCommand(
        new Command("set")
          .description("Set the AI provider")
          .argument("[provider-id]", "Provider ID (e.g., openai, anthropic, google)")
          .action(providerSetAction)
      )
      .addCommand(
        new Command("current")
          .description("Show current provider")
          .action(providerCurrentAction)
      )
      .addCommand(
        new Command("list")
          .description("List all available providers")
          .action(providerListAction)
      )
  );

// Default action for just "agentic config"
configCommand.action(() => {
  configCommand.help();
});

