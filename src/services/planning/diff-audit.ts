import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { SpecItem, VerificationPriority } from "./spec-storage.js";

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface ScopeViolation {
  type: "out_of_scope" | "file_boundary" | "unrelated";
  file: string;
  description: string;
  severity: VerificationPriority;
}

export interface RiskScore {
  total: number;
  critical: number;
  major: number;
  minor: number;
  scopeViolations: ScopeViolation[];
  riskyPatterns: RiskyPattern[];
}

export interface RiskyPattern {
  pattern: string;
  file: string;
  description: string;
  severity: VerificationPriority;
}

const RISKY_PATTERNS = [
  { regex: /process\.env\.[A-Z_]+/, description: "Environment variable access", severity: "major" as VerificationPriority },
  { regex: /password|secret|api_key|token/i, description: "Potential secret exposure", severity: "critical" as VerificationPriority },
  { regex: /eval\(|exec\(/, description: "Dynamic code execution", severity: "critical" as VerificationPriority },
  { regex: /SQL|INSERT|UPDATE|DELETE.*FROM/i, description: "Raw SQL query", severity: "major" as VerificationPriority },
  { regex: /migrate|migration/, description: "Database migration", severity: "major" as VerificationPriority },
  { regex: /\.env$|\.env\./, description: ".env file modification", severity: "critical" as VerificationPriority },
  { regex: /auth|login|password|permission/i, description: "Authentication/authorization change", severity: "major" as VerificationPriority },
  { regex: /ssh|key|cert|credential/i, description: "Security-related file", severity: "critical" as VerificationPriority },
];

function getGitDiff(): string {
  try {
    return execSync("git diff --unified=3", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function getGitStatus(): string {
  try {
    return execSync("git status --porcelain", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function parseDiff(diffOutput: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffOutput.split("\n");
  
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git")) {
      if (currentFile) {
        if (currentHunk) {
          currentHunk.content = hunkContent.join("\n");
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      const path = match ? match[2] : "";

      currentFile = {
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      hunkContent = [];
    } else if (line.startsWith("new file")) {
      if (currentFile) currentFile.status = "added";
    } else if (line.startsWith("deleted file")) {
      if (currentFile) currentFile.status = "deleted";
    } else if (line.startsWith("rename from")) {
      if (currentFile) currentFile.status = "renamed";
    } else if (line.startsWith("@@")) {
      if (currentHunk && currentFile) {
        currentHunk.content = hunkContent.join("\n");
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2]) || 1,
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4]) || 1,
          content: "",
        };
        hunkContent = [];
      }
    } else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      hunkContent.push(line);
      if (currentFile) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentFile.additions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentFile.deletions++;
        }
      }
    }
  }

  if (currentFile) {
    if (currentHunk) {
      currentHunk.content = hunkContent.join("\n");
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

function checkScopeViolations(diffFiles: DiffFile[], spec: SpecItem): ScopeViolation[] {
  const violations: ScopeViolation[] = [];

  for (const file of diffFiles) {
    const isInScope = spec.fileBoundaries.length === 0 || 
      spec.fileBoundaries.some((boundary) => file.path.includes(boundary));

    const isOutOfScope = spec.outOfScope.some((boundary) => file.path.includes(boundary));

    if (spec.fileBoundaries.length > 0 && !isInScope && !isOutOfScope) {
      violations.push({
        type: "file_boundary",
        file: file.path,
        description: `File is outside specified file boundaries: ${spec.fileBoundaries.join(", ")}`,
        severity: "major",
      });
    }

    if (isOutOfScope) {
      violations.push({
        type: "out_of_scope",
        file: file.path,
        description: `File is explicitly marked as out of scope`,
        severity: "critical",
      });
    }

    const isRelatedToInScope = spec.inScope.some((item) => 
      file.path.toLowerCase().includes(item.toLowerCase())
    );

    if (spec.inScope.length > 0 && !isInScope && !isRelatedToInScope && !isOutOfScope) {
      violations.push({
        type: "unrelated",
        file: file.path,
        description: "File does not appear related to the planned work",
        severity: "minor",
      });
    }
  }

  return violations;
}

function checkRiskyPatterns(diffFiles: DiffFile[]): RiskyPattern[] {
  const risky: RiskyPattern[] = [];

  for (const file of diffFiles) {
    for (const hunk of file.hunks) {
      const content = hunk.content;
      
      for (const pattern of RISKY_PATTERNS) {
        if (pattern.regex.test(content)) {
          risky.push({
            pattern: pattern.regex.source,
            file: file.path,
            description: pattern.description,
            severity: pattern.severity,
          });
        }
      }
    }
  }

  return risky;
}

function calculateRiskScore(violations: ScopeViolation[], riskyPatterns: RiskyPattern[]): RiskScore {
  const score: RiskScore = {
    total: 0,
    critical: 0,
    major: 0,
    minor: 0,
    scopeViolations: violations,
    riskyPatterns,
  };

  const severityWeights: Record<VerificationPriority, number> = {
    critical: 10,
    major: 5,
    minor: 1,
    outdated: 0,
  };

  for (const v of violations) {
    const weight = v.severity === "critical" ? 10 : v.severity === "major" ? 5 : 1;
    score.total += weight;
  }

  for (const r of riskyPatterns) {
    const weight = r.severity === "critical" ? 10 : r.severity === "major" ? 5 : 1;
    score.total += weight;
  }

  return score;
}

export const diffAudit = {
  getDiff(): DiffFile[] {
    const diffOutput = getGitDiff();
    return parseDiff(diffOutput);
  },

  getStatus(): string[] {
    const status = getGitStatus();
    return status.split("\n").filter((s) => s.trim());
  },

  audit(specId?: string): { files: DiffFile[]; risk: RiskScore } | null {
    const diffOutput = getGitDiff();
    if (!diffOutput.trim()) {
      return null;
    }

    const files = parseDiff(diffOutput);
    
    let violations: ScopeViolation[] = [];
    
    if (specId) {
      const { specStorage } = require("./spec-storage.js");
      const spec = specStorage.getSpec(specId);
      
      if (spec) {
        violations = checkScopeViolations(files, spec);
      }
    }

    const riskyPatterns = checkRiskyPatterns(files);
    const risk = calculateRiskScore(violations, riskyPatterns);

    return { files, risk };
  },

  auditWithSpec(spec: SpecItem): { files: DiffFile[]; risk: RiskScore } {
    const diffOutput = getGitDiff();
    const files = diffOutput ? parseDiff(diffOutput) : [];
    
    const violations = checkScopeViolations(files, spec);
    const riskyPatterns = checkRiskyPatterns(files);
    const risk = calculateRiskScore(violations, riskyPatterns);

    return { files, risk };
  },

  hasUncommittedChanges(): boolean {
    const status = getGitStatus();
    return status.trim().length > 0;
  },

  getChangedFiles(): string[] {
    const status = getGitStatus();
    return status
      .split("\n")
      .filter((s) => s.trim())
      .map((s) => s.substring(3).trim());
  },
};
