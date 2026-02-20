import chalk from "chalk";
import boxen from "boxen";
import { specStorage } from "./spec-storage.js";
import { diffAudit, type DiffFile, type RiskScore } from "./diff-audit.js";
import { verifyWithAI } from "./ai-verification.js";
import { verifyLocally } from "./local-verification.js";
import type { SpecItem, VerificationIssue } from "./spec-storage.js";

export const verification = {
  async verify(specId: string, useAI: boolean = false): Promise<{
    spec: SpecItem;
    issues: VerificationIssue[];
    risk: RiskScore;
    files: DiffFile[];
  } | null> {
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
