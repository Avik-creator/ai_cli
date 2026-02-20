import chalk from "chalk";
import boxen from "boxen";
import { text, isCancel, confirm } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { aiService } from "../services/ai.service.ts";
import { allTools, getToolsForTask, toolDescriptions } from "../tools/index.ts";
import { config, getCurrentProvider } from "../config/env.ts";
import { PROVIDERS } from "../config/providers.ts";
import { sessionManager } from "../services/session-manager.ts";
import { specStorage } from "../services/planning/spec-storage.ts";
import type { CoreMessage } from "ai";
import type { ToolSet } from "../tools/index.ts";

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
  }) as Parameters<typeof marked.use>[0]
);

/**
 * Build system prompt with personality
 */
function buildSystemPrompt(): string {
  const personalityAddition = sessionManager.getPersonalityPromptAddition();
  
  const basePrompt = `You are agentic, an intelligent CLI assistant with access to powerful tools for development tasks.

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
- **webSearch tool**: When using webSearch, ALWAYS provide the "query" parameter with a clear, specific search query. Example: webSearch({"query": "React CVE 2024 security vulnerabilities"})
- Use getPRInfo before postPRComment to understand the full context
- Use listDir and searchFiles before readFile to locate files
- Use readFile before writeFile to understand existing code
- Chain tools together to accomplish complex tasks

## Important:
- When a user asks about current information, news, or recent events, you MUST use the webSearch tool
- Always include the "query" parameter when calling webSearch - extract the key search terms from the user's question
- If a tool call fails, try again with clearer parameters

Current working directory: ${process.cwd()}
`;

  if (personalityAddition) {
    return basePrompt + "\n\n" + personalityAddition;
  }
  return basePrompt;
}

interface RunAgentOptions {
  mode?: string;
  singlePrompt?: string | null;
  sessionId?: string | null;
  switchModel?: boolean;
  modelId?: string;
  planId?: string | null;
}

interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  toolName: string;
  result?: {
    success?: boolean;
    error?: string;
  } | string;
}

function formatSpecForPrompt(spec: any): string {
  let output = `# ${spec.title}\n\n`;
  output += `## Goal\n${spec.goal}\n\n`;
  
  if (spec.inScope.length > 0) {
    output += `## In Scope\n`;
    for (const item of spec.inScope) {
      output += `- ${item}\n`;
    }
    output += "\n";
  }
  
  if (spec.outOfScope.length > 0) {
    output += `## Out of Scope\n`;
    for (const item of spec.outOfScope) {
      output += `- ${item}\n`;
    }
    output += "\n";
  }
  
  if (spec.fileBoundaries.length > 0) {
    output += `## File Boundaries\n`;
    for (const boundary of spec.fileBoundaries) {
      output += `- ${boundary}\n`;
    }
    output += "\n";
  }
  
  if (spec.acceptanceCriteria.length > 0) {
    output += `## Acceptance Criteria\n`;
    for (const criteria of spec.acceptanceCriteria) {
      output += `- ${criteria}\n`;
    }
    output += "\n";
  }
  
  return output;
}

