import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";
import type { Model } from "./providers.js";

const CONFIG_DIR = join(homedir(), ".agentic-cli");
const MODELS_FILE = join(CONFIG_DIR, "custom-models.json");

async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
  }
}

export async function getCustomModels(): Promise<Model[]> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(MODELS_FILE, "utf-8");
    return JSON.parse(data) as Model[];
  } catch {
    return [];
  }
}

export async function addCustomModel(model: Model): Promise<void> {
  const models = await getCustomModels();
  const exists = models.some((m) => m.id === model.id);
  if (exists) {
    throw new Error(`Model "${model.id}" already exists`);
  }
  models.push(model);
  await fs.writeFile(MODELS_FILE, JSON.stringify(models, null, 2), "utf-8");
}

export async function removeCustomModel(modelId: string): Promise<void> {
  const models = await getCustomModels();
  const filtered = models.filter((m) => m.id !== modelId);
  await fs.writeFile(MODELS_FILE, JSON.stringify(filtered, null, 2), "utf-8");
}

export async function listCustomModels(): Promise<Model[]> {
  return getCustomModels();
}

export { MODELS_FILE, CONFIG_DIR };
