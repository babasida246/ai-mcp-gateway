#!/usr/bin/env node

/**
 * MCP CLI - Command Line Interface for AI MCP Gateway
 * 
 * Usage:
 *   mcp chat "your message"           - Send single message
 *   mcp chat                           - Interactive chat mode
 *   mcp code path/to/file.js -p "..."  - Analyze code file
 *   mcp code - < file.js               - Analyze from stdin
 *   mcp diff path/to/file.js -p "..."  - Get diff patch
 * 
 * Environment Variables:
 *   MCP_ENDPOINT - API endpoint (default: http://localhost:3000)
 *   MCP_API_KEY  - API authentication key
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { chatCommand } from './commands/chat.js';
import { codeCommand } from './commands/code.js';
import { diffCommand } from './commands/diff.js';
import { analyzeCommand } from './commands/analyze.js';
import { createProjectCommand } from './commands/create-project.js';
import { claudeCommand } from './commands/claude.js';
import { summarizeProject } from './commands/summarize.js';
import { debugCommand } from './commands/debug.js';
import { mcpServeCommand } from './commands/mcp-serve.js';

const program = new Command();

program
    .name('mcp')
    .description('CLI tool for AI MCP Gateway')
    .version('0.1.0');

// Global options
program
    .option('-e, --endpoint <url>', 'MCP server endpoint URL')
    .option('-k, --api-key <key>', 'API authentication key')
    .option('-u, --username <username>', 'Admin username for authentication')
    .option('-p, --password <password>', 'Admin password for authentication');

// Chat command
program
    .command('chat [message]')
    .description('Chat with AI (interactive mode if no message provided)')
    .option('-i, --interactive', 'Force interactive mode')
    .option('--use-claude-code', 'Use Claude Code instead of multi-layer API')
    .option('-a, --agent', 'Enable agent mode (Claude Code / Copilot-like)')
    .option('--auto-execute', 'Auto-execute actions without confirmation')
    .option('-b, --budget <number>', 'Budget for API calls', parseFloat)
    .action(async (message: string | undefined, options: Record<string, unknown>) => {
        const globalOpts = program.opts();
        await chatCommand(message, {
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
            interactive: options.interactive as boolean | undefined,
            useClaudeCode: options.useClaudeCode as boolean | undefined,
            agent: options.agent as boolean | undefined,
            autoExecute: options.autoExecute as boolean | undefined,
            budget: options.budget as number | undefined,
        });
    });

// Code command
program
    .command('code <file>')
    .description('Send code file for AI analysis/review or create new code (GitHub Copilot-style)')
    .option('-p, --prompt <text>', 'Custom prompt for AI')
    .option('--stdin', 'Read from stdin instead of file')
    .option('--no-context', 'Disable context analysis (faster but less accurate)')
    .option('--no-related', 'Skip related files analysis')
    .option('-c, --create', 'Create new code instead of analyzing existing file')
    .option('-o, --output <file>', 'Output file for generated code')
    .option('--apply', 'Apply generated changes to disk')
    .option('--use-claude-code', 'Use Claude Code instead of multi-layer API')
    .action(async (arg: string, options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await codeCommand(arg, {
            prompt: options.prompt as string | undefined,
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            stdin: options.stdin as boolean | undefined,
            context: options.context as boolean | undefined,
            related: options.related as boolean | undefined,
            create: options.create as boolean | undefined,
            output: options.output as string | undefined,
            apply: options.apply as boolean | undefined,
            useClaudeCode: options.useClaudeCode as boolean | undefined,
        });
    });

// Diff command
program
    .command('diff <file>')
    .description('Request unified diff patch from AI')
    .option('-p, --prompt <text>', 'Custom prompt for changes')
    .option('--apply', 'Automatically apply the patch (not implemented)')
    .option('--use-claude-code', 'Use Claude Code instead of multi-layer API')
    .action(async (arg: string, options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await diffCommand(arg, {
            prompt: options.prompt as string | undefined,
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
            apply: options.apply as boolean | undefined,
            useClaudeCode: options.useClaudeCode as boolean | undefined,
        });
    });

// Analyze command - Multi-file analysis
program
    .command('analyze <pattern>')
    .description('Analyze multiple files (e.g., "src/**/*.ts")')
    .option('-p, --prompt <text>', 'Custom analysis prompt')
    .option('-m, --max-files <number>', 'Maximum files to analyze (default: 10)', '10')
    .option('-r, --recursive', 'Include subdirectories')
    .option('--use-claude-code', 'Use Claude Code instead of multi-layer API')
    .action(async (pattern: string, options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await analyzeCommand(pattern, {
            prompt: options.prompt as string | undefined,
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
            maxFiles: parseInt(options.maxFiles as string),
            recursive: options.recursive as boolean | undefined,
            useClaudeCode: options.useClaudeCode as boolean | undefined,
        });
    });

