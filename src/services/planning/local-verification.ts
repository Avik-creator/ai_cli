import type { SpecItem, VerificationIssue, VerificationPriority } from "./spec-storage.js";
import type { DiffFile } from "./diff-audit.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function verifyLocally(spec: SpecItem, files: DiffFile[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (const criterion of spec.acceptanceCriteria) {
    const keywords = criterion.toLowerCase().split(" ").filter((w) => w.length > 3);
    
    const hasRelatedFile = files.length === 0 || keywords.some((keyword) =>
      files.some((f) => f.path.toLowerCase().includes(keyword))
    );

    if (!hasRelatedFile && spec.inScope.length > 0) {
      issues.push({
        id: generateId(),
        specId: spec.id,
        priority: "major" as VerificationPriority,
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
