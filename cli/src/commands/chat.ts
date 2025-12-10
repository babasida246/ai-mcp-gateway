/**
 * Chat Command - Interactive and single message chat
 * Enhanced with Claude Code / GitHub Copilot-like capabilities
 */

import chalk from 'chalk';
import * as readline from 'readline';
import { MCPClient, MCPResponse } from '../client.js';
import { displayEscalation, promptEscalationConfirm } from '../utils/escalation.js';
import {
    readProjectContext,
    hasMinimalProjectContext,
    createMissingProjectFiles,
    buildContextualPrompt
} from '../utils/projectContext.js';
import {
    analyzeProject,
    searchFiles,
    searchContent,
    confirmAction,
    parseActionsFromResponse,
    executeAction,
    formatProjectAnalysisForPrompt,
    ProjectAnalysis,
    // Advanced features
    readFileChunked,
    getFileSummary,
    isGitRepo,
    getGitStatus,
    gitCommit,
    getGitDiff,
    gitCreateBranch,
    gitCheckout,
    undoLastChange,
    getUndoHistory,
    smartSearch,
    findRelatedFiles
} from '../utils/agentTools.js';
import * as fs from 'fs';
import * as path from 'path';

export async function chatCommand(
    message: string | undefined,
    options: {
        endpoint?: string;
        apiKey?: string;
        username?: string;
        password?: string;
        interactive?: boolean;
        useClaudeCode?: boolean;
        budget?: number;
        agent?: boolean; // Enable agent mode (Claude Code-like)
        autoExecute?: boolean; // Auto-execute actions without confirmation
    }
): Promise<void> {
    const client = new MCPClient(options.endpoint, options.apiKey, options.username, options.password);

    // Agent mode: analyze project and enable file operations
    if (options.agent || message?.startsWith('/agent ')) {
        const agentMessage = message?.startsWith('/agent ') ? message.slice(7) : message;
        await agentMode(client, agentMessage, options);
        return;
    }

    if (message) {
        // Single message mode
        await sendMessage(client, message, options);
    } else {
        // Interactive mode
        await interactiveMode(client, options);
    }
}

/**
 * Send a single message
 */
async function sendMessage(client: MCPClient, prompt: string, options: { endpoint?: string; apiKey?: string; username?: string; password?: string; budget?: number }): Promise<void> {
    // Read project context files
    console.log(chalk.dim('🔍 Reading project context...'));
    const projectContext = readProjectContext();

    // Check if we need to auto-generate project context files
    if (!hasMinimalProjectContext(projectContext)) {
        console.log(chalk.yellow('📝 Project context files missing. Generating project summary first...'));

        try {
            // Import and run summarize functionality
            const { summarizeProject } = await import('./summarize.js');

            // Generate summary with free budget
            await summarizeProject({
                output: 'temp-project-summary.md',
                budget: 0, // Free tier for initial analysis
                verbose: false, // Less verbose for chat mode
                endpoint: options.endpoint,
                apiKey: options.apiKey,
                username: options.username,
                password: options.password
            });

            // Read the generated summary
            const summaryPath = 'temp-project-summary.md';
            if (fs.existsSync(summaryPath)) {
                const summaryContent = fs.readFileSync(summaryPath, 'utf-8');

                // Create missing project files based on summary
                await createMissingProjectFiles(process.cwd(), summaryContent, false);

                // Clean up temporary file
                try {
                    fs.unlinkSync(summaryPath);
                } catch {
                    // Ignore cleanup errors
                }

                // Re-read project context with newly created files
                console.log(chalk.green('✅ Project context files created.'));
                const updatedContext = readProjectContext();
                Object.assign(projectContext, updatedContext);
            }
        } catch {
            console.log(chalk.yellow('⚠️  Could not auto-generate project context. Continuing without...'));
        }
    }

    // Build enhanced prompt with project context
    const enhancedPrompt = buildContextualPrompt(prompt, projectContext, 'analysis');

    console.log(chalk.dim('\n⏳ Sending request to MCP server...\n'));

    const context = client.getCurrentContext();

    try {
        let response = await client.send({
            mode: 'chat',
            message: enhancedPrompt,
            budget: options.budget ?? 0, // Default to free tier if not specified
            ...context,
        });

        // Handle escalation confirmation if required
        if (response.requiresEscalationConfirm && response.suggestedLayer) {
            const currentLayer = response.metadata?.layer || 'L0';
            const shouldEscalate = await promptEscalationConfirm(
                currentLayer,
                response.suggestedLayer,
                response.escalationReason || 'Quality improvement needed'
            );

            if (shouldEscalate) {
                console.log(chalk.cyan(`\n🔄 Escalating to ${response.suggestedLayer}...\n`));

                const escalatedMessage = response.optimizedPrompt || prompt;

                response = await client.send({
                    mode: 'chat',
                    message: escalatedMessage,
                    budget: options.budget ?? 0, // Default to free tier if not specified
                    ...context,
                });
            }
        }

        printResponse(response);
    } catch {
        process.exit(1);
    }
}

