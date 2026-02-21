import { streamText, generateObject, generateText, stepCountIs, type CoreMessage, type LanguageModel } from "ai";
import { config, AVAILABLE_MODELS } from "../config/env.ts";
import { PROVIDERS, PROVIDER_MODELS, type Provider } from "../config/providers.ts";
import { getCustomModels } from "../config/custom-models.ts";
import type { ToolSet } from "../tools/index.ts";
import chalk from "chalk";
import { spawn, type ChildProcess } from "child_process";
import type { z } from "zod";

type ModelInstance = string | LanguageModel;

interface SendMessageOptions {
  modelId?: string | null;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  [key: string]: unknown;
}

interface SendMessageResult {
  content: string;
  finishReason: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  toolCalls: unknown[];
  toolResults: unknown[];
  steps?: unknown[];
}

const OPENROUTER_SAFE_MAX_TOKENS = 1024;

function collectErrorSignals(error: unknown, depth: number = 0): { messages: string[]; statusCode?: number } {
  if (!error || depth > 3) {
    return { messages: [] };
  }

  const messages: string[] = [];
  let statusCode: number | undefined;
  const anyError = error as Record<string, unknown>;

  if (error instanceof Error && error.message) {
    messages.push(error.message);
  }

  if (typeof anyError.responseBody === "string") {
    messages.push(anyError.responseBody);
  }

  if (typeof anyError.statusCode === "number") {
    statusCode = anyError.statusCode;
  }

  if (anyError.data && typeof anyError.data === "object") {
    const data = anyError.data as Record<string, unknown>;
    if (data.error && typeof data.error === "object") {
      const providerErr = data.error as Record<string, unknown>;
      if (typeof providerErr.message === "string") {
        messages.push(providerErr.message);
      }
      if (typeof providerErr.code === "string") {
        messages.push(providerErr.code);
      }
      if (typeof providerErr.type === "string") {
        messages.push(providerErr.type);
      }
    }
  }

  if (anyError.cause) {
    const nested = collectErrorSignals(anyError.cause, depth + 1);
    messages.push(...nested.messages);
    if (nested.statusCode !== undefined) {
      statusCode = nested.statusCode;
    }
  }

  if (Array.isArray(anyError.errors)) {
    for (const nestedError of anyError.errors) {
      const nested = collectErrorSignals(nestedError, depth + 1);
      messages.push(...nested.messages);
      if (nested.statusCode !== undefined) {
        statusCode = nested.statusCode;
      }
    }
  }

  return { messages, statusCode };
}

function toUserFacingAIError(error: unknown): Error {
  const { messages, statusCode } = collectErrorSignals(error);
  const signalText = messages.join(" ").toLowerCase();

  if (
    statusCode === 413 ||
    signalText.includes("request too large") ||
    signalText.includes("tokens per minute") ||
    signalText.includes("tpm") ||
    signalText.includes("rate_limit_exceeded")
  ) {
    return new Error(
      "Request is too large for the current model limits. Try /compact, /clear, a shorter prompt, or switch models with /model."
    );
  }

  if (
    signalText.includes("prompt tokens limit exceeded") ||
    signalText.includes("prompt is too long")
  ) {
    return new Error(
      "Prompt exceeds provider token limits. Use /compact, /clear, or start a new planning session."
    );
  }

  if (signalText.includes("rate limit") || signalText.includes("too many requests")) {
    return new Error("Provider rate limit reached. Please wait a few seconds and try again.");
  }

  if (
    statusCode === 429 ||
    signalText.includes("temporarily rate-limited upstream") ||
    signalText.includes("provider returned error")
  ) {
    return new Error("Provider is temporarily rate-limited. Please retry shortly or switch models with /model.");
  }

  if (
    statusCode === 402 ||
    signalText.includes("requires more credits") ||
    signalText.includes("can only afford") ||
    signalText.includes("openrouter.ai/settings/credits")
  ) {
    return new Error(
      "Insufficient OpenRouter credits for this request. Add credits or reduce response size (try /compact or lower max tokens)."
    );
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    signalText.includes("unauthorized") ||
    signalText.includes("invalid api key") ||
    signalText.includes("authentication")
  ) {
    return new Error("Authentication failed for the current provider. Run `agentic config setup` to update credentials.");
  }

  if (
    signalText.includes("network") ||
    signalText.includes("timeout") ||
    signalText.includes("econnreset") ||
    signalText.includes("fetch failed")
  ) {
    return new Error("Network error while contacting the model provider. Please try again.");
  }

  return new Error("Model request failed. Please try again or switch models with /model.");
}

