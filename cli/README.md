# MCP CLI - AI Gateway Command Line Tool

A powerful command-line interface for the MCP Gateway with AI-powered project scaffolding, code analysis, and interactive chat.

## ✨ Features

- 🤖 **Interactive Chat** - Real-time AI conversation with project context awareness
- 📝 **Code Analysis** - Expert code reviews and suggestions with project history tracking  
- 🔧 **Diff Generation** - Generate unified diff patches for code changes
- 🚀 **Project Creation** - AI-powered project scaffolding with auto-detection capabilities
- 📊 **Project Summarization** - Comprehensive project analysis and documentation generation
- 🎨 **Syntax Highlighting** - Colored terminal output for better readability
- 🔌 **Pipe Support** - Seamless integration with Unix pipes
- 📋 **Smart Context Reading** - Auto-loads SKETCH.md, ROADMAP.md, mcp-instructor.md files
- 📝 **Auto-Documentation** - Creates missing project files when context is incomplete
- 🧠 **History Tracking** - Maintains project-coding-history.md for all tasks
- 💰 **Budget Management** - Free tier default with intelligent escalation to Claude Code
- 🎯 **Layer Control** - Choose maximum model tier to control costs
- ⚠️ **Escalation Flexibility** - Claude Code allowed even with free budget
- 🧠 **Claude Code Integration** - Seamlessly switch to Claude Code for complex tasks
- 📐 **Auto-File Generation** - Creates SKETCH.md, ROADMAP.md, LOGIC_FLOW.md from analysis

## 🧠 Claude Code Engine Mode

MCP CLI can use Claude Code as an alternative to the multi-layer API pipeline. This is useful for:

- **Cost Savings**: Use your Claude Pro subscription instead of pay-per-use API calls
- **Full Context**: Claude Code has access to your entire project workspace
- **Complex Tasks**: Let Claude Code handle complex refactoring and architecture changes

### Setup Claude Code

Install Claude Code CLI:

**macOS:**
```bash
brew install anthropic/tap/claude
```

**Linux/WSL:**
```bash
npm install -g @anthropic-ai/claude-code
# OR
curl -fsSL https://claude.ai/install.sh | sh
```

**Windows:**
```powershell
npm install -g @anthropic-ai/claude-code
```

**Custom Binary Path:**
```bash
export CLAUDE_BIN=/path/to/claude
```

### Using Claude Code

#### Quick Launch
```bash
# Launch Claude Code in current directory
mcp claude

# Launch in specific directory
mcp claude --cwd ./my-project

# Forward arguments to Claude Code
mcp claude -- --help
```

#### Project-Based Mode

When creating a project, enable Claude Code engine:

```bash
# Interactive prompt will ask: "Use Claude Code engine for this project? (y/N)"
mcp create-project "Build a React dashboard"

# Or use flag to skip prompt
mcp create-project "Build a React dashboard" --use-claude-code
```

This creates `mcp.config.json` with:
```json
{
  "projectName": "build-react-dashboard",
  "engine": "claude-code",
  "useClaudeCode": true,
  ...
}
```

#### Automatic Claude Code Fallback

When inside a project with Claude Code enabled, all commands automatically offer Claude Code instead of escalating to paid tiers:

```bash
# Inside a Claude Code project
mcp code src/app.tsx -p "Add authentication"

# CLI detects escalation needed and prompts:
# "🤖 Claude Code Available
#  Use Claude Code for this task? (Y/n):"
#
# If Yes → Launches Claude Code with full context
# If No → Escalates to L1/L2/L3 via API
```

#### Per-Command Override

Force Claude Code for any command with `--use-claude-code`:

```bash
# Even outside a Claude Code project
mcp code src/index.ts --use-claude-code -p "Refactor this module"
mcp diff utils.py --use-claude-code -p "Optimize performance"
mcp analyze "src/**/*.ts" --use-claude-code
```

## 🚀 Installation

### From Source

```bash
# Navigate to CLI directory
cd cli

# Install dependencies
npm install

# Build TypeScript
npm run build

# Install globally
npm install -g .
```

### Verify Installation

```bash
mcp --version
mcp --help
```

## Configuration

Set environment variables for authentication:

```bash
# MCP Gateway endpoint (default: http://localhost:3000)
export MCP_ENDPOINT=http://localhost:3000

# Optional API key for authentication
export MCP_API_KEY=your-api-key-here
```

