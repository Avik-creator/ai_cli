import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export interface FileMatch {
  name: string;
  path: string;
}

export interface SearchFilesResponse {
  success: boolean;
  pattern?: string;
  matches?: FileMatch[];
  matchCount?: number;
  truncated?: boolean;
  error?: string;
}

export const searchFilesTool = tool({
  description:
    "Search for files by name pattern. Use this to find specific files in a project.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("File name pattern to search for (e.g., '*.ts', 'package.json')"),
    directory: z
      .string()
      .optional()
      .default(".")
      .describe("Directory to search in"),
    maxResults: z.number().optional().default(20).describe("Maximum results to return"),
  }),
  execute: async ({ pattern, directory = ".", maxResults = 20 }): Promise<SearchFilesResponse> => {
    try {
      const absolutePath = path.resolve(process.cwd(), directory);
      console.log(chalk.cyan(`\n🔎 Searching for: ${pattern}`));

      const matches: FileMatch[] = [];
      const patternRegex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        "i"
      );

      async function search(dir: string, depth = 0): Promise<void> {
        if (depth > 10 || matches.length >= maxResults) return;

        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (matches.length >= maxResults) break;
            if (entry.name.startsWith(".") || entry.name === "node_modules")
              continue;

            const entryPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              await search(entryPath, depth + 1);
            } else if (patternRegex.test(entry.name)) {
              matches.push({
                name: entry.name,
                path: path.relative(absolutePath, entryPath),
              });
            }
          }
        } catch { }
      }

      await search(absolutePath);
      console.log(chalk.green(`✅ Found ${matches.length} files`));

      return {
        success: true,
        pattern,
        matches,
        matchCount: matches.length,
        truncated: matches.length >= maxResults,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Search error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
