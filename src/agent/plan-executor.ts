import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm, text, isCancel, select } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask } from "../tools/index.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import { verification } from "../services/planning/verification.ts";
import { diffAudit } from "../services/planning/diff-audit.ts";
import { sessionStorage } from "../services/storage/session-storage.ts";
import { buildSystemPrompt, formatSpecForPrompt } from "./prompts.ts";
import { displayToolCall, displaySeparator, displayWarning } from "./display.ts";
import { isSlashCommand, executeSlashCommand, type SlashCommandContext } from "./slash-commands.ts";
import type { ToolCall } from "./display.ts";
import type { CoreMessage } from "ai";
import type { SpecItem } from "../services/planning/spec-storage.ts";
import { getPlanningProgress } from "./planning-state.ts";
import fs from "fs";
import { execFileSync } from "child_process";

marked.use(
  markedTerminal({
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow,
    link: chalk.blue.underline,
  }) as Parameters<typeof marked.use>[0]
);

const PLAN_DIR = ".agentic-plan";
const PLAN_QUICK_COMMANDS = "help | status | recap | /plan-status | /plan-recap | exit";
const DEFAULT_STRICT_GUARDRAILS = true;
const PLANNING_CONTROL_INPUTS = new Set([
  "create plan",
  "status",
  "recap",
  "help",
  "exit",
  "/plan-status",
  "/plan-recap",
  "/plan-sttus",
]);
const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*m/g;
const TRANSCRIPT_PREFIX_RE = /^\s*(USER|ASSISTANT|SYSTEM|TOOL)\s*:/i;
const BOX_DRAWING_LINE_RE = /^[\s│┌┐└┘╭╮╰╯─━┃┊┈▏▕◇◆•·]+$/;
const PLANNING_NOISE_RE = /^(quick commands:|commands:|next:|analyzing:|plan created!|planning agreement summary:?)/i;
const COLLABORATIVE_PLANNING_GUIDE = `You are in planning mode and acting as a collaborative engineering partner.

Use this interaction contract on EVERY planning response:
1) Start with "Checkpoint: Discovery|Approach|Technology|Agreement"
2) Add one short line: "What I heard: ..."
3) If a decision is needed, present at most 2 concrete options with tradeoffs
4) End with exactly one clear next question for the user

Rules:
- Keep responses concise (generally <= 10 lines unless asked for more)
- Ask for missing constraints before making assumptions
- Highlight risks honestly and explain why
- Do not write implementation code in planning mode
- Never finalize a plan until the user explicitly confirms`;

function ensurePlanDir(): void {
  if (!fs.existsSync(PLAN_DIR)) {
    fs.mkdirSync(PLAN_DIR, { recursive: true });
  }
}

async function buildPlanningSystemPrompt(isResumedSession: boolean): Promise<string> {
  const systemPrompt = await buildSystemPrompt();
  const sessionModeInstructions = isResumedSession
    ? "You are resuming a previous planning conversation. Keep your first response short, acknowledge context, and ask how to continue."
    : "You are in a NEW planning conversation. Keep your first response short, welcoming, and ask what they want to build.";

  return `${systemPrompt}

---
${COLLABORATIVE_PLANNING_GUIDE}

${sessionModeInstructions}

When the user confirms with phrases like "create plan", "let's do it", or "sounds good":
1. Use writeFile to write ".agentic-plan/plan-ready.txt" with the agreed approach
2. Wait for the system to generate the formal plan and artifacts`;
}

