import chalk from "chalk";
import boxen from "boxen";
import { select, confirm, password, isCancel, outro } from "@clack/prompts";
import {
  getProviderApiKey,
  storeApiKey,
  getCurrentProvider,
  setCurrentProvider,
} from "../../config/env.ts";
import { PROVIDERS, getAllProviders } from "../../config/providers.ts";
import { installPackage } from "./package-installer.js";
import * as ui from "../../utils/ui.ts";

export async function providerSetAction(providerId?: string): Promise<void> {
  const providers = getAllProviders();
  let selectedProvider;

  if (providerId) {
    selectedProvider = PROVIDERS[providerId];
    if (!selectedProvider) {
      ui.error(`Provider "${providerId}" not found.`);
      ui.dim("\nAvailable providers:");
      providers.forEach((p) => {
        ui.dim(`  - ${p.id}: ${p.name}`);
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

  const apiKey = await getProviderApiKey(selectedProvider.id);
  if (!apiKey) {
    ui.warning(
      `\n⚠️  ${selectedProvider.apiKeyName} is not configured.\n` +
      `Run 'agentic config set ${selectedProvider.apiKeyName} <key>' to set it.\n` +
      `Get your API key at: ${selectedProvider.link}`
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

    await storeApiKey(selectedProvider.apiKeyName, keyValue as string);
    ui.success(`✓ ${selectedProvider.apiKeyName} saved`);
  }

  await setCurrentProvider(selectedProvider.id);
  
  ui.successBox(`Provider set to: ${selectedProvider.name}`, {
    title: "✅ Success",
  });
  ui.dim(`Description: ${selectedProvider.description}`);
  ui.dim(`API Key: ${selectedProvider.apiKeyName}`);

  if (selectedProvider.package) {
    try {
      await import(selectedProvider.importPath!);
      ui.success(`\n✓ ${selectedProvider.package} is already installed`);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ERR_MODULE_NOT_FOUND" || err.message.includes("Cannot find module")) {
        ui.warning(`\n⚠️  ${selectedProvider.package} is not installed.`);

        const installNow = await confirm({
          message: `Install ${selectedProvider.package} now?`,
          initialValue: true,
        });

        if (isCancel(installNow)) {
          outro(chalk.yellow("Provider configured. Install package manually when ready."));
          return;
        }

        if (installNow) {
          ui.info(`\nInstalling ${selectedProvider.package}...`);
          try {
            await installPackage(selectedProvider.package!);
            ui.success(`\n✓ ${selectedProvider.package} installed successfully!`);
          } catch (installError) {
            const installErr = installError as Error;
            ui.error(
              `\n❌ Failed to install ${selectedProvider.package}.\n` +
              `Please install manually: bun add ${selectedProvider.package}\n` +
              `Error: ${installErr.message}`
            );
          }
        } else {
          ui.warning(
            `\n⚠️  Install ${selectedProvider.package} manually:\n` +
            `  bun add ${selectedProvider.package}`
          );
        }
      }
    }
  }

  outro(chalk.green("✨ Provider configured!"));
}

export async function providerCurrentAction(): Promise<void> {
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];

  if (!provider) {
    ui.error(`Provider "${currentProviderId}" not found.`);
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
    ui.warning(
      `\n⚠️  Configure API key:\n` +
      `  agentic config set ${provider.apiKeyName} <key>\n` +
      chalk.gray(`  Get it at: ${provider.link}`)
    );
  }
}

export async function providerListAction(): Promise<void> {
  ui.heading("🤖 Available Providers");

  const currentProviderId = await getCurrentProvider();
  const providers = getAllProviders();

  for (const provider of providers) {
    const isCurrent = provider.id === currentProviderId;
    const apiKey = await getProviderApiKey(provider.id);
    const hasApiKey = !!apiKey;

    const marker = isCurrent ? chalk.green("✓") : " ";
    const status = hasApiKey ? chalk.green("(configured)") : chalk.yellow("(not configured)");

    ui.item(`${marker} ${chalk.bold(provider.name)} ${isCurrent ? chalk.cyan("(current)") : ""}`);
    ui.dim(`   ${provider.description}`);
    ui.dim(`   API Key: ${provider.apiKeyName} ${status}`);
    if (provider.package) {
      ui.dim(`   Package: ${provider.package}`);
    }
    ui.newline();
  }
}
