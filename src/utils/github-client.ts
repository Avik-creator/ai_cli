import { getApiKey } from "../config/env.ts";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export class GitHubClient {
  private token: string | null = null;

  async ensureToken(): Promise<string> {
    if (!this.token) {
      const token = await getApiKey("GITHUB_TOKEN");
      if (!token) {
        throw new Error("GITHUB_TOKEN is not set. Run 'agentic config set GITHUB_TOKEN <token>' to set it.");
      }
      this.token = token;
    }
    return this.token;
  }

  private getHeaders(accept: string = "application/vnd.github.v3+json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: accept,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    };
  }

  async get<T>(endpoint: string, accept?: string): Promise<T> {
    const token = await this.ensureToken();
    this.token = token;
    
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers: this.getHeaders(accept),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getText(endpoint: string): Promise<string> {
    const token = await this.ensureToken();
    this.token = token;
    
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers: this.getHeaders("application/vnd.github.v3.diff"),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.text();
  }

  async getPR(owner: string, repo: string, prNumber: number) {
    return this.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  }

  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    return this.getText(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  }

  async getPRFiles(owner: string, repo: string, prNumber: number) {
    return this.get<Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>>(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
  }

  async getPRComments(owner: string, repo: string, prNumber: number) {
    return this.get<Array<{
      user?: { login: string };
      body: string;
      path?: string;
      line?: number | null;
      created_at: string;
    }>>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`);
  }

  async postReview(owner: string, repo: string, prNumber: number, body: string, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT") {
    const token = await this.ensureToken();
    this.token = token;
    
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({ body, event }),
    });

    if (!response.ok) {
      const error = await response.json() as { message?: string };
      throw new Error(`GitHub API error: ${response.status} - ${error.message}`);
    }

    return response.json();
  }
}

export const githubClient = new GitHubClient();
