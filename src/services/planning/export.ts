import { writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import boxen from "boxen";
import { specStorage, type SpecItem } from "./spec-storage.js";

function formatPlanAsMarkdown(spec: SpecItem): string {
  let md = `# ${spec.title}\n\n`;
  
  md += `**Status:** ${spec.status.toUpperCase()}\n`;
  md += `**Created:** ${new Date(spec.createdAt).toLocaleString()}\n`;
  md += `**Updated:** ${new Date(spec.updatedAt).toLocaleString()}\n\n`;
  
  md += `## Goal\n\n${spec.goal}\n\n`;
  
  if (spec.description) {
    md += `## Description\n\n${spec.description}\n\n`;
  }
  
  if (spec.inScope.length > 0) {
    md += `## In Scope\n\n`;
    for (const item of spec.inScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }
  
  if (spec.outOfScope.length > 0) {
    md += `## Out of Scope\n\n`;
    for (const item of spec.outOfScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }
  
  if (spec.fileBoundaries.length > 0) {
    md += `## File Boundaries\n\n`;
    for (const boundary of spec.fileBoundaries) {
      md += `- \`${boundary}\`\n`;
    }
    md += "\n";
  }
  
  if (spec.acceptanceCriteria.length > 0) {
    md += `## Acceptance Criteria\n\n`;
    for (let i = 1; i <= spec.acceptanceCriteria.length; i++) {
      md += `${i}. [ ] ${spec.acceptanceCriteria[i - 1]}\n`;
    }
    md += "\n";
  }
  
  if (spec.phases.length > 0) {
    md += `## Phases\n\n`;
    for (const phase of spec.phases) {
      md += `### ${phase.title} (${phase.status})\n\n`;
      md += `${phase.description}\n\n`;
      if (phase.tasks.length > 0) {
        md += `**Tasks:**\n`;
        for (const task of phase.tasks) {
          md += `- [ ] ${task}\n`;
        }
      }
      md += "\n";
    }
  }
  
  return md;
}

function formatPlanAsJSON(spec: SpecItem): string {
  return JSON.stringify(spec, null, 2);
}

function formatAsGitHubIssues(spec: SpecItem): string {
  let output = `# GitHub Issues Export\n\n`;
  output += `---\n\n`;
  
  output += `## Issue: ${spec.title}\n\n`;
  output += `**Goal:** ${spec.goal}\n\n`;
  
  if (spec.description) {
    output += `**Description:**\n${spec.description}\n\n`;
  }
  
  if (spec.acceptanceCriteria.length > 0) {
    output += `**Acceptance Criteria:**\n`;
    for (const criteria of spec.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
    output += "\n";
  }
  
  if (spec.inScope.length > 0) {
    output += `**In Scope:**\n`;
    for (const item of spec.inScope) {
      output += `- ${item}\n`;
    }
    output += "\n";
  }
  
  output += `---\n\n`;
  output += `## Markdown Template\n\n`;
  output += "```markdown\n";
  output += `## ${spec.title}\n\n`;
  output += `### Goal\n${spec.goal}\n\n`;
  
  if (spec.acceptanceCriteria.length > 0) {
    output += `### Acceptance Criteria\n`;
    for (const criteria of spec.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
  }
  output += "```\n";
  
  return output;
}

function formatAsJiraMarkdown(spec: SpecItem): string {
  let output = `h1. ${spec.title}\n\n`;
  
  output += `*Goal:* ${spec.goal}\n\n`;
  
  if (spec.description) {
    output += `||Description||\n|${spec.description}|\n\n`;
  }
  
  if (spec.inScope.length > 0) {
    output += `h2. In Scope\n`;
    for (const item of spec.inScope) {
      output += `* ${item}\n`;
    }
    output += "\n";
  }
  
  if (spec.acceptanceCriteria.length > 0) {
    output += `h2. Acceptance Criteria\n`;
    for (let i = 1; i <= spec.acceptanceCriteria.length; i++) {
      output += `# ${i}. ${spec.acceptanceCriteria[i - 1]}\n`;
    }
    output += "\n";
  }
  
  return output;
}

function formatAsTasks(spec: SpecItem): string {
  let output = `# Task Breakdown for: ${spec.title}\n\n`;
  
  output += `## Overview\n`;
  output += `- Goal: ${spec.goal}\n`;
  output += `- Total Criteria: ${spec.acceptanceCriteria.length}\n`;
  output += `- Phases: ${spec.phases.length}\n\n`;
  
  if (spec.phases.length > 0) {
    output += `## Phases & Tasks\n\n`;
    for (const phase of spec.phases) {
      output += `### ${phase.title} (${phase.status})\n`;
      output += `${phase.description}\n\n`;
      
      if (phase.tasks.length > 0) {
        output += `| Task | Status |\n`;
        output += `|------|--------|\n`;
        for (const task of phase.tasks) {
          const status = phase.status === "completed" ? "✅" : phase.status === "in_progress" ? "🔄" : "⬜";
          output += `| ${task} | ${status} |\n`;
        }
      }
      output += "\n";
    }
  } else {
    output += `## Tasks (from Acceptance Criteria)\n\n`;
    output += `| # | Task | Status |\n`;
    output += `|---|------|--------|\n`;
    for (let i = 1; i <= spec.acceptanceCriteria.length; i++) {
      output += `| ${i} | ${spec.acceptanceCriteria[i - 1]} | ⬜ |\n`;
    }
  }
  
  return output;
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

  printPlanSummary(spec: SpecItem): void {
    console.log(
      boxen(
        chalk.bold.cyan(`${spec.title}\n\n`) +
        chalk.gray(`Goal: ${spec.goal}\n\n`) +
        `${chalk.green("✓")} ${spec.acceptanceCriteria.length} acceptance criteria\n` +
        `${chalk.blue("📁")} ${spec.fileBoundaries.length} file boundaries\n` +
        `${chalk.yellow("🔄")} ${spec.phases.length} phases\n\n` +
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
