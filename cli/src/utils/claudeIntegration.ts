/**
 * Claude Code Engine Integration for Commands
 * Handles intelligent fallback to Claude Code when escalation is needed
 */

import chalk from 'chalk';
import * as readline from 'readline';
import { loadProjectConfig, findProjectRoot } from '../projectConfig.js';
import { runClaudeCode } from './runClaudeCode.js';

/**
 * Check if Claude Code mode should be used based on:
 * 1. Project config (mcp.config.json)
 * 2. CLI flag (--use-claude-code or --claude)
 * 
 * @param cwd Current working directory
 * @param cliFlag CLI flag override
 * @returns Object with shouldUse flag and project root
 */
export async function shouldUseClaudeCode(
    cwd: string = process.cwd(),
    cliFlag?: boolean
): Promise<{ shouldUse: boolean; projectRoot: string | null }> {
    // If CLI flag explicitly set, use it
    if (cliFlag !== undefined) {
        return { shouldUse: cliFlag, projectRoot: null };
    }

    // Try to find project config
    const projectRoot = findProjectRoot(cwd);
    if (!projectRoot) {
        return { shouldUse: false, projectRoot: null };
    }

    const config = await loadProjectConfig(projectRoot);
    if (!config) {
        return { shouldUse: false, projectRoot };
    }

    // Check both flags for compatibility
    const useClaudeCode = config.engine === 'claude-code' || config.useClaudeCode === true;

    return { shouldUse: useClaudeCode, projectRoot };
}

/**
 * Prompt user to use Claude Code instead of escalating to L1/L2/L3
 * 
 * @param taskSummary Brief description of what the task is
 * @param currentLayer Current layer (usually L0)
 * @param suggestedLayer Layer that would be escalated to (L1/L2/L3)
 * @param reason Why escalation is needed
 * @returns Promise<true> if user wants Claude Code, false otherwise
 */
export async function promptClaudeCodeInsteadOfEscalation(
    taskSummary: string,
    currentLayer: string,
    suggestedLayer: string,
    reason: string
): Promise<boolean> {
    console.log(chalk.cyan('\n🤖 Claude Code Available'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.yellow(`   Task: ${taskSummary}`));
    console.log(chalk.dim(`   Current Layer: ${currentLayer}`));
    console.log(chalk.dim(`   Suggested Escalation: ${suggestedLayer}`));
    console.log(chalk.dim(`   Reason: ${reason}`));
    console.log();
    console.log(chalk.cyan('   This project is configured to use Claude Code.'));
    console.log(chalk.dim(`   • ${chalk.green('Claude Code')}: Use local Claude Pro (no API cost, full context)`));
    console.log(chalk.dim(`   • ${chalk.yellow('Escalate to ' + suggestedLayer)}: Use multi-layer API (costs money, limited context)`));
    console.log();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.cyan('Use Claude Code for this task? (Y/n): '), (answer) => {
            rl.close();
            const useClaude = answer.trim().toLowerCase() !== 'n';

            if (useClaude) {
                console.log(chalk.green('✓ Will use Claude Code\n'));
            } else {
                console.log(chalk.yellow(`⚠️  Will escalate to ${suggestedLayer} via API\n`));
            }

            resolve(useClaude);
        });
    });
}

/**
 * Execute task with Claude Code
 * Launches Claude Code in the project directory with context about the task
 * 
 * @param taskSummary Description of the task for user reference
 * @param projectRoot Project root directory
 * @returns Exit code from Claude Code
 */
export async function executeWithClaudeCode(
    taskSummary: string,
    projectRoot: string
): Promise<number> {
    console.log(chalk.cyan(`\n📋 Task: ${taskSummary}`));
    console.log(chalk.dim(`   Launching Claude Code in ${projectRoot}...\n`));

    const exitCode = await runClaudeCode({
        cwd: projectRoot,
        args: [], // Let Claude Code run in interactive mode
    });

    return exitCode;
}

/**
 * Helper to create task summary from command context
 * Used to generate concise description for Claude Code prompt
 * 
 * @param command Command name (code, chat, diff, analyze, etc.)
 * @param target Target file/pattern
 * @param prompt User's custom prompt
 * @returns Task summary string
 */
export function createTaskSummary(
    command: string,
    target?: string,
    prompt?: string
): string {
    const parts: string[] = [];

    parts.push(command.charAt(0).toUpperCase() + command.slice(1));

    if (target) {
        parts.push(`on ${target}`);
    }

    if (prompt) {
        const shortPrompt = prompt.length > 60 ? prompt.substring(0, 57) + '...' : prompt;
        parts.push(`- "${shortPrompt}"`);
    }

    return parts.join(' ');
}