function renderPlanningStatus(messages: CoreMessage[], sessionId: string): void {
  const progress = getPlanningProgress(messages);
  const activeStageIndex = progress.stages.findIndex((stage) => stage.id === progress.currentStage.id);
  const progressBar = progress.stages
    .map((stage, index) => {
      if (index < activeStageIndex) return chalk.green("■");
      if (index === activeStageIndex) return chalk.cyan("▣");
      return chalk.gray("□");
    })
    .join(" ");

  const stageLines = progress.stages
    .map((stage) => {
      if (stage.id === progress.currentStage.id) {
        return `  ${chalk.cyan("➜")} ${chalk.cyan(stage.label)}`;
      }
      if (stage.complete) {
        return `  ${chalk.green("✓")} ${chalk.green(stage.label)}`;
      }
      return `  ${chalk.gray("•")} ${chalk.gray(stage.label)}`;
    })
    .join("\n");

  console.log(
    boxen(
      `${chalk.bold.cyan("Session")} ${chalk.white(sessionId.slice(0, 8))}...\n` +
      `${chalk.bold.cyan("Progress")} ${progressBar} ${chalk.gray(`(${progress.completedCount}/${progress.totalStages} complete)`)}\n` +
      `${chalk.bold.cyan("Turns")} ${chalk.white(`${progress.userTurns} user / ${progress.assistantTurns} assistant`)}\n\n` +
      `${stageLines}\n\n` +
      `${chalk.yellow("Next")} ${progress.nextStepHint}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
        title: "🤝 Planning Status",
      }
    )
  );
}

function renderPlanningHelp(): void {
  console.log(
    boxen(
      `${chalk.bold.cyan("Quick Commands")}\n\n` +
      `${chalk.yellow("help")}      Show this planning help\n` +
      `${chalk.yellow("status")}    Show collaboration progress\n` +
      `${chalk.yellow("recap")}     Summarize decisions + open questions\n` +
      `${chalk.yellow("/plan-status")}  Slash version of status\n` +
      `${chalk.yellow("/plan-recap")}   Slash version of recap\n` +
      `${chalk.yellow("exit")}      Save and quit\n\n` +
      `${chalk.bold.cyan("Collaboration Tips")}\n\n` +
      `${chalk.gray("• Share constraints early (timeline, scope, stack, team size)")}\n` +
      `${chalk.gray("• Ask for tradeoffs if two options seem close")}\n` +
      `${chalk.gray("• Say 'create plan' when you want to formalize")}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "yellow",
        title: "🧭 Plan Mode Help",
      }
    )
  );
}

function getFriendlyPlanningError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("too large") ||
    normalized.includes("tokens per minute") ||
    normalized.includes("rate_limit_exceeded") ||
    normalized.includes("model limits")
  ) {
    return "Request is too large for this model. Use /compact, /clear, or /model to continue with a smaller context.";
  }

  if (normalized.includes("rate limit")) {
    return "Provider rate limit reached. Wait a few seconds and try again.";
  }

  return message;
}

function messageContentToText(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join(" ")
    .trim();
}

function isCreatePlanIntent(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return [
    "create plan",
    "create the plan",
    "finalize plan",
    "finalize the plan",
    "lets do it",
    "let's do it",
    "go ahead",
    "confirm plan",
  ].includes(normalized);
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

function sanitizeAgreementText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(ANSI_ESCAPE_RE, "")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !TRANSCRIPT_PREFIX_RE.test(line))
    .filter((line) => !BOX_DRAWING_LINE_RE.test(line))
    .filter((line) => !PLANNING_NOISE_RE.test(line))
    .filter((line) => !line.startsWith("~"))
    .filter((line) => !line.includes("To continue this session later"))
    .filter((line) => !line.startsWith("┌"))
    .filter((line) => !line.startsWith("╭"))
    .filter((line) => !line.startsWith("│"))
    .filter((line) => !isLikelyCodeLine(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlanningControlInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.startsWith("/")) {
    return true;
  }
  if (PLANNING_CONTROL_INPUTS.has(normalized)) {
    return true;
  }
  if (/^create plan\b/.test(normalized)) {
    return true;
  }
  return false;
}

function buildAgreementFromMessages(messages: CoreMessage[]): string {
  const snippets = messages
    .filter((message) => message.role === "user")
    .map((message) => sanitizeAgreementText(messageContentToText(message.content)))
    .filter((text) => text.length > 0)
    .filter((text) => !isPlanningControlInput(text));

  const deduped: string[] = [];
  for (const snippet of snippets.slice(-20)) {
    if (deduped[deduped.length - 1] !== snippet) {
      deduped.push(snippet);
    }
  }

  const combined = deduped.join("\n\n");
  const compact = combined.length > 2400 ? combined.slice(combined.length - 2400) : combined;
  const fallback = "No explicit agreement captured. Use the most recent confirmed scope and constraints.";

  return `Planning agreement summary:\n\n${compact || fallback}`;
}