function logVerboseAIError(context: string, error: unknown): void {
  if (process.env.AGENTIC_VERBOSE_ERRORS === "1") {
    console.error(chalk.red(`${context}:`), error);
  }
}

function isModuleNotFoundError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  const message = err?.message || "";
  return err?.code === "ERR_MODULE_NOT_FOUND" || message.includes("Cannot find module");
}

function createProviderModelFactory(
  provider: Provider,
  providerModule: Record<string, unknown>,
  apiKey: string
): (modelId: string) => LanguageModel {
  if (provider.id === "openrouter") {
    const directOpenrouterFn = providerModule.openrouter as ((modelId: string) => LanguageModel) | undefined;
    const createOpenRouter =
      (providerModule.createOpenRouter as ((options: { apiKey: string }) => { chat: (modelId: string) => LanguageModel }) | undefined) ||
      (providerModule.default as ((options: { apiKey: string }) => { chat: (modelId: string) => LanguageModel }) | undefined);

    if (typeof createOpenRouter === "function") {
      const openrouter = createOpenRouter({ apiKey });
      if (!openrouter || typeof openrouter.chat !== "function") {
        throw new Error(`Provider "${provider.id}" did not return a valid chat() model factory`);
      }

      return (modelId: string) => openrouter.chat(modelId);
    }

    if (typeof directOpenrouterFn === "function") {
      return directOpenrouterFn;
    }

    throw new Error(`Provider "${provider.id}" is missing createOpenRouter/openrouter export`);
  }

  const providerFn = (providerModule[provider.id] || providerModule.default || providerModule) as ((modelId: string) => LanguageModel);
  if (typeof providerFn !== "function") {
    throw new Error(`Provider "${provider.id}" is not a function`);
  }

  return providerFn;
}

export class AIService {
  private model: ModelInstance | null = null;
  private initialized = false;
  private modelId: string | null = null;
  private providerId: string | null = null;
  private providerInstance: ((modelId: string) => LanguageModel) | null = null;

  private resolveEffectiveMaxTokens(maxTokensOverride?: number, maxOutputTokensOverride?: number): number | undefined {
    if (typeof maxOutputTokensOverride === "number") {
      return maxOutputTokensOverride;
    }

    if (typeof maxTokensOverride === "number") {
      return maxTokensOverride;
    }

    if (this.providerId === "openrouter") {
      return Math.min(config.maxTokens, OPENROUTER_SAFE_MAX_TOKENS);
    }

    return config.maxTokens;
  }

  private resolveRequestOutputTokenOptions(options: SendMessageOptions): { maxTokens?: number; maxOutputTokens?: number } {
    const resolved = this.resolveEffectiveMaxTokens(
      options.maxTokens as number | undefined,
      options.maxOutputTokens as number | undefined
    );

    if (typeof resolved !== "number") {
      return {};
    }

    // Keep both keys for compatibility across AI SDK/provider adapters.
    return {
      maxTokens: resolved,
      maxOutputTokens: resolved,
    };
  }

