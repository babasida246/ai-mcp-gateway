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
    .description('Send code file for AI analysis/review')
    .option('-p, --prompt <text>', 'Custom prompt for AI')
    .option('--stdin', 'Read from stdin instead of file')
    .action(async (file: string, options: any) => {
        const globalOpts = program.opts();
        await codeCommand(file, {
            prompt: options.prompt,
            endpoint: globalOpts.endpoint,
            apiKey: globalOpts.apiKey,
            stdin: options.stdin,
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