Or use command-line options:

```bash
mcp chat "Hello" --endpoint http://your-server:3000 --api-key YOUR_KEY
```

## Usage

### Chat Command

Interactive chat session:

```bash
mcp chat
```

Single message:

```bash
mcp chat "What is the capital of France?"
```

Interactive mode commands:
- `/exit` - Exit interactive mode
- `/help` - Show available commands

### Code Command

Analyze a file:

```bash
mcp code src/index.ts "Review this code for bugs"
```

Analyze from stdin (pipe support):

```bash
cat myfile.js | mcp code - "Optimize this function"
```

Generate code from description:

```bash
mcp code - "Create a TypeScript function to validate email addresses" > validator.ts
```

### Diff Command

Generate a patch to fix issues:

```bash
mcp diff src/app.ts "Fix the memory leak in handleRequest"
```

Apply the generated patch:

```bash
mcp diff src/app.ts "Add error handling" | patch -p1
```

Or using git apply:

```bash
mcp diff src/app.ts "Refactor to async/await" > changes.patch
git apply changes.patch
```

### Create Project Command (NEW!)

AI-powered project scaffolding with interactive configuration:

```bash
mcp create-project "Todo app with React and TypeScript"
```

**Interactive Prompts:**
```
Project description: Todo app with React and TypeScript
Budget (USD, 0 for no limit): 0.50
Maximum layer (L0/L1/L2/L3): L1
Enable testing? (y/n): y
Enable debug mode? (y/n): n

Analyzing project requirements...
Creating project plan...

Files to generate:
  - package.json
  - tsconfig.json
  - src/App.tsx
  - src/components/TodoList.tsx
  - src/types.ts
  - src/tests/App.test.tsx
  
[1/6] Generating package.json...
  Cost: $0.0012 | Total: $0.0012
[2/6] Generating tsconfig.json...
  Cost: $0.0008 | Total: $0.0020
...
✓ Generated 6 files
💰 Total cost: $0.0450
```

**Features:**
- **Budget Tracking**: Set a budget limit (e.g., $0.50) and generation stops if exceeded
- **Layer Control**: Choose maximum model tier (L0=free, L1=cheap, L2=mid, L3=premium)
- **Test Generation**: Optionally include test files
- **Debug Mode**: Verbose logging for troubleshooting
- **Cost Display**: Shows per-file and cumulative costs

**Examples:**
```bash
# Free models only (L0)
mcp create-project "Simple Express API"
# Budget: 0
# Max layer: L0

# With budget limit
mcp create-project "Full-stack Next.js app"
# Budget: 1.00
# Max layer: L2

# Quick mode (no prompts, use defaults)
mcp create-project "CLI tool" --budget 0 --max-layer L0 --no-tests
```

### Summarize Command (NEW!)

Generate comprehensive project summary and create missing documentation files:

```bash
mcp summarize
```

**With options:**
```bash
# Custom output file
mcp summarize -o PROJECT-OVERVIEW.md

# Verbose mode
mcp summarize -v

# Custom model
mcp summarize --model gpt-4
```

**What it does:**
- Analyzes entire project structure and codebase
- Reads existing documentation (SKETCH.md, ROADMAP.md, etc.)
- Creates missing project files automatically:
  - `SKETCH.md` - Project overview and architecture
  - `ROADMAP.md` - Development roadmap and next steps  
  - `LOGIC_FLOW.md` - System logic and data flow
  - `mcp-instructor.md` - Project instructions and guidelines
- Generates comprehensive markdown summary with:
  - Project overview and technology stack
  - Architecture analysis
  - Code statistics and file breakdown
  - Development history (if available)
  - Recommendations for next steps

**Example output:**
```
📊 Analyzing project for summary generation...
🔍 Project context files missing. Generating project summary first...
✅ Created SKETCH.md
✅ Created ROADMAP.md  
✅ Created LOGIC_FLOW.md
✅ Created mcp-instructor.md
✅ Project summary generated successfully!
📄 Summary saved to: PROJECT-SUMMARY-2024-12-02.md
💰 Cost: $0.0012
```

## Examples

### Review Multiple Files

```bash
# Review all TypeScript files
for file in src/**/*.ts; do
  echo "Reviewing $file..."
  mcp code "$file" "Check for security issues"
done
```