async function runPlanExecution(specId: string): Promise<boolean> {
  const spec = specStorage.getSpec(specId);
  if (!spec) {
    console.log(chalk.red(`Plan not found: ${specId}`));
    return false;
  }

  console.log(
    boxen(
      chalk.bold.cyan("📋 Plan Execution Mode\n\n") +
      chalk.gray("You are about to execute a plan. The AI will:\n") +
      chalk.white("1. Analyze the codebase\n") +
      chalk.white("2. Generate implementation steps\n") +
      chalk.white("3. Ask for confirmation BEFORE making changes\n") +
      chalk.white("4. Execute only after you approve"),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "yellow",
      }
    )
  );

  console.log(
    boxen(
      formatSpecForPrompt(spec),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
        title: "📝 Plan Details",
      }
    )
  );

  await aiService.initialize();

  const prompt = `You are executing a plan. Your task is to:

1. First, explore the codebase to understand the current structure
2. Generate a detailed implementation plan based on the spec below
3. Present the implementation steps clearly
4. WAIT for user confirmation before making ANY changes

## SPEC:
${formatSpecForPrompt(spec)}

## Your Response Format:
Start by exploring the codebase, then present:

### Implementation Steps
1. [Step description]
2. [Step description]
...

### Files to Modify
- file1.ts
- file2.ts
...

### Files to Create
- new-file.ts
...

Then ask: "Should I start implementing these changes? (yes/no)"

DO NOT make any changes until the user explicitly confirms.`;

  const spin = yoctoSpinner({ text: "Analyzing codebase and generating plan...", color: "cyan" }).start();

  let fullResponse = "";

  await aiService.sendMessage(
    [
      {
        role: "system",
        content: prompt,
      },
    ],
    (chunk) => {
      if (fullResponse === "") {
        spin.stop();
        console.log(chalk.green.bold("\n🤖 AI Plan:\n"));
        console.log(chalk.gray("─".repeat(60)));
      }
      fullResponse += chunk;
    },
    {},
    undefined,
    { maxSteps: 5 }
  );

  spin.stop();

  if (fullResponse) {
    const rendered = marked.parse(fullResponse);
    console.log(rendered);
  }

  console.log(chalk.gray("─".repeat(60)));

  const shouldImplement = await confirm({
    message: chalk.yellow("Should I start implementing these changes?"),
    initialValue: false,
  });

  if (!shouldImplement) {
    console.log(chalk.yellow("\n👌 Implementation cancelled. Your code is safe.\n"));
    return false;
  }

  console.log(chalk.green("\n✅ Starting implementation...\n"));

  const implementationPrompt = `Continue from the plan above and implement all the changes. 

For each file:
1. Read the existing file first
2. Make the necessary modifications
3. Explain what you changed

Start implementing now.`;

  let implResponse = "";

  await aiService.sendMessage(
    [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "assistant",
        content: fullResponse,
      },
      {
        role: "user",
        content: implementationPrompt,
      },
    ],
    (chunk) => {
      if (implResponse === "") {
        console.log(chalk.green.bold("\n🤖 Implementing...\n"));
        console.log(chalk.gray("─".repeat(60)));
      }
      implResponse += chunk;
    },
    getToolsForTask("code"),
    (toolCall) => {
      displayToolCall(toolCall as ToolCall);
    },
    { maxSteps: 15 }
  );

  if (implResponse) {
    const rendered = marked.parse(implResponse);
    console.log(rendered);
  }

  console.log(chalk.gray("─".repeat(60)));
  console.log(chalk.green.bold("\n✅ Implementation complete!\n"));

  return true;
}

/**
 * Display tool call information
 */
