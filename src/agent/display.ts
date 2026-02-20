import chalk from "chalk";
import boxen from "boxen";

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
  const argsPreview = argsJson.substring(0, 200);
  const isTruncated = argsJson.length > 200;

  const box = boxen(
    `${chalk.cyan("Tool:")} ${chalk.bold(toolCall.toolName)}\n` +
    `${chalk.gray("Args:")} ${argsPreview}${isTruncated ? "..." : ""}`,
    {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: { left: 2 },
      borderStyle: "round",
      borderColor: "cyan",
      dimBorder: true,
    }
  );
  console.log(box);
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
      resultPreview = toolResult.result.substring(0, 100);
    } else if (typeof toolResult.result === "object" && "error" in toolResult.result) {
      resultPreview = (toolResult.result as { error: string }).error;
    } else {
      resultPreview = "Completed successfully";
    }
  }

  const colorFn = color === "green" ? chalk.green : chalk.red;
  const isTruncated = resultPreview.length >= 100;
  console.log(colorFn(`  ${icon} ${toolResult.toolName}: ${resultPreview}${isTruncated ? "..." : ""}`));
}

export function displayError(message: string, title: string = "Error"): void {
  console.log(
    boxen(chalk.red(`❌ ${message}`), {
      padding: 1,
      borderStyle: "round",
      borderColor: "red",
      title,
    })
  );
}

export function displaySuccess(message: string, title: string = "Success"): void {
  console.log(
    boxen(chalk.green(`✅ ${message}`), {
      padding: 1,
      borderStyle: "round",
      borderColor: "green",
      title,
    })
  );
}

export function displayInfo(message: string, title: string = "Info"): void {
  console.log(
    boxen(message, {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
      title,
    })
  );
}

export function displayWarning(message: string, title: string = "Warning"): void {
  console.log(
    boxen(chalk.yellow(message), {
      padding: 1,
      borderStyle: "round",
      borderColor: "yellow",
      title,
    })
  );
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
  console.log(chalk.gray(char.repeat(length)));
}
