import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm, text, isCancel } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask } from "../tools/index.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import { exportService } from "../services/planning/export.ts";
import { buildSystemPrompt, formatSpecForPrompt } from "./prompts.ts";
import { displayToolCall, displaySeparator } from "./display.ts";
import type { ToolCall } from "./display.ts";
import type { CoreMessage } from "ai";
import fs from "fs";
import path from "path";

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
const SESSION_FILE = `${PLAN_DIR}/session.json`;

interface PlanningSession {
  id: string;
  startedAt: string;
  lastActivity: string;
  messages: CoreMessage[];
  agreedApproach?: string;
}

function ensurePlanDir(): void {
  if (!fs.existsSync(PLAN_DIR)) {
    fs.mkdirSync(PLAN_DIR, { recursive: true });
  }
}

function loadSession(): PlanningSession | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  try {
    const data = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveSession(session: PlanningSession): void {
  ensurePlanDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

function createNewSession(): PlanningSession {
  return {
    id: Date.now().toString(36),
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    messages: [],
  };
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

  let session = loadSession();
  let isNewSession = false;

  if (session) {
    const resume = await confirm({
      message: `Found a previous planning session from ${new Date(session.lastActivity).toLocaleString()}. Resume?`,
      initialValue: true,
    });

    if (!resume) {
      session = createNewSession();
      isNewSession = true;
    }
  } else {
    session = createNewSession();
    isNewSession = true;
  }

  if (isNewSession) {
    console.log(
      boxen(
        chalk.bold.cyan("🎯 Interactive Planning Session\n\n") +
        chalk.gray("Let's plan something together. Tell me what you want to build.\n\n") +
        chalk.yellow("How this works:\n") +
        chalk.white("1. You tell me what you want to build\n") +
        chalk.white("2. We discuss the approach together\n") +
        chalk.white("3. We agree on the tech stack\n") +
        chalk.white("4. I create a plan, tickets, and architecture\n\n") +
        chalk.dim("Say 'exit' to save and quit anytime"),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "round",
          borderColor: "cyan",
        }
      )
    );
  } else {
    console.log(
      boxen(
        chalk.bold.cyan("🎯 Resumed Planning Session\n\n") +
        chalk.gray("Continuing from where we left off...\n"),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "round",
          borderColor: "cyan",
        }
      )
    );
  }

  await aiService.initialize();

  const systemPrompt = await buildSystemPrompt();

  if (session.messages.length === 0) {
    session.messages.push({
      role: "system",
      content: `${systemPrompt}

---
You are in a NEW planning conversation. The user will tell you what they want to build.
Follow the Interactive Planning Session flow from the system prompt.
Keep your FIRST response SHORT - just a friendly greeting and ask what they want to build.`,
    });
  } else {
    session.messages.push({
      role: "system",
      content: `${systemPrompt}

---
You are resuming a previous planning conversation. The user wants to continue from where they left off.
Keep your response SHORT - acknowledge you're back and ask how they want to proceed.`,
    });
  }

  saveSession(session);

  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Tell me what you want to build...",
    });

    if (isCancel(userInput)) {
      console.log(chalk.yellow("\n👋 Goodbye! Session saved.\n"));
      break;
    }

    const input = (userInput as string).trim();

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.yellow("\n👋 Goodbye! Session saved.\n"));
      break;
    }

    session.messages.push({ role: "user", content: input });
    session.lastActivity = new Date().toISOString();
    saveSession(session);

    let fullResponse = "";
    const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

    await aiService.sendMessage(
      session.messages,
      (chunk) => {
        if (fullResponse === "") {
          spin.stop();
          console.log(chalk.green.bold("\n🤖\n"));
          displaySeparator();
        }
        fullResponse += chunk;
      },
      getToolsForTask("all"),
      (toolCall: unknown) => {
        displayToolCall(toolCall as ToolCall);
      },
      { maxSteps: 10 }
    );

    spin.stop();

    if (fullResponse) {
      const rendered = marked.parse(fullResponse);
      console.log(rendered);
      session.messages.push({ role: "assistant", content: fullResponse });
      session.lastActivity = new Date().toISOString();
      saveSession(session);
    }

    displaySeparator();

    const planReadyFile = `${PLAN_DIR}/plan-ready.txt`;
    if (fs.existsSync(planReadyFile)) {
      const agreedApproach = fs.readFileSync(planReadyFile, "utf-8").trim();
      fs.unlinkSync(planReadyFile);

      console.log(chalk.cyan("\n🤖 Creating implementation plan...\n"));

      const { createSpecFromAI } = await import("../commands/plan.command.js");
      const specData = await createSpecFromAI(agreedApproach);

      if (specData) {
        const spec = specStorage.createSpec(specData);
        console.log(chalk.green(`\n✅ Created plan: ${spec.title}\n`));

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
          fs.unlinkSync(SESSION_FILE);
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
