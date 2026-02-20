import chalk from "chalk";
import { spawn, type ChildProcess } from "child_process";
import type { LanguageModel } from "ai";
import { config } from "../../config/env.ts";
import { PROVIDERS, type Provider } from "../../config/providers.ts";

export interface ProviderInstance {
  providerId: string;
  providerInstance: ((modelId: string) => LanguageModel) | null;
  initialized: boolean;
}

export class ProviderManager {
  private currentProviderId: string | null = null;
  private providerInstance: ((modelId: string) => LanguageModel) | null = null;
  private initialized = false;

  async initialize(modelId: string | null = null): Promise<{
    provider: Provider;
    model: string | LanguageModel;
  }> {
    const currentProviderId = await config.getCurrentProvider();

    if (this.currentProviderId !== currentProviderId) {
      this.initialized = false;
      this.providerInstance = null;
    }

    if (this.initialized && (!modelId || modelId === this.currentProviderId)) {
      const provider = PROVIDERS[currentProviderId];
      return { provider, model: modelId || config.getModel() };
    }

    this.currentProviderId = currentProviderId;
    const provider = PROVIDERS[currentProviderId];

    if (!provider) {
      throw new Error(
        `Provider "${currentProviderId}" not found. Run 'agentic config provider set' to configure.`
      );
    }

    const apiKey = await config.getProviderApiKey(currentProviderId);
    if (!apiKey) {
      throw new Error(
        `${provider.apiKeyName} is not set. Run 'agentic config setup' to configure.`
      );
    }

    if (!process.env[provider.apiKeyEnv]) {
      process.env[provider.apiKeyEnv] = apiKey;
    }

    if (provider.id === "gateway") {
      this.providerInstance = null;
    } else {
      try {
        const providerModule = await import(provider.importPath!);
        const providerFn = (providerModule[provider.id] || providerModule.default || providerModule) as ((modelId: string) => LanguageModel);
        if (typeof providerFn !== "function") {
          throw new Error(`Provider "${provider.id}" is not a function`);
        }
        this.providerInstance = providerFn;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ERR_MODULE_NOT_FOUND" || err.message.includes("Cannot find module")) {
          console.log(
            chalk.yellow(
              `\n⚠️  Provider package "${provider.package}" not found.\n` +
              `Installing ${provider.package}...\n`
            )
          );

          try {
            await this.installProviderPackage(provider.package!);
            const providerModule = await import(provider.importPath!);
            const providerFn = (providerModule[provider.id] || providerModule.default || providerModule) as ((modelId: string) => LanguageModel);
            if (typeof providerFn !== "function") {
              throw new Error(`Provider "${provider.id}" is not a function`);
            }
            this.providerInstance = providerFn;
            console.log(chalk.green(`✓ ${provider.package} installed successfully\n`));
          } catch (installError) {
            const installErr = installError as Error;
            throw new Error(
              `Failed to install provider package "${provider.package}".\n` +
              `Please run manually: ${chalk.cyan(`bun add ${provider.package}`)}\n` +
              `Error: ${installErr.message}`
            );
          }
        } else {
          throw error;
        }
      }
    }

    const selectedModel = modelId || config.getModel();

    if (provider.id === "gateway") {
      this.initialized = true;
      return { provider, model: selectedModel };
    } else {
      if (!this.providerInstance) {
        throw new Error(`Provider instance not initialized for ${provider.id}`);
      }
      this.initialized = true;
      return { provider, model: this.providerInstance(selectedModel) };
    }
  }

  async installProviderPackage(packageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const installCommand: string[] = ["add"];
      if (packageName.startsWith("@ai-sdk/")) {
        installCommand.push(`${packageName}@latest`);
      } else {
        installCommand.push(packageName);
      }

      const bun = spawn("bun", installCommand, {
        stdio: "inherit",
        shell: true,
        cwd: process.cwd(),
      }) as ChildProcess;

      bun.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Installation failed with code ${code}`));
        }
      });

      bun.on("error", (error: Error) => {
        reject(error);
      });
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.initialized = false;
    this.providerInstance = null;
    this.currentProviderId = null;
  }
}

export const providerManager = new ProviderManager();
