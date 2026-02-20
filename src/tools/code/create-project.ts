import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface CreateProjectResponse {
  success: boolean;
  basePath?: string;
  created?: string[];
  errors?: Array<{ path: string; error: string }>;
  totalFiles?: number;
  error?: string;
}

export const createProjectTool = tool({
  description:
    "Create a project with multiple files and directories at once. Use this to scaffold new projects or add features.",
  inputSchema: z.object({
    basePath: z
      .string()
      .optional()
      .default(".")
      .describe("Base directory for the project"),
    files: z
      .array(
        z.object({
          path: z.string().describe("Relative file path"),
          content: z.string().describe("File content"),
        })
      )
      .describe("Array of files to create with their content"),
  }),
  execute: async ({ basePath = ".", files }): Promise<CreateProjectResponse> => {
    try {
      const absoluteBase = path.resolve(process.cwd(), basePath);
      console.log(chalk.cyan(`\n🏗️  Creating project structure in: ${basePath}`));

      const created: string[] = [];
      const errors: Array<{ path: string; error: string }> = [];

      for (const file of files) {
        try {
          const filePath = path.join(absoluteBase, file.path);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, file.content, "utf-8");
          created.push(file.path);
          console.log(chalk.green(`  ✓ ${file.path}`));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ path: file.path, error: errorMessage });
          console.log(chalk.red(`  ✗ ${file.path}: ${errorMessage}`));
        }
      }

      console.log(chalk.green(`\n✅ Created ${created.length}/${files.length} files`));

      return {
        success: errors.length === 0,
        basePath: absoluteBase,
        created,
        errors: errors.length > 0 ? errors : undefined,
        totalFiles: files.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Project creation error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
