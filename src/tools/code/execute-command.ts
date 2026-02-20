import { tool } from "ai";
import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import chalk from "chalk";

export interface CommandResponse {
  success: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  command?: string;
  cwd?: string;
  error?: string;
  timedOut?: boolean;
}

export const executeCommandTool = tool({
  description:
    "Execute a shell command. Use this to run build commands, install packages, run tests, or execute scripts. Be careful with destructive commands.",
  inputSchema: z.object({
    command: z.string().describe("The command to execute"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory for the command (defaults to current directory)"),
    timeout: z
      .number()
      .optional()
      .default(60000)
      .describe("Command timeout in milliseconds (default: 60s)"),
  }),
  execute: async ({ command, cwd, timeout = 60000 }): Promise<CommandResponse> => {
    return new Promise((resolve) => {
      const workDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
      console.log(chalk.cyan(`\n⚡ Executing: ${command}`));
      console.log(chalk.gray(`   in: ${workDir}`));

      const child = spawn(command, {
        shell: true,
        cwd: workDir,
        env: { ...process.env },
      }) as ChildProcess;

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(chalk.gray(text));
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(chalk.yellow(text));
      });

      const timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({
          success: false,
          error: "Command timed out",
          stdout: stdout.substring(0, 10000),
          stderr: stderr.substring(0, 5000),
          timedOut: true,
        });
      }, timeout);

      child.on("close", (code: number | null) => {
        clearTimeout(timeoutId);
        const success = code === 0;

        if (success) {
          console.log(chalk.green(`\n✅ Command completed (exit code: ${code})`));
        } else {
          console.log(chalk.red(`\n❌ Command failed (exit code: ${code})`));
        }

        resolve({
          success,
          exitCode: code,
          stdout: stdout.substring(0, 10000),
          stderr: stderr.substring(0, 5000),
          command,
          cwd: workDir,
        });
      });

      child.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        console.error(chalk.red(`Command error: ${error.message}`));
        resolve({
          success: false,
          error: error.message,
          command,
          cwd: workDir,
        });
      });
    });
  },
});