// Create Project command - AI-powered project scaffolding
program
    .command('create-project [description]')
    .description('Create a complete project with AI (auto-structure, tests, CI/CD). If no description provided, looks for mcp-instruction.md or mcp-instructor.md')
    .option('-o, --output <dir>', 'Output directory (default: auto-generated name)')
    .option('--no-install', 'Skip npm install')
    .option('--no-test', 'Skip initial test run')
    .option('-v, --verbose', 'Verbose output')
    .option('-b, --budget <amount>', 'Budget for AI generation (USD)', parseFloat)
    .option('-l, --max-layer <layer>', 'Maximum layer to use (L0/L1/L2/L3)')
    .option('--enable-test', 'Enable testing during generation')
    .option('--enable-debug', 'Enable debug mode')
    .option('--use-claude-code', 'Use Claude Code engine instead of multi-layer API')
    .action(async (description: string | undefined, options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await createProjectCommand(description, {
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
            output: options.output as string | undefined,
            budget: options.budget as number | undefined,
            maxLayer: options.maxLayer as string | undefined,
            noTests: options.noTest as boolean | undefined,
            debug: options.enableDebug as boolean | undefined,
            useClaudeCode: options.useClaudeCode as boolean | undefined,
        });
    });

// Claude command - Launch Claude Code
program
    .command('claude')
    .description('Launch Claude Code in current or specified directory')
    .option('--cwd <dir>', 'Working directory for Claude Code')
    .allowUnknownOption() // Allow forwarding args to claude
    .action(async (options: Record<string, unknown>, cmd: Command) => {
        // Extract args after 'claude' command to forward to Claude Code
        const rawArgs = process.argv.slice(2); // All args after 'node script.js'
        const claudeIndex = rawArgs.findIndex(arg => arg === 'claude');
        const forwardArgs = claudeIndex >= 0 ? rawArgs.slice(claudeIndex + 1).filter(arg => !arg.startsWith('--cwd')) : [];

        await claudeCommand({
            cwd: options.cwd as string | undefined,
            forwardArgs: forwardArgs.length > 0 ? forwardArgs : undefined,
        });
    });

// Summarize command - Generate comprehensive project summary
program
    .command('summarize')
    .description('Generate comprehensive project summary by analyzing all files and history')
    .option('-o, --output <file>', 'Output file for summary (default: PROJECT-SUMMARY-YYYY-MM-DD.md)')
    .option('-b, --budget <amount>', 'Budget for AI analysis (USD)', parseFloat)
    .option('-m, --model <model>', 'Specific model to use for analysis')
    .option('-v, --verbose', 'Show verbose analysis process')
    .action(async (options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await summarizeProject({
            output: options.output as string | undefined,
            budget: options.budget as number | undefined,
            model: options.model as string | undefined,
            verbose: options.verbose as boolean | undefined,
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
        });
    });

// Debug command - Capture and analyze CLI output
program
    .command('debug <action>')
    .description('Capture and analyze CLI output for debugging (capture|read|clear|analyze)')
    .option('-o, --output <file>', 'Output file for captured data')
    .option('-a, --append', 'Append to existing file instead of overwriting')
    .option('-f, --format <type>', 'Output format: json, text, markdown (default: text)', 'text')
    .option('-t, --include-timestamp', 'Include timestamp in output')
    .option('-l, --max-lines <number>', 'Maximum lines to display when reading', parseInt)
    .action(async (action: string, options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await debugCommand(action, {
            output: options.output as string | undefined,
            append: options.append as boolean | undefined,
            format: options.format as 'json' | 'text' | 'markdown' | undefined,
            includeTimestamp: options.includeTimestamp as boolean | undefined,
            maxLines: options.maxLines as number | undefined,
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
            username: globalOpts.username as string | undefined,
            password: globalOpts.password as string | undefined,
        });
    });

// MCP Server command - Start MCP server for external clients
program
    .command('mcp-serve')
    .description('Start MCP server for Claude Desktop, VSCode, or other MCP clients')
    .option('-t, --transport <type>', 'Transport type: stdio, websocket (default: stdio)', 'stdio')
    .option('-p, --port <number>', 'WebSocket port (default: 3001)', parseInt)
    .option('-l, --log-level <level>', 'Log level: debug, info, warn, error (default: info)', 'info')
    .action(async (options: Record<string, unknown>) => {
        const globalOpts = program.opts() as Record<string, unknown>;
        await mcpServeCommand({
            transport: (options.transport as 'stdio' | 'websocket') || 'stdio',
            port: (options.port as number) || 3001,
            logLevel: (options.logLevel as 'debug' | 'info' | 'warn' | 'error') || 'info',
            endpoint: globalOpts.endpoint as string | undefined,
            apiKey: globalOpts.apiKey as string | undefined,
        });
    });

