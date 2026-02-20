import chalk from "chalk";
import boxen from "boxen";
import { aiService } from "../ai.service.js";
import type { SpecItem, VerificationIssue, VerificationPriority } from "./spec-storage.js";
import type { DiffFile } from "./diff-audit.js";

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

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function formatFilesForPrompt(files: DiffFile[]): string {
  return files
    .map(
      (f) =>
        `- ${f.path} (${f.status}): +${f.additions} -${f.deletions}`
    )
    .join("\n");
}

export async function verifyWithAI(
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