function displayToolCall(toolCall: ToolCall): void {
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
function displayToolResult(toolResult: ToolResult): void {
  const success = toolResult.result && typeof toolResult.result === "object"
    ? toolResult.result.success !== false
    : true;
  const color = success ? "green" : "red";
  const icon = success ? "✓" : "✗";

  let resultPreview = "";
  if (toolResult.result) {
    if (typeof toolResult.result === "string") {
      resultPreview = toolResult.result.substring(0, 100);
    } else if (typeof toolResult.result === "object" && toolResult.result.error) {
      resultPreview = toolResult.result.error;
    } else {
      resultPreview = "Completed successfully";
    }
  }

  const colorFn = color === "green" ? chalk.green : chalk.red;
  console.log(
    colorFn(
      `  ${icon} ${toolResult.toolName}: ${resultPreview}${resultPreview.length >= 100 ? "..." : ""
      }`
    )
  );
}

/**
 * Main agent chat loop
 */
export async function runAgent(options: RunAgentOptions = {}): Promise<void> {
  const { mode = "all", singlePrompt = null, planId = null } = options;

  // Plan execution mode
  if (planId) {
    await runPlanExecution(planId);
    return;
  }

  // Initialize AI service
  try {
    await aiService.initialize();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      boxen(chalk.red(`❌ ${errorMessage}`), {
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

  // Session management
  let currentSession = options.sessionId 
    ? sessionManager.getSession(options.sessionId)
    : null;
  
  let currentSessionId = options.sessionId || (currentSession?.id || null);

  // If sessionId provided but not found, create new session
  if (options.sessionId && !currentSession) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
  }

  // Build messages - either from session or fresh
  let messages: CoreMessage[];
  const currentModel = aiService.getModelId();
  
  if (currentSessionId) {
    if (options.switchModel && options.modelId) {
      console.log(chalk.yellow("\n🔄 Switching model, generating context summary...\n"));
      await sessionManager.summarizeForModelSwitch(currentSessionId, currentModel);
    }
    messages = sessionManager.loadSessionWithSummary(currentSessionId, currentModel);
    if (messages.length <= 1) {
      messages = [{
        role: "system",
        content: buildSystemPrompt(),
      }];
    }
  } else {
    // Fresh session with system prompt
    messages = [{
      role: "system",
      content: buildSystemPrompt(),
    }];
  }

  // Single prompt mode - no persistence for one-off commands
  if (singlePrompt) {
    await processMessage(singlePrompt, messages, tools, null);
    return;
  }

  // Create session if not exists (for interactive mode)
  if (!currentSessionId) {
    currentSession = sessionManager.createNewSession(mode);
    currentSessionId = currentSession.id;
  }

  // Show session info
  const personality = sessionManager.getActivePersonality();
  console.log(chalk.gray(`Session: ${currentSessionId?.slice(0, 8)}... | Personality: ${personality}`));

  // Interactive loop
  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 You"),
      placeholder: "Ask me anything...",
      validate: (val: string) => {
        if (!val || val.trim().length === 0) {
          return "Please enter a message";
        }
      },
    });

    if (isCancel(userInput)) {
      if (currentSessionId) {
        console.log(chalk.yellow("\n👋 Goodbye!") + chalk.gray("\n\nTo continue this session later, run:\n"));
        console.log(chalk.cyan(`  agentic -s ${currentSessionId}\n`));
      } else {
        console.log(chalk.yellow("\n👋 Goodbye!\n"));
      }
      process.exit(0);
    }

    const input = (userInput as string).trim();

    // Handle special commands
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      if (currentSessionId) {
        console.log(chalk.yellow("\n👋 Goodbye!") + chalk.gray("\n\nTo continue this session later, run:\n"));
        console.log(chalk.cyan(`  agentic -s ${currentSessionId}\n`));
      } else {
        console.log(chalk.yellow("\n👋 Goodbye!\n"));
      }
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

    await processMessage(input, messages, tools, currentSessionId);
  }
}

/**
 * Process a single message
 */
async function processMessage(
  input: string,
  messages: CoreMessage[],
  tools: ToolSet,
  sessionId: string | null
): Promise<void> {
  // Add user message
  messages.push({
    role: "user",
    content: input,
  });

  // Save user message to session if we have a session
  if (sessionId) {
    sessionManager.addSessionMessage(sessionId, "user", input);
  }

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
    const toolCallsProcessed: ToolCall[] = [];

    const result = await aiService.sendMessage(
      messages,
      (chunk: string) => {
        if (isFirstChunk) {
          spin.stop();
          console.log(chalk.green.bold("\n🤖 agentic:"));
          console.log(chalk.gray("─".repeat(60)));
          isFirstChunk = false;
        }
        fullResponse += chunk;
      },
      tools,
      (toolCall: unknown) => {
        if (isFirstChunk) {
          spin.stop();
          isFirstChunk = false;
        }
        displayToolCall(toolCall as ToolCall);
        toolCallsProcessed.push(toolCall as ToolCall);
      },
      { maxSteps: 15 }
    );

    // Display tool results if any
    if (result.toolResults && result.toolResults.length > 0) {
      console.log(chalk.gray("\n📊 Tool Results:"));
      for (const tr of result.toolResults) {
        displayToolResult(tr as ToolResult);
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
      
      // Save assistant message to session
      if (sessionId) {
        sessionManager.addSessionMessage(sessionId, "assistant", fullResponse);
      }
    }

    console.log("");
  } catch (error) {
    spin.stop();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      boxen(chalk.red(`❌ Error: ${errorMessage}`), {
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
function showHelp(): void {
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
function showTools(): void {
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

