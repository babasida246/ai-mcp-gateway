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

const program = new Command();

program
    .name('mcp')
    .description('CLI tool for AI MCP Gateway')
    .version('0.1.0');

// Global options
program
    .option('-e, --endpoint <url>', 'MCP server endpoint URL')
    .option('-k, --api-key <key>', 'API authentication key');

// Chat command
program
    .command('chat [message]')
    .description('Chat with AI (interactive mode if no message provided)')
    .option('-i, --interactive', 'Force interactive mode')
    .action(async (message: string | undefined, options: any) => {
        const globalOpts = program.opts();
        await chatCommand(message, {
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            interactive: options.interactive,
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
    .action(async (file: string, options: any) => {
        const globalOpts = program.opts();
        await codeCommand(file, {
            prompt: options.prompt,
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            stdin: options.stdin,
            context: options.context,
            related: options.related,
            create: options.create,
            output: options.output,
        });
    });

// Diff command
program
    .command('diff <file>')
    .description('Request unified diff patch from AI')
    .option('-p, --prompt <text>', 'Custom prompt for changes')
    .option('--apply', 'Automatically apply the patch (not implemented)')
    .action(async (file: string, options: any) => {
        const globalOpts = program.opts();
        await diffCommand(file, {
            prompt: options.prompt,
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            apply: options.apply,
        });
    });

// Analyze command - Multi-file analysis
program
    .command('analyze <pattern>')
    .description('Analyze multiple files (e.g., "src/**/*.ts")')
    .option('-p, --prompt <text>', 'Custom analysis prompt')
    .option('-m, --max-files <number>', 'Maximum files to analyze (default: 10)', '10')
    .option('-r, --recursive', 'Include subdirectories')
    .action(async (pattern: string, options: any) => {
        const globalOpts = program.opts();
        await analyzeCommand(pattern, {
            prompt: options.prompt,
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            maxFiles: parseInt(options.maxFiles),
            recursive: options.recursive,
        });
    });

// Create Project command - AI-powered project scaffolding
program
    .command('create-project <description>')
    .description('Create a complete project with AI (auto-structure, tests, CI/CD)')
    .option('-o, --output <dir>', 'Output directory (default: auto-generated name)')
    .option('--no-install', 'Skip npm install')
    .option('--no-test', 'Skip initial test run')
    .option('-v, --verbose', 'Verbose output')
    .option('-b, --budget <amount>', 'Budget for AI generation (USD)', parseFloat)
    .option('-l, --max-layer <layer>', 'Maximum layer to use (L0/L1/L2/L3)')
    .option('--enable-test', 'Enable testing during generation')
    .option('--enable-debug', 'Enable debug mode')
    .action(async (description: string, options: any) => {
        const globalOpts = program.opts();
        await createProjectCommand(description, {
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            output: options.output,
            noInstall: options.noInstall,
            noTest: options.noTest,
            verbose: options.verbose,
            budget: options.budget,
            maxLayer: options.maxLayer,
            enableTest: options.enableTest,
            enableDebug: options.enableDebug,
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

    console.log(chalk.white('  mcp diff <file> [-p "prompt"]'));
    console.log(chalk.dim('    Request AI to generate unified diff patch.\n'));

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

    console.log(chalk.green('  # Analyze from stdin'));
    console.log(chalk.dim('  $ cat myfile.js | mcp code -\n'));

    console.log(chalk.green('  # Get diff patch'));
    console.log(chalk.dim('  $ mcp diff src/util.py -p "optimize this function"\n'));

    console.log(chalk.green('  # Custom endpoint'));
    console.log(chalk.dim('  $ mcp --endpoint https://my-server.com chat "hello"\n'));

    console.log(chalk.yellow('🌍 ENVIRONMENT VARIABLES:\n'));

    console.log(chalk.white('  MCP_ENDPOINT'));
    console.log(chalk.dim('    API endpoint URL (default: http://localhost:3000)\n'));

    console.log(chalk.white('  MCP_API_KEY'));
    console.log(chalk.dim('    API authentication key (optional)\n'));

    console.log(chalk.yellow('📚 DOCUMENTATION:\n'));
    console.log(chalk.dim('  https://github.com/yourusername/ai-mcp-gateway\n'));
}
