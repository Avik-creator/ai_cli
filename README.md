# agentic CLI

An agentic CLI tool powered by Vercel AI SDK and AI Gateway that combines web search, PR reviews, code generation, and command execution into an intelligent development assistant. Access 100+ AI models from OpenAI, Anthropic, Google, xAI, and more through a single API key.

## Features

- **🔍 Web Search** - Search the internet using Exa AI for documentation, code examples, and solutions
- **📋 PR Reviews** - Fetch, analyze, and review GitHub Pull Requests with AI assistance
- **💻 Code Generation** - Generate complete code files and project structures
- **⚡ Command Execution** - Run shell commands and get AI help fixing errors
- **🤖 Agentic Workflow** - Multi-step tool calling for complex tasks

## Quick Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure API keys (interactive wizard)
bun run setup

# 3. Test it works
bunx agentic-cli ask "Hello, world!"
# or: bun run src/main.js ask "Hello, world!"

# 4. (Optional) Create an alias for easier use
echo 'alias agentic="bunx agentic-cli"' >> ~/.zshrc
source ~/.zshrc
```

**📖 For usage instructions, see [USAGE.md](./USAGE.md)**

**📖 For detailed setup instructions, see [SETUP.md](./SETUP.md)**

## Installation

```bash
# Install dependencies
bun install

# Link the CLI globally (optional)
bun link
```

## Setup

Configure your API keys:

```bash
# Interactive setup wizard
bun run setup
# or
agentic config setup

# Or set individual keys
agentic config set AI_GATEWAY_API_KEY your_key_here
agentic config set EXA_API_KEY your_key_here
agentic config set GITHUB_TOKEN your_token_here
```

### Required API Keys

| Key | Description | Get it from |
|-----|-------------|-------------|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway API key (required) | [Vercel AI Gateway](https://vercel.com/ai-gateway) |
| `EXA_API_KEY` | Exa Search API key (for web search) | [Exa AI](https://exa.ai) |
| `GITHUB_TOKEN` | GitHub Personal Access Token (for PR reviews) | [GitHub Settings](https://github.com/settings/tokens) |

### Model Management

The CLI supports 100+ models from various providers through Vercel AI Gateway:

```bash
# List all available models
agentic model list

# Set a model interactively (shows a select menu)
agentic model set
# You'll get an interactive menu to choose:
# - Option 1: Browse all 100+ models in one menu
# - Option 2: Filter by provider first, then select model

# Set a specific model directly
agentic model set openai/gpt-5-mini

# Show current model
agentic model current
```

**Interactive Model Selection:**
When you run `agentic model set` without arguments, you'll see an interactive menu:
- **Browse all models**: See all 100+ models in one scrollable menu (default)
- **Filter by provider**: First select a provider (OpenAI, Anthropic, Google, etc.), then choose from that provider's models

The current model is marked with a ✓ checkmark in the menu.

**Popular Models:**
- `openai/gpt-5-mini` - Fast and efficient (default)
- `openai/gpt-5` - More capable
- `anthropic/claude-sonnet-4.5` - Excellent reasoning
- `google/gemini-2.5-flash` - Fast and versatile
- `xai/grok-4` - Powerful reasoning

Set a default model via environment variable:
```bash
export AGENTICAI_MODEL=openai/gpt-5
```

## Usage

### Interactive Chat

Start an interactive session with all tools available:

```bash
agentic
# or
agentic chat
```

### Quick Commands

```bash
# Search the web
agentic search "React 19 new features"

# Ask a single question
agentic ask "How do I set up TypeScript in a Bun project?"

# Review a PR
agentic review https://github.com/owner/repo/pull/123

# Generate code
agentic generate "a REST API with Express and TypeScript"

# Run a command and fix errors
agentic run "npm test"

# Fix issues in a file
agentic fix src/index.ts --error "Cannot find module"
```

### Tool Modes

You can limit which tools are available:

```bash
# Only search tools
agentic chat --mode search

# Only code/file tools
agentic chat --mode code

# Only PR review tools
agentic chat --mode pr-review

# All tools (default)
agentic chat --mode all
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `agentic` | Start interactive chat (default) |
| `agentic chat` | Start interactive chat with options |
| `agentic search <query>` | Search the web |
| `agentic ask <question>` | Ask a single question |
| `agentic review [pr-url]` | Review a GitHub PR |
| `agentic generate <description>` | Generate code |
| `agentic run <command>` | Execute command and fix errors |
| `agentic fix [file]` | Analyze and fix issues |
| `agentic config setup` | Interactive API key setup |
| `agentic config list` | List configured API keys |
| `agentic config set <key> <value>` | Set an API key |
| `agentic config remove <key>` | Remove a stored key |
| `agentic model list` | List all available models |
| `agentic model set [model-id]` | Set the AI model to use |
| `agentic model current` | Show current model |

## Available Tools

### Web Search
- `webSearch` - Search the web using Exa AI
- `getContents` - Fetch content from specific URLs

### GitHub / PR Review
- `getPRInfo` - Get PR details, diff, and comments
- `postPRComment` - Post review comments on PRs
- `getGitStatus` - Get current git status

### Code / Files
- `readFile` - Read file contents
- `writeFile` - Write content to files
- `listDir` - List directory contents
- `executeCommand` - Run shell commands
- `searchFiles` - Search for files by pattern
- `createProject` - Create multiple files at once

## Examples

### Web Search
```
You: Search for the latest Next.js 15 features

🔍 Searching: "latest Next.js 15 features"...
✅ Found 5 results

🤖 agentic:
Based on my search, here are the key features in Next.js 15...
```

### PR Review
```
You: Review the PR at https://github.com/vercel/ai/pull/123

📋 Fetching PR #123...
✅ PR fetched: "Add streaming support"

🤖 agentic:
## PR Review Summary

### Changes Overview
- Added streaming support for text generation
- Updated types for better TypeScript support
...
```

### Code Generation
```
You: Create a simple Express API with health check endpoint

📁 Listing: .
📝 Writing: src/server.ts
📝 Writing: package.json
📝 Writing: tsconfig.json

🤖 agentic:
I've created a simple Express API with:
- src/server.ts - Main server file with health endpoint
- package.json - Dependencies and scripts
- tsconfig.json - TypeScript configuration

To run it:
```bash
bun install
bun run dev
```

## Environment Variables

You can also set API keys via environment variables:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=your_key
export EXA_API_KEY=your_key
export GITHUB_TOKEN=your_token
```

Or create a `.env` file:

```env
AI_GATEWAY_API_KEY=your_key
EXA_API_KEY=your_key
GITHUB_TOKEN=your_token
AGENTICAI_MODEL=openai/gpt-5-mini
```

## Architecture

```
src/
├── main.js              # CLI entry point
├── config/
│   └── env.js           # Environment & API key management
├── services/
│   └── ai.service.js    # Vercel AI SDK integration
├── tools/
│   ├── index.js         # Tool exports
│   ├── web-search.tool.js   # Exa search tools
│   ├── github.tool.js   # GitHub/PR tools
│   └── code.tool.js     # File/command tools
├── commands/
│   ├── chat.command.js  # Chat commands
│   └── config.command.js # Config commands
└── agent/
    └── agent.js         # Agentic chat loop
```

## Tech Stack

- **Bun** - JavaScript runtime
- **Vercel AI SDK** - AI model integration
- **Google Gemini** - Language model
- **Exa AI** - Web search API
- **Commander.js** - CLI framework
- **Clack** - Beautiful CLI prompts

## License

MIT

