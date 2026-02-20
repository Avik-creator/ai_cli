import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { exportService } from "./export.js";

const SPEC_DIR = ".agentic-plan";

function getSpecDir(): string {
  const specDir = join(process.cwd(), SPEC_DIR);
  if (!existsSync(specDir)) {
    mkdirSync(specDir, { recursive: true });
  }
  return specDir;
}

export type SpecStatus = "draft" | "active" | "completed" | "archived";
export type VerificationPriority = "critical" | "major" | "minor" | "outdated";

export interface SpecItem {
  id: string;
  title: string;
  description: string;
  status: SpecStatus;
  goal: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  fileBoundaries: string[];
  phases: SpecPhase[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecPhase {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  tasks: string[];
}

export interface VerificationIssue {
  id: string;
  specId: string;
  priority: VerificationPriority;
  category: string;
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
  resolved: boolean;
  createdAt: string;
}

function generateId(): string {
  return randomUUID().split("-")[0];
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function loadSpec(filename: string): SpecItem {
  const content = readFileSync(filename, "utf-8");
  return JSON.parse(content) as SpecItem;
}

function saveSpec(spec: SpecItem, filename: string): void {
  writeFileSync(filename, JSON.stringify(spec, null, 2), "utf-8");
}

export const specStorage = {
  listSpecs(): SpecItem[] {
    const specDir = getSpecDir();
    if (!existsSync(specDir)) {
      return [];
    }

    const files = readdirSync(specDir).filter((f) => f.endsWith(".json"));
    const specs: SpecItem[] = [];

    for (const file of files) {
      try {
        const spec = loadSpec(join(specDir, file));
        specs.push(spec);
      } catch {
        // Skip invalid files
      }
    }

    return specs.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getSpec(id: string): SpecItem | null {
    const specDir = getSpecDir();
    const filename = join(specDir, `${id}.json`);

    if (!existsSync(filename)) {
      return null;
    }

    return loadSpec(filename);
  },

  createSpec(data: Partial<SpecItem>): SpecItem {
    const id = generateId();
    const now = getTimestamp();

    const spec: SpecItem = {
      id,
      title: data.title || "Untitled Plan",
      description: data.description || "",
      status: "draft",
      goal: data.goal || "",
      inScope: data.inScope || [],
      outOfScope: data.outOfScope || [],
      acceptanceCriteria: data.acceptanceCriteria || [],
      fileBoundaries: data.fileBoundaries || [],
      phases: data.phases || [],
      createdAt: now,
      updatedAt: now,
    };

    const filename = join(getSpecDir(), `${id}.json`);
    saveSpec(spec, filename);

    exportService.exportTickets(id, "tasks");

    return spec;
  },

  updateSpec(id: string, updates: Partial<SpecItem>): SpecItem | null {
    const spec = this.getSpec(id);
    if (!spec) {
      return null;
    }

    const updated: SpecItem = {
      ...spec,
      ...updates,
      id: spec.id,
      createdAt: spec.createdAt,
      updatedAt: getTimestamp(),
    };

    const filename = join(getSpecDir(), `${id}.json`);
    saveSpec(updated, filename);

    return updated;
  },

  deleteSpec(id: string): boolean {
    const specDir = getSpecDir();
    const filename = join(specDir, `${id}.json`);

    if (!existsSync(filename)) {
      return false;
    }

    unlinkSync(filename);
    return true;
  },

  addPhase(specId: string, phase: Partial<SpecPhase>): SpecPhase | null {
    const spec = this.getSpec(specId);
    if (!spec) {
      return null;
    }

    const newPhase: SpecPhase = {
      id: generateId(),
      title: phase.title || "New Phase",
      description: phase.description || "",
      status: "pending",
      tasks: phase.tasks || [],
    };

    spec.phases.push(newPhase);
    spec.updatedAt = getTimestamp();

    const filename = join(getSpecDir(), `${specId}.json`);
    saveSpec(spec, filename);

    return newPhase;
  },

  updatePhaseStatus(specId: string, phaseId: string, status: SpecPhase["status"]): boolean {
    const spec = this.getSpec(specId);
    if (!spec) {
      return false;
    }

    const phase = spec.phases.find((p) => p.id === phaseId);
    if (!phase) {
      return false;
    }

    phase.status = status;
    spec.updatedAt = getTimestamp();

    const filename = join(getSpecDir(), `${specId}.json`);
    saveSpec(spec, filename);

    return true;
  },

  getSpecDir(): string {
    return SPEC_DIR;
  },
};
