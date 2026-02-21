import chalk from "chalk";
import boxen from "boxen";
import { createPanel, renderDivider } from "../utils/tui.ts";

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  result?: {
    success?: boolean;
    error?: string;
  } | string;
}

export function displayToolCall(toolCall: ToolCall): void {
  const argsJson = JSON.stringify(toolCall.args, null, 2);
  const argsPreview = argsJson.substring(0, 180).replace(/\s+/g, " ");
  const isTruncated = argsJson.length > 180;
  console.log(
    chalk.hex("#00e2ff")("↳") +
    chalk.white(` ${toolCall.toolName} `) +
    chalk.gray(`${argsPreview}${isTruncated ? "..." : ""}`)
  );
}

export function displayToolResult(toolResult: ToolResult): void {
  const success = toolResult.result && typeof toolResult.result === "object"
    ? toolResult.result.success !== false
    : true;
  const color = success ? "green" : "red";
  const icon = success ? "✓" : "✗";

  let resultPreview = "";
  if (toolResult.result) {
    if (typeof toolResult.result === "string") {
      resultPreview = toolResult.result.substring(0, 140);
    } else if (typeof toolResult.result === "object" && "error" in toolResult.result) {
      resultPreview = (toolResult.result as { error: string }).error;
    } else {
      resultPreview = "Completed successfully";
    }
  }

  const colorFn = color === "green" ? chalk.green : chalk.red;
  const isTruncated = resultPreview.length >= 140;
  console.log(colorFn(`  ${icon} ${toolResult.toolName}: ${resultPreview}${isTruncated ? "..." : ""}`));
}

export function displayError(message: string, title: string = "Error"): void {
  console.log(createPanel(`❌ ${title}`, chalk.red(message), { tone: "error" }));
}

export function displaySuccess(message: string, title: string = "Success"): void {
  console.log(createPanel(`✅ ${title}`, chalk.green(message), { tone: "success" }));
}

export function displayInfo(message: string, title: string = "Info"): void {
  console.log(createPanel(title, message, { tone: "primary" }));
}

export function displayWarning(message: string, title: string = "Warning"): void {
  console.log(createPanel(title, chalk.yellow(message), { tone: "warning" }));
}

export function createBox(
  content: string,
  options: {
    padding?: { top?: number; bottom?: number; left?: number; right?: number };
    margin?: { top?: number; bottom?: number; left?: number; right?: number };
    borderStyle?: "single" | "double" | "round" | "bold" | "round" | "single" | "none";
    borderColor?: "red" | "green" | "yellow" | "blue" | "cyan" | "magenta" | "gray" | "white" | "black";
    title?: string;
    titleAlignment?: "left" | "center" | "right";
    dimBorder?: boolean;
  } = {}
): string {
  return boxen(content, {
    padding: options.padding ?? 1,
    margin: options.margin,
    borderStyle: options.borderStyle ?? "round",
    borderColor: options.borderColor ?? "gray",
    title: options.title,
    titleAlignment: options.titleAlignment ?? "left",
    dimBorder: options.dimBorder,
  });
}

export function displaySeparator(char: string = "─", length: number = 60): void {
  console.log(renderDivider(char, length));
}
