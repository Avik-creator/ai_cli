import dotenv from "dotenv";
import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";

dotenv.config();

const CONFIG_DIR = join(homedir(), ".agentic-cli");
const KEYS_FILE = join(CONFIG_DIR, "api-keys.json");

/**
 * Ensure config directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Get stored API keys
 */
export async function getStoredKeys() {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(KEYS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Store API key
 */
export async function storeApiKey(name, value) {
  await ensureConfigDir();
  const keys = await getStoredKeys();
  keys[name] = value;
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), "utf-8");
}

/**
 * Get API key (from env or stored)
 */
export async function getApiKey(name) {
  // First check environment variables
  const envKey = process.env[name];
  if (envKey) return envKey;

  // Then check stored keys
  const storedKeys = await getStoredKeys();
  return storedKeys[name];
}

/**
 * Available models from Vercel AI Gateway
 */
export const AVAILABLE_MODELS = [
  { id: "xai/grok-code-fast-1", name: "Grok Code Fast 1", provider: "xai" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "minimax/minimax-m2", name: "Minimax M2", provider: "minimax" },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview", provider: "google" },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "anthropic" },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
  { id: "xai/grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning", provider: "xai" },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "anthropic" },
  { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "openai" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic" },
  { id: "openai/gpt-5", name: "GPT-5", provider: "openai" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "openai/gpt-5-chat", name: "GPT-5 Chat", provider: "openai" },
  { id: "openai/gpt-5-codex", name: "GPT-5 Codex", provider: "openai" },
  { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "moonshotai" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano", provider: "openai" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "deepseek" },
  { id: "xai/grok-4.1-fast-non-reasoning", name: "Grok 4.1 Fast Non-Reasoning", provider: "xai" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "deepseek/deepseek-v3.2-thinking", name: "DeepSeek V3.2 Thinking", provider: "deepseek" },
  { id: "google/gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "google" },
  { id: "openai/gpt-5.1-instant", name: "GPT-5.1 Instant", provider: "openai" },
  { id: "xai/grok-4-fast-non-reasoning", name: "Grok 4 Fast Non-Reasoning", provider: "xai" },
  { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google" },
  { id: "openai/gpt-oss-safeguard-20b", name: "GPT OSS Safeguard 20B", provider: "openai" },
  { id: "openai/gpt-5.1-thinking", name: "GPT-5.1 Thinking", provider: "openai" },
  { id: "openai/text-embedding-3-small", name: "Text Embedding 3 Small", provider: "openai" },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", provider: "openai" },
  { id: "xai/grok-4.1-fast-reasoning", name: "Grok 4.1 Fast Reasoning", provider: "xai" },
  { id: "zai/glm-4.6", name: "GLM 4.6", provider: "zai" },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", provider: "anthropic" },
  { id: "openai/gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai" },
  { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "xai/grok-4", name: "Grok 4", provider: "xai" },
  { id: "google/gemini-3-pro-image", name: "Gemini 3 Pro Image", provider: "google" },
  { id: "mistral/mistral-embed", name: "Mistral Embed", provider: "mistral" },
  { id: "openai/o4-mini", name: "O4 Mini", provider: "openai" },
  { id: "openai/gpt-5.1-codex", name: "GPT-5.1 Codex", provider: "openai" },
  { id: "google/gemini-2.5-flash-preview-09-2025", name: "Gemini 2.5 Flash Preview", provider: "google" },
  { id: "google/gemini-2.5-flash-image-preview", name: "Gemini 2.5 Flash Image Preview", provider: "google" },
  { id: "perplexity/sonar", name: "Sonar", provider: "perplexity" },
  { id: "moonshotai/kimi-k2-turbo", name: "Kimi K2 Turbo", provider: "moonshotai" },
  { id: "perplexity/sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "perplexity" },
  { id: "google/gemini-embedding-001", name: "Gemini Embedding 001", provider: "google" },
  { id: "google/gemini-2.5-flash-lite-preview-09-2025", name: "Gemini 2.5 Flash Lite Preview", provider: "google" },
  { id: "openai/gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", provider: "openai" },
  { id: "amazon/nova-lite", name: "Nova Lite", provider: "amazon" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", provider: "openai" },
  { id: "alibaba/qwen3-max", name: "Qwen3 Max", provider: "alibaba" },
  { id: "meta/llama-3.3-70b", name: "Llama 3.3 70B", provider: "meta" },
  { id: "stealth/sonoma-sky-alpha", name: "Sonoma Sky Alpha", provider: "stealth" },
  { id: "moonshotai/kimi-k2-0905", name: "Kimi K2 0905", provider: "moonshotai" },
  { id: "openai/text-embedding-3-large", name: "Text Embedding 3 Large", provider: "openai" },
  { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", provider: "google" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "deepseek" },
  { id: "xai/grok-2", name: "Grok 2", provider: "xai" },
  { id: "openai/o3", name: "O3", provider: "openai" },
  { id: "alibaba/qwen-3-30b", name: "Qwen 3 30B", provider: "alibaba" },
  { id: "moonshotai/kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo", provider: "moonshotai" },
  { id: "xai/grok-3-fast", name: "Grok 3 Fast", provider: "xai" },
  { id: "meta/llama-3.1-8b", name: "Llama 3.1 8B", provider: "meta" },
  { id: "anthropic/claude-opus-4", name: "Claude Opus 4", provider: "anthropic" },
  { id: "deepseek/deepseek-v3.1-terminus", name: "DeepSeek V3.1 Terminus", provider: "deepseek" },
  { id: "deepseek/deepseek-v3", name: "DeepSeek V3", provider: "deepseek" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "meta/llama-4-scout", name: "Llama 4 Scout", provider: "meta" },
  { id: "mistral/pixtral-12b", name: "Pixtral 12B", provider: "mistral" },
  { id: "alibaba/qwen-3-32b", name: "Qwen 3 32B", provider: "alibaba" },
  { id: "openai/gpt-5.2-chat", name: "GPT-5.2 Chat", provider: "openai" },
  { id: "perplexity/sonar-pro", name: "Sonar Pro", provider: "perplexity" },
  { id: "alibaba/qwen3-next-80b-a3b-instruct", name: "Qwen3 Next 80B A3B Instruct", provider: "alibaba" },
  { id: "mistral/mistral-large", name: "Mistral Large", provider: "mistral" },
  { id: "moonshotai/kimi-k2", name: "Kimi K2", provider: "moonshotai" },
  { id: "meituan/longcat-flash-chat", name: "Longcat Flash Chat", provider: "meituan" },
  { id: "mistral/mistral-small", name: "Mistral Small", provider: "mistral" },
  { id: "xai/grok-2-vision", name: "Grok 2 Vision", provider: "xai" },
  { id: "alibaba/qwen3-235b-a22b-thinking", name: "Qwen3 235B A22B Thinking", provider: "alibaba" },
  { id: "openai/gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "openai" },
  { id: "alibaba/qwen3-next-80b-a3b-thinking", name: "Qwen3 Next 80B A3B Thinking", provider: "alibaba" },
  { id: "deepseek/deepseek-v3.1", name: "DeepSeek V3.1", provider: "deepseek" },
  { id: "alibaba/qwen-3-235b", name: "Qwen 3 235B", provider: "alibaba" },
  { id: "mistral/devstral-small", name: "Devstral Small", provider: "mistral" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "xai/grok-3-mini", name: "Grok 3 Mini", provider: "xai" },
  { id: "mistral/devstral-2", name: "Devstral 2", provider: "mistral" },
  { id: "mistral/ministral-8b", name: "Ministral 8B", provider: "mistral" },
  { id: "openai/o1", name: "O1", provider: "openai" },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "anthropic" },
  { id: "amazon/nova-micro", name: "Nova Micro", provider: "amazon" },
  { id: "openai/text-embedding-ada-002", name: "Text Embedding Ada 002", provider: "openai" },
  { id: "mistral/mistral-medium", name: "Mistral Medium", provider: "mistral" },
  { id: "mistral/ministral-14b", name: "Ministral 14B", provider: "mistral" },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", provider: "anthropic" },
  { id: "mistral/codestral", name: "Codestral", provider: "mistral" },
  { id: "zai/glm-4.6v-flash", name: "GLM 4.6V Flash", provider: "zai" },
  { id: "openai/gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
  { id: "alibaba/qwen3-vl-instruct", name: "Qwen3 VL Instruct", provider: "alibaba" },
  { id: "deepseek/deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale", provider: "deepseek" },
  { id: "cohere/embed-v4.0", name: "Embed V4.0", provider: "cohere" },
  { id: "mistral/mistral-large-3", name: "Mistral Large 3", provider: "mistral" },
  { id: "meta/llama-4-maverick", name: "Llama 4 Maverick", provider: "meta" },
  { id: "alibaba/qwen3-coder-plus", name: "Qwen3 Coder Plus", provider: "alibaba" },
  { id: "zai/glm-4.5", name: "GLM 4.5", provider: "zai" },
  { id: "openai/gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" },
  { id: "google/text-embedding-005", name: "Text Embedding 005", provider: "google" },
  { id: "mistral/magistral-small", name: "Magistral Small", provider: "mistral" },
  { id: "alibaba/qwen3-coder-30b-a3b", name: "Qwen3 Coder 30B A3B", provider: "alibaba" },
  { id: "xai/grok-3", name: "Grok 3", provider: "xai" },
  { id: "zai/glm-4.6v", name: "GLM 4.6V", provider: "zai" },
  { id: "voyage/voyage-3.5", name: "Voyage 3.5", provider: "voyage" },
  { id: "stealth/sonoma-dusk-alpha", name: "Sonoma Dusk Alpha", provider: "stealth" },
  { id: "arcee-ai/trinity-mini", name: "Trinity Mini", provider: "arcee-ai" },
  { id: "vercel/v0-1.5-md", name: "V0 1.5 MD", provider: "vercel" },
  { id: "zai/glm-4.5-air", name: "GLM 4.5 Air", provider: "zai" },
  { id: "amazon/nova-2-lite", name: "Nova 2 Lite", provider: "amazon" },
  { id: "alibaba/qwen3-embedding-8b", name: "Qwen3 Embedding 8B", provider: "alibaba" },
  { id: "voyage/voyage-3-large", name: "Voyage 3 Large", provider: "voyage" },
  { id: "prime-intellect/intellect-3", name: "Intellect 3", provider: "prime-intellect" },
  { id: "xai/grok-3-mini-fast", name: "Grok 3 Mini Fast", provider: "xai" },
  { id: "alibaba/qwen-3-14b", name: "Qwen 3 14B", provider: "alibaba" },
  { id: "openai/o3-mini", name: "O3 Mini", provider: "openai" },
  { id: "mistral/devstral-small-2", name: "Devstral Small 2", provider: "mistral" },
  { id: "vercel/v0-1.0-md", name: "V0 1.0 MD", provider: "vercel" },
  { id: "alibaba/qwen3-coder", name: "Qwen3 Coder", provider: "alibaba" },
  { id: "alibaba/qwen3-embedding-4b", name: "Qwen3 Embedding 4B", provider: "alibaba" },
  { id: "mistral/pixtral-large", name: "Pixtral Large", provider: "mistral" },
  { id: "amazon/titan-embed-text-v2", name: "Titan Embed Text V2", provider: "amazon" },
  { id: "mistral/magistral-medium", name: "Magistral Medium", provider: "mistral" },
  { id: "K/kat-coder-pro-v1", name: "Kat Coder Pro V1", provider: "K" },
  { id: "meta/llama-3.1-70b", name: "Llama 3.1 70B", provider: "meta" },
  { id: "anthropic/claude-3.5-sonnet-20240620", name: "Claude 3.5 Sonnet (20240620)", provider: "anthropic" },
  { id: "meta/llama-3.2-11b", name: "Llama 3.2 11B", provider: "meta" },
  { id: "openai/gpt-5-pro", name: "GPT-5 Pro", provider: "openai" },
  { id: "zai/glm-4.5v", name: "GLM 4.5V", provider: "zai" },
  { id: "morph/morph-v3-fast", name: "Morph V3 Fast", provider: "morph" },
  { id: "google/text-multilingual-embedding-002", name: "Text Multilingual Embedding 002", provider: "google" },
  { id: "meta/llama-3.2-90b", name: "Llama 3.2 90B", provider: "meta" },
  { id: "alibaba/qwen3-max-preview", name: "Qwen3 Max Preview", provider: "alibaba" },
  { id: "voyage/voyage-3.5-lite", name: "Voyage 3.5 Lite", provider: "voyage" },
  { id: "alibaba/qwen3-embedding-0.6b", name: "Qwen3 Embedding 0.6B", provider: "alibaba" },
  { id: "cohere/command-a", name: "Command A", provider: "cohere" },
  { id: "bfl/flux-pro-1.1", name: "Flux Pro 1.1", provider: "bfl" },
  { id: "google/imagen-4.0-generate-001", name: "Imagen 4.0 Generate 001", provider: "google" },
  { id: "google/imagen-4.0-fast-generate-001", name: "Imagen 4.0 Fast Generate 001", provider: "google" },
  { id: "bfl/flux-kontext-max", name: "Flux Kontext Max", provider: "bfl" },
  { id: "meituan/longcat-flash-thinking", name: "Longcat Flash Thinking", provider: "meituan" },
  { id: "bfl/flux-kontext-pro", name: "Flux Kontext Pro", provider: "bfl" },
  { id: "bfl/flux-pro-1.1-ultra", name: "Flux Pro 1.1 Ultra", provider: "bfl" },
  { id: "google/imagen-4.0-ultra-generate-001", name: "Imagen 4.0 Ultra Generate 001", provider: "google" },
  { id: "bfl/flux-2-pro", name: "Flux 2 Pro", provider: "bfl" },
  { id: "openai/o3-deep-research", name: "O3 Deep Research", provider: "openai" },
  { id: "amazon/nova-pro", name: "Nova Pro", provider: "amazon" },
  { id: "bfl/flux-pro-1.0-fill", name: "Flux Pro 1.0 Fill", provider: "bfl" },
  { id: "bfl/flux-2-flex", name: "Flux 2 Flex", provider: "bfl" },
  { id: "inception/mercury-coder-small", name: "Mercury Coder Small", provider: "inception" },
  { id: "meta/llama-3.2-1b", name: "Llama 3.2 1B", provider: "meta" },
  { id: "meta/llama-3.2-3b", name: "Llama 3.2 3B", provider: "meta" },
  { id: "mistral/codestral-embed", name: "Codestral Embed", provider: "mistral" },
  { id: "mistral/mistral-nemo", name: "Mistral Nemo", provider: "mistral" },
  { id: "mistral/mixtral-8x22b-instruct", name: "Mixtral 8x22B Instruct", provider: "mistral" },
  { id: "morph/morph-v3-large", name: "Morph V3 Large", provider: "morph" },
  { id: "N/nemotron-nano-12b-v2-vl", name: "Nemotron Nano 12B V2 VL", provider: "N" },
  { id: "N/nemotron-nano-9b-v2", name: "Nemotron Nano 9B V2", provider: "N" },
  { id: "openai/codex-mini", name: "Codex Mini", provider: "openai" },
  { id: "openai/gpt-3.5-turbo-instruct", name: "GPT-3.5 Turbo Instruct", provider: "openai" },
  { id: "openai/o3-pro", name: "O3 Pro", provider: "openai" },
  { id: "perplexity/sonar-reasoning", name: "Sonar Reasoning", provider: "perplexity" },
  { id: "voyage/voyage-code-2", name: "Voyage Code 2", provider: "voyage" },
  { id: "voyage/voyage-code-3", name: "Voyage Code 3", provider: "voyage" },
  { id: "voyage/voyage-finance-2", name: "Voyage Finance 2", provider: "voyage" },
  { id: "voyage/voyage-law-2", name: "Voyage Law 2", provider: "voyage" },
];

/**
 * Get model by ID
 */
export function getModelById(id) {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider) {
  return AVAILABLE_MODELS.filter((m) => m.provider === provider);
}

/**
 * Get current provider
 */
export async function getCurrentProvider() {
  const stored = await getApiKey("AGENTICAI_PROVIDER");
  return stored || process.env.AGENTICAI_PROVIDER || "gateway";
}

/**
 * Set current provider
 */
export async function setCurrentProvider(providerId) {
  await storeApiKey("AGENTICAI_PROVIDER", providerId);
}

/**
 * Get API key for a provider
 */
export async function getProviderApiKey(providerId) {
  const { PROVIDERS } = await import("./providers.js");
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  return await getApiKey(provider.apiKeyName);
}

/**
 * Config object with lazy key loading
 */
export const config = {
  async getCurrentProvider() {
    return await getCurrentProvider();
  },
  async getGatewayApiKey() {
    return await getApiKey("AI_GATEWAY_API_KEY");
  },
  async getProviderApiKey(providerId) {
    return await getProviderApiKey(providerId);
  },
  async getExaApiKey() {
    return await getApiKey("EXA_API_KEY");
  },
  async getGitHubToken() {
    return await getApiKey("GITHUB_TOKEN");
  },
  getModel() {
    return process.env.AGENTICAI_MODEL || "openai/gpt-5-mini";
  },
  async setModel(modelId) {
    // Update environment variable for current session
    process.env.AGENTICAI_MODEL = modelId;

    // Try to persist to .env file in current directory
    try {
      const envPath = join(process.cwd(), ".env");
      let envContent = "";

      try {
        envContent = await fs.readFile(envPath, "utf-8");
      } catch {
        // .env file doesn't exist, create it
      }

      // Update or add AGENTICAI_MODEL
      const lines = envContent.split("\n");
      let found = false;
      const updatedLines = lines.map((line) => {
        if (line.startsWith("AGENTICAI_MODEL=")) {
          found = true;
          return `AGENTICAI_MODEL=${modelId}`;
        }
        return line;
      });

      if (!found) {
        updatedLines.push(`AGENTICAI_MODEL=${modelId}`);
      }

      await fs.writeFile(envPath, updatedLines.join("\n") + "\n", "utf-8");
    } catch (error) {
      // Silently fail if we can't write to .env (e.g., permissions)
      // The environment variable is still set for the current session
    }
  },
  temperature: 0.7,
  maxTokens: 8192,
};

export { CONFIG_DIR, KEYS_FILE };