/**
 * Interactive chat mode with readline
 */
async function interactiveMode(client: MCPClient, options: { budget?: number; agent?: boolean; autoExecute?: boolean } = {}): Promise<void> {
    console.log(chalk.cyan('╔══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║   MCP Interactive Chat Mode                      ║'));
    console.log(chalk.cyan('║   (Claude Code / GitHub Copilot-like)            ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════╝'));
    console.log(chalk.dim('Type your message and press Enter'));
    console.log(chalk.dim('Commands: /exit, /quit, /help, /agent, /search'));
    console.log(chalk.dim('/agent <task> - Execute task with file modifications'));
    console.log(chalk.dim('/search <query> - Search files and content\n'));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.green('You> '),
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
        const input = line.trim();

        // Handle special commands
        if (input === '/exit' || input === '/quit') {
            console.log(chalk.yellow('\n👋 Goodbye!\n'));
            rl.close();
            return;
        }

        if (input === '/help') {
            printHelp();
            rl.prompt();
            return;
        }

        // Handle /agent command
        if (input.startsWith('/agent ')) {
            const agentTask = input.slice(7).trim();
            if (agentTask) {
                await runAgentTask(client, agentTask, options);
            } else {
                console.log(chalk.yellow('Usage: /agent <task description>'));
            }
            rl.prompt();
            return;
        }

        // Handle /search command
        if (input.startsWith('/search ')) {
            const query = input.slice(8).trim();
            if (query) {
                await runSearch(query);
            } else {
                console.log(chalk.yellow('Usage: /search <query>'));
            }
            rl.prompt();
            return;
        }

        // Handle /read command
        if (input.startsWith('/read ')) {
            const filePath = input.slice(6).trim();
            if (filePath) {
                const summary = getFileSummary(filePath);
                if (summary.lines > 0) {
                    console.log(chalk.cyan(`\n📄 ${filePath}:`));
                    console.log(chalk.dim(`   ${summary.lines} lines | ${summary.size} | ${summary.language}`));
                    if (summary.sections.length > 0) {
                        console.log(chalk.dim('\n   Key sections:'));
                        summary.sections.slice(0, 10).forEach(s => console.log(chalk.dim(`   ${s}`)));
                    }
                    console.log('');

                    // Read first chunk
                    const chunk = readFileChunked(filePath, 1, 100);
                    console.log(chunk.content);
                    if (chunk.hasMore) {
                        console.log(chalk.dim(`\n... showing lines 1-${chunk.endLine} of ${chunk.totalLines}`));
                        console.log(chalk.dim('Use /read <file> <start> <lines> for more'));
                    }
                } else {
                    console.log(chalk.red(`Error: Could not read file ${filePath}`));
                }
            }
            rl.prompt();
            return;
        }

        // Handle /git commands
        if (input.startsWith('/git ')) {
            const gitCmd = input.slice(5).trim();
            await handleGitCommand(gitCmd);
            rl.prompt();
            return;
        }

        // Handle /undo command
        if (input === '/undo') {
            const result = undoLastChange();
            if (result.success) {
                console.log(chalk.green(`✅ Undone changes to: ${result.file}`));
            } else {
                console.log(chalk.yellow(`⚠️ ${result.error}`));
            }
            rl.prompt();
            return;
        }

        // Handle /history command
        if (input === '/history') {
            const history = getUndoHistory();
            if (history.length === 0) {
                console.log(chalk.yellow('No changes to undo.'));
            } else {
                console.log(chalk.cyan('\n📜 Undo History:'));
                history.forEach((h, i) => {
                    const time = new Date(h.timestamp).toLocaleTimeString();
                    console.log(chalk.dim(`  ${i + 1}. ${path.relative(process.cwd(), h.path)} (${time})`));
                });
                console.log('');
            }
            rl.prompt();
            return;
        }

        // Handle /smart-search command
        if (input.startsWith('/smart ')) {
            const query = input.slice(7).trim();
            if (query) {
                console.log(chalk.dim(`\n🔍 Smart searching for: ${query}\n`));
                const results = smartSearch(query);
                if (results.length > 0) {
                    results.slice(0, 10).forEach(r => {
                        const relPath = path.relative(process.cwd(), r.file);
                        console.log(chalk.cyan(`📄 ${relPath} (score: ${r.score})`));
                        r.matches.slice(0, 3).forEach(m => {
                            console.log(chalk.dim(`   L${m.line}: ${m.content.substring(0, 80)}`));
                        });
                    });
                } else {
                    console.log(chalk.yellow('No results found.'));
                }
                console.log('');
            }
            rl.prompt();
            return;
        }

        // Handle /related command
        if (input.startsWith('/related ')) {
            const filePath = input.slice(9).trim();
            if (filePath && fs.existsSync(filePath)) {
                const related = findRelatedFiles(filePath);
                if (related.length > 0) {
                    console.log(chalk.cyan(`\n🔗 Files related to ${path.basename(filePath)}:`));
                    related.forEach(f => console.log(chalk.dim(`   ${path.relative(process.cwd(), f)}`)));
                    console.log('');
                } else {
                    console.log(chalk.yellow('No related files found.'));
                }
            }
            rl.prompt();
            return;
        }

        if (!input) {
            rl.prompt();
            return;
        }

        // Send message to MCP
        console.log(chalk.dim('⏳ Thinking...\n'));

        const context = client.getCurrentContext();

        try {
            const response = await client.send({
                mode: 'chat',
                message: input,
                budget: options.budget ?? 0, // Default to free tier if not specified
                ...context,
            });

            console.log(chalk.blue('AI> ') + response.message);

            if (response.metadata) {
                console.log(chalk.dim(`\n[Model: ${response.metadata.model}, Tokens: ${response.metadata.tokens}]`));
            }

            console.log(); // Empty line
        } catch {
            console.log(chalk.red('\n❌ Failed to get response\n'));
        }

        rl.prompt();
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

/**
 * Print response message
 */
function printResponse(response: MCPResponse): void {
    console.log(chalk.cyan('─'.repeat(50)));
    console.log(chalk.white(response.message || JSON.stringify(response, null, 2)));
    console.log(chalk.cyan('─'.repeat(50)));

    // Display escalation warning if present
    if (response.escalation?.required) {
        displayEscalation({
            from: response.escalation.currentLayer || 'unknown',
            to: response.escalation.suggestedLayer || 'unknown',
            reason: response.escalation.reason || 'Quality improvement needed'
        });
    }

    // Display metadata
    if (response.metadata) {
        const meta = response.metadata;
        const complexity = meta.complexity || 'unknown';
        const layer = meta.layer || 'unknown';
        const model = meta.model || response.model || 'unknown';
        const tokens = meta.tokens || response.tokens?.total || 0;
        const cost = meta.cost || response.cost;

        console.log(chalk.dim(`\n📊 Complexity: ${complexity} | Layer: ${layer} | Model: ${model} | Tokens: ${tokens}${cost ? ` | Cost: $${cost.toFixed(4)}` : ''}\n`));
    } else if (response.model) {
        const tokens = response.tokens?.total || 0;
        const cost = response.cost ? `$${response.cost.toFixed(4)}` : '';
        console.log(chalk.dim(`\n📊 Model: ${response.model} | Tokens: ${tokens} ${cost ? `| Cost: ${cost}` : ''}\n`));
    }
}

/**
 * Print help message
 */
function printHelp(): void {
    console.log(chalk.yellow('\n📖 Interactive Chat Help'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log('  Type your message and press Enter');
    console.log('  /help          - Show this help');
    console.log('  /exit, /quit   - Exit chat mode');
    console.log(chalk.cyan('\n📁 File Operations:'));
    console.log('  /read <file>   - Read file content');
    console.log('  /search <q>    - Search files and content');
    console.log('  /agent <task>  - Execute task with file operations');
    console.log(chalk.cyan('\n🔀 Git Operations:'));
    console.log('  /git status    - Show git status');
    console.log('  /git diff      - Show git diff');
    console.log('  /git commit <msg> - Commit changes');
    console.log('  /git branch <name> - Create new branch');
    console.log(chalk.cyan('\n↩️ Undo Operations:'));
    console.log('  /undo          - Undo last file change');
    console.log('  /history       - Show undo history');
    console.log(chalk.dim('─'.repeat(50) + '\n'));
}

/**
 * Agent Mode - Claude Code / GitHub Copilot-like functionality
 */
async function agentMode(
    client: MCPClient,
    task: string | undefined,
    options: { budget?: number; autoExecute?: boolean; endpoint?: string; apiKey?: string; username?: string; password?: string }
): Promise<void> {
    console.log(chalk.cyan('\n╔══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║   🤖 MCP Agent Mode                              ║'));
    console.log(chalk.cyan('║   Claude Code / GitHub Copilot-like Assistant    ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════╝\n'));

    // Analyze project
    console.log(chalk.dim('🔍 Analyzing project structure...'));
    const projectAnalysis = analyzeProject(process.cwd());

    console.log(chalk.green(`✅ Project analyzed:`));
    console.log(chalk.dim(`   Type: ${projectAnalysis.projectType}`));
    console.log(chalk.dim(`   Framework: ${projectAnalysis.framework}`));
    console.log(chalk.dim(`   Language: ${projectAnalysis.language}`));
    console.log(chalk.dim(`   Package Manager: ${projectAnalysis.packageManager}`));
    console.log(chalk.dim(`   Dependencies: ${projectAnalysis.dependencies.length}`));
    console.log(chalk.dim(`   Files analyzed: ${projectAnalysis.relevantFiles.length}\n`));

    if (task) {
        // Single task mode
        await runAgentTask(client, task, { ...options, projectAnalysis });
    } else {
        // Interactive agent mode
        await interactiveAgentMode(client, projectAnalysis, options);
    }
}

/**
 * Run a single agent task
 */
async function runAgentTask(
    client: MCPClient,
    task: string,
    options: { budget?: number; autoExecute?: boolean; projectAnalysis?: ProjectAnalysis }
): Promise<void> {
    const projectAnalysis = options.projectAnalysis || analyzeProject(process.cwd());

    console.log(chalk.cyan(`\n🎯 Task: ${task}\n`));
    console.log(chalk.dim('⏳ Analyzing and planning...'));

    // Build agent prompt with project context and action instructions
    const agentPrompt = buildAgentPrompt(task, projectAnalysis);

    const context = client.getCurrentContext();

    try {
        const response = await client.send({
            mode: 'code',
            message: agentPrompt,
            budget: options.budget ?? 0,
            ...context,
        });

        console.log(chalk.cyan('\n📋 AI Analysis:\n'));
        console.log(response.message);

        // Parse actions from response
        const actions = parseActionsFromResponse(response.message);

        if (actions.length > 0) {
            console.log(chalk.yellow(`\n🔧 Found ${actions.length} action(s) to execute:\n`));

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                console.log(chalk.cyan(`${i + 1}. ${action.description}`));
            }

            // Confirm and execute actions
            if (options.autoExecute) {
                console.log(chalk.yellow('\n⚡ Auto-executing actions...\n'));
                for (const action of actions) {
                    const result = await executeAction(action, projectAnalysis);
                    console.log(result.message);
                }
            } else {
                const confirmed = await confirmAction('Execute these actions?');
                if (confirmed) {
                    console.log(chalk.dim('\n⚡ Executing actions...\n'));
                    for (const action of actions) {
                        const result = await executeAction(action, projectAnalysis);
                        console.log(result.message);
                    }
                    console.log(chalk.green('\n✅ All actions completed!'));
                } else {
                    console.log(chalk.yellow('\n⏸️ Actions cancelled.'));
                }
            }
        } else {
            console.log(chalk.dim('\nNo executable actions found in response.'));
        }
    } catch (error) {
        console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
    }
}

/**
 * Interactive agent mode
 */
async function interactiveAgentMode(
    client: MCPClient,
    projectAnalysis: ProjectAnalysis,
    options: { budget?: number; autoExecute?: boolean }
): Promise<void> {
    console.log(chalk.dim('Enter your task or command. Type /help for options.\n'));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.magenta('Agent> '),
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
        const input = line.trim();

        if (input === '/exit' || input === '/quit') {
            console.log(chalk.yellow('\n👋 Exiting agent mode.\n'));
            rl.close();
            return;
        }

        if (input === '/help') {
            printAgentHelp();
            rl.prompt();
            return;
        }

        if (input.startsWith('/search ')) {
            await runSearch(input.slice(8).trim());
            rl.prompt();
            return;
        }

        if (input.startsWith('/read ')) {
            const filePath = input.slice(6).trim();
            const summary = getFileSummary(filePath);
            if (summary.lines > 0) {
                console.log(chalk.cyan(`\n📄 ${filePath}:`));
                console.log(chalk.dim(`   ${summary.lines} lines | ${summary.size} | ${summary.language}`));
                const chunk = readFileChunked(filePath, 1, 100);
                console.log(chunk.content);
                if (chunk.hasMore) {
                    console.log(chalk.dim(`\n... showing lines 1-${chunk.endLine} of ${chunk.totalLines}`));
                }
            } else {
                console.log(chalk.red(`Error: Could not read file ${filePath}`));
            }
            rl.prompt();
            return;
        }

        // Handle git commands in agent mode
        if (input.startsWith('/git ')) {
            await handleGitCommand(input.slice(5).trim());
            rl.prompt();
            return;
        }

        // Handle undo in agent mode
        if (input === '/undo') {
            const result = undoLastChange();
            if (result.success) {
                console.log(chalk.green(`✅ Undone changes to: ${result.file}`));
            } else {
                console.log(chalk.yellow(`⚠️ ${result.error}`));
            }
            rl.prompt();
            return;
        }

        // Handle smart search in agent mode
        if (input.startsWith('/smart ')) {
            const query = input.slice(7).trim();
            if (query) {
                const results = smartSearch(query);
                if (results.length > 0) {
                    console.log(chalk.cyan(`\n🔍 Smart search results for "${query}":\n`));
                    results.slice(0, 10).forEach(r => {
                        const relPath = path.relative(process.cwd(), r.file);
                        console.log(chalk.cyan(`📄 ${relPath} (score: ${r.score})`));
                        r.matches.slice(0, 2).forEach(m => {
                            console.log(chalk.dim(`   L${m.line}: ${m.content.substring(0, 80)}`));
                        });
                    });
                } else {
                    console.log(chalk.yellow('No results found.'));
                }
                console.log('');
            }
            rl.prompt();
            return;
        }

        if (input === '/analyze') {
            console.log(chalk.cyan('\n📊 Project Analysis:\n'));
            console.log(formatProjectAnalysisForPrompt(projectAnalysis));
            rl.prompt();
            return;
        }

        if (!input) {
            rl.prompt();
            return;
        }

        // Execute as agent task
        await runAgentTask(client, input, { ...options, projectAnalysis });
        rl.prompt();
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

/**
 * Handle git commands
 */
async function handleGitCommand(cmd: string): Promise<void> {
    if (!isGitRepo()) {
        console.log(chalk.yellow('⚠️ Not a git repository'));
        return;
    }

    if (cmd === 'status') {
        const status = getGitStatus();
        if (status) {
            console.log(chalk.cyan(`\n🔀 Git Status (${status.branch})`));
            if (status.ahead > 0 || status.behind > 0) {
                console.log(chalk.dim(`   ↑${status.ahead} ↓${status.behind}`));
            }
            if (status.staged.length > 0) {
                console.log(chalk.green('\n   Staged:'));
                status.staged.forEach(f => console.log(chalk.green(`     + ${f}`)));
            }
            if (status.modified.length > 0) {
                console.log(chalk.yellow('\n   Modified:'));
                status.modified.forEach(f => console.log(chalk.yellow(`     M ${f}`)));
            }
            if (status.untracked.length > 0) {
                console.log(chalk.dim('\n   Untracked:'));
                status.untracked.forEach(f => console.log(chalk.dim(`     ? ${f}`)));
            }
            console.log('');
        }
    } else if (cmd === 'diff') {
        const diff = getGitDiff();
        if (diff) {
            console.log(chalk.cyan('\n📝 Git Diff:\n'));
            console.log(diff.substring(0, 5000));
            if (diff.length > 5000) {
                console.log(chalk.dim(`\n... (${diff.length - 5000} more characters)`));
            }
        } else {
            console.log(chalk.dim('No changes to show.'));
        }
    } else if (cmd.startsWith('commit ')) {
        const message = cmd.slice(7).trim();
        if (message) {
            const confirmed = await confirmAction(`Commit with message: "${message}"?`);
            if (confirmed) {
                const result = gitCommit(message);
                if (result.success) {
                    console.log(chalk.green('✅ Changes committed!'));
                } else {
                    console.log(chalk.red(`❌ Commit failed: ${result.error}`));
                }
            }
        } else {
            console.log(chalk.yellow('Usage: /git commit <message>'));
        }
    } else if (cmd.startsWith('branch ')) {
        const branchName = cmd.slice(7).trim();
        if (branchName) {
            const result = gitCreateBranch(branchName);
            if (result.success) {
                console.log(chalk.green(`✅ Created and switched to branch: ${branchName}`));
            } else {
                console.log(chalk.red(`❌ Failed: ${result.error}`));
            }
        } else {
            console.log(chalk.yellow('Usage: /git branch <name>'));
        }
    } else if (cmd.startsWith('checkout ')) {
        const branchName = cmd.slice(9).trim();
        if (branchName) {
            const result = gitCheckout(branchName);
            if (result.success) {
                console.log(chalk.green(`✅ Switched to branch: ${branchName}`));
            } else {
                console.log(chalk.red(`❌ Failed: ${result.error}`));
            }
        } else {
            console.log(chalk.yellow('Usage: /git checkout <branch>'));
        }
    } else {
        console.log(chalk.yellow('Git commands: status, diff, commit <msg>, branch <name>, checkout <branch>'));
    }
}

/**
 * Run search command
 */
async function runSearch(query: string): Promise<void> {
    console.log(chalk.dim(`\n🔍 Searching for: ${query}\n`));

    // Search file names
    const files = searchFiles(process.cwd(), query);
    if (files.length > 0) {
        console.log(chalk.cyan(`📁 Files matching "${query}":`));
        files.slice(0, 10).forEach(f => {
            console.log(chalk.dim(`   ${path.relative(process.cwd(), f)}`));
        });
        if (files.length > 10) {
            console.log(chalk.dim(`   ... and ${files.length - 10} more`));
        }
    }

    // Search content
    const results = searchContent(process.cwd(), query);
    if (results.length > 0) {
        console.log(chalk.cyan(`\n📝 Content matches:`));
        results.slice(0, 15).forEach(r => {
            const relPath = path.relative(process.cwd(), r.file);
            console.log(chalk.dim(`   ${relPath}:${r.line}`));
            console.log(chalk.white(`      ${r.content.substring(0, 100)}`));
        });
        if (results.length > 15) {
            console.log(chalk.dim(`   ... and ${results.length - 15} more matches`));
        }
    }

    if (files.length === 0 && results.length === 0) {
        console.log(chalk.yellow('No results found.'));
    }

    console.log('');
}

/**
 * Build agent prompt with project context
 */
function buildAgentPrompt(task: string, projectAnalysis: ProjectAnalysis): string {
    return `You are an AI coding assistant similar to Claude Code or GitHub Copilot.
You can analyze code, create files, edit files, and execute commands.

## Current Project
${formatProjectAnalysisForPrompt(projectAnalysis)}

## Task
${task}

## Instructions
1. Analyze the task and the project structure
2. Plan the necessary changes
3. Provide your response with executable actions using these formats:

### To create a new file:
\`\`\`FILE_CREATE path/to/file.ts
// file content here
\`\`\`

### To edit an existing file:
\`\`\`FILE_EDIT path/to/file.ts
// complete new content for the file
\`\`\`

### To run a shell command:
\`\`\`COMMAND
npm install package-name
\`\`\`

### To install packages:
\`\`\`INSTALL
package-name-1
package-name-2
\`\`\`

Please analyze the task and provide the necessary actions to complete it.
Be specific and provide complete file contents when creating or editing files.`;
}

/**
 * Print agent help
 */
function printAgentHelp(): void {
    console.log(chalk.yellow('\n📖 Agent Mode Help'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log('  Type your task in natural language');
    console.log('  /help         - Show this help');
    console.log('  /exit, /quit  - Exit agent mode');
    console.log(chalk.cyan('\n📁 File Operations:'));
    console.log('  /read <file>  - Read file with summary');
    console.log('  /search <q>   - Search files and content');
    console.log('  /smart <q>    - Smart search with relevance');
    console.log('  /related <f>  - Find related files');
    console.log('  /analyze      - Show project analysis');
    console.log(chalk.cyan('\n🔀 Git Operations:'));
    console.log('  /git status   - Show git status');
    console.log('  /git diff     - Show git diff');
    console.log('  /git commit <msg> - Commit changes');
    console.log('  /git branch <name> - Create branch');
    console.log('  /git checkout <br> - Switch branch');
    console.log(chalk.cyan('\n↩️ Undo Operations:'));
    console.log('  /undo         - Undo last file change');
    console.log('  /history      - Show undo history');
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.cyan('\nExample tasks:'));
    console.log('  "Add a login form to the dashboard"');
    console.log('  "Fix the bug in user authentication"');
    console.log('  "Create unit tests for the API routes"');
    console.log('  "Refactor the database queries"');
    console.log(chalk.dim('─'.repeat(50) + '\n'));
}
