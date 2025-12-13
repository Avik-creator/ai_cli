import { webSearch as exaWebSearch } from "@exalabs/ai-sdk";
import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../config/env.js";
import chalk from "chalk";

/**
 * Exa Web Search Tool
 * Uses the official @exalabs/ai-sdk package for AI SDK 5 compatibility
 */
export const webSearchTool = exaWebSearch({
  // Default configuration
  type: "auto", // intelligent hybrid search
  numResults: 5, // return up to 5 results
  contents: {
    text: { maxCharacters: 2000 }, // get up to 2000 chars per result
    livecrawl: "fallback", // get fresh content when needed
    summary: true, // return AI-generated summary for each result
    highlights: {
      numSentences: 3,
      highlightsPerUrl: 2,
    },
  },
});

/**
 * Get Contents Tool - for fetching specific URL contents
 */
export const getContentsTool = tool({
  description:
    "Fetch and extract content from specific URLs. Use this when you have URLs and need their full content.",
  parameters: z.object({
    urls: z
      .array(z.string())
      .describe("Array of URLs to fetch content from (max 10)"),
    includeText: z.boolean().optional().default(true),
    includeSummary: z.boolean().optional().default(true),
  }),
  execute: async ({ urls, includeText = true, includeSummary = true }) => {
    const apiKey = await getApiKey("EXA_API_KEY");

    if (!apiKey) {
      return {
        error: "EXA_API_KEY is not set.",
        success: false,
      };
    }

    try {
      console.log(chalk.cyan(`\n📄 Fetching content from ${urls.length} URLs...`));

      const requestBody = {
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

      const data = await response.json();

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
      console.error(chalk.red(`Content fetch error: ${error.message}`));
      return {
        error: error.message,
        success: false,
      };
    }
  },
});

