import { streamText, generateObject, generateText, stepCountIs, gateway } from "ai";
import { config, AVAILABLE_MODELS } from "../config/env.js";
import { PROVIDERS, PROVIDER_MODELS } from "../config/providers.js";
import chalk from "chalk";

export class AIService {
  constructor() {
    this.model = null;
    this.initialized = false;
    this.modelId = null;
    this.providerId = null;
    this.providerInstance = null;
  }

  async initialize(modelId = null) {
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
      // Gateway uses model strings directly
      this.providerInstance = null; // Gateway is handled by AI SDK automatically
    } else {
      // Load provider dynamically
      try {
        const providerModule = await import(provider.importPath);
        const providerFn = providerModule[provider.id] || providerModule.default;
        this.providerInstance = providerFn;
      } catch (error) {
        throw new Error(
          `Provider package "${provider.package}" not installed. Run: bun add ${provider.package}`
        );
      }
    }

    // Use provided model or default
    const selectedModel = modelId || config.getModel();

    // For gateway, validate against AVAILABLE_MODELS
    // For other providers, validate against PROVIDER_MODELS
    let modelExists = false;
    if (provider.id === "gateway") {
      modelExists = AVAILABLE_MODELS.some((m) => m.id === selectedModel);
    } else {
      const providerModels = PROVIDER_MODELS[currentProviderId] || [];
      modelExists = providerModels.some((m) => m.id === selectedModel);
    }

    if (!modelExists && selectedModel) {
      console.log(
        chalk.yellow(
          `⚠️  Warning: Model "${selectedModel}" not found. Using default for ${provider.name}.`
        )
      );
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

    // Create model instance
    if (provider.id === "gateway") {
      // Gateway uses model string directly
      this.model = this.modelId;
    } else {
      // Use provider instance to create model
      this.model = this.providerInstance(this.modelId);
    }

    this.initialized = true;
  }

  /**
   * Send a message and get streaming response
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @param {Object} tools - Optional tools object
   * @param {Function} onToolCall - Callback for tool calls
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Full response with content, tool calls, and usage
   */
  async sendMessage(
    messages,
    onChunk,
    tools = undefined,
    onToolCall = null,
    options = {}
  ) {
    await this.initialize(options.modelId);

    try {
      const streamConfig = {
        model: this.model,
        messages: messages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        ...options,
      };

      // Add tools if provided with maxSteps for multi-step tool calling
      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = options.maxSteps || 10;
        streamConfig.stopWhen = stepCountIs(options.maxSteps || 10);
      }

      const result = streamText(streamConfig);

      let fullResponse = "";

      // Stream text chunks
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      const fullResult = await result;

      const toolCalls = [];
      const toolResults = [];

      // Collect tool calls from all steps
      if (fullResult.steps && Array.isArray(fullResult.steps)) {
        for (const step of fullResult.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              toolCalls.push(toolCall);
              if (onToolCall) {
                onToolCall(toolCall);
              }
            }
          }

          if (step.toolResults && step.toolResults.length > 0) {
            toolResults.push(...step.toolResults);
          }
        }
      }

      return {
        content: fullResponse,
        finishReason: fullResult.finishReason,
        usage: fullResult.usage,
        toolCalls,
        toolResults,
        steps: fullResult.steps,
      };
    } catch (error) {
      console.error(chalk.red("AI Service Error:"), error.message);
      throw error;
    }
  }

  /**
   * Generate text without streaming
   */
  async generateText(messages, tools = undefined, options = {}) {
    await this.initialize(options.modelId);

    const textConfig = {
      model: this.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      ...options,
    };

    if (tools && Object.keys(tools).length > 0) {
      textConfig.tools = tools;
      textConfig.maxSteps = options.maxSteps || 10;
      textConfig.stopWhen = stepCountIs(options.maxSteps || 10);
    }

    return await generateText(textConfig);
  }

  /**
   * Generate structured output using a Zod schema
   */
  async generateStructured(schema, prompt, options = {}) {
    await this.initialize(options.modelId);

    try {
      const result = await generateObject({
        model: this.model,
        schema: schema,
        prompt: prompt,
        ...options,
      });

      return result.object;
    } catch (error) {
      console.error(chalk.red("Structured Generation Error:"), error.message);
      throw error;
    }
  }

  /**
   * Get current model ID
   */
  getModelId() {
    return this.modelId || config.getModel();
  }

  /**
   * Set model
   */
  async setModel(modelId) {
    this.initialized = false;
    this.modelId = null;
    await this.initialize(modelId);
  }
}

export const aiService = new AIService();

