import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export interface FileWriteResponse {
  success: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
}

export const writeFileTool = tool({
  description:
    "Write content to a file. Use this to create new files or update existing ones. Creates directories if needed.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to write (relative or absolute)"),
    content: z.string().describe("Content to write to the file"),
    createDirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Create parent directories if they don't exist"),
  }),
  execute: async ({ filePath, content, createDirs = true }): Promise<FileWriteResponse> => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      console.log(chalk.cyan(`\n📝 Writing: ${filePath}`));

      if (createDirs) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      }

      await fs.writeFile(absolutePath, content, "utf-8");
      const stats = await fs.stat(absolutePath);

      console.log(chalk.green(`✅ Wrote ${content.length} characters`));

      return {
        success: true,
        path: absolutePath,
        bytesWritten: stats.size,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Write error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