  async initialize(modelId: string | null = null): Promise<void> {
    // Get current provider
    const currentProviderId = await config.getCurrentProvider();

    // If provider changed, reinitialize
    if (this.providerId !== currentProviderId) {
      this.initialized = false;
      this.providerInstance = null;
    }

    if (this.initialized && (!modelId || modelId === this.modelId)) return;

    this.providerId = currentProviderId;
    const provider = PROVIDERS[currentProviderId];

    if (!provider) {
      throw new Error(
        `Provider "${currentProviderId}" not found. Run 'agentic config provider set' to configure.`
      );
    }

    // Get API key for the provider
    const apiKey = await config.getProviderApiKey(currentProviderId);
    if (!apiKey) {
      throw new Error(
        `${provider.apiKeyName} is not set. Run 'agentic config setup' to configure.`
      );
    }

    // Set API key in environment
    if (!process.env[provider.apiKeyEnv]) {
      process.env[provider.apiKeyEnv] = apiKey;
    }

    // Initialize provider instance
    if (provider.id === "gateway") {
      // Gateway uses model strings directly - AI SDK handles it automatically
      // when AI_GATEWAY_API_KEY is set
      this.providerInstance = null;
    } else {
      try {
        const providerModule = await import(provider.importPath!);
        this.providerInstance = createProviderModelFactory(
          provider,
          providerModule as Record<string, unknown>,
          apiKey
        );
      } catch (error) {
        if (isModuleNotFoundError(error)) {
          // Try to install the package automatically
          console.log(
            chalk.yellow(
              `\n⚠️  Provider package "${provider.package}" not found.\n` +
              `Installing ${provider.package}...\n`
            )
          );

          try {
            await this.installProviderPackage(provider.package!);
            // Retry import after installation
            const providerModule = await import(provider.importPath!);
            this.providerInstance = createProviderModelFactory(
              provider,
              providerModule as Record<string, unknown>,
              apiKey
            );
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

    // Use provided model or default
    const selectedModel = modelId || config.getModel();

    const customModels = await getCustomModels();

    // OpenRouter supports a very large dynamic model catalog.
    // Do not override user-selected model IDs with a curated fallback.
    if (provider.id === "openrouter" && selectedModel) {
      this.modelId = selectedModel;
    } else {
      // For gateway, validate against AVAILABLE_MODELS + custom models
      // For other providers, validate against PROVIDER_MODELS + provider-scoped custom models
      let modelExists = false;
      if (provider.id === "gateway") {
        modelExists =
          AVAILABLE_MODELS.some((m) => m.id === selectedModel) ||
          customModels.some((m) => m.id === selectedModel);
      } else {
        const providerModels = PROVIDER_MODELS[currentProviderId] || [];
        modelExists =
          providerModels.some((m) => m.id === selectedModel) ||
          customModels.some((m) => m.id === selectedModel && m.provider === currentProviderId);
      }

      if (!modelExists && selectedModel) {
      // Silently use default model - don't warn about unknown models
      // Use first model from provider as default
        if (provider.id === "gateway") {
          this.modelId = config.getModel();
        } else {
          const providerModels = PROVIDER_MODELS[currentProviderId] || [];
          this.modelId = providerModels[0]?.id || selectedModel;
        }
      } else {
        this.modelId = selectedModel;
      }
    }

    // Create model instance
    if (provider.id === "gateway") {
      // Gateway uses model string directly
      this.model = this.modelId;
    } else {
      // Use provider instance to create model
      if (!this.providerInstance) {
        throw new Error(`Provider instance not initialized for ${provider.id}`);
      }
      this.model = this.providerInstance(this.modelId!);
    }

    this.initialized = true;
  }

  /**
   * Send a message and get streaming response
   */
  async sendMessage(
    messages: CoreMessage[],
    onChunk?: (chunk: string) => void,
    tools?: ToolSet,
    onToolCall?: (toolCall: unknown) => void,
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> {
    await this.initialize(options.modelId || null);

    try {
      const { modelId: _modelId, maxSteps: _maxSteps, temperature: overrideTemperature, maxTokens: _maxTokens, maxOutputTokens: _maxOutputTokens, ...passthroughOptions } = options;
      const tokenOptions = this.resolveRequestOutputTokenOptions(options);

      const streamConfig: Record<string, unknown> = {
        model: this.model,
        messages: messages,
        ...passthroughOptions,
        temperature: typeof overrideTemperature === "number" ? overrideTemperature : config.temperature,
        ...tokenOptions,
      };

      // Add tools if provided with maxSteps for multi-step tool calling
      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = options.maxSteps || 10;
        streamConfig.stopWhen = stepCountIs(options.maxSteps || 10);
      }

      const result = streamText(streamConfig as Parameters<typeof streamText>[0]);

      let fullResponse = "";

      // Stream text chunks
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      const fullResult = await result;

      const toolCalls: unknown[] = [];
      const toolResults: unknown[] = [];

      // Collect tool calls from all steps
      if (fullResult.steps && Array.isArray(fullResult.steps)) {
        for (const step of fullResult.steps) {
          if ((step as { toolCalls?: unknown[] }).toolCalls && (step as { toolCalls: unknown[] }).toolCalls.length > 0) {
            for (const toolCall of (step as { toolCalls: unknown[] }).toolCalls) {
              toolCalls.push(toolCall);
              if (onToolCall) {
                onToolCall(toolCall);
              }
            }
          }

          if ((step as { toolResults?: unknown[] }).toolResults && (step as { toolResults: unknown[] }).toolResults.length > 0) {
            toolResults.push(...(step as { toolResults: unknown[] }).toolResults);
          }
        }
      }

      const usage = fullResult.usage && typeof fullResult.usage === 'object' && 'then' in fullResult.usage
        ? await fullResult.usage
        : fullResult.usage;

      const finishReason = fullResult.finishReason && typeof fullResult.finishReason === 'object' && 'then' in fullResult.finishReason
        ? await fullResult.finishReason
        : fullResult.finishReason;

      const steps = fullResult.steps && typeof fullResult.steps === 'object' && 'then' in fullResult.steps
        ? await fullResult.steps
        : fullResult.steps;

      return {
        content: fullResponse,
        finishReason: typeof finishReason === 'string' ? finishReason : null,
        usage: usage && typeof usage === 'object' && !('then' in usage) ? {
          promptTokens: (usage as { promptTokens?: number }).promptTokens,
          completionTokens: (usage as { completionTokens?: number }).completionTokens,
          totalTokens: (usage as { totalTokens?: number }).totalTokens,
        } : undefined,
        toolCalls,
        toolResults,
        steps: Array.isArray(steps) ? steps : [],
      };
    } catch (error) {
      logVerboseAIError("AI Service Error", error);
      throw toUserFacingAIError(error);
    }
  }

  /**
   * Generate text without streaming
   */
  async generateText(
    messages: CoreMessage[],
    tools?: ToolSet,
    options: SendMessageOptions = {}
  ) {
    await this.initialize(options.modelId || null);

    const { modelId: _modelId, maxSteps: _maxSteps, temperature: overrideTemperature, maxTokens: _maxTokens, maxOutputTokens: _maxOutputTokens, ...passthroughOptions } = options;
    const tokenOptions = this.resolveRequestOutputTokenOptions(options);

    const textConfig: Record<string, unknown> = {
      model: this.model,
      messages,
      ...passthroughOptions,
      temperature: typeof overrideTemperature === "number" ? overrideTemperature : config.temperature,
      ...tokenOptions,
    };

    if (tools && Object.keys(tools).length > 0) {
      textConfig.tools = tools;
      textConfig.maxSteps = options.maxSteps || 10;
      textConfig.stopWhen = stepCountIs(options.maxSteps || 10);
    }

    try {
      return await generateText(textConfig as Parameters<typeof generateText>[0]);
    } catch (error) {
      logVerboseAIError("Text Generation Error", error);
      throw toUserFacingAIError(error);
    }
  }

  /**
   * Generate structured output using a Zod schema
   */
  async generateStructured<T extends z.ZodType>(
    schema: T,
    prompt: string | CoreMessage[],
    options: SendMessageOptions = {}
  ): Promise<z.infer<T>> {
    await this.initialize(options.modelId || null);

    try {
      const { modelId: _modelId, maxSteps: _maxSteps, temperature: _temperature, maxTokens: _maxTokens, maxOutputTokens: _maxOutputTokens, ...passthroughOptions } = options;
      const tokenOptions = this.resolveRequestOutputTokenOptions(options);

      const result = await generateObject({
        model: this.model!,
        schema: schema,
        prompt: prompt,
        ...passthroughOptions,
        ...tokenOptions,
      });

      return result.object as z.infer<T>;
    } catch (error) {
      logVerboseAIError("Structured Generation Error", error);
      throw toUserFacingAIError(error);
    }
  }

  /**
   * Install provider package using bun add
   * For AI SDK 5 compatibility, installs @ai-sdk/* packages at version 2.0.0 or later
   */
  async installProviderPackage(packageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // For @ai-sdk packages, ensure we install v2.0.0+ for AI SDK 5 compatibility
      const installCommand: string[] = ["add"];
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

  /**
   * Get current model ID
   */
  getModelId(): string {
    return this.modelId || config.getModel();
  }

  /**
   * Set model
   */
  async setModel(modelId: string): Promise<void> {
    this.initialized = false;
    this.modelId = null;
    await this.initialize(modelId);
  }
}

export const aiService = new AIService();