async function createAndOfferPlanFromAgreement(
  sessionId: string,
  agreedApproach: string
): Promise<"continue" | "done"> {
  sessionStorage.updatePlanningSession(sessionId, agreedApproach);
  fs.writeFileSync(`${PLAN_DIR}/plan-ready.last.txt`, agreedApproach, "utf-8");

  console.log(chalk.cyan("\n🤖 Creating implementation plan...\n"));

  const { createSpecFromAI } = await import("../commands/plan.command.js");
  const specData = await createSpecFromAI(agreedApproach);

  if (!specData) {
    fs.writeFileSync(`${PLAN_DIR}/plan-ready.retry.txt`, agreedApproach, "utf-8");
    displayWarning(
      "Plan generation did not complete. Your latest discussion was saved to .agentic-plan/plan-ready.retry.txt",
      "Plan Not Created"
    );
    return "continue";
  }

  const spec = specStorage.createSpec(specData);
  console.log(chalk.green(`\n✅ Created plan: ${spec.title}\n`));

  sessionStorage.updatePlanningSession(sessionId, undefined, spec.id, "completed");

  console.log(chalk.cyan("🧩 Plan artifacts (.md) saved in .agentic-plan/\n"));
  console.log(chalk.gray(`  • .agentic-plan/${spec.id}.md`));
  console.log(chalk.gray(`  • .agentic-plan/${spec.id}-tickets.md`));
  console.log(chalk.gray(`  • .agentic-plan/${spec.id}-architecture.md\n`));

  console.log(
    boxen(
      chalk.bold.cyan("Plan Summary\n\n") +
      formatSpecForPrompt(spec),
      {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }
    )
  );

  const execute = await confirm({
    message: "Ready for me to implement this?",
    initialValue: true,
  });

  if (execute) {
    await runPlanExecution(spec.id);
  } else {
    console.log(chalk.yellow("\nPlan saved. Run 'agentic plan run' later to execute.\n"));
    console.log(chalk.dim("Session ended. Your discussion is saved.\n"));
  }

  return "done";
}

interface PlanExecutionOptions {
  strict?: boolean;
  aiAudit?: boolean;
  autoCommit?: boolean;
}

function getSpecContractGaps(spec: SpecItem): string[] {
  const gaps: string[] = [];
  if (!spec.goal || spec.goal.trim().length === 0) {
    gaps.push("Goal is empty");
  }
  if (spec.inScope.length === 0) {
    gaps.push("In-scope items are empty");
  }
  if (spec.acceptanceCriteria.length === 0) {
    gaps.push("Acceptance criteria are empty");
  }
  if (spec.fileBoundaries.length === 0) {
    gaps.push("File boundaries are empty");
  }
  return gaps;
}

function getDriftSummary(result: Awaited<ReturnType<typeof verification.verifyCurrentChanges>>): {
  hasScopeViolation: boolean;
  hasCritical: boolean;
  hasMajor: boolean;
} {
  const hasScopeViolation = result.risk.scopeViolations.length > 0;
  const hasCriticalIssue = result.issues.some((issue) => issue.priority === "critical");
  const hasMajorIssue = result.issues.some((issue) => issue.priority === "major");
  const hasCriticalRisk = result.risk.critical > 0;
  const hasMajorRisk = result.risk.major > 0;

  return {
    hasScopeViolation,
    hasCritical: hasCriticalIssue || hasCriticalRisk,
    hasMajor: hasMajorIssue || hasMajorRisk,
  };
}

