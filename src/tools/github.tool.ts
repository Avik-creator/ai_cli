import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../config/env.ts";
import chalk from "chalk";
import { simpleGit } from "simple-git";

const git = simpleGit();

interface PRInfo {
  number: number;
  title: string;
  body: string | null;
  state: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  baseBranch?: string;
  headBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  mergeable?: boolean | null;
  url: string;
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface PRComment {
  user?: string;
  body: string;
  path?: string;
  line?: number | null;
  createdAt: string;
}

interface PRInfoResponse {
  success: boolean;
  pr?: PRInfo;
  files?: PRFile[];
  diff?: string;
  comments?: PRComment[];
  error?: string;
}

interface PRReviewResponse {
  success: boolean;
  reviewId?: number;
  reviewUrl?: string;
  state?: string;
  error?: string;
}

interface GitStatusResponse {
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

/**
 * Get PR Information Tool
 */
export const getPRInfoTool = tool({
  description:
    "Get information about a GitHub Pull Request including its diff, files changed, and comments. Use this to review PRs.",
  inputSchema: z.object({
    prUrl: z
      .string()
      .optional()
      .describe(
        "Full GitHub PR URL (e.g., https://github.com/owner/repo/pull/123). If not provided, will try to detect from current branch."
      ),
    owner: z.string().optional().describe("Repository owner/organization"),
    repo: z.string().optional().describe("Repository name"),
    prNumber: z.number().optional().describe("PR number"),
  }),
  execute: async ({ prUrl, owner, repo, prNumber }): Promise<PRInfoResponse> => {
    const token = await getApiKey("GITHUB_TOKEN");

    if (!token) {
      return {
        error:
          "GITHUB_TOKEN is not set. Run 'agentic config set GITHUB_TOKEN <token>' to set it.",
        success: false,
      };
    }

    try {
      let finalOwner = owner;
      let finalRepo = repo;
      let finalPrNumber = prNumber;

      // Parse PR URL if provided
      if (prUrl) {
        const urlMatch = prUrl.match(
          /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
        );
        if (urlMatch) {
          finalOwner = urlMatch[1];
          finalRepo = urlMatch[2];
          finalPrNumber = parseInt(urlMatch[3], 10);
        }
      }

      // If still no PR info, try to get from current git context
      if (!finalOwner || !finalRepo || !finalPrNumber) {
        try {
          const remotes = await git.getRemotes(true);
          const origin = remotes.find((r) => r.name === "origin");
          if (origin) {
            const match = origin.refs.fetch.match(
              /github\.com[\/:]([^\/]+)\/([^\/\.]+)/
            );
            if (match) {
              finalOwner = finalOwner || match[1];
              finalRepo = finalRepo || match[2];
            }
          }
        } catch (e) {
          // Git not available or not in a git repo
        }
      }

      if (!finalOwner || !finalRepo || !finalPrNumber) {
        return {
          error:
            "Could not determine PR details. Please provide prUrl or owner, repo, and prNumber.",
          success: false,
        };
      }

      console.log(chalk.cyan(`\n📋 Fetching PR #${finalPrNumber} from ${finalOwner}/${finalRepo}...`));

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      // Fetch PR details
      const prResponse = await fetch(
        `https://api.github.com/repos/${finalOwner}/${finalRepo}/pulls/${finalPrNumber}`,
        { headers }
      );

      if (!prResponse.ok) {
        throw new Error(`GitHub API error: ${prResponse.status}`);
      }

      const prData = await prResponse.json() as {
        number: number;
        title: string;
        body: string | null;
        state: string;
        user?: { login: string };
        created_at: string;
        updated_at: string;
        base?: { ref: string };
        head?: { ref: string };
        additions?: number;
        deletions?: number;
        changed_files?: number;
        mergeable?: boolean | null;
        html_url: string;
      };

      // Fetch PR diff
      const diffResponse = await fetch(
        `https://api.github.com/repos/${finalOwner}/${finalRepo}/pulls/${finalPrNumber}`,
        {
          headers: {
            ...headers,
            Accept: "application/vnd.github.v3.diff",
          },
        }
      );

      const diff = await diffResponse.text();

      // Fetch PR files
      const filesResponse = await fetch(
        `https://api.github.com/repos/${finalOwner}/${finalRepo}/pulls/${finalPrNumber}/files`,
        { headers }
      );

      const files = await filesResponse.json() as Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }>;

      // Fetch PR comments
      const commentsResponse = await fetch(
        `https://api.github.com/repos/${finalOwner}/${finalRepo}/pulls/${finalPrNumber}/comments`,
        { headers }
      );

      const comments = await commentsResponse.json() as Array<{
        user?: { login: string };
        body: string;
        path?: string;
        line?: number | null;
        created_at: string;
      }>;

      console.log(chalk.green(`✅ PR fetched: "${prData.title}"`));

      return {
        success: true,
        pr: {
          number: prData.number,
          title: prData.title,
          body: prData.body,
          state: prData.state,
          author: prData.user?.login,
          createdAt: prData.created_at,
          updatedAt: prData.updated_at,
          baseBranch: prData.base?.ref,
          headBranch: prData.head?.ref,
          additions: prData.additions,
          deletions: prData.deletions,
          changedFiles: prData.changed_files,
          mergeable: prData.mergeable,
          url: prData.html_url,
        },
        files: files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch?.substring(0, 3000), // Limit patch size
        })),
        diff: diff.substring(0, 15000), // Limit diff size for context
        comments: comments.map((c) => ({
          user: c.user?.login,
          body: c.body,
          path: c.path,
          line: c.line,
          createdAt: c.created_at,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`PR fetch error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});

/**
 * Post PR Review Comment Tool
 */
export const postPRCommentTool = tool({
  description:
    "Post a review comment on a GitHub Pull Request. Use this to provide feedback on PRs.",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    prNumber: z.number().describe("PR number"),
    body: z.string().describe("Comment body (supports markdown)"),
    event: z
      .enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"])
      .optional()
      .default("COMMENT")
      .describe("Review event type"),
  }),
  execute: async ({ owner, repo, prNumber, body, event = "COMMENT" }): Promise<PRReviewResponse> => {
    const token = await getApiKey("GITHUB_TOKEN");

    if (!token) {
      return {
        error: "GITHUB_TOKEN is not set.",
        success: false,
      };
    }

    try {
      console.log(chalk.cyan(`\n💬 Posting review on PR #${prNumber}...`));

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            body,
            event,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json() as { message?: string };
        throw new Error(errorData.message || `GitHub API error: ${response.status}`);
      }

      const reviewData = await response.json() as {
        id: number;
        html_url: string;
        state: string;
      };

      console.log(chalk.green(`✅ Review posted successfully`));

      return {
        success: true,
        reviewId: reviewData.id,
        reviewUrl: reviewData.html_url,
        state: reviewData.state,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Post review error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});

/**
 * Get Git Status Tool
 */
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

