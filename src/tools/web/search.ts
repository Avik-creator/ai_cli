import { tool } from "ai";
import { z } from "zod";
import { getApiKey } from "../../config/env.ts";
import chalk from "chalk";
import { exaClient } from "../../utils/exa-client.ts";

export interface SearchResult {
  url: string;
  title: string;
  summary?: string;
  highlights?: string[];
  text?: string;
  publishedDate?: string;
  author?: string;
}

export interface WebSearchResponse {
  success: boolean;
  query?: string;
  results?: SearchResult[];
  searchType?: string;
  error?: string;
}

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

      const data = await exaClient.search({
        query,
        type,
        numResults,
        category,
      });

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
