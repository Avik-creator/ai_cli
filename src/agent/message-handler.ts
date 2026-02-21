import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { confirm } from "@clack/prompts";
import type { CoreMessage } from "ai";
import type { ToolSet } from "../tools/index.ts";
import { aiService } from "../services/ai.service.ts";
import { sessionManager } from "../services/session-manager.ts";
import { specStorage } from "../services/planning/spec-storage.js";
import { exportService } from "../services/planning/export.js";
import { displayToolCall, displayToolResult, displaySeparator } from "./display.ts";
import type { ToolCall, ToolResult } from "./display.ts";
import { createPanel } from "../utils/tui.ts";
import fs from "fs";
import { runPlanExecution } from "./plan-executor.ts";

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

export interface ProcessMessageOptions {
  sessionId: string | null;
  maxSteps?: number;
}

export async function processMessage(
  input: string,
  messages: CoreMessage[],
  tools: ToolSet,
  sessionId: string | null,
  maxSteps: number = 15
): Promise<void> {
  messages.push({
    role: "user",
    content: input,
  });

  if (sessionId) {
    sessionManager.addSessionMessage(sessionId, "user", input);
  }

  console.log(chalk.hex("#00e2ff")("you") + chalk.gray(" > ") + chalk.white(input));

  const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

  try {
    let fullResponse = "";
    let isFirstChunk = true;

    const result = await aiService.sendMessage(
      messages,
      (chunk: string) => {
        if (isFirstChunk) {
          spin.stop();
          console.log(chalk.gray("agentic >"));
          displaySeparator();
          isFirstChunk = false;
        }
        fullResponse += chunk;
      },
      tools,
      (toolCall: unknown) => {
        if (isFirstChunk) {
          spin.stop();
          isFirstChunk = false;
        }
        displayToolCall(toolCall as ToolCall);
      },
      { maxSteps }
    );

    if (result.toolResults && result.toolResults.length > 0) {
      console.log(chalk.gray("\n📊 Tool Results:"));
      for (const tr of result.toolResults) {
        displayToolResult(tr as ToolResult);
      }
    }

    if (fullResponse) {
      console.log("");
      const rendered = marked.parse(fullResponse);
      console.log(rendered);
    }

    displaySeparator();

    if (fullResponse) {
      messages.push({
        role: "assistant",
        content: fullResponse,
      });
      
      if (sessionId) {
        sessionManager.addSessionMessage(sessionId, "assistant", fullResponse);
      }
    }

    const planPromptFile = ".agentic-plan/plan-prompt.txt";
    const planReadyFile = ".agentic-plan/plan-ready.txt";
    try {
      if (fs.existsSync(planPromptFile)) {
        const userRequest = fs.readFileSync(planPromptFile, "utf-8").trim();
        fs.unlinkSync(planPromptFile);
        
        console.log(chalk.cyan("\n🤖 Creating plan and implementing...\n"));
        
        const { createSpecFromAI } = await import("../commands/plan.command.js");
        const specData = await createSpecFromAI(userRequest);
        
        if (specData) {
          const spec = specStorage.createSpec(specData);
          console.log(chalk.green(`\n✓ Created plan: ${spec.title}\n`));
          
          console.log(chalk.cyan("📝 Generating tickets...\n"));
          try {
            exportService.exportTickets(spec.id, "tasks", undefined);
            console.log(chalk.green("✓ Tickets generated\n"));
          } catch (e) {
            console.log(chalk.yellow("⚠️  Could not generate tickets\n"));
          }
          
          const execute = await confirm({
            message: "Execute this plan? (Will make changes to your codebase)",
            initialValue: true,
          });
          
          if (execute) {
            await runPlanExecution(spec.id);
          } else {
            console.log(chalk.yellow("\nPlan saved. Run 'agentic plan run' later to execute.\n"));
          }
        }
        
        messages.length = 0;
      }
      else if (fs.existsSync(planReadyFile)) {
        const agreedApproach = fs.readFileSync(planReadyFile, "utf-8").trim();
        fs.unlinkSync(planReadyFile);
        
        console.log(chalk.cyan("\n🤖 Creating plan from our discussion...\n"));
        
        const { createSpecFromAI } = await import("../commands/plan.command.js");
        const specData = await createSpecFromAI(agreedApproach);
        
        if (specData) {
          const spec = specStorage.createSpec(specData);
          console.log(chalk.green(`\n✓ Created plan: ${spec.title}\n`));
          
          console.log(chalk.cyan("📝 Generating tickets...\n"));
          try {
            exportService.exportTickets(spec.id, "tasks", undefined);
            console.log(chalk.green("✓ Tickets generated\n"));
          } catch (e) {
            console.log(chalk.yellow("⚠️  Could not generate tickets\n"));
          }
          
          const execute = await confirm({
            message: "Execute this plan? (Will make changes to your codebase)",
            initialValue: true,
          });
          
          if (execute) {
            await runPlanExecution(spec.id);
          } else {
            console.log(chalk.yellow("\nPlan saved. Run 'agentic plan run' later to execute.\n"));
          }
        }
        
        messages.length = 0;
      }
    } catch (e) {
    }

    console.log("");
  } catch (error) {
    spin.stop();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(createPanel("❌ Error", chalk.red(errorMessage), { tone: "error", margin: 1 }));
  }
}
