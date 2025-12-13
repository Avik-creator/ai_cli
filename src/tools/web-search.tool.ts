import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../config/env.ts";
import chalk from "chalk";

interface SearchResult {
  url: string;
  title: string;
  summary?: string;
  highlights?: string[];
  text?: string;
  publishedDate?: string;
  author?: string;
}

interface WebSearchResponse {
  success: boolean;
  query?: string;
  results?: SearchResult[];
  searchType?: string;
  error?: string;
}

interface ContentsResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

/**
 * Exa Web Search Tool
 * Custom implementation that properly handles query parameter and execution
 */
export const webSearchTool = tool({
  description:
    "Search the web using Exa AI. Use this to find current information, documentation, news, research papers, and more.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query. Be specific and include relevant keywords."),
    type: z
      .enum(["auto", "neural", "fast", "deep"])
      .optional()
      .default("auto")
      .describe("Search type: auto (intelligent hybrid), neural (embeddings-based), fast (streamlined), deep (comprehensive)"),
    numResults: z
      .number()
      .optional()
      .default(5)
      .describe("Number of results to return (1-100)"),
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
      .describe("Filter results by category"),
  }),
  execute: async ({ query, type = "auto", numResults = 5, category }): Promise<WebSearchResponse> => {
    const apiKey = await getApiKey("EXA_API_KEY");

    if (!apiKey) {
      return {
        error: "EXA_API_KEY is not set. Run 'agentic config set EXA_API_KEY <key>' to set it.",
        success: false,
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        error: "Query parameter is required but was not provided or is empty.",
        success: false,
      };
    }

    try {
      console.log(chalk.cyan(`\n🔍 Searching: "${query}"...`));

      const requestBody: Record<string, unknown> = {
        query: query.trim(),
        type,
        numResults: Math.min(Math.max(1, numResults), 100),
        contents: {
          text: { maxCharacters: 2000 },
          livecrawl: "fallback",
          summary: true,
          highlights: {
            numSentences: 3,
            highlightsPerUrl: 2,
          },
        },
      };

      if (category) {
        requestBody.category = category;
      }

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

      const data = await response.json() as {
        results?: Array<{
          url: string;
          title: string;
          summary?: string;
          highlights?: string[];
          text?: string;
          publishedDate?: string;
          author?: string;
        }>;
        resolvedSearchType?: string;
      };

      console.log(chalk.green(`✅ Found ${data.results?.length || 0} results`));

      return {
        success: true,
        query: query.trim(),
        results: data.results?.map((r) => ({
          url: r.url,
          title: r.title,
          summary: r.summary,
          highlights: r.highlights,
          text: r.text?.substring(0, 2000),
          publishedDate: r.publishedDate,
          author: r.author,
        })) || [],
        searchType: data.resolvedSearchType || type,
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

/**
 * Get Contents Tool - for fetching specific URL contents
 */
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

