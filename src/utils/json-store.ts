import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";

const DEFAULT_CONFIG_DIR = join(homedir(), ".agentic-cli");

export class JsonStore<T> {
  private filePath: string;
  private data: T | null = null;
  private initialized: boolean = false;

  constructor(fileName: string, configDir: string = DEFAULT_CONFIG_DIR) {
    this.filePath = join(configDir, fileName);
  }

  private async ensureDir(): Promise<void> {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf("/"));
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
    }
  }

  async load(): Promise<T> {
    if (this.initialized && this.data !== null) {
      return this.data;
    }

    await this.ensureDir();

    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      this.data = JSON.parse(content) as T;
    } catch {
      this.data = null as T;
    }

    this.initialized = true;
    return this.data as T;
  }

  async save(data: T): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    this.data = data;
    this.initialized = true;
  }

  async get(): Promise<T | null> {
    return this.load();
  }

  async set(data: T): Promise<void> {
    await this.save(data);
  }

  async update(updater: (current: T) => T): Promise<T> {
    const current = await this.load();
    const defaultValue = this.getDefaultValue();
    const updated = updater(current || defaultValue);
    await this.save(updated);
    return updated;
  }

  async delete(predicate: (item: T extends (infer U)[] ? U : never) => boolean): Promise<void> {
    const current = await this.load();
    if (!Array.isArray(current)) {
      throw new Error("Delete only works with array stores");
    }
    const filtered = current.filter((item: any) => !predicate(item)) as T;
    await this.save(filtered);
  }

  getDefaultValue(): T {
    return [] as unknown as T;
  }

  getFilePath(): string {
    return this.filePath;
  }
}

export async function ensureConfigDir(configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch {
  }
}
