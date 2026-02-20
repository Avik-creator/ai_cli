import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask } from "../tools/index.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import { buildSystemPrompt, formatSpecForPrompt } from "./prompts.ts";
import { displayToolCall, displayToolResult, displaySeparator } from "./display.ts";
import type { ToolCall, ToolResult } from "./display.ts";

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

  await aiService.sendMessage(
    [
      {
        role: "system",
        content: prompt,
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
        content: prompt,
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
    (chunk) => {
      if (implResponse === "") {
        console.log(chalk.green.bold("\n🤖 Implementing...\n"));
        displaySeparator();
      }
      implResponse += chunk;
    },
    getToolsForTask("code"),
    (toolCall) => {
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