async function maybeCommitChanges(spec: SpecItem, autoCommit: boolean): Promise<boolean> {
  const hasChanges = diffAudit.hasUncommittedChanges();
  if (!hasChanges) {
    console.log(chalk.gray("No uncommitted changes to commit.\n"));
    return true;
  }

  let shouldCommit = autoCommit;
  if (!autoCommit) {
    const commitConfirm = await confirm({
      message: "Audit complete. Create a git commit now?",
      initialValue: false,
    });
    shouldCommit = !isCancel(commitConfirm) && Boolean(commitConfirm);
  }

  if (!shouldCommit) {
    console.log(chalk.yellow("Changes kept uncommitted. Review and commit when ready.\n"));
    return true;
  }

  const defaultMessage = `plan(${spec.id}): ${spec.title}`;
  const commitMessage = await text({
    message: "Commit message:",
    initialValue: defaultMessage,
    placeholder: defaultMessage,
  });

  if (isCancel(commitMessage) || !String(commitMessage).trim()) {
    console.log(chalk.yellow("Commit cancelled. Changes remain in working tree.\n"));
    return true;
  }

  try {
    execFileSync("git", ["add", "-A"], { stdio: "inherit" });
    execFileSync("git", ["commit", "-m", String(commitMessage).trim()], { stdio: "inherit" });
    console.log(chalk.green("\n✅ Commit created successfully.\n"));
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    displayWarning(`Failed to create commit: ${errMsg}`, "Commit Failed");
    return false;
  }
}

