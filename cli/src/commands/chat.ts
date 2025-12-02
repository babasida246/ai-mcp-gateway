/**
 * Chat Command - Interactive and single message chat
 */

import chalk from 'chalk';
import * as readline from 'readline';
import { MCPClient, MCPResponse } from '../client.js';
import { displayEscalation, promptEscalationConfirm } from '../utils/escalation.js';
import {
    shouldUseClaudeCode,
    promptClaudeCodeInsteadOfEscalation,
    executeWithClaudeCode,
    createTaskSummary
} from '../utils/claudeIntegration.js';
import {
    readProjectContext,
    hasMinimalProjectContext,
    createMissingProjectFiles,
    displayContextSummary,
    buildContextualPrompt
} from '../utils/projectContext.js';
import * as fs from 'fs';

export async function chatCommand(
    message: string | undefined,
    options: { endpoint?: string; apiKey?: string; interactive?: boolean; useClaudeCode?: boolean }
): Promise<void> {
    const client = new MCPClient(options.endpoint, options.apiKey);

    if (message) {
        // Single message mode
        await sendMessage(client, message);
    } else {
        // Interactive mode
        await interactiveMode(client);
    }
}

/**
 * Send a single message
 */
async function sendMessage(client: MCPClient, prompt: string): Promise<void> {
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
                verbose: false // Less verbose for chat mode
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
                } catch {}
                
                // Re-read project context with newly created files
                console.log(chalk.green('✅ Project context files created.'));
                const updatedContext = readProjectContext();
                Object.assign(projectContext, updatedContext);
            }
        } catch (error) {
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
                    ...context,
                });
            }
        }

        printResponse(response);
    } catch (error) {
        process.exit(1);
    }
}

/**
 * Interactive chat mode with readline
 */
async function interactiveMode(client: MCPClient): Promise<void> {
    console.log(chalk.cyan('╔══════════════════════════════════════╗'));
    console.log(chalk.cyan('║   MCP Interactive Chat Mode          ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════╝'));
    console.log(chalk.dim('Type your message and press Enter'));
    console.log(chalk.dim('Commands: /exit, /quit, /help\n'));

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
                ...context,
            });

            console.log(chalk.blue('AI> ') + response.message);

            if (response.metadata) {
                console.log(chalk.dim(`\n[Model: ${response.metadata.model}, Tokens: ${response.metadata.tokens}]`));
            }

            console.log(); // Empty line
        } catch (error) {
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
function printResponse(response: any): void {
    console.log(chalk.cyan('─'.repeat(50)));
    console.log(chalk.white(response.message || JSON.stringify(response, null, 2)));
    console.log(chalk.cyan('─'.repeat(50)));

    // Display escalation warning if present
    if (response.escalation?.required) {
        displayEscalation(response.escalation);
    }

    // Display metadata
    if (response.metadata) {
        const meta = response.metadata;
        const complexity = meta.complexity || 'unknown';
        const layer = meta.layer || 'unknown';
        const model = meta.model || response.model || 'unknown';
        const tokens = meta.tokens?.total || response.tokens?.total || 0;
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
    console.log(chalk.dim('─'.repeat(40)));
    console.log('  Type your message and press Enter');
    console.log('  /help  - Show this help');
    console.log('  /exit  - Exit chat mode');
    console.log('  /quit  - Exit chat mode');
    console.log(chalk.dim('─'.repeat(40) + '\n'));
}
