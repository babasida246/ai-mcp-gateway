/**
 * Analyze Command - Multi-file codebase analysis
 * GitHub Copilot-style workspace analysis
 */

import chalk from 'chalk';
import * as fs from 'fs';
import { glob } from 'glob';
import { MCPClient } from '../client.js';
import {
    shouldUseClaudeCode,
    promptClaudeCodeInsteadOfEscalation,
    executeWithClaudeCode,
    createTaskSummary
} from '../utils/claudeIntegration.js';

export async function analyzeCommand(
    pattern: string,
    options: {
        prompt?: string;
        endpoint?: string;
        apiKey?: string;
        maxFiles?: number;
        recursive?: boolean;
        useClaudeCode?: boolean;
    }
): Promise<void> {
    console.log(chalk.cyan.bold('\n🔍 MCP Codebase Analyzer\n'));
    console.log(chalk.dim('─'.repeat(50)));

    const client = new MCPClient(options.endpoint, options.apiKey);

    // Find files matching pattern
    console.log(chalk.yellow(`📂 Finding files matching: ${pattern}`));

    const files = await findFiles(pattern, {
        maxFiles: options.maxFiles || 10,
        recursive: options.recursive || false
    });

    if (files.length === 0) {
        console.log(chalk.red('\n❌ No files found matching pattern'));
        process.exit(1);
    }

    console.log(chalk.green(`✓ Found ${files.length} files\n`));

    // Read file contents
    console.log(chalk.yellow('📖 Reading files...'));
    const fileContents: Map<string, string> = new Map();

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            fileContents.set(file, content);
            console.log(chalk.dim(`  ✓ ${file} (${content.split('\n').length} lines)`));
        } catch (error) {
            console.log(chalk.red(`  ❌ ${file} - ${error instanceof Error ? error.message : 'Error'}`));
        }
    }

    console.log();

    // Analyze with AI
    console.log(chalk.cyan('🤖 Analyzing with AI...\n'));

    const analysisPrompt = options.prompt || `Analyze this codebase for:
- Code quality issues
- Security vulnerabilities
- Performance problems
- Best practice violations
- Potential bugs
- Improvement suggestions

Provide a structured analysis with severity levels (error/warning/info).`;

    // Build context with all file contents
    let filesContext = '# Codebase Analysis\n\n';
    for (const [file, content] of fileContents.entries()) {
        filesContext += `## File: ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }

    const fullPrompt = `${analysisPrompt}\n\n${filesContext}`;

    try {
        const context = client.getCurrentContext();
        const response = await client.send({
            mode: 'code',
            message: fullPrompt,
            ...context,
        });

        // Display results
        console.log(chalk.cyan('╔' + '═'.repeat(58) + '╗'));
        console.log(chalk.cyan('║') + chalk.bold(' ANALYSIS RESULTS ').padEnd(58) + chalk.cyan('║'));
        console.log(chalk.cyan('╚' + '═'.repeat(58) + '╝\n'));

        console.log(response.message);
        console.log();

        // Metadata
        if (response.model) {
            console.log(chalk.dim('─'.repeat(50)));
            console.log(chalk.dim(`📊 Model: ${response.model}`));
            console.log(chalk.dim(`🎯 Files analyzed: ${fileContents.size}/${files.length}`));
            if (response.tokens) {
                console.log(chalk.dim(`💬 Tokens: ${response.tokens.total}`));
            }
            if (response.cost) {
                console.log(chalk.dim(`💰 Cost: $${response.cost.toFixed(4)}`));
            }
            console.log();
        }

    } catch (error) {
        console.log(chalk.red('\n❌ Analysis failed'));
        console.log(chalk.dim(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    }
}

/**
 * Find files matching glob pattern
 */
async function findFiles(
    pattern: string,
    options: { maxFiles: number; recursive: boolean }
): Promise<string[]> {
    try {
        const globPattern = options.recursive ? pattern : pattern.replace('**/', '');

        const matches = await glob(globPattern, {
            ignore: [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**',
                '**/coverage/**',
                '**/*.min.js',
                '**/*.map'
            ],
            nodir: true
        });

        return matches.slice(0, options.maxFiles);
    } catch (error) {
        console.error(chalk.red('Error finding files:'), error);
        return [];
    }
}
