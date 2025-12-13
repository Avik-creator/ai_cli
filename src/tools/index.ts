/**
 * All available tools for the agentic CLI
 */
import { webSearchTool, getContentsTool } from "./web-search.tool.js";
import { getPRInfoTool, postPRCommentTool, getGitStatusTool } from "./github.tool.js";
import {
  readFileTool,
  writeFileTool,
  listDirTool,
  executeCommandTool,
  searchFilesTool,
  createProjectTool,
} from "./code.tool.js";
// Tool type - using a more flexible type that accepts any Tool
import type { Tool } from "ai";
export type ToolSet = Record<string, Tool<any, any>>;

/**
 * All tools organized by category
 */
export const toolsByCategory: {
  search: { webSearch: Tool<any, any>; getContents: Tool<any, any> };
  github: { getPRInfo: Tool<any, any>; postPRComment: Tool<any, any>; getGitStatus: Tool<any, any> };
  code: {
    readFile: Tool<any, any>;
    writeFile: Tool<any, any>;
    listDir: Tool<any, any>;
    executeCommand: Tool<any, any>;
    searchFiles: Tool<any, any>;
    createProject: Tool<any, any>;
  };
} = {
  search: {
    webSearch: webSearchTool,
    getContents: getContentsTool,
  },
  github: {
    getPRInfo: getPRInfoTool,
    postPRComment: postPRCommentTool,
    getGitStatus: getGitStatusTool,
  },
  code: {
    readFile: readFileTool,
    writeFile: writeFileTool,
    listDir: listDirTool,
    executeCommand: executeCommandTool,
    searchFiles: searchFilesTool,
    createProject: createProjectTool,
  },
};

/**
 * All tools as a flat object (for AI SDK)
 */
export const allTools: ToolSet = {
  // Web Search
  webSearch: webSearchTool,
  getContents: getContentsTool,

  // GitHub / PR Review
  getPRInfo: getPRInfoTool,
  postPRComment: postPRCommentTool,
  getGitStatus: getGitStatusTool,

  // Code / File Operations
  readFile: readFileTool,
  writeFile: writeFileTool,
  listDir: listDirTool,
  executeCommand: executeCommandTool,
  searchFiles: searchFilesTool,
  createProject: createProjectTool,
};

/**
 * Get tools by task type
 */
export function getToolsForTask(taskType: string): ToolSet {
  switch (taskType) {
    case "search":
      return {
        webSearch: webSearchTool,
        getContents: getContentsTool,
      };

    case "pr-review":
      return {
        getPRInfo: getPRInfoTool,
        postPRComment: postPRCommentTool,
        getGitStatus: getGitStatusTool,
        readFile: readFileTool,
        webSearch: webSearchTool,
      };

    case "code":
      return {
        readFile: readFileTool,
        writeFile: writeFileTool,
        listDir: listDirTool,
        executeCommand: executeCommandTool,
        searchFiles: searchFilesTool,
        createProject: createProjectTool,
        webSearch: webSearchTool,
      };

    case "all":
    default:
      return allTools;
  }
}

/**
 * Tool descriptions for help text
 */
export const toolDescriptions = [
  {
    category: "Web Search",
    tools: [
      { name: "webSearch", description: "Search the web using Exa AI" },
      { name: "getContents", description: "Fetch content from URLs" },
    ],
  },
  {
    category: "GitHub / PR Review",
    tools: [
      { name: "getPRInfo", description: "Get PR details, diff, and comments" },
      { name: "postPRComment", description: "Post review comments on PRs" },
      { name: "getGitStatus", description: "Get current git status" },
    ],
  },
  {
    category: "Code / Files",
    tools: [
      { name: "readFile", description: "Read file contents" },
      { name: "writeFile", description: "Write content to files" },
      { name: "listDir", description: "List directory contents" },
      { name: "executeCommand", description: "Run shell commands" },
      { name: "searchFiles", description: "Search for files by pattern" },
      { name: "createProject", description: "Create multiple files at once" },
    ],
  },
] as const;

export {
  webSearchTool,
  getContentsTool,
  getPRInfoTool,
  postPRCommentTool,
  getGitStatusTool,
  readFileTool,
  writeFileTool,
  listDirTool,
  executeCommandTool,
  searchFilesTool,
  createProjectTool,
};