export async function runPlanExecution(specId: string, options: PlanExecutionOptions = {}): Promise<boolean> {
  const spec = specStorage.getSpec(specId);
  if (!spec) {
    console.log(chalk.red(`Plan not found: ${specId}`));
    return false;
  }

  const strictGuardrails = options.strict ?? DEFAULT_STRICT_GUARDRAILS;
  const aiAudit = options.aiAudit ?? false;
  const autoCommit = options.autoCommit ?? false;

  console.log(
    boxen(
      chalk.bold.cyan("📋 Controlled Plan Execution\n\n") +
      chalk.gray("Workflow:\n") +
      chalk.white("1. Validate spec contract\n") +
      chalk.white("2. Propose implementation steps\n") +
      chalk.white("3. Confirm before writing code\n") +
      chalk.white("4. Execute and capture git diff\n") +
      chalk.white("5. Audit diff vs spec\n") +
      chalk.white("6. Confirm commit"),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "yellow",
      }
    )
  );

  console.log(chalk.gray(`Guardrail mode: ${strictGuardrails ? chalk.green("STRICT") : chalk.yellow("WARN")}`));
  console.log(chalk.gray(`Audit engine: ${aiAudit ? chalk.cyan("AI + local") : chalk.cyan("local")}\n`));

  console.log(
    boxen(
      formatSpecForPrompt(spec),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
        title: "📝 Plan Details",
      }
    )
  );

  const contractGaps = getSpecContractGaps(spec);
  if (contractGaps.length > 0) {
    displayWarning(`Spec contract gaps:\n- ${contractGaps.join("\n- ")}`, "Spec Contract Incomplete");
    const proceedWithGaps = await confirm({
      message: strictGuardrails
        ? "Spec is incomplete. Continue anyway (strict guardrails still apply)?"
        : "Spec is incomplete. Continue in warning mode?",
      initialValue: false,
    });
    if (isCancel(proceedWithGaps) || !proceedWithGaps) {
      console.log(chalk.yellow("\nExecution cancelled. Refine the plan first.\n"));
      return false;
    }
  }

  await aiService.initialize();

  const systemPrompt = await buildSystemPrompt();

  const spin = yoctoSpinner({ text: "Analyzing codebase and generating plan...", color: "cyan" }).start();

  let fullResponse = "";

  const combinedSystemPrompt = `${systemPrompt}

---

## Current Task
You are executing a plan. Your task is to:

1. First, explore the codebase to understand the current structure.
2. Generate a detailed implementation plan based on the spec below.
3. Respect scope constraints:
   - Stay within file boundaries unless explicitly approved.
   - Avoid out-of-scope files/items.
   - Anchor work to acceptance criteria.
4. WAIT for user confirmation before making ANY changes.

## SPEC:
${formatSpecForPrompt(spec)}

## Your Response Format:
Start by exploring the codebase, then present:

### Implementation Steps
1. [Step description]
2. [Step description]
...

### Files to Modify
- file1.ts
- file2.ts
...

### Files to Create
- new-file.ts
...

### Scope Check
- Explain why each touched file is within scope.

Then ask: "Should I start implementing these changes? (yes/no)".

DO NOT make any changes until the user explicitly confirms.
If the plan cannot be completed inside scope, ask for scope update instead of proceeding.`;

  try {
    await aiService.sendMessage(
      [
        {
          role: "system",
          content: combinedSystemPrompt,
        },
      ],
      (chunk) => {
        if (fullResponse === "") {
          spin.stop();
          console.log(chalk.green.bold("\n🤖 AI Plan:\n"));
          displaySeparator();
        }
        fullResponse += chunk;
      },
      {},
      undefined,
      { maxSteps: 5 }
    );
  } catch (error) {
    spin.stop();
    displayWarning(getFriendlyPlanningError(error), "Model Request Failed");
    return false;
  }

  spin.stop();

  if (fullResponse) {
    const rendered = marked.parse(fullResponse);
    console.log(rendered);
  }

  displaySeparator();

  const shouldImplement = await confirm({
    message: chalk.yellow("Should I start implementing these changes?"),
    initialValue: false,
  });

  if (isCancel(shouldImplement) || !shouldImplement) {
    console.log(chalk.yellow("\n👌 Implementation cancelled. Your code is safe.\n"));
    return false;
  }

  console.log(chalk.green("\n✅ Starting implementation...\n"));

  const implementationPrompt = `Continue from the plan above and implement all the changes. 

For each file:
1. Read the existing file first
2. Confirm the file is in scope before modifying
3. Make the necessary modifications
4. Explain what you changed and which acceptance criterion it satisfies

Start implementing now.`;

  let implResponse = "";
  const codeTools = getToolsForTask("code");
  const executionTools = {
    readFile: codeTools.readFile,
    writeFile: codeTools.writeFile,
    listDir: codeTools.listDir,
    searchFiles: codeTools.searchFiles,
    executeCommand: codeTools.executeCommand,
  };

  try {
    await aiService.sendMessage(
      [
        {
          role: "system",
          content: combinedSystemPrompt,
        },
        {
          role: "assistant",
          content: fullResponse,
        },
        {
          role: "user",
          content: implementationPrompt,
        },
      ],
      (chunk: string) => {
        if (implResponse === "") {
          console.log(chalk.green.bold("\n🤖 Implementing...\n"));
          displaySeparator();
        }
        implResponse += chunk;
      },
      executionTools,
      (toolCall: unknown) => {
        displayToolCall(toolCall as ToolCall);
      },
      { maxSteps: 18 }
    );
  } catch (error) {
    displayWarning(getFriendlyPlanningError(error), "Implementation Failed");
    return false;
  }

  if (implResponse) {
    const rendered = marked.parse(implResponse);
    console.log(rendered);
  }

  displaySeparator();
  console.log(chalk.green.bold("\n✅ Implementation complete. Running spec audit...\n"));

  const auditResult = await verification.verifyCurrentChanges(spec, aiAudit);
  verification.printVerificationResult(auditResult);

  const drift = getDriftSummary(auditResult);
  const changedFiles = auditResult.files.length;

  if (changedFiles === 0) {
    displayWarning("No code changes were detected after execution.", "No Diff");
    return false;
  }

  if (strictGuardrails && (drift.hasScopeViolation || drift.hasCritical)) {
    displayWarning(
      "Strict guardrails blocked completion due to scope/critical drift.\n" +
      "Review the diff, adjust spec boundaries, or rerun with --no-strict.",
      "Execution Blocked"
    );

    const override = await confirm({
      message: "Override strict block and keep these changes anyway?",
      initialValue: false,
    });

    if (isCancel(override) || !override) {
      console.log(chalk.yellow("\nExecution stopped after audit block. Working tree changes remain for your review.\n"));
      return false;
    }
  } else if (drift.hasScopeViolation || drift.hasCritical || drift.hasMajor) {
    console.log(chalk.yellow("⚠️  Drift/risk signals detected. Proceeding in warning mode.\n"));
  } else {
    console.log(chalk.green("✅ Audit passed: changes align with declared scope.\n"));
  }

  const commitOk = await maybeCommitChanges(spec, autoCommit);
  if (!commitOk) {
    return false;
  }

  console.log(chalk.green.bold("✅ Plan workflow complete: Spec → Execute → Audit → Confirm.\n"));
  return true;
}

