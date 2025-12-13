/**
 * Provider definitions and configurations
 */

export interface Provider {
  id: string;
  name: string;
  description: string;
  apiKeyName: string;
  apiKeyEnv: string;
  link: string;
  package: string | null;
  importPath: string | null;
  modelPrefix: string;
}

export interface Model {
  id: string;
  name: string;
  provider?: string;
}

export type ProviderId = keyof typeof PROVIDERS;

export const PROVIDERS: Record<string, Provider> = {
  gateway: {
    id: "gateway",
    name: "Vercel AI Gateway",
    description: "Access 100+ models from multiple providers with a single API key",
    apiKeyName: "AI_GATEWAY_API_KEY",
    apiKeyEnv: "AI_GATEWAY_API_KEY",
    link: "https://vercel.com/ai-gateway",
    package: null, // Built into AI SDK
    importPath: null,
    modelPrefix: "", // Models are like "openai/gpt-5-mini"
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5, GPT-4, O-series models",
    apiKeyName: "OPENAI_API_KEY",
    apiKeyEnv: "OPENAI_API_KEY",
    link: "https://platform.openai.com/api-keys",
    package: "@ai-sdk/openai",
    importPath: "@ai-sdk/openai",
    modelPrefix: "", // Models are like "gpt-5"
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Opus, Sonnet, Haiku models",
    apiKeyName: "ANTHROPIC_API_KEY",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    link: "https://console.anthropic.com/settings/keys",
    package: "@ai-sdk/anthropic",
    importPath: "@ai-sdk/anthropic",
    modelPrefix: "", // Models are like "claude-sonnet-4.5"
  },
  google: {
    id: "google",
    name: "Google Generative AI",
    description: "Gemini 2.5, 3.0, Imagen models",
    apiKeyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    link: "https://aistudio.google.com/apikey",
    package: "@ai-sdk/google",
    importPath: "@ai-sdk/google",
    modelPrefix: "", // Models are like "gemini-2.5-flash"
  },
  groq: {
    id: "groq",
    name: "Groq",
    description: "Fast inference for Llama, Mixtral, Gemma models",
    apiKeyName: "GROQ_API_KEY",
    apiKeyEnv: "GROQ_API_KEY",
    link: "https://console.groq.com/keys",
    package: "@ai-sdk/groq",
    importPath: "@ai-sdk/groq",
    modelPrefix: "", // Models are like "llama-3.3-70b-versatile"
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    description: "Mistral Large, Medium, Small models",
    apiKeyName: "MISTRAL_API_KEY",
    apiKeyEnv: "MISTRAL_API_KEY",
    link: "https://console.mistral.ai/api-keys",
    package: "@ai-sdk/mistral",
    importPath: "@ai-sdk/mistral",
    modelPrefix: "", // Models are like "mistral-large-latest"
  },
  xai: {
    id: "xai",
    name: "xAI Grok",
    description: "Grok 4, Grok 3, Grok 2 models",
    apiKeyName: "XAI_API_KEY",
    apiKeyEnv: "XAI_API_KEY",
    link: "https://console.x.ai/api-keys",
    package: "@ai-sdk/xai",
    importPath: "@ai-sdk/xai",
    modelPrefix: "", // Models are like "grok-4"
  },
};

/**
 * Get provider by ID
 */
export function getProvider(providerId: string): Provider | undefined {
  return PROVIDERS[providerId];
}

/**
 * Get all providers
 */
export function getAllProviders(): Provider[] {
  return Object.values(PROVIDERS);
}

/**
 * Default models for each provider
 */
export const PROVIDER_MODELS: Record<string, Model[]> = {
  gateway: [
    { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
    { id: "openai/gpt-5", name: "GPT-5", provider: "openai" },
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    { id: "xai/grok-4", name: "Grok 4", provider: "xai" },
  ],
  openai: [
    { id: "gpt-5-mini", name: "GPT-5 Mini" },
    { id: "gpt-5", name: "GPT-5" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3", name: "O3" },
    { id: "o3-mini", name: "O3 Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
    { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
  ],
  google: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", name: "Gemma2 9B IT" },
    { id: "qwen/qwen3-32b", name: "Qwen 3 32B" },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large" },
    { id: "mistral-medium-latest", name: "Mistral Medium" },
    { id: "mistral-small-latest", name: "Mistral Small" },
    { id: "pixtral-large-latest", name: "Pixtral Large" },
    { id: "magistral-small-2506", name: "Magistral Small" },
  ],
  xai: [
    { id: "grok-4", name: "Grok 4" },
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-fast", name: "Grok 3 Fast" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
    { id: "grok-2", name: "Grok 2" },
  ],
};

