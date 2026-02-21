import { AVAILABLE_MODELS } from "./env.ts";
import { PROVIDER_MODELS } from "./providers.ts";
import { getCustomModels } from "./custom-models.ts";

function defaultGatewayModel(): string {
  return PROVIDER_MODELS.gateway?.[0]?.id || AVAILABLE_MODELS[0]?.id || "openai/gpt-5-mini";
}

function defaultOpenRouterModel(): string {
  return PROVIDER_MODELS.openrouter?.[0]?.id || "openai/gpt-4o-mini";
}

export async function resolveModelForProvider(providerId: string, currentModelId: string): Promise<string> {
  const customModels = await getCustomModels();

  if (providerId === "gateway") {
    const currentIsKnown =
      AVAILABLE_MODELS.some((m) => m.id === currentModelId) ||
      customModels.some((m) => m.id === currentModelId);

    return currentIsKnown ? currentModelId : defaultGatewayModel();
  }

  const providerModels = PROVIDER_MODELS[providerId] || [];
  const customForProvider = customModels.filter((m) => m.provider === providerId);

  if (providerId === "openrouter") {
    const currentInCurated = providerModels.some((m) => m.id === currentModelId);
    const currentInCustom = customForProvider.some((m) => m.id === currentModelId);
    const looksLikeRouterModel = currentModelId.includes("/");

    if (currentInCurated || currentInCustom || looksLikeRouterModel) {
      return currentModelId;
    }

    return providerModels[0]?.id || customForProvider[0]?.id || defaultOpenRouterModel();
  }

  const modelSupported =
    providerModels.some((m) => m.id === currentModelId) ||
    customForProvider.some((m) => m.id === currentModelId);

  if (modelSupported) {
    return currentModelId;
  }

  return providerModels[0]?.id || customForProvider[0]?.id || currentModelId || defaultGatewayModel();
}