### Interactive Code Session

```bash
$ mcp chat
MCP CLI - Interactive Mode
Type '/exit' to quit, '/help' for commands

You: Explain how async/await works in JavaScript
Assistant: async/await is syntactic sugar over Promises...
[detailed explanation]

You: Show me an example
Assistant: [provides code example]

You: /exit
Goodbye!
```

### Generate and Apply Patches

```bash
# Generate a patch to add logging
mcp diff src/handler.ts "Add console.log statements for debugging" > debug.patch

# Review the patch
cat debug.patch

# Apply it
git apply debug.patch
```

### Pipe Chain Example

```bash
# Get code from curl, analyze it, save review
curl https://raw.githubusercontent.com/user/repo/main/index.js | \
  mcp code - "Security audit" > review.txt
```

## Command Reference

### Global Options

```
--endpoint <url>    MCP Gateway endpoint (default: http://localhost:3000)
--api-key <key>     API key for authentication
-h, --help          Display help
-V, --version       Display version
```

### chat [message]

Start interactive chat or send single message.

**Arguments:**
- `message` - (optional) Single message to send

**Options:**
- None

**Examples:**
```bash
mcp chat                              # Interactive mode
mcp chat "Hello world"                # Single message
mcp chat "Explain Docker compose"     # Question
```

### code <filename> [instruction]

Analyze code from file or stdin.

**Arguments:**
- `filename` - File path or `-` for stdin
- `instruction` - (optional) What to do with the code

**Options:**
- None

**Examples:**
```bash
mcp code app.ts "Review for bugs"
mcp code src/utils.js
cat script.py | mcp code - "Optimize this"
echo "const x = 1" | mcp code -
```

### diff <filename> <instruction>

Generate unified diff patch.

**Arguments:**
- `filename` - File to modify
- `instruction` - Changes to make

**Options:**
- None

**Examples:**
```bash
mcp diff app.ts "Add error handling"
mcp diff server.js "Use async/await" > changes.patch
```

## Output Format

### Chat Response

Plain text response from the AI model.

### Code Response

```
[Formatted analysis with code blocks, suggestions, etc.]

Model: claude-3-5-sonnet-20241022
Tokens: 150 input, 500 output (650 total)
Cost: $0.0045
```

### Diff Response

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,6 +10,9 @@
 function handler(req, res) {
+  if (!req.body) {
+    throw new Error('Missing body');
+  }
   return processRequest(req);
 }
```

## Troubleshooting

### Connection Refused

```bash
# Check if gateway is running
curl http://localhost:3000/health

# Check endpoint configuration
echo $MCP_ENDPOINT
```

### Authentication Failed

```bash
# Verify API key
echo $MCP_API_KEY

# Or pass explicitly
mcp chat "test" --api-key YOUR_KEY
```

### Build Errors

```bash
# Clean and rebuild
cd cli
rm -rf dist node_modules
npm install
npm run build
```

## Development

### Project Structure

```
cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── client.ts          # HTTP client
│   └── commands/
│       ├── chat.ts        # Chat command
│       ├── code.ts        # Code command
│       └── diff.ts        # Diff command
├── package.json
├── tsconfig.json
└── README.md
```

### Build Commands

```bash
npm run build              # Compile TypeScript
npm run dev                # Watch mode
npm test                   # Run tests
npm run lint               # Lint code
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Implement command logic
3. Register in `src/index.ts`
4. Update this README

## API

The CLI communicates with the MCP Gateway via POST requests to `/v1/mcp-cli`:

```json
{
  "mode": "chat" | "code" | "diff",
  "message": "user message",
  "context": {
    "cwd": "/current/dir",
    "files": ["file1.ts", "file2.ts"],
    "gitStatus": "git status output",
    "filename": "app.ts",
    "language": "typescript"
  }
}
```

Response:

```json
{
  "message": "AI response",
  "patch": "unified diff (diff mode only)",
  "model": "claude-3-5-sonnet-20241022",
  "tokens": {
    "input": 100,
    "output": 200,
    "total": 300
  },
  "cost": 0.0025
}
```

## License

MIT - See main project LICENSE file

## Links

- [MCP Gateway](../README.md)
- [Design Document](../design-cli-mcp.md)
- [API Documentation](../README.md#api-endpoints)
