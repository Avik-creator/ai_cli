# Setup Guide for agentic CLI

Complete setup instructions to get your agentic CLI up and running.

## Prerequisites

- **Bun** (v1.0.0 or later) - [Install Bun](https://bun.sh)
- **Node.js** (v18.0.0 or later) - Required by some dependencies
- **API Keys** (see below)

## Step 1: Install Dependencies

```bash
# Clone or navigate to the project directory
cd ai_cli

# Install all dependencies
bun install
```

## Step 2: Get Your API Keys

You'll need the following API keys:

### 1. Vercel AI Gateway API Key (Required)

This is the main API key that gives you access to 100+ AI models.

1. Go to [Vercel AI Gateway](https://vercel.com/ai-gateway)
2. Sign up or log in to your Vercel account
3. Navigate to AI Gateway settings
4. Create a new API key
5. Copy the key (starts with something like `vgw_...`)

**Why you need this:**
- Single API key for 100+ models from OpenAI, Anthropic, Google, xAI, etc.
- Unified interface for all models
- Better rate limiting and monitoring

### 2. Exa AI API Key (Optional - for web search)

Required only if you want to use the web search feature.

1. Go to [Exa AI](https://exa.ai)
2. Sign up for an account
3. Navigate to API keys section
4. Create a new API key
5. Copy the key

### 3. GitHub Personal Access Token (Optional - for PR reviews)

Required only if you want to review GitHub Pull Requests.

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "agentic-cli"
4. Select scopes: `repo` (for private repos) or `public_repo` (for public repos only)
5. Generate and copy the token

## Step 3: Configure API Keys

You have three options to set up your API keys:

### Option 1: Interactive Setup (Recommended)

Run the interactive setup wizard:

```bash
bun run setup
# or
bun run src/main.js config setup
```

This will guide you through setting up all API keys step by step.

### Option 2: Command Line

Set keys individually:

```bash
# Set AI Gateway API key (required)
agentic config set AI_GATEWAY_API_KEY your_gateway_key_here

# Set Exa API key (optional)
agentic config set EXA_API_KEY your_exa_key_here

# Set GitHub token (optional)
agentic config set GITHUB_TOKEN your_github_token_here
```

### Option 3: Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
touch .env
```

Add your keys:

```env
AI_GATEWAY_API_KEY=your_gateway_key_here
EXA_API_KEY=your_exa_key_here
GITHUB_TOKEN=your_github_token_here
AGENTICAI_MODEL=openai/gpt-5-mini
```

**Note:** The `.env` file is already in `.gitignore`, so your keys won't be committed.

## Step 4: Verify Setup

Check that your keys are configured:

```bash
# List all configured keys (values are hidden)
agentic config list
```

You should see:
```
✓ AI_GATEWAY_API_KEY: ******** (configured)
✓ EXA_API_KEY: ******** (configured)
✓ GITHUB_TOKEN: ******** (configured)
```

## Step 5: (Optional) Set Your Preferred Model

Choose which AI model to use:

```bash
# Interactive model selection
agentic model set

# Or set directly
agentic model set openai/gpt-5-mini

# View current model
agentic model current
```

**Popular model recommendations:**
- `openai/gpt-5-mini` - Fast and efficient (default)
- `openai/gpt-5` - More capable
- `anthropic/claude-sonnet-4.5` - Excellent reasoning
- `google/gemini-2.5-flash` - Fast and versatile
- `xai/grok-4` - Powerful reasoning

## Step 6: Test the CLI

Try a simple command to verify everything works:

```bash
# Test with a simple question
agentic ask "What is 2+2?"

# Or start an interactive chat
agentic chat
```

If you see an error about missing API keys, go back to Step 3.

## Step 7: (Optional) Link Globally

To use `agentic` from any directory:

```bash
# Link the CLI globally
bun link

# Now you can use it from anywhere
cd ~/some-other-project
agentic chat
```

## Troubleshooting

### "AI_GATEWAY_API_KEY is not set"

**Solution:** Run `agentic config setup` or set the key manually:
```bash
agentic config set AI_GATEWAY_API_KEY your_key
```

### "Model not found" error

**Solution:** Check available models:
```bash
agentic model list
```

Then set a valid model:
```bash
agentic model set openai/gpt-5-mini
```

### "EXA_API_KEY is not set" (when using search)

**Solution:** Either:
1. Set the Exa API key: `agentic config set EXA_API_KEY your_key`
2. Or skip web search features (they'll be disabled automatically)

### "GITHUB_TOKEN is not set" (when reviewing PRs)

**Solution:** Either:
1. Set the GitHub token: `agentic config set GITHUB_TOKEN your_token`
2. Or skip PR review features (they'll be disabled automatically)

### Permission denied errors

**Solution:** Make sure the CLI is executable:
```bash
chmod +x src/main.js
```

## Quick Start Checklist

- [ ] Installed Bun
- [ ] Ran `bun install`
- [ ] Got Vercel AI Gateway API key
- [ ] Ran `agentic config setup`
- [ ] Tested with `agentic ask "Hello"`
- [ ] (Optional) Set preferred model with `agentic model set`
- [ ] (Optional) Linked globally with `bun link`

## Next Steps

Once setup is complete, explore the CLI:

```bash
# Interactive chat with all tools
agentic chat

# Search the web
agentic search "latest AI news"

# Review a GitHub PR
agentic review https://github.com/owner/repo/pull/123

# Generate code
agentic generate "a React todo app"

# See all commands
agentic --help
```

## Need Help?

- Check the [README.md](./README.md) for full documentation
- Run `agentic --help` for command reference
- Run `agentic <command> --help` for specific command help

