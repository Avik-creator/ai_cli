import chalk from "chalk";

export interface ToolError {
  error: string;
  success: false;
}

export function formatToolError(error: unknown, context?: string): ToolError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const prefix = context ? `${context}: ` : "";
  console.error(chalk.red(`\n❌ ${prefix}${errorMessage}`));
  return {
    error: `${prefix}${errorMessage}`,
    success: false,
  };
}

export function formatToolSuccess(message: string): void {
  console.log(chalk.green(`\n✅ ${message}`));
}

export function formatToolInfo(message: string): void {
  console.log(chalk.cyan(`\n🔍 ${message}`));
}
