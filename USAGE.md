# How to Use agentic CLI

After installation, you have several ways to run the CLI:

## Method 1: Direct Path (Easiest - Recommended)

Since there's a naming conflict with another `agentic` package, use the direct path:

```bash
# From the project directory
./src/main.js chat
./src/main.js model set
./src/main.js ask "Hello"

# Or with bun
bun src/main.js chat
bun src/main.js model set
```

**Create an alias for convenience:**

```bash
# Add to ~/.zshrc (or ~/.bashrc)
alias agentic="cd /Users/avikmukherjee/Desktop/AllProjects/Web\ Projects/NextJs/ai_cli && bun src/main.js"

# Or use absolute path
alias agentic="bun /Users/avikmukherjee/Desktop/AllProjects/Web\ Projects/NextJs/ai_cli/src/main.js"

# Then reload your shell
source ~/.zshrc

# Now you can use from anywhere:
agentic chat
agentic model set
```

## Method 2: Using bun run (From Project Directory)

If you're in the project directory, use the npm scripts:

```bash
# From the project root
bun run src/main.js chat
bun run src/main.js model set
bun run src/main.js ask "Hello"

# Or use the shortcuts
bun run chat
bun run setup
```

## Method 3: Install Globally (Traditional npm way)

If you want a true global install:

```bash
# Install globally with npm (if you have npm)
npm install -g .

# Or create a symlink manually
sudo ln -s $(pwd)/src/main.js /usr/local/bin/agentic
chmod +x /usr/local/bin/agentic
```

## Quick Reference

### Common Commands

```bash
# Interactive chat
./src/main.js chat
# or: bun src/main.js chat
# or: bun run src/main.js chat

# Set model interactively
./src/main.js model set
# or: bun src/main.js model set

# Ask a question
./src/main.js ask "What is AI?"
# or: bun src/main.js ask "What is AI?"

# Search the web
./src/main.js search "latest AI news"
# or: bun src/main.js search "latest AI news"

# Review a PR
./src/main.js review https://github.com/owner/repo/pull/123
# or: bun src/main.js review https://github.com/owner/repo/pull/123

# Generate code
./src/main.js generate "a React todo app"
# or: bun src/main.js generate "a React todo app"

# Show help
./src/main.js --help
# or: bun src/main.js --help
```

### Recommended: Create an Alias

Add this to your `~/.zshrc` (or `~/.bashrc` for bash):

```bash
# agentic CLI alias (update path to your project location)
alias agentic="bun /Users/avikmukherjee/Desktop/AllProjects/Web\ Projects/NextJs/ai_cli/src/main.js"
```

Or if you want to use relative path (must be in project directory):

```bash
# agentic CLI alias (relative - must be in project dir)
alias agentic="cd /Users/avikmukherjee/Desktop/AllProjects/Web\ Projects/NextJs/ai_cli && bun src/main.js"
```

Then reload:
```bash
source ~/.zshrc
```

Now you can use `agentic` from anywhere!

## Troubleshooting

### "command not found: agentic"

**Solution:** Use one of the methods above. The easiest is:
```bash
# From project directory
./src/main.js chat
# or
bun src/main.js chat
```

Or create an alias as shown above.

### "bunx: command not found"

**Solution:** Make sure Bun is installed and in your PATH:
```bash
# Check if bun is installed
which bun

# If not, install bun
curl -fsSL https://bun.sh/install | bash
```

### Permission Denied

**Solution:** Make the script executable:
```bash
chmod +x src/main.js
```

