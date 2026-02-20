import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../../config/env.ts";
import chalk from "chalk";

export interface SearchResult {
  url: string;
  title: string;
  summary?: string;
  highlights?: string[];
  text?: string;
}

export interface ContentsResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

export const getContentsTool = tool({
  description:
    "Fetch and extract content from specific URLs. Use this when you have URLs and need their full content.",
  inputSchema: z.object({
    urls: z
      .array(z.string())
      .describe("Array of URLs to fetch content from (max 10)"),
    includeText: z.boolean().optional().default(true),
    includeSummary: z.boolean().optional().default(true),
  }),
  execute: async ({ urls, includeText = true, includeSummary = true }): Promise<ContentsResponse> => {
    const apiKey = await getApiKey("EXA_API_KEY");

    if (!apiKey) {
      return {
        error: "EXA_API_KEY is not set.",
        success: false,
      };
    }

    try {
      console.log(chalk.cyan(`\n📄 Fetching content from ${urls.length} URLs...`));

      const requestBody: Record<string, unknown> = {
        ids: urls.slice(0, 10),
      };

      if (includeText) {
        requestBody.text = { maxCharacters: 3000 };
      }
      if (includeSummary) {
        requestBody.summary = {};
      }
      requestBody.highlights = {
        numSentences: 3,
        highlightsPerUrl: 3,
      };

      const response = await fetch("https://api.exa.ai/contents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Exa API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        results?: Array<{
          url: string;
          title: string;
          summary?: string;
          highlights?: string[];
          text?: string;
        }>;
      };

      console.log(chalk.green(`✅ Retrieved content from ${data.results?.length || 0} URLs`));

      return {
        success: true,
        results: data.results?.map((r) => ({
          url: r.url,
          title: r.title,
          summary: r.summary,
          highlights: r.highlights,
          text: r.text?.substring(0, 2000),
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Content fetch error: ${errorMessage}`));
      return {
        error: errorMessage,
        success: false,
      };
    }
  },
});
