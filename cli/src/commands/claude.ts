/**
 * Claude Command - Quick access to Claude Code binary
 * Allows running Claude Code directly from MCP CLI
 */

import { runClaudeCode } from '../utils/runClaudeCode.js';

export async function claudeCommand(
    options: {
        cwd?: string;
        forwardArgs?: string[];
    }
): Promise<void> {
    const exitCode = await runClaudeCode({
        cwd: options.cwd,
        args: options.forwardArgs || [],
    });

    process.exit(exitCode);
}
