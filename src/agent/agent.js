import chalk from "chalk";
import boxen from "boxen";
import { text, isCancel, confirm, select, spinner } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { aiService } from "../services/ai.service.js";
import { allTools, getToolsForTask, toolDescriptions } from "../tools/index.js";
import { config, getCurrentProvider } from "../config/env.js";
import { PROVIDERS } from "../config/providers.js";

// Configure marked for terminal
marked.use(
  markedTerminal({
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow,
    link: chalk.blue.underline,
  })
);

/**
 * System prompt for the agentic assistant
 */
const SYSTEM_PROMPT = `You are agentic, an intelligent CLI assistant with access to powerful tools for development tasks.

## Your Capabilities:
1. **Web Search** - Search the internet for documentation, code examples, solutions, and current information using Exa AI
2. **GitHub/PR Review** - Review pull requests, analyze diffs, post review comments, and check git status
3. **Code Operations** - Read, write, and search files; execute shell commands; create project structures

## Guidelines:
- Be concise but thorough in your responses
- Use tools proactively when they would help answer the user's question
- For code changes, always read the existing file first before making modifications
- When executing commands, explain what you're doing and why
- For PR reviews, analyze the diff systematically and provide constructive feedback
- When searching the web, synthesize information from multiple sources
- Format your responses using markdown for better readability

## Safety:
- Never execute destructive commands (rm -rf, format, etc.) without explicit user confirmation
- Don't expose API keys or sensitive information
- Be cautious with write operations - confirm before overwriting important files

## Tool Usage Strategy:
- Use webSearch to find documentation, solutions, or current information
- Use getPRInfo before postPRComment to understand the full context
- Use listDir and searchFiles before readFile to locate files
- Use readFile before writeFile to understand existing code
- Chain tools together to accomplish complex tasks

Current working directory: ${process.cwd()}
`;

/**
 * Display tool call information
 */
function displayToolCall(toolCall) {
  const box = boxen(
    `${chalk.cyan("Tool:")} ${chalk.bold(toolCall.toolName)}\n` +
    `${chalk.gray("Args:")} ${JSON.stringify(toolCall.args, null, 2).substring(0, 200)}${JSON.stringify(toolCall.args).length > 200 ? "..." : ""
    }`,
    {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: { left: 2 },
      borderStyle: "round",
      borderColor: "cyan",
      dimBorder: true,
    }
  );
  console.log(box);
}

/**
 * Display tool result summary
 */
function displayToolResult(toolResult) {
  const success = toolResult.result?.success !== false;
  const color = success ? "green" : "red";
  const icon = success ? "✓" : "✗";

  let resultPreview = "";
  if (toolResult.result) {
    if (typeof toolResult.result === "string") {
      resultPreview = toolResult.result.substring(0, 100);
    } else if (toolResult.result.error) {
      resultPreview = toolResult.result.error;
    } else {
      resultPreview = "Completed successfully";
    }
  }

  console.log(
    chalk[color](
      `  ${icon} ${toolResult.toolName}: ${resultPreview}${resultPreview.length >= 100 ? "..." : ""
      }`
    )
  );
}

/**
 * Main agent chat loop
 */
