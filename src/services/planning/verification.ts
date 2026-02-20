import chalk from "chalk";
import boxen from "boxen";
import { aiService } from "../ai.service.js";
import type { SpecItem, VerificationIssue, VerificationPriority } from "./spec-storage.js";
import { diffAudit, type DiffFile, type RiskScore } from "./diff-audit.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const VERIFICATION_PROMPT = `You are a spec verification engine. Analyze the code changes against the specification and identify issues.

## Your Task:
1. Compare the diff against the spec's acceptance criteria
2. Identify what's implemented vs what's missing
3. Categorize issues by severity

## Spec:
- Goal: {goal}
- In Scope: {inScope}
- Out of Scope: {outOfScope}
- Acceptance Criteria: {acceptanceCriteria}

## Changed Files:
{files}

## Your Output Format:
Return a JSON array of issues in this exact format:
[
  {
    "priority": "critical|major|minor",
    "category": "missing_feature|scope_violation|incomplete|incorrect",
    "description": "Clear description of the issue",
    "file": "optional file path",
    "suggestion": "How to fix it"
  }
]

Only return the JSON array, nothing else.`;

function formatFilesForPrompt(files: DiffFile[]): string {
  return files
    .map(
      (f) =>
        `- ${f.path} (${f.status}): +${f.additions} -${f.deletions}`
    )
    .join("\n");
}

async function verifyWithAI(
  spec: SpecItem,
  files: DiffFile[]
): Promise<VerificationIssue[]> {
  const prompt = VERIFICATION_PROMPT
    .replace("{goal}", spec.goal)
    .replace("{inScope}", spec.inScope.join(", "))
    .replace("{outOfScope}", spec.outOfScope.join(", "))
    .replace(
      "{acceptanceCriteria}",
      spec.acceptanceCriteria.map((c) => `- ${c}`).join("\n")
    )
    .replace("{files}", formatFilesForPrompt(files));

  let jsonStr = "";

  await aiService.sendMessage(
    [
      {
        role: "system",
        content: "You are a strict spec verification engine. Return only valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    (chunk) => {
      jsonStr += chunk;
    },
    {},
    undefined,
    { maxSteps: 2 }
  );

  try {
    const startIdx = jsonStr.indexOf("[");
    const endIdx = jsonStr.lastIndexOf("]");
    
    if (startIdx === -1 || endIdx === -1) {
      return [];
    }

    const parsed = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
    
    return parsed.map((p: any) => ({
      id: generateId(),
      specId: spec.id,
      priority: p.priority as VerificationPriority,
      category: p.category,
      description: p.description,
      file: p.file,
      suggestion: p.suggestion,
      resolved: false,
      createdAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

function verifyLocally(spec: SpecItem, files: DiffFile[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  const changedFilePaths = new Set(files.map((f) => f.path));

  for (const criterion of spec.acceptanceCriteria) {
    const keywords = criterion.toLowerCase().split(" ").filter((w) => w.length > 3);
    
    const hasRelatedFile = files.length === 0 || keywords.some((keyword) =>
      files.some((f) => f.path.toLowerCase().includes(keyword))
    );

    if (!hasRelatedFile && spec.inScope.length > 0) {
      issues.push({
        id: generateId(),
        specId: spec.id,
        priority: "major",
        category: "missing_feature",
        description: `Acceptance criterion may not be addressed: ${criterion}`,
        suggestion: "Verify this criterion is addressed in the changes",
        resolved: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return issues;
}

export const verification = {
  async verify(specId: string, useAI: boolean = false): Promise<{
    spec: SpecItem;
    issues: VerificationIssue[];
    risk: RiskScore;
    files: DiffFile[];
  } | null> {
    const { specStorage } = require("./spec-storage.js");
    const spec = specStorage.getSpec(specId);
    
    if (!spec) {
      return null;
    }

    const { files, risk } = diffAudit.auditWithSpec(spec);
    
    let issues: VerificationIssue[] = [];

    if (useAI) {
      issues = await verifyWithAI(spec, files);
    } else {
      issues = verifyLocally(spec, files);
    }

    return { spec, issues, risk, files };
  },

  async verifyCurrentChanges(
    spec: SpecItem,
    useAI: boolean = false
  ): Promise<{
    issues: VerificationIssue[];
    risk: RiskScore;
    files: DiffFile[];
  }> {
    const { files, risk } = diffAudit.auditWithSpec(spec);
    
    let issues: VerificationIssue[] = [];

    if (useAI) {
      issues = await verifyWithAI(spec, files);
    } else {
      issues = verifyLocally(spec, files);
    }

    return { issues, risk, files };
  },

  printVerificationResult(result: {
    issues: VerificationIssue[];
    risk: RiskScore;
    files: DiffFile[];
  }): void {
    console.log(
      boxen(
        `${chalk.bold("📋 Verification Results")}\n\n` +
        `${chalk.bold("Changed Files:")} ${chalk.white(result.files.length)}\n` +
        `${chalk.red("Critical:")} ${chalk.red(result.risk.critical.toString())} ` +
        `${chalk.yellow("Major:")} ${chalk.yellow(result.risk.major.toString())} ` +
        `${chalk.gray("Minor:")} ${chalk.gray(result.risk.minor.toString())}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: result.risk.critical > 0 ? "red" : result.risk.major > 0 ? "yellow" : "green",
        }
      )
    );

    if (result.issues.length > 0) {
      console.log(chalk.bold("\n📝 Issues Found:\n"));

      const grouped = {
        critical: result.issues.filter((i) => i.priority === "critical"),
        major: result.issues.filter((i) => i.priority === "major"),
        minor: result.issues.filter((i) => i.priority === "minor"),
      };

      for (const issue of grouped.critical) {
        console.log(chalk.red(`🔴 [CRITICAL] ${issue.description}`));
        if (issue.file) console.log(chalk.gray(`   File: ${issue.file}`));
        if (issue.suggestion) console.log(chalk.cyan(`   Fix: ${issue.suggestion}`));
        console.log("");
      }

      for (const issue of grouped.major) {
        console.log(chalk.yellow(`🟡 [MAJOR] ${issue.description}`));
        if (issue.file) console.log(chalk.gray(`   File: ${issue.file}`));
        if (issue.suggestion) console.log(chalk.cyan(`   Fix: ${issue.suggestion}`));
        console.log("");
      }

      for (const issue of grouped.minor) {
        console.log(chalk.gray(`⚪ [MINOR] ${issue.description}`));
        console.log("");
      }
    }

    if (result.risk.scopeViolations.length > 0) {
      console.log(chalk.bold("\n⚠️  Scope Violations:\n"));
      for (const v of result.risk.scopeViolations) {
        console.log(
          `${chalk.red("•")} ${v.file}: ${v.description}`
        );
      }
    }

    if (result.risk.riskyPatterns.length > 0) {
      console.log(chalk.bold("\n🚨 Risky Patterns:\n"));
      for (const r of result.risk.riskyPatterns) {
        console.log(
          `${r.severity === "critical" ? chalk.red("🔴") : chalk.yellow("🟡")} ${r.file}: ${r.description}`
        );
      }
    }

    console.log(chalk.gray("─".repeat(60)));
  },
};
