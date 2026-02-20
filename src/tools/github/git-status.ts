import { tool } from "ai";
import { z } from "zod";
import chalk from "chalk";
import { simpleGit } from "simple-git";

const git = simpleGit();

export interface GitStatusResponse {
  success: boolean;
  currentBranch?: string;
  tracking?: string | null;
  ahead?: number;
  behind?: number;
  staged?: string[];
  modified?: string[];
  deleted?: string[];
  untracked?: string[];
  conflicted?: string[];
  isClean?: boolean;
  branches?: string[];
  recentCommits?: Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>;
  diff?: string | null;
  error?: string;
}

export const getGitStatusTool = tool({
  description:
    "Get the current git status including branch, uncommitted changes, and recent commits.",
  inputSchema: z.object({
    includeDiff: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include diff of uncommitted changes"),
    commitCount: z
      .number()
      .optional()
      .default(5)
      .describe("Number of recent commits to include"),
  }),
  execute: async ({ includeDiff = false, commitCount = 5 }): Promise<GitStatusResponse> => {
    try {
      console.log(chalk.cyan("\n📊 Getting git status..."));

      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return {
          error: "Not in a git repository",
          success: false,
        };
      }

      const status = await git.status();
      const branch = await git.branchLocal();
      const log = await git.log({ maxCount: commitCount });

      let diff: string | null = null;
      if (includeDiff && (status.modified.length > 0 || status.staged.length > 0)) {
        diff = await git.diff();
      }

      console.log(chalk.green(`✅ On branch: ${status.current}`));

      return {
        success: true,
        currentBranch: status.current || undefined,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        deleted: status.deleted,
        untracked: status.not_added,
        conflicted: status.conflicted,
        isClean: status.isClean(),
        branches: branch.all,
        recentCommits: log.all.map((c) => ({
          hash: c.hash.substring(0, 7),
          message: c.message,
          author: c.author_name,
          date: c.date,
        })),
        diff: diff?.substring(0, 5000) || null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Git status error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
