import { Command } from "commander";
import chalk from "chalk";
import { runAgent } from "../agent/agent.ts";
import { sessionManager } from "../services/session-manager.ts";
import { createPanel } from "../utils/tui.ts";

interface RunAgentOptions {
  mode?: string;
  singlePrompt?: string;
  sessionId?: string | null;
}

/**
 * Interactive chat command
 */
export const chatCommand = new Command("chat")
  .description("Start an interactive AI agent chat session")
  .option("-m, --mode <mode>", "Tool mode: all, search, code, pr-review", "all")
  .option("-s, --session <session-id>", "Continue an existing session")
  .action(async (options: { mode: string; session?: string }) => {
    await runAgent({ 
      mode: options.mode,
      sessionId: options.session || null 
    });
  });

/**
 * Sessions command - list and manage sessions
 */
export const sessionsCommand = new Command("sessions")
  .description("List and manage chat sessions")
  .option("-l, --list", "List all sessions")
  .option("-d, --delete <session-id>", "Delete a session")
  .action(async (options: { list?: boolean; delete?: string }) => {
    if (options.delete) {
      sessionManager.deleteSession(options.delete);
      console.log(createPanel("✅ Session Deleted", chalk.green(`${options.delete.slice(0, 8)}...`), { tone: "success" }));
      return;
    }
    
    if (options.list) {
      const sessions = sessionManager.listSessions();
      console.log(
        createPanel(
          "📋 Chat Sessions",
          `${chalk.gray(`Total: ${sessions.length}`)}\n\n${sessionManager.formatSessionList(sessions)}`,
          { tone: "primary" }
        )
      );
      return;
    }
    
    console.log(createPanel("Sessions", chalk.yellow("Use --list to show sessions or --delete <id> to delete a session"), { tone: "warning" }));
  });

/**
 * Search command - quick web search
 */
export const searchCommand = new Command("search")
  .description("Search the web using Exa AI")
  .argument("<query...>", "Search query")
  .action(async (queryParts: string[]) => {
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
  .action(async (questionParts: string[], options: { mode: string }) => {
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
  .action(async (prUrl: string | undefined, options: { post?: boolean }) => {
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
  .action(async (descriptionParts: string[]) => {
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
  .action(async (commandParts: string[]) => {
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
  .action(async (file: string | undefined, options: { error?: string }) => {
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
