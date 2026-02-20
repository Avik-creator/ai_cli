import { join } from "path";
import type { Model } from "./providers.js";
import { JsonStore } from "../utils/json-store.ts";

const MODELS_FILE = "custom-models.json";

const modelStore = new JsonStore<Model[]>(MODELS_FILE);

modelStore.getDefaultValue = () => [];

export async function getCustomModels(): Promise<Model[]> {
  const models = await modelStore.get();
  return models || [];
}

export async function addCustomModel(model: Model): Promise<void> {
  const models = await getCustomModels();
  const exists = models.some((m) => m.id === model.id);
  if (exists) {
    throw new Error(`Model "${model.id}" already exists`);
  }
  models.push(model);
  await modelStore.save(models);
}

export async function removeCustomModel(modelId: string): Promise<void> {
  const models = await getCustomModels();
  const filtered = models.filter((m) => m.id !== modelId);
  await modelStore.save(filtered);
}

export async function listCustomModels(): Promise<Model[]> {
  return getCustomModels();
}

export { MODELS_FILE };