export async function runAgent(options = {}) {
  const { mode = "all", singlePrompt = null } = options;

  // Initialize AI service
  try {
    await aiService.initialize();
  } catch (error) {
    console.log(
      boxen(chalk.red(`❌ ${error.message}`), {
        padding: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
    console.log(
      chalk.yellow("\nRun 'agentic config setup' to configure your API keys.\n") +
      chalk.gray("You need AI_GATEWAY_API_KEY from https://vercel.com/ai-gateway\n")
    );
    process.exit(1);
  }

  // Get tools for this mode
  const tools = getToolsForTask(mode);
  const toolNames = Object.keys(tools);

  // Display intro
  if (!singlePrompt) {
    const currentModel = aiService.getModelId();
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];

    console.log(
      boxen(
        chalk.bold.cyan("🚀 agentic AI Agent\n\n") +
        chalk.gray("An agentic assistant for development tasks\n") +
        chalk.gray(`Provider: ${chalk.white(provider.name)} | `) +
        chalk.gray(`Mode: ${chalk.white(mode)} | Tools: ${chalk.white(toolNames.length)}\n`) +
        chalk.gray(`Model: ${chalk.white(currentModel)}`),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: "double",
          borderColor: "cyan",
        }
      )
    );

    console.log(
      boxen(
        `${chalk.gray("Available tools:")}\n` +
        toolNames.map((t) => chalk.cyan(`  • ${t}`)).join("\n") +
        `\n\n${chalk.gray('Type "help" for commands, "exit" to quit')}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "gray",
          dimBorder: true,
        }
      )
    );
  }

  // Conversation history
  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
  ];

  // Single prompt mode
  if (singlePrompt) {
    await processMessage(singlePrompt, messages, tools);
    return;
  }

  // Interactive loop
  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Ask me anything...",
      validate: (val) => {
        if (!val || val.trim().length === 0) {
          return "Please enter a message";
        }
      },
    });

    if (isCancel(userInput)) {
      console.log(chalk.yellow("\n👋 Goodbye!\n"));
      process.exit(0);
    }

    const input = userInput.trim();

    // Handle special commands
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.yellow("\n👋 Goodbye!\n"));
      break;
    }

    if (input.toLowerCase() === "help") {
      showHelp();
      continue;
    }

    if (input.toLowerCase() === "clear") {
      messages.length = 1; // Keep system prompt
      console.log(chalk.gray("Conversation cleared.\n"));
      continue;
    }

    if (input.toLowerCase() === "tools") {
      showTools();
      continue;
    }

    await processMessage(input, messages, tools);
  }
}

/**
 * Process a single message
 */
async function processMessage(input, messages, tools) {
  // Add user message
  messages.push({
    role: "user",
    content: input,
  });

  // Display user message
  console.log(
    boxen(chalk.white(input), {
      padding: 1,
      margin: { left: 2, top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "blue",
      title: "👤 You",
      titleAlignment: "left",
    })
  );

  const spin = yoctoSpinner({ text: "Thinking...", color: "cyan" }).start();

  try {
    let fullResponse = "";
    let isFirstChunk = true;
    const toolCallsProcessed = [];

    const result = await aiService.sendMessage(
      messages,
      (chunk) => {
        if (isFirstChunk) {
          spin.stop();
          console.log(chalk.green.bold("\n🤖 agentic:"));
          console.log(chalk.gray("─".repeat(60)));
          isFirstChunk = false;
        }
        fullResponse += chunk;
      },
      tools,
      (toolCall) => {
        if (isFirstChunk) {
          spin.stop();
          isFirstChunk = false;
        }
        displayToolCall(toolCall);
        toolCallsProcessed.push(toolCall);
      },
      { maxSteps: 15 }
    );

    // Display tool results if any
    if (result.toolResults && result.toolResults.length > 0) {
      console.log(chalk.gray("\n📊 Tool Results:"));
      for (const tr of result.toolResults) {
        displayToolResult(tr);
      }
    }

    // Render the response
    if (fullResponse) {
      console.log("");
      const rendered = marked.parse(fullResponse);
      console.log(rendered);
    }

    console.log(chalk.gray("─".repeat(60)));

    // Add assistant response to history
    if (fullResponse) {
      messages.push({
        role: "assistant",
        content: fullResponse,
      });
    }

    // Display usage if available
    if (result.usage) {
      console.log(
        chalk.gray(
          `\n📈 Tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion = ${result.usage.totalTokens} total`
        )
      );
    }

    console.log("");
  } catch (error) {
    spin.stop();
    console.log(
      boxen(chalk.red(`❌ Error: ${error.message}`), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(
    boxen(
      `${chalk.bold.cyan("Commands:")}\n\n` +
      `${chalk.yellow("help")}    - Show this help message\n` +
      `${chalk.yellow("tools")}   - List available tools\n` +
      `${chalk.yellow("clear")}   - Clear conversation history\n` +
      `${chalk.yellow("exit")}    - Exit the agent\n\n` +
      `${chalk.bold.cyan("Examples:")}\n\n` +
      `${chalk.gray('• "Search for React best practices"')}\n` +
      `${chalk.gray('• "Review PR https://github.com/owner/repo/pull/123"')}\n` +
      `${chalk.gray('• "Create a new Express API project"')}\n` +
      `${chalk.gray('• "Read package.json and explain the dependencies"')}\n` +
      `${chalk.gray('• "Run npm test and fix any failing tests"')}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
        title: "💡 Help",
      }
    )
  );
}

/**
 * Show available tools
 */
function showTools() {
  let output = "";
  for (const category of toolDescriptions) {
    output += `${chalk.bold.cyan(category.category)}\n`;
    for (const tool of category.tools) {
      output += `  ${chalk.yellow(tool.name.padEnd(16))} ${chalk.gray(tool.description)}\n`;
    }
    output += "\n";
  }

  console.log(
    boxen(output.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
      title: "🛠️  Available Tools",
    })
  );
}

