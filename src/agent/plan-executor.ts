import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm, text, isCancel } from "@clack/prompts";
import { aiService } from "../services/ai.service.ts";
import { getToolsForTask } from "../tools/index.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import { buildSystemPrompt, formatSpecForPrompt } from "./prompts.ts";
import { displayToolCall, displayToolResult, displaySeparator } from "./display.ts";
import type { ToolCall, ToolResult } from "./display.ts";
import type { CoreMessage } from "ai";

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

  // Merge system prompt (with skills/tools info) with task-specific instructions
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
  console.log(
    boxen(
      chalk.bold.cyan("🎯 Interactive Planning Mode\n\n") +
      chalk.gray("Chat with me like a coworker. Tell me what you want to build,\n") +
      chalk.gray("and I'll help you plan and implement it step by step.\n\n") +
      chalk.yellow("Commands during chat:\n") +
      chalk.white("  • 'create plan' - Generate a formal plan from our discussion\n") +
      chalk.white("  • 'let's do it' - Start implementing\n") +
      chalk.white("  • 'show plan' - See the current plan\n") +
      chalk.white("  • 'exit' - End the session"),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
      }
    )
  );

  await aiService.initialize();

  const systemPrompt = await buildSystemPrompt();
  const messages: CoreMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}

---
You are in interactive planning mode. The user wants to collaborate on building something.
- Be conversational and helpful like a coworker
- Ask clarifying questions to understand their needs
- When they say "create plan" or "let's do it", generate a structured plan
- Wait for their approval before making any code changes
- Use tools to explore the codebase when needed`,
    },
  ];

  let currentPlan: ReturnType<typeof specStorage.createSpec> | null = null;

  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Tell me what you want to build...",
    });

    if (isCancel(userInput)) {
      console.log(chalk.yellow("\n👋 Goodbye!\n"));
      process.exit(0);
    }

    const input = (userInput as string).trim();

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.yellow("\n👋 Goodbye!\n"));
      break;
    }

    if (input.toLowerCase() === "show plan" && currentPlan) {
      console.log(boxen(formatSpecForPrompt(currentPlan), {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
        title: "📋 Current Plan",
      }));
      continue;
    }

    messages.push({ role: "user", content: input });

    let fullResponse = "";
    const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

    const lowerInput = input.toLowerCase();
    const shouldCreatePlan = lowerInput.includes("create plan") || lowerInput.includes("let's do it") || lowerInput.includes("lets do it");

    if (shouldCreatePlan && !currentPlan) {
      spin.stop();
      const planPrompt = `Based on our conversation, create a structured implementation plan.
      
Respond with ONLY valid JSON:
{
  "title": "Short clear title",
  "goal": "Detailed goal description", 
  "inScope": ["item 1", "item 2"],
  "outOfScope": ["excluded item"],
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "fileBoundaries": ["src/..."]
}`;

      messages.push({ role: "user", content: planPrompt }, { role: "assistant", content: "" });

      await aiService.sendMessage(
        messages.slice(0, -1),
        (chunk) => {
          fullResponse += chunk;
        },
        getToolsForTask("code"),
        undefined,
        { maxSteps: 3 }
      );

      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const planData = JSON.parse(jsonMatch[0]);
        currentPlan = specStorage.createSpec(planData);
        messages[messages.length - 1].content = fullResponse;

        console.log(chalk.green.bold("\n📋 Plan created:\n"));
        console.log(boxen(formatSpecForPrompt(currentPlan), {
          padding: 1,
          borderStyle: "round",
          borderColor: "green",
        }));

        const shouldImplement = await confirm({
          message: "Start implementing this plan?",
          initialValue: false,
        });

        if (shouldImplement) {
          await runPlanExecution(currentPlan.id);
          return;
        }
      }
      continue;
    }

    await aiService.sendMessage(
      messages,
      (chunk) => {
        if (fullResponse === "") {
          spin.stop();
          console.log(chalk.green.bold("\n🤖 Assistant:\n"));
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
      messages.push({ role: "assistant", content: fullResponse });
    }

    displaySeparator();
  }
}
