import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../config/env.js";
import chalk from "chalk";

/**
 * Exa Web Search Tool
 * Uses Exa API to search the web and retrieve content
 */
export const webSearchTool = tool({
  description:
    "Search the web for information using Exa AI. Use this to find current information, documentation, code examples, research papers, news, and more.",
  parameters: z.object({
    query: z.string().describe("The search query to find relevant information"),
    type: z
      .enum(["auto", "neural", "deep"])
      .optional()
      .default("auto")
      .describe(
        "Search type: 'auto' (intelligent selection), 'neural' (embeddings-based), 'deep' (comprehensive with query expansion)"
      ),
    numResults: z
      .number()
      .optional()
      .default(5)
      .describe("Number of results to return (1-25)"),
    category: z
      .enum([
        "company",
        "research paper",
        "news",
        "pdf",
        "github",
        "tweet",
        "personal site",
        "linkedin profile",
        "financial report",
      ])
      .optional()
      .describe("Optional category to focus search on"),
    includeText: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include full text content from results"),
    includeSummary: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include AI-generated summaries"),
  }),
  execute: async ({
    query,
    type = "auto",
    numResults = 5,
    category,
    includeText = true,
    includeSummary = true,
  }) => {
    const apiKey = await getApiKey("EXA_API_KEY");

    if (!apiKey) {
      return {
        error:
          "EXA_API_KEY is not set. Run 'agentic config set EXA_API_KEY <key>' to set it.",
        success: false,
      };
    }

    try {
      console.log(chalk.cyan(`\n🔍 Searching: "${query}"...`));

      const requestBody = {
        query,
        type,
        numResults: Math.min(numResults, 25),
        contents: {},
      };

      if (category) {
        requestBody.category = category;
      }

      if (includeText) {
        requestBody.contents.text = {
          maxCharacters: 2000,
        };
      }

      if (includeSummary) {
        requestBody.contents.summary = {};
      }

      // Add highlights
      requestBody.contents.highlights = {
        numSentences: 3,
        highlightsPerUrl: 2,
      };

      const response = await fetch("https://api.exa.ai/search", {
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

      console.log(chalk.green(`✅ Found ${data.results?.length || 0} results`));

      // Format results for the AI
      const formattedResults = data.results?.map((result, index) => ({
        index: index + 1,
        title: result.title,
        url: result.url,
        publishedDate: result.publishedDate,
        author: result.author,
        summary: result.summary,
        highlights: result.highlights,
        text: result.text?.substring(0, 1500), // Limit text length
      }));

      return {
        success: true,
        query,
        searchType: data.resolvedSearchType || type,
        resultCount: formattedResults?.length || 0,
        results: formattedResults,
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

