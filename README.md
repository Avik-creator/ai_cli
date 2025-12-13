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

### 1. Select Your AI Provider

Choose which AI provider you want to use:

```bash
# Interactive provider selection
agentic config provider set

# Or set directly
agentic config provider set openai
agentic config provider set anthropic
agentic config provider set google
agentic config provider set groq
agentic config provider set mistral
agentic config provider set xai
agentic config provider set gateway  # Vercel AI Gateway (default)
```

**Available Providers:**
- **Vercel AI Gateway** (default) - Access 100+ models with a single API key
- **OpenAI** - GPT-5, GPT-4, O-series models
- **Anthropic** - Claude Opus, Sonnet, Haiku models
- **Google Generative AI** - Gemini 2.5, 3.0, Imagen models
- **Groq** - Fast inference for Llama, Mixtral, Gemma models
- **Mistral AI** - Mistral Large, Medium, Small models
- **xAI Grok** - Grok 4, Grok 3, Grok 2 models

### 2. Configure API Keys

```bash
# Interactive setup wizard (configures provider + API keys)
bun run setup
# or
agentic config setup

# Or set individual keys
agentic config set OPENAI_API_KEY your_key_here
agentic config set ANTHROPIC_API_KEY your_key_here
# etc.
```

### Required API Keys

The API key you need depends on your selected provider:

| Provider | API Key Name | Get it from |
|----------|--------------|-------------|
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | [Vercel AI Gateway](https://vercel.com/ai-gateway) |
| OpenAI | `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) |
| Anthropic | `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| Groq | `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) |
| Mistral | `MISTRAL_API_KEY` | [Mistral Console](https://console.mistral.ai/api-keys) |
| xAI | `XAI_API_KEY` | [xAI Console](https://console.x.ai/api-keys) |

**Optional Keys:**
- `EXA_API_KEY` - For web search functionality ([Exa AI](https://exa.ai))
- `GITHUB_TOKEN` - For PR review functionality ([GitHub Settings](https://github.com/settings/tokens))

### 3. Install Provider Packages (Automatic)

The CLI will **automatically install** provider packages when you select a provider! 

When you run `agentic config provider set <provider>`, the CLI will:
1. Check if the provider package is installed
2. Prompt you to install it if missing
3. Automatically run `bun add <package>` for you

**Manual Installation (if needed):**

If automatic installation fails, you can install manually:

```bash
bun add @ai-sdk/openai      # For OpenAI
bun add @ai-sdk/anthropic   # For Anthropic
bun add @ai-sdk/google      # For Google
bun add @ai-sdk/groq        # For Groq
bun add @ai-sdk/mistral     # For Mistral
bun add @ai-sdk/xai         # For xAI
```

**Note:** 
- Vercel AI Gateway is built into the AI SDK and doesn't require a separate package
- Packages are also automatically installed when you first use a provider (if missing)

### Provider Management

```bash
# List all available providers
agentic config provider list

# Show current provider
agentic config provider current

# Set provider interactively
agentic config provider set

# Set provider directly
agentic config provider set openai
```

### Model Management

The available models depend on your selected provider:

**Vercel AI Gateway** (default) - 100+ models from multiple providers:

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

**Popular Models (Gateway):**
- `openai/gpt-5-mini` - Fast and efficient (default)
- `openai/gpt-5` - More capable
- `anthropic/claude-sonnet-4.5` - Excellent reasoning
- `google/gemini-2.5-flash` - Fast and versatile
- `xai/grok-4` - Powerful reasoning

**Provider-Specific Models:**
- **OpenAI**: `gpt-5-mini`, `gpt-5`, `gpt-4o`, `o3`, `o3-mini`
- **Anthropic**: `claude-sonnet-4.5`, `claude-opus-4.5`, `claude-haiku-4.5`
- **Google**: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-pro-preview`
- **Groq**: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`, `qwen/qwen3-32b`
- **Mistral**: `mistral-large-latest`, `mistral-medium-latest`, `pixtral-large-latest`
- **xAI**: `grok-4`, `grok-3`, `grok-3-fast`

Set a default model via environment variable:
```bash
export AGENTICAI_MODEL=gpt-5-mini  # For OpenAI provider
export AGENTICAI_MODEL=openai/gpt-5-mini  # For Gateway provider
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

