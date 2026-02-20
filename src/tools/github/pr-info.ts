import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../../config/env.ts";
import chalk from "chalk";
import { simpleGit } from "simple-git";
import { githubClient } from "../../utils/github-client.ts";

const git = simpleGit();

export interface PRInfo {
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

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRComment {
  user?: string;
  body: string;
  path?: string;
  line?: number | null;
  createdAt: string;
}

export interface PRInfoResponse {
  success: boolean;
  pr?: PRInfo;
  files?: PRFile[];
  diff?: string;
  comments?: PRComment[];
  error?: string;
}

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

      const prData = await githubClient.getPR(finalOwner, finalRepo, finalPrNumber) as {
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

      const diff = await githubClient.getPRDiff(finalOwner, finalRepo, finalPrNumber);
      const files = await githubClient.getPRFiles(finalOwner, finalRepo, finalPrNumber);
      const comments = await githubClient.getPRComments(finalOwner, finalRepo, finalPrNumber);

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
          patch: f.patch?.substring(0, 3000),
        })),
        diff: diff.substring(0, 15000),
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
