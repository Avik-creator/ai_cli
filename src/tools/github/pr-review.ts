import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../../config/env.ts";
import chalk from "chalk";

export interface PRReviewResponse {
  success: boolean;
  reviewId?: number;
  reviewUrl?: string;
  state?: string;
  error?: string;
}

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
