import { Command } from "commander";
import chalk from "chalk";
import { runAgent } from "../agent/agent.js";

/**
 * Interactive chat command
 */
export const chatCommand = new Command("chat")
  .description("Start an interactive AI agent chat session")
  .option("-m, --mode <mode>", "Tool mode: all, search, code, pr-review", "all")
  .action(async (options) => {
    await runAgent({ mode: options.mode });
  });

/**
 * Search command - quick web search
 */
export const searchCommand = new Command("search")
  .description("Search the web using Exa AI")
  .argument("<query...>", "Search query")
  .action(async (queryParts) => {
    const query = queryParts.join(" ");
    await runAgent({
      mode: "search",
      singlePrompt: `Search the web for: ${query}. Provide a comprehensive summary of the results.`,
    });
  });

/**
 * Ask command - single question
 */
export const askCommand = new Command("ask")
  .description("Ask a single question (non-interactive)")
  .argument("<question...>", "Your question")
  .option("-m, --mode <mode>", "Tool mode: all, search, code, pr-review", "all")
  .action(async (questionParts, options) => {
    const question = questionParts.join(" ");
    await runAgent({
      mode: options.mode,
      singlePrompt: question,
    });
  });

/**
 * Review command - PR review
 */
export const reviewCommand = new Command("review")
  .description("Review a GitHub Pull Request")
  .argument("[pr-url]", "GitHub PR URL (optional if in git repo)")
  .option("--post", "Post the review as a comment on the PR")
  .action(async (prUrl, options) => {
    let prompt = "Review the PR";
    if (prUrl) {
      prompt = `Review this Pull Request: ${prUrl}`;
    } else {
      prompt = `Get the git status and help me understand the current changes. If there's an open PR for this branch, review it.`;
    }

    prompt += `

Please provide:
1. A summary of the changes
2. Code quality assessment
3. Potential issues or bugs
4. Suggestions for improvement
5. Security considerations if relevant`;

    if (options.post) {
      prompt += `\n\nAfter the review, post the review comment to the PR.`;
    }

    await runAgent({
      mode: "pr-review",
      singlePrompt: prompt,
    });
  });

/**
 * Generate command - code generation
 */
export const generateCommand = new Command("generate")
  .alias("gen")
  .description("Generate code or project structures")
  .argument("<description...>", "Description of what to generate")
  .action(async (descriptionParts) => {
    const description = descriptionParts.join(" ");
    await runAgent({
      mode: "code",
      singlePrompt: `Generate the following: ${description}

Please:
1. First check the current directory structure
2. Create all necessary files with complete, working code
3. Include any configuration files needed
4. Provide instructions for running/using the generated code`,
    });
  });

/**
 * Run command - execute and fix
 */
export const runCommand = new Command("run")
  .description("Run a command and help fix any errors")
  .argument("<command...>", "Command to run")
  .action(async (commandParts) => {
    const command = commandParts.join(" ");
    await runAgent({
      mode: "code",
      singlePrompt: `Execute the command: ${command}

If it fails:
1. Analyze the error
2. Search for solutions if needed
3. Fix the issue
4. Re-run the command to verify the fix`,
    });
  });

/**
 * Fix command - analyze and fix issues
 */
export const fixCommand = new Command("fix")
  .description("Analyze and fix issues in your codebase")
  .argument("[file]", "Specific file to fix (optional)")
  .option("-e, --error <error>", "Specific error message to fix")
  .action(async (file, options) => {
    let prompt = "";

    if (file) {
      prompt = `Read the file ${file} and analyze it for issues.`;
    } else {
      prompt = `Analyze the current project for issues.`;
    }

    if (options.error) {
      prompt += ` Focus on fixing this error: ${options.error}`;
    }

    prompt += `

Please:
1. Identify any problems or potential improvements
2. Fix the issues
3. Explain what was changed and why`;

    await runAgent({
      mode: "code",
      singlePrompt: prompt,
    });
  });

