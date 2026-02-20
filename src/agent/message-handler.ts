import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import type { CoreMessage } from "ai";
import type { ToolSet } from "../tools/index.ts";
import { aiService } from "../services/ai.service.ts";
import { sessionManager } from "../services/session-manager.ts";
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

  console.log(
    boxen(chalk.white(input), {
      padding: 1,
      margin: { left: 2, top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "blue",
      title: "👤 You",
      titleAlignment: "left",
    })
  );

  const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

  try {
    let fullResponse = "";
    let isFirstChunk = true;
    const toolCallsProcessed: ToolCall[] = [];

    const result = await aiService.sendMessage(
      messages,
      (chunk: string) => {
        if (isFirstChunk) {
          spin.stop();
          console.log(chalk.green.bold("\n🤖 agentic:"));
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
        toolCallsProcessed.push(toolCall as ToolCall);
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

    console.log("");
  } catch (error) {
    spin.stop();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      boxen(chalk.red(`❌ Error: ${errorMessage}`), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
  }
}
