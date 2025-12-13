import { tool } from "ai";
import { z } from "zod";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

/**
 * Read File Tool
 */
export const readFileTool = tool({
  description:
    "Read the contents of a file. Use this to examine existing code, configuration files, or any text file.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to read (relative or absolute)"),
    encoding: z.string().optional().default("utf-8").describe("File encoding"),
  }),
  execute: async ({ filePath, encoding = "utf-8" }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      console.log(chalk.cyan(`\n📖 Reading: ${filePath}`));

      // Check if file exists first
      try {
        await fs.stat(absolutePath);
      } catch (statError) {
        // File doesn't exist, provide helpful error
        const dirPath = path.dirname(absolutePath);
        let suggestion = "";

        try {
          // Check if directory exists
          const dirStat = await fs.stat(dirPath);
          if (dirStat.isDirectory()) {
            // Try to list files in the directory to suggest alternatives
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
              // Can't read directory, skip suggestion
            }
          }
        } catch {
          // Directory doesn't exist
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

      const content = await fs.readFile(absolutePath, { encoding });
      const stats = await fs.stat(absolutePath);

      console.log(chalk.green(`✅ Read ${content.length} characters`));

      return {
        success: true,
        path: absolutePath,
        content: content.substring(0, 50000), // Limit content size
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      const errorMsg = error.code === 'ENOENT'
        ? `File not found: ${filePath}`
        : error.message;
      console.error(chalk.red(`Read error: ${errorMsg}`));
      return {
        error: errorMsg,
        success: false,
      };
    }
  },
});

/**
 * Write File Tool
 */
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
  execute: async ({ filePath, content, createDirs = true }) => {
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
      console.error(chalk.red(`Write error: ${error.message}`));
      return {
        error: error.message,
        success: false,
      };
    }
  },
});

/**
 * List Directory Tool
 */
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
  }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), dirPath);
      console.log(chalk.cyan(`\n📁 Listing: ${dirPath}`));

      async function listDir(dir, depth = 0) {
        if (depth > maxDepth) return [];

        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results = [];

        for (const entry of entries) {
          if (!showHidden && entry.name.startsWith(".")) continue;
          if (entry.name === "node_modules") continue;

          const entryPath = path.join(dir, entry.name);
          const relativePath = path.relative(absolutePath, entryPath);

          const item = {
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
      console.error(chalk.red(`List error: ${error.message}`));
      return {
        error: error.message,
        success: false,
      };
    }
  },
});

/**
 * Execute Command Tool
 */
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
  execute: async ({ command, cwd, timeout = 60000 }) => {
    return new Promise((resolve) => {
      const workDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
      console.log(chalk.cyan(`\n⚡ Executing: ${command}`));
      console.log(chalk.gray(`   in: ${workDir}`));

      const child = spawn(command, {
        shell: true,
        cwd: workDir,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(chalk.gray(text));
      });

      child.stderr.on("data", (data) => {
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

      child.on("close", (code) => {
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

      child.on("error", (error) => {
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

/**
 * Search Files Tool
 */
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
  execute: async ({ pattern, directory = ".", maxResults = 20 }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), directory);
      console.log(chalk.cyan(`\n🔎 Searching for: ${pattern}`));

      const matches = [];
      const patternRegex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        "i"
      );

      async function search(dir, depth = 0) {
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
      console.error(chalk.red(`Search error: ${error.message}`));
      return {
        error: error.message,
        success: false,
      };
    }
  },
});

/**
 * Create Project Structure Tool
 */
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
  execute: async ({ basePath = ".", files }) => {
    try {
      const absoluteBase = path.resolve(process.cwd(), basePath);
      console.log(chalk.cyan(`\n🏗️  Creating project structure in: ${basePath}`));

      const created = [];
      const errors = [];

      for (const file of files) {
        try {
          const filePath = path.join(absoluteBase, file.path);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, file.content, "utf-8");
          created.push(file.path);
          console.log(chalk.green(`  ✓ ${file.path}`));
        } catch (error) {
          errors.push({ path: file.path, error: error.message });
          console.log(chalk.red(`  ✗ ${file.path}: ${error.message}`));
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
      console.error(chalk.red(`Project creation error: ${error.message}`));
      return {
        error: error.message,
        success: false,
      };
    }
  },
});

