import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export interface DirectoryItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface ListDirResponse {
  success: boolean;
  path?: string;
  itemCount?: number;
  items?: DirectoryItem[];
  error?: string;
}

export const listDirTool = tool({
  description:
    "List contents of a directory. Use this to explore the file structure of a project.",
  inputSchema: z.object({
    dirPath: z
      .string()
      .optional()
      .default(".")
      .describe("Path to directory (defaults to current directory)"),
    recursive: z
      .boolean()
      .optional()
      .default(false)
      .describe("List recursively (be careful with large directories)"),
    maxDepth: z
      .number()
      .optional()
      .default(2)
      .describe("Maximum recursion depth"),
    showHidden: z
      .boolean()
      .optional()
      .default(false)
      .describe("Show hidden files"),
  }),
  execute: async ({
    dirPath = ".",
    recursive = false,
    maxDepth = 2,
    showHidden = false,
  }): Promise<ListDirResponse> => {
    try {
      const absolutePath = path.resolve(process.cwd(), dirPath);
      console.log(chalk.cyan(`\n📁 Listing: ${dirPath}`));

      async function listDir(dir: string, depth = 0): Promise<DirectoryItem[]> {
        if (depth > maxDepth) return [];

        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: DirectoryItem[] = [];

        for (const entry of entries) {
          if (!showHidden && entry.name.startsWith(".")) continue;
          if (entry.name === "node_modules") continue;

          const entryPath = path.join(dir, entry.name);
          const relativePath = path.relative(absolutePath, entryPath);

          const item: DirectoryItem = {
            name: entry.name,
            path: relativePath || entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          };

          if (!entry.isDirectory()) {
            try {
              const stats = await fs.stat(entryPath);
              item.size = stats.size;
            } catch { }
          }

          results.push(item);

          if (recursive && entry.isDirectory() && depth < maxDepth) {
            const subItems = await listDir(entryPath, depth + 1);
            results.push(...subItems);
          }
        }

        return results;
      }

      const items = await listDir(absolutePath);
      console.log(chalk.green(`✅ Found ${items.length} items`));

      return {
        success: true,
        path: absolutePath,
        itemCount: items.length,
        items,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`List error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
