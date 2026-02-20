import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export interface FileReadResponse {
  success: boolean;
  path?: string;
  content?: string;
  size?: number;
  modified?: string;
  error?: string;
}

export const readFileTool = tool({
  description:
    "Read the contents of a file. Use this to examine existing code, configuration files, or any text file.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to read (relative or absolute)"),
    encoding: z.string().optional().default("utf-8").describe("File encoding"),
  }),
  execute: async ({ filePath, encoding = "utf-8" }): Promise<FileReadResponse> => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      console.log(chalk.cyan(`\n📖 Reading: ${filePath}`));

      try {
        await fs.stat(absolutePath);
      } catch (statError) {
        const dirPath = path.dirname(absolutePath);
        let suggestion = "";

        try {
          const dirStat = await fs.stat(dirPath);
          if (dirStat.isDirectory()) {
            try {
              const files = await fs.readdir(dirPath);
              if (files.length > 0) {
                const fileName = path.basename(filePath);
                const similar = files.filter(f =>
                  f.toLowerCase().includes(fileName.toLowerCase().substring(0, 3)) ||
                  fileName.toLowerCase().includes(f.toLowerCase().substring(0, 3))
                );
                if (similar.length > 0) {
                  suggestion = `\n  Did you mean one of these?\n  ${similar.slice(0, 5).map(f => `  - ${path.join(path.dirname(filePath), f)}`).join('\n')}`;
                } else {
                  suggestion = `\n  Files in ${path.dirname(filePath)}:\n  ${files.slice(0, 10).map(f => `  - ${path.join(path.dirname(filePath), f)}`).join('\n')}${files.length > 10 ? `\n  ... and ${files.length - 10} more` : ''}`;
                }
              }
            } catch {
            }
          }
        } catch {
          suggestion = `\n  Directory ${path.dirname(filePath)} does not exist.`;
        }

        const errorMsg = `File not found: ${filePath}${suggestion}`;
        console.error(chalk.red(`Read error: ${errorMsg}`));
        return {
          error: errorMsg,
          success: false,
          path: absolutePath,
        };
      }

      const content = await fs.readFile(absolutePath, { encoding: encoding as BufferEncoding });
      const stats = await fs.stat(absolutePath);

      console.log(chalk.green(`✅ Read ${content.length} characters`));

      return {
        success: true,
        path: absolutePath,
        content: content.substring(0, 50000),
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorMsg = err.code === 'ENOENT'
        ? `File not found: ${filePath}`
        : err.message || String(error);
      console.error(chalk.red(`Read error: ${errorMsg}`));
      return {
        error: errorMsg,
        success: false,
      };
    }
  },
});
