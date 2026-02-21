import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm, text, isCancel, select } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask } from "../tools/index.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import { exportService } from "../services/planning/export.ts";
import { sessionStorage } from "../services/storage/session-storage.ts";
import { buildSystemPrompt, formatSpecForPrompt } from "./prompts.ts";
import { displayToolCall, displaySeparator, displayWarning } from "./display.ts";
import { isSlashCommand, executeSlashCommand, type SlashCommandContext } from "./slash-commands.ts";
import type { ToolCall } from "./display.ts";
import type { CoreMessage } from "ai";
import { getPlanningProgress } from "./planning-state.ts";
import fs from "fs";

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

async function generateArchitectureDiagram(spec: any): Promise<void> {
  const diagramContent = `# ${spec.title} - Architecture

## System Overview
${spec.goal}

## Components

${spec.inScope.map((item: string) => `- ${item}`).join("\n")}

## Data Flow
(TODO: Add flow diagram)

## Tech Stack
- Language: To be determined
- Framework: To be determined

---
Generated: ${new Date().toISOString()}
`;

  const diagramPath = `${PLAN_DIR}/${spec.id}-architecture.md`;
  fs.writeFileSync(diagramPath, diagramContent, "utf-8");
  console.log(chalk.cyan(`📐 Architecture diagram saved to: ${diagramPath}`));
}

export async function runPlanExecution(specId: string): Promise<boolean> {
  const spec = specStorage.getSpec(specId);
  if (!spec) {
    console.log(chalk.red(`Plan not found: ${specId}`));
    return false;
  }

  console.log(
    boxen(
      chalk.bold.cyan("📋 Plan Execution Mode\n\n") +
      chalk.gray("You are about to execute a plan. The AI will:\n") +
      chalk.white("1. Analyze the codebase\n") +
      chalk.white("2. Generate implementation steps\n") +
      chalk.white("3. Ask for confirmation BEFORE making changes\n") +
      chalk.white("4. Execute only after you approve"),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "yellow",
      }
    )
  );

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

  await aiService.initialize();

  const systemPrompt = await buildSystemPrompt();
  
  const prompt = `You are executing a plan. Your task is to:

1. First, explore the codebase to understand the current structure
2. Generate a detailed implementation plan based on the spec below
3. Present the implementation steps clearly
4. WAIT for user confirmation before making ANY changes

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

Then ask: "Should I start implementing these changes? (yes/no)"

DO NOT make any changes until the user explicitly confirms.`;

  const spin = yoctoSpinner({ text: "Analyzing codebase and generating plan...", color: "cyan" }).start();

  let fullResponse = "";

  const combinedSystemPrompt = `${systemPrompt}

---

## Current Task
You are executing a plan. Your task is to:

1. First, explore the codebase to understand the current structure
2. Generate a detailed implementation plan based on the spec below
3. Present the implementation steps clearly
4. WAIT for user confirmation before making ANY changes

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

Then ask: "Should I start implementing these changes? (yes/no)"

DO NOT make any changes until the user explicitly confirms.`;

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

  if (!shouldImplement) {
    console.log(chalk.yellow("\n👌 Implementation cancelled. Your code is safe.\n"));
    return false;
  }

  console.log(chalk.green("\n✅ Starting implementation...\n"));

  const implementationPrompt = `Continue from the plan above and implement all the changes. 

For each file:
1. Read the existing file first
2. Make the necessary modifications
3. Explain what you changed

Start implementing now.`;

  let implResponse = "";

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
      getToolsForTask("code"),
      (toolCall: unknown) => {
        displayToolCall(toolCall as ToolCall);
      },
      { maxSteps: 15 }
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
  console.log(chalk.green.bold("\n✅ Implementation complete!\n"));

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
        console.log(chalk.gray(`\nReinitialized with new model: ${aiService.getModelId()}\n`));
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

    messages.push({ role: "user", content: input });
    sessionStorage.addPlanningMessage(currentSessionId!, "user", input);

    let fullResponse = "";
    const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

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
        getToolsForTask("all"),
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

      sessionStorage.updatePlanningSession(currentSessionId!, agreedApproach);

      console.log(chalk.cyan("\n🤖 Creating implementation plan...\n"));

      const { createSpecFromAI } = await import("../commands/plan.command.js");
      const specData = await createSpecFromAI(agreedApproach);

      if (specData) {
        const spec = specStorage.createSpec(specData);
        console.log(chalk.green(`\n✅ Created plan: ${spec.title}\n`));

        sessionStorage.updatePlanningSession(currentSessionId!, undefined, spec.id, "completed");

        console.log(chalk.cyan("📝 Generating tickets...\n"));
        try {
          exportService.exportTickets(spec.id, "tasks", undefined);
          console.log(chalk.green("✓ Tickets generated\n"));
        } catch (e) {
          console.log(chalk.yellow("⚠️ Could not generate tickets\n"));
        }

        console.log(chalk.cyan("📐 Creating architecture diagram...\n"));
        try {
          await generateArchitectureDiagram(spec);
          console.log(chalk.green("✓ Architecture diagram created\n"));
        } catch (e) {
          console.log(chalk.yellow("⚠️ Could not create architecture diagram\n"));
        }

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
          return;
        } else {
          console.log(chalk.yellow("\nPlan saved. Run 'agentic plan run' later to execute.\n"));
          console.log(chalk.dim("Session ended. Your discussion is saved.\n"));
          break;
        }
      }
    }
  }
}
