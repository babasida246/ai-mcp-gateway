/**
 * Claude Code Integration - Spawn external Claude Code binary
 * Allows CLI to use Claude Code as an alternative to multi-layer API routing
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import chalk from 'chalk';

export interface RunClaudeOptions {
    cwd?: string;
    args?: string[];        // Extra args to pass to `claude code`
    claudeBinOverride?: string; // Optional env override for binary path
}

/**
 * Run Claude Code CLI binary in interactive mode
 * 
 * @param options Configuration for Claude Code execution
 * @returns Promise resolving to exit code (0 = success, non-zero = error)
 * 
 * @example
 * // Basic usage
 * await runClaudeCode({ cwd: './my-project' });
 * 
 * // With custom args
 * await runClaudeCode({ 
 *   cwd: './my-project',
 *   args: ['--help']
 * });
 * 
 * // With custom binary path
 * await runClaudeCode({ 
 *   claudeBinOverride: '/usr/local/bin/claude'
 * });
 */
export async function runClaudeCode(options: RunClaudeOptions = {}): Promise<number> {
    const cwd = options.cwd || process.cwd();
    const args = ['code', ...(options.args || [])];

    // Find Claude binary in order of priority:
    // 1. options.claudeBinOverride
    // 2. CLAUDE_BIN environment variable
    // 3. 'claude' in PATH
    let claudeBin: string;

    if (options.claudeBinOverride) {
        claudeBin = options.claudeBinOverride;
        if (!existsSync(claudeBin)) {
            console.error(chalk.red(`\n❌ Claude binary not found at: ${claudeBin}\n`));
            printInstallInstructions();
            return 1;
        }
    } else if (process.env.CLAUDE_BIN) {
        claudeBin = process.env.CLAUDE_BIN;
        if (!existsSync(claudeBin)) {
            console.error(chalk.red(`\n❌ CLAUDE_BIN points to non-existent file: ${claudeBin}\n`));
            printInstallInstructions();
            return 1;
        }
    } else {
        // Use 'claude' from PATH
        claudeBin = 'claude';
    }

    try {
        console.log(chalk.cyan(`\n🤖 Launching Claude Code...`));
        console.log(chalk.dim(`   Working directory: ${cwd}`));
        console.log(chalk.dim(`   Command: ${claudeBin} ${args.join(' ')}\n`));

        // Spawn Claude Code process with inherited stdio for interactivity
        const child = spawn(claudeBin, args, {
            cwd,
            stdio: 'inherit', // Allow user to interact directly
            shell: platform() === 'win32', // Use shell on Windows for better compatibility
        });

        return new Promise<number>((resolve) => {
            child.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    console.error(chalk.red('\n❌ Claude Code binary not found in PATH\n'));
                    printInstallInstructions();
                    resolve(1);
                } else {
                    console.error(chalk.red(`\n❌ Failed to spawn Claude Code: ${error.message}\n`));
                    resolve(1);
                }
            });

            child.on('close', (code) => {
                const exitCode = code ?? 1;
                if (exitCode === 0) {
                    console.log(chalk.green('\n✓ Claude Code session completed\n'));
                } else {
                    console.log(chalk.yellow(`\n⚠️  Claude Code exited with code ${exitCode}\n`));
                }
                resolve(exitCode);
            });
        });
    } catch (error) {
        console.error(chalk.red(`\n❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}\n`));
        return 1;
    }
}

/**
 * Print installation instructions for Claude Code
 */
function printInstallInstructions(): void {
    console.log(chalk.yellow('📦 Claude Code Installation:'));
    console.log();

    const os = platform();

    if (os === 'win32') {
        console.log(chalk.white('  Windows (PowerShell):'));
        console.log(chalk.dim('    # Using npm (recommended)'));
        console.log(chalk.cyan('    npm install -g @anthropic-ai/claude-code'));
        console.log();
        console.log(chalk.dim('    # Or download from https://claude.ai/download'));
        console.log();
    } else if (os === 'darwin') {
        console.log(chalk.white('  macOS:'));
        console.log(chalk.dim('    # Using Homebrew (recommended)'));
        console.log(chalk.cyan('    brew install anthropic/tap/claude'));
        console.log();
        console.log(chalk.dim('    # Or using npm'));
        console.log(chalk.cyan('    npm install -g @anthropic-ai/claude-code'));
        console.log();
    } else {
        console.log(chalk.white('  Linux / WSL:'));
        console.log(chalk.dim('    # Using npm (recommended)'));
        console.log(chalk.cyan('    npm install -g @anthropic-ai/claude-code'));
        console.log();
        console.log(chalk.dim('    # Or using curl'));
        console.log(chalk.cyan('    curl -fsSL https://claude.ai/install.sh | sh'));
        console.log();
    }

    console.log(chalk.yellow('🔧 Alternative: Set CLAUDE_BIN environment variable'));
    console.log(chalk.dim('    export CLAUDE_BIN=/path/to/claude'));
    console.log();

    console.log(chalk.dim('📚 Documentation: https://docs.anthropic.com/claude-code'));
    console.log();
}
