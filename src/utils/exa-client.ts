import { getApiKey } from "../config/env.ts";

const EXA_API_BASE = "https://api.exa.ai";

export interface ExaSearchOptions {
  query: string;
  type?: "auto" | "neural" | "fast" | "deep";
  numResults?: number;
  category?: string;
}

export interface ExaContentOptions {
  urls: string[];
  text?: { maxCharacters?: number };
  livecrawl?: "fallback" | "preferred" | "never";
}

export class ExaClient {
  private apiKey: string | null = null;

  async ensureApiKey(): Promise<string> {
    if (!this.apiKey) {
      const key = await getApiKey("EXA_API_KEY");
      if (!key) {
        throw new Error("EXA_API_KEY is not set. Run 'agentic config set EXA_API_KEY <key>' to set it.");
      }
      this.apiKey = key;
    }
    return this.apiKey;
  }

  async search(options: ExaSearchOptions) {
    const apiKey = await this.ensureApiKey();
    this.apiKey = apiKey;

    const { query, type = "auto", numResults = 5, category } = options;

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

    const response = await fetch(`${EXA_API_BASE}/search`, {
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

    return response.json() as Promise<{
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
    }>;
  }

  async getContents(options: ExaContentOptions) {
    const apiKey = await this.ensureApiKey();
    this.apiKey = apiKey;

    const { urls, text = { maxCharacters: 5000 }, livecrawl = "fallback" } = options;

    const response = await fetch(`${EXA_API_BASE}/contents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        urls,
        text: {
          ...text,
          maxCharacters: text.maxCharacters || 5000,
        },
        livecrawl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<{
      results?: Array<{
        url: string;
        title?: string;
        content?: string;
        text?: string;
        error?: string;
      }>;
    }>;
  }
}

export const exaClient = new ExaClient();