// Help command
program
    .command('help')
    .description('Show detailed help and examples')
    .action(() => {
        printDetailedHelp();
    });

// Error handling
program.exitOverride((err) => {
    if (err.code === 'commander.help') {
        process.exit(0);
    }
    if (err.code === 'commander.version') {
        process.exit(0);
    }
    console.error(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

/**
 * Print detailed help with examples
 */
function printDetailedHelp(): void {
    console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold('  MCP CLI - AI Coding Assistant                      ').padEnd(58) + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('📖 COMMANDS:\n'));

    console.log(chalk.white('  mcp chat [message]'));
    console.log(chalk.dim('    Chat with AI. If no message, starts interactive mode.\n'));

    console.log(chalk.white('  mcp code <file> [-p "prompt"]'));
    console.log(chalk.dim('    Send file for code review or analysis.'));
    console.log(chalk.dim('    Use "-" as filename to read from stdin.\n'));

    console.log(chalk.white('  mcp analyze <pattern> [-m max]'));
    console.log(chalk.dim('    Analyze multiple files matching a pattern.\n'));

    console.log(chalk.white('  mcp create-project <description>'));
    console.log(chalk.dim('    Create complete project with AI (structure, tests, CI/CD).\n'));

    console.log(chalk.white('  mcp summarize'));
    console.log(chalk.dim('    Generate comprehensive project summary analyzing all files and history.\n'));

    console.log(chalk.white('  mcp diff <file> [-p "prompt"]'));
    console.log(chalk.dim('    Request AI to generate unified diff patch.\n'));

    console.log(chalk.white('  mcp debug <action>'));
    console.log(chalk.dim('    Capture and analyze CLI output for debugging.'));
    console.log(chalk.dim('    Actions: capture, read, clear, analyze\n'));

    console.log(chalk.white('  mcp mcp-serve'));
    console.log(chalk.dim('    Start MCP server for Claude Desktop, VSCode, or other MCP clients.'));
    console.log(chalk.dim('    Exposes AI routing, network tools, and ops tools via JSON-RPC.\n'));

    console.log(chalk.yellow('🔧 OPTIONS:\n'));

    console.log(chalk.white('  -e, --endpoint <url>'));
    console.log(chalk.dim('    Override MCP_ENDPOINT env variable\n'));

    console.log(chalk.white('  -k, --api-key <key>'));
    console.log(chalk.dim('    Override MCP_API_KEY env variable\n'));

    console.log(chalk.yellow('💡 EXAMPLES:\n'));

    console.log(chalk.green('  # Interactive chat'));
    console.log(chalk.dim('  $ mcp chat\n'));

    console.log(chalk.green('  # Single message'));
    console.log(chalk.dim('  $ mcp chat "explain async/await in JavaScript"\n'));

    console.log(chalk.green('  # Code review'));
    console.log(chalk.dim('  $ mcp code src/index.ts -p "find bugs and suggest improvements"\n'));

    console.log(chalk.green('  # Analyze multiple files'));
    console.log(chalk.dim('  $ mcp analyze "src/**/*.ts" -m 5\n'));

    console.log(chalk.green('  # Create a new project'));
    console.log(chalk.dim('  $ mcp create-project "React dashboard with authentication"\n'));

    console.log(chalk.green('  # Generate project summary'));
    console.log(chalk.dim('  $ mcp summarize -v\n'));

    console.log(chalk.green('  # Analyze from stdin'));
    console.log(chalk.dim('  $ cat myfile.js | mcp code -\n'));

    console.log(chalk.green('  # Get diff patch'));
    console.log(chalk.dim('  $ mcp diff src/util.py -p "optimize this function"\n'));

    console.log(chalk.green('  # Custom endpoint'));
    console.log(chalk.dim('  $ mcp --endpoint https://my-server.com chat "hello"\n'));

    console.log(chalk.green('  # Start MCP server (for Claude Desktop config)'));
    console.log(chalk.dim('  $ mcp mcp-serve --transport stdio\n'));

    console.log(chalk.yellow('🌍 ENVIRONMENT VARIABLES:\n'));

    console.log(chalk.white('  MCP_ENDPOINT'));
    console.log(chalk.dim('    API endpoint URL (default: http://localhost:3000)\n'));

    console.log(chalk.white('  MCP_API_KEY'));
    console.log(chalk.dim('    API authentication key (optional)\n'));

    console.log(chalk.yellow('📚 DOCUMENTATION:\n'));
    console.log(chalk.dim('  https://github.com/yourusername/ai-mcp-gateway\n'));
}
