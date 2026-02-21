import { writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import boxen from "boxen";
import { specStorage, type SpecItem, type SpecPhase } from "./spec-storage.js";

interface PlanArtifacts {
  planPath: string;
  ticketsPath: string;
  architecturePath: string;
}

interface ExportView {
  title: string;
  goal: string;
  description: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  fileBoundaries: string[];
  phases: Array<{
    title: string;
    description: string;
    status: SpecPhase["status"];
    tasks: string[];
  }>;
}

const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*m/g;
const TRANSCRIPT_PREFIX_RE = /^\s*(USER|ASSISTANT|SYSTEM|TOOL)\s*:/i;
const CONTROL_LINE_RE = /^\s*(create plan|status|recap|help|exit|\/[a-z0-9-]+)\s*$/i;
const BOX_DRAWING_LINE_RE = /^[\s│┌┐└┘╭╮╰╯─━┃┊┈▏▕◇◆•·]+$/;
const PLANNING_NOISE_RE = /^(quick commands:|commands:|next:|analyzing:|plan created!|planning agreement summary:?)/i;

function clipText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function isLikelyCodeLine(line: string): boolean {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) {
    return false;
  }

  if (["bash", "python", "json", "yaml", "yml", "env", "toml", "sql", "typescript", "javascript"].includes(lower)) {
    return true;
  }
  if (/^[A-Z0-9_]{2,}\s*=/.test(trimmed)) {
    return true;
  }
  if (/^(pip|npm|pnpm|yarn|bun|uvicorn|python3?|node|go|cargo)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(from\s+\S+\s+import|import\s+\S+)/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z_][a-z0-9_\.]*\(.*/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z_][a-z0-9_]*\s*=.+/i.test(trimmed)) {
    return true;
  }
  if (/^(class|def|async def|return|await|if|else|elif|for|while|try|except|raise)\b/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("#")) {
    return true;
  }
  if (trimmed.includes("```")) {
    return true;
  }
  if (/^[(){}[\],.:]+$/.test(trimmed)) {
    return true;
  }
  if (/^@[\w.]+/.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("├──") || trimmed.includes("└──")) {
    return true;
  }
  if (trimmed.includes("Column(") || trimmed.includes("ForeignKey(") || trimmed.includes("__tablename__")) {
    return true;
  }
  if (/[{}();]{3,}/.test(trimmed)) {
    return true;
  }
  return false;
}

function isNoiseLine(line: string): boolean {
  return (
    line.length === 0 ||
    TRANSCRIPT_PREFIX_RE.test(line) ||
    CONTROL_LINE_RE.test(line) ||
    BOX_DRAWING_LINE_RE.test(line) ||
    PLANNING_NOISE_RE.test(line) ||
    line.includes("To continue this session later") ||
    /^wait for the/i.test(line) ||
    /^\d+\.\s+\*\*/.test(line) ||
    line === "---" ||
    line.startsWith("###") ||
    line.startsWith("~") ||
    line.startsWith("┌") ||
    line.startsWith("╭") ||
    line.startsWith("│") ||
    isLikelyCodeLine(line)
  );
}

function sanitizeMultiline(raw: string, maxChars: number): string {
  const cleaned = raw
    .replace(/\r/g, "")
    .replace(ANSI_ESCAPE_RE, "")
    .replace(/```[\s\S]*?```/g, " ");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(TRANSCRIPT_PREFIX_RE, "").trim())
    .filter((line) => !isNoiseLine(line));

  const compact = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return clipText(compact, maxChars);
}

function sanitizeSingleLine(raw: string, maxChars = 180): string {
  const compact = sanitizeMultiline(raw, maxChars * 3).replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  return clipText(compact, maxChars);
}

function sanitizeList(values: string[], fallback: string[] = []): string[] {
  const normalized = values
    .map((value) => sanitizeSingleLine(value))
    .filter((value) => value.length > 0)
    .filter((value) => !CONTROL_LINE_RE.test(value))
    .filter((value) => !PLANNING_NOISE_RE.test(value));

  const unique = Array.from(new Set(normalized)).slice(0, 16);
  return unique.length > 0 ? unique : fallback;
}

function toExportView(spec: SpecItem): ExportView {
  const title = sanitizeSingleLine(spec.title, 90) || "Untitled Plan";
  const goal = sanitizeMultiline(spec.goal || "", 1200) || "No goal provided";
  const description = sanitizeMultiline(spec.description || "", 1200);
  const inScope = sanitizeList(spec.inScope, ["Core application components"]);
  const outOfScope = sanitizeList(spec.outOfScope);
  const acceptanceCriteria = sanitizeList(spec.acceptanceCriteria);
  const fileBoundaries = sanitizeList(spec.fileBoundaries, ["src/**"]);
  const phases = spec.phases
    .map((phase) => ({
      title: sanitizeSingleLine(phase.title, 120) || "Phase",
      description: sanitizeMultiline(phase.description || "", 500),
      status: phase.status,
      tasks: sanitizeList(phase.tasks),
    }))
    .filter((phase) => phase.title.length > 0 || phase.description.length > 0 || phase.tasks.length > 0);

  return {
    title,
    goal,
    description,
    inScope,
    outOfScope,
    acceptanceCriteria,
    fileBoundaries,
    phases,
  };
}

function formatPlanAsMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  let md = `# ${view.title}\n\n`;

  md += `**Status:** ${spec.status.toUpperCase()}\n`;
  md += `**Created:** ${new Date(spec.createdAt).toLocaleString()}\n`;
  md += `**Updated:** ${new Date(spec.updatedAt).toLocaleString()}\n\n`;

  md += `## Goal\n\n${view.goal}\n\n`;

  if (view.description) {
    md += `## Description\n\n${view.description}\n\n`;
  }

  if (view.inScope.length > 0) {
    md += "## In Scope\n\n";
    for (const item of view.inScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }

  if (view.outOfScope.length > 0) {
    md += "## Out of Scope\n\n";
    for (const item of view.outOfScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }

  if (view.fileBoundaries.length > 0) {
    md += "## File Boundaries\n\n";
    for (const boundary of view.fileBoundaries) {
      md += `- \`${boundary}\`\n`;
    }
    md += "\n";
  }

  if (view.acceptanceCriteria.length > 0) {
    md += "## Acceptance Criteria\n\n";
    for (let i = 1; i <= view.acceptanceCriteria.length; i++) {
      md += `${i}. [ ] ${view.acceptanceCriteria[i - 1]}\n`;
    }
    md += "\n";
  }

  if (view.phases.length > 0) {
    md += "## Phases\n\n";
    for (const phase of view.phases) {
      md += `### ${phase.title} (${phase.status})\n\n`;
      if (phase.description) {
        md += `${phase.description}\n\n`;
      }
      if (phase.tasks.length > 0) {
        md += "**Tasks:**\n";
        for (const task of phase.tasks) {
          md += `- [ ] ${task}\n`;
        }
        md += "\n";
      }
    }
  }

  return md;
}

function formatPlanAsJSON(spec: SpecItem): string {
  return JSON.stringify(spec, null, 2);
}

function formatAsGitHubIssues(spec: SpecItem): string {
  const view = toExportView(spec);
  let output = "# GitHub Issues Export\n\n";
  output += "---\n\n";

  output += `## Issue: ${view.title}\n\n`;
  output += `**Goal:** ${view.goal}\n\n`;

  if (view.description) {
    output += `**Description:**\n${view.description}\n\n`;
  }

  if (view.acceptanceCriteria.length > 0) {
    output += "**Acceptance Criteria:**\n";
    for (const criteria of view.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
    output += "\n";
  }

  if (view.inScope.length > 0) {
    output += "**In Scope:**\n";
    for (const item of view.inScope) {
      output += `- ${item}\n`;
    }
    output += "\n";
  }

  output += "---\n\n";
  output += "## Markdown Template\n\n";
  output += "```markdown\n";
  output += `## ${view.title}\n\n`;
  output += `### Goal\n${view.goal}\n\n`;

  if (view.acceptanceCriteria.length > 0) {
    output += "### Acceptance Criteria\n";
    for (const criteria of view.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
  }
  output += "```\n";

  return output;
}

function formatAsJiraMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  let output = `h1. ${view.title}\n\n`;

  output += `*Goal:* ${view.goal}\n\n`;

  if (view.description) {
    output += `||Description||\n|${view.description}|\n\n`;
  }

  if (view.inScope.length > 0) {
    output += "h2. In Scope\n";
    for (const item of view.inScope) {
      output += `* ${item}\n`;
    }
    output += "\n";
  }

  if (view.acceptanceCriteria.length > 0) {
    output += "h2. Acceptance Criteria\n";
    for (let i = 1; i <= view.acceptanceCriteria.length; i++) {
      output += `# ${i}. ${view.acceptanceCriteria[i - 1]}\n`;
    }
    output += "\n";
  }

  return output;
}

function formatAsTasks(spec: SpecItem): string {
  const view = toExportView(spec);
  let output = `# Task Breakdown for: ${view.title}\n\n`;

  output += "## Overview\n";
  output += `- Goal: ${view.goal}\n`;
  output += `- Total Criteria: ${view.acceptanceCriteria.length}\n`;
  output += `- Phases: ${view.phases.length}\n\n`;

  if (view.phases.length > 0) {
    output += "## Phases & Tasks\n\n";
    for (const phase of view.phases) {
      output += `### ${phase.title} (${phase.status})\n`;
      if (phase.description) {
        output += `${phase.description}\n\n`;
      }

      if (phase.tasks.length > 0) {
        output += "| Task | Status |\n";
        output += "|------|--------|\n";
        for (const task of phase.tasks) {
          const status = phase.status === "completed" ? "✅" : phase.status === "in_progress" ? "🔄" : "⬜";
          output += `| ${task} | ${status} |\n`;
        }
      }
      output += "\n";
    }
  } else {
    output += "## Tasks (from Acceptance Criteria)\n\n";
    output += "| # | Task | Status |\n";
    output += "|---|------|--------|\n";
    for (let i = 1; i <= view.acceptanceCriteria.length; i++) {
      output += `| ${i} | ${view.acceptanceCriteria[i - 1]} | ⬜ |\n`;
    }
  }

  return output;
}

function formatArchitectureAsMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  const components = view.inScope.length > 0
    ? view.inScope.map((item) => `- ${item}`).join("\n")
    : "- Core application components";

  const boundaries = view.fileBoundaries.length > 0
    ? view.fileBoundaries.map((boundary) => `- \`${boundary}\``).join("\n")
    : "- `src/**`";

  return `# ${view.title} - Architecture

## In-Scope Components
${components}

## File Boundaries
${boundaries}

## Diagram
\`\`\`mermaid
flowchart TD
    user["Developer"] --> cli["agentic CLI"]
    cli --> spec["Spec Contract"]
    spec --> exec["Execution Layer"]
    exec --> diff["Git Diff Audit"]
    diff --> gate["Drift Gate"]
    gate --> commit["Confirmed Commit"]
\`\`\`

---
Generated: ${new Date().toISOString()}
`;
}

export const exportService = {
  exportPlan(
    specId: string,
    format: "markdown" | "json",
    outputPath?: string
  ): boolean {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return false;
    }

    let content: string;
    let extension: string;

    if (format === "markdown") {
      content = formatPlanAsMarkdown(spec);
      extension = "md";
    } else {
      content = formatPlanAsJSON(spec);
      extension = "json";
    }

    if (outputPath) {
      writeFileSync(outputPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported to: ${outputPath}`));
    } else {
      const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}.${extension}`);
      writeFileSync(defaultPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported to: ${defaultPath}`));
    }

    return true;
  },

  exportTickets(
    specId: string,
    format: "github" | "jira" | "tasks",
    outputPath?: string
  ): boolean {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return false;
    }

    let content: string;
    let extension: string;

    switch (format) {
      case "github":
        content = formatAsGitHubIssues(spec);
        extension = "md";
        break;
      case "jira":
        content = formatAsJiraMarkdown(spec);
        extension = "md";
        break;
      case "tasks":
        content = formatAsTasks(spec);
        extension = "md";
        break;
      default:
        content = formatAsTasks(spec);
        extension = "md";
    }

    if (outputPath) {
      writeFileSync(outputPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported tickets to: ${outputPath}`));
    } else {
      const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}-tickets.${extension}`);
      writeFileSync(defaultPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported tickets to: ${defaultPath}`));
    }

    return true;
  },

  exportArchitecture(specId: string, outputPath?: string): string | null {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return null;
    }

    const content = formatArchitectureAsMarkdown(spec);
    const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}-architecture.md`);
    const targetPath = outputPath || defaultPath;
    writeFileSync(targetPath, content, "utf-8");
    console.log(chalk.green(`✓ Exported architecture to: ${targetPath}`));
    return targetPath;
  },

  exportArtifacts(specId: string): PlanArtifacts | null {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return null;
    }

    const baseDir = join(process.cwd(), specStorage.getSpecDir());
    const planPath = join(baseDir, `${spec.id}.md`);
    const ticketsPath = join(baseDir, `${spec.id}-tickets.md`);
    const architecturePath = join(baseDir, `${spec.id}-architecture.md`);

    this.exportPlan(specId, "markdown", planPath);
    this.exportTickets(specId, "tasks", ticketsPath);
    this.exportArchitecture(specId, architecturePath);

    return { planPath, ticketsPath, architecturePath };
  },

  printPlanSummary(spec: SpecItem): void {
    const view = toExportView(spec);
    console.log(
      boxen(
        chalk.bold.cyan(`${view.title}\n\n`) +
        chalk.gray(`Goal: ${clipText(view.goal, 220)}\n\n`) +
        `${chalk.green("✓")} ${view.acceptanceCriteria.length} acceptance criteria\n` +
        `${chalk.blue("📁")} ${view.fileBoundaries.length} file boundaries\n` +
        `${chalk.yellow("🔄")} ${view.phases.length} phases\n\n` +
        chalk.gray(`ID: ${spec.id}`),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "cyan",
        }
      )
    );
  },
};