export async function runInteractivePlanning(): Promise<void> {
  ensurePlanDir();

  const sessions = sessionStorage.listPlanningSessions();
  let currentSessionId: string | null = null;
  let isNewSession = false;
  let resumedSessionLastActivity: string | null = null;

  if (sessions.length > 0) {
    const options = [
      {
        value: "new",
        label: `${chalk.bold.cyan("Start new planning session")} ${chalk.gray("(fresh collaboration)")}`,
      },
      ...sessions.filter(s => s.status === "active").map(s => ({
        value: s.id,
        label: `${chalk.white("Resume")} ${chalk.cyan(s.id.slice(0, 8))}... ${chalk.gray(new Date(s.lastActivity).toLocaleString())}`,
      })),
    ];

    const choice = await select({
      message: "Planning sessions:",
      options,
    });

    if (isCancel(choice) || choice === "new") {
      currentSessionId = null;
      isNewSession = true;
    } else {
      currentSessionId = choice as string;
      resumedSessionLastActivity = sessions.find((session) => session.id === currentSessionId)?.lastActivity ?? null;
    }
  } else {
    isNewSession = true;
  }

  if (isNewSession) {
    currentSessionId = Date.now().toString(36);
    sessionStorage.createPlanningSession(currentSessionId);
  }

  if (isNewSession) {
    console.log(
      boxen(
        chalk.bold.cyan("Collaborative Planning Studio\n\n") +
        chalk.gray("We will co-design the plan before any implementation happens.\n\n") +
        chalk.yellow("Workflow:\n") +
        chalk.white("1. Discovery  2. Approach  3. Technology  4. Agreement\n\n") +
        chalk.yellow("Quick commands:\n") +
        chalk.white(`• ${PLAN_QUICK_COMMANDS}\n\n`) +
        chalk.dim("Say 'create plan' when the direction is final."),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "double",
          borderColor: "cyan",
          title: "🎯 Plan Mode",
        }
      )
    );
  } else {
    console.log(
      boxen(
        chalk.bold.cyan("Resumed Planning Session\n\n") +
        chalk.gray("Continuing from your previous collaboration.\n") +
        (resumedSessionLastActivity
          ? `${chalk.gray(`Last activity: ${new Date(resumedSessionLastActivity).toLocaleString()}\n`)}`
          : "") +
        chalk.white(`Quick commands: ${PLAN_QUICK_COMMANDS}`),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "round",
          borderColor: "cyan",
          title: "♻️ Resume",
        }
      )
    );
  }

  await aiService.initialize();

  const messages: CoreMessage[] = [];

  if (isNewSession) {
    messages.push({
      role: "system",
      content: await buildPlanningSystemPrompt(false),
    });
  } else {
    const savedMessages = sessionStorage.getPlanningMessages(currentSessionId!);
    messages.push({
      role: "system",
      content: await buildPlanningSystemPrompt(true),
    });
    for (const msg of savedMessages) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  renderPlanningStatus(messages, currentSessionId!);

  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Describe your goal, constraints, or preferred approach...",
    });

    if (isCancel(userInput)) {
      console.log(chalk.yellow("\n👋 Goodbye! Session saved.\n"));
      break;
    }

    const input = (userInput as string).trim();
    const normalizedInput = input.toLowerCase();

    if (normalizedInput === "help" || normalizedInput === "commands") {
      renderPlanningHelp();
      continue;
    }

    if (normalizedInput === "status") {
      renderPlanningStatus(messages, currentSessionId!);
      continue;
    }

    if (normalizedInput === "recap") {
      const slashContext: SlashCommandContext = {
        messages,
        sessionId: currentSessionId,
        mode: "plan",
      };
      const recapResult = await executeSlashCommand("/plan-recap", slashContext);
      if (recapResult.output) {
        console.log(recapResult.output);
      }
      continue;
    }

    if (isSlashCommand(input)) {
      const slashContext: SlashCommandContext = {
        messages,
        sessionId: currentSessionId,
        mode: "plan",
      };
      const result = await executeSlashCommand(input, slashContext);
      
      if (result.output) {
        console.log(result.output);
      }
      
      if (result.clearMessages) {
        messages.length = 1;
        messages[0] = {
          role: "system",
          content: await buildPlanningSystemPrompt(false),
        };
      }
      
      if (result.modelChanged) {
        messages[0] = {
          role: "system",
          content: await buildPlanningSystemPrompt(messages.length > 1),
        };
        try {
          await aiService.initialize();
          console.log(chalk.gray(`\nReinitialized with new model: ${aiService.getModelId()}\n`));
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          displayWarning(errMsg, "Model Initialization Failed");
        }
      }
      
      if (result.exit) {
        console.log(chalk.yellow("\n👋 Goodbye! Session saved.\n"));
        break;
      }
      
      continue;
    }

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.yellow("\n👋 Goodbye! Session saved.\n"));
      break;
    }

    if (isCreatePlanIntent(input)) {
      messages.push({ role: "user", content: input });
      sessionStorage.addPlanningMessage(currentSessionId!, "user", input);

      const agreedApproach = buildAgreementFromMessages(messages);
      const outcome = await createAndOfferPlanFromAgreement(currentSessionId!, agreedApproach);
      if (outcome === "done") {
        return;
      }
      continue;
    }

    messages.push({ role: "user", content: input });
    sessionStorage.addPlanningMessage(currentSessionId!, "user", input);

    let fullResponse = "";
    const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();
    const planningTools = { writeFile: getToolsForTask("code").writeFile };

    try {
      await aiService.sendMessage(
        messages,
        (chunk) => {
          if (fullResponse === "") {
            spin.stop();
            console.log(
              boxen(
                chalk.bold.green("Planning Partner\n") +
                chalk.gray("Working through tradeoffs with you before implementation."),
                {
                  padding: { top: 0, bottom: 0, left: 1, right: 1 },
                  margin: { top: 1, bottom: 0 },
                  borderStyle: "round",
                  borderColor: "green",
                  title: "🤝 Assistant",
                }
              )
            );
            displaySeparator("─", 72);
          }
          fullResponse += chunk;
        },
        planningTools,
        (toolCall: unknown) => {
          displayToolCall(toolCall as ToolCall);
        },
        { maxSteps: 10 }
      );
    } catch (error) {
      spin.stop();
      displayWarning(getFriendlyPlanningError(error), "Planning Request Failed");
      console.log(chalk.gray("Tip: try /compact or switch model with /model before retrying.\n"));
      continue;
    }

    spin.stop();

    if (fullResponse) {
      const rendered = marked.parse(fullResponse);
      console.log(rendered);
      messages.push({ role: "assistant", content: fullResponse });
      sessionStorage.addPlanningMessage(currentSessionId!, "assistant", fullResponse);
    }

    const progress = getPlanningProgress(messages);
    console.log(chalk.gray(`Next: ${progress.nextStepHint}`));
    console.log(chalk.dim(`Commands: ${PLAN_QUICK_COMMANDS}`));
    displaySeparator("─", 72);

    const planReadyFile = `${PLAN_DIR}/plan-ready.txt`;
    if (fs.existsSync(planReadyFile)) {
      const agreedApproach = fs.readFileSync(planReadyFile, "utf-8").trim();
      fs.unlinkSync(planReadyFile);
      const outcome = await createAndOfferPlanFromAgreement(currentSessionId!, agreedApproach);
      if (outcome === "done") {
        return;
      }
    }
  }
}
