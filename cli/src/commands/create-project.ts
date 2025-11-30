/**
 * Create Project Command - AI-powered project scaffolding
 * Generates complete project structure with budget tracking and layer control
 */

import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { MCPClient } from '../client.js';

interface ProjectConfig {
    description: string;
    budget: number; // USD, 0 = unlimited
    maxLayer: 'L0' | 'L1' | 'L2' | 'L3';
    enableTests: boolean;
    debugMode: boolean;
    outputDir?: string;
}

interface FileToGenerate {
    path: string;
    purpose: string;
    priority: number;
}

export async function createProjectCommand(
    description: string | undefined,
    options: {
        endpoint?: string;
        apiKey?: string;
        budget?: number;
        maxLayer?: string;
        noTests?: boolean;
        debug?: boolean;
        output?: string;
    }
): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 MCP Project Generator\n'));
    console.log(chalk.dim('─'.repeat(50)));

    const client = new MCPClient(options.endpoint, options.apiKey);

    // Get project configuration
    const config = await getProjectConfig(description, options);

    console.log(chalk.yellow('\n📋 Project Configuration:'));
    console.log(chalk.dim(`  Description: ${config.description}`));
    console.log(chalk.dim(`  Budget: ${config.budget === 0 ? 'Unlimited' : '$' + config.budget.toFixed(2)}`));
    console.log(chalk.dim(`  Max Layer: ${config.maxLayer}`));
    console.log(chalk.dim(`  Tests: ${config.enableTests ? 'Yes' : 'No'}`));
    console.log(chalk.dim(`  Debug: ${config.debugMode ? 'Yes' : 'No'}`));
    if (config.outputDir) {
        console.log(chalk.dim(`  Output: ${config.outputDir}`));
    }
    console.log();

    // Step 1: Analyze project requirements
    console.log(chalk.cyan('🔍 Analyzing project requirements...'));
    const projectPlan = await analyzeProjectRequirements(client, config);

    if (!projectPlan || projectPlan.files.length === 0) {
        console.log(chalk.red('\n❌ Failed to generate project plan'));
        process.exit(1);
    }

    // Display project plan
    console.log(chalk.green('\n✓ Project plan created!'));
    console.log(chalk.yellow(`\n📁 Files to generate (${projectPlan.files.length}):`));
    projectPlan.files.forEach((file: FileToGenerate) => {
        console.log(chalk.dim(`  ${file.priority}. ${file.path} - ${file.purpose}`));
    });

    // Confirm before generation
    const confirmed = await confirmGeneration();
    if (!confirmed) {
        console.log(chalk.yellow('\n⚠️  Project generation cancelled'));
        process.exit(0);
    }

    // Step 2: Generate files with budget tracking
    console.log(chalk.cyan('\n📝 Generating project files...\n'));
    let totalCost = 0;
    let filesGenerated = 0;
    const outputDir = config.outputDir || process.cwd();

    for (let i = 0; i < projectPlan.files.length; i++) {
        const file = projectPlan.files[i];
        const fileNum = i + 1;

        console.log(chalk.blue(`[${fileNum}/${projectPlan.files.length}] Generating ${file.path}...`));

        try {
            const result = await generateFile(client, config, file, projectPlan.context);

            if (!result) {
                console.log(chalk.red(`  ❌ Failed to generate ${file.path}`));
                continue;
            }

            // Check budget before writing
            totalCost += result.cost;
            if (config.budget > 0 && totalCost > config.budget) {
                console.log(chalk.red(`\n⚠️  Budget exceeded! ($${totalCost.toFixed(4)} > $${config.budget})`));
                console.log(chalk.yellow(`Generated ${filesGenerated}/${projectPlan.files.length} files before hitting budget limit`));
                break;
            }

            // Write file
            const filePath = path.join(outputDir, file.path);
            const fileDir = path.dirname(filePath);

            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }

            fs.writeFileSync(filePath, result.content, 'utf-8');
            filesGenerated++;

            console.log(chalk.green(`  ✓ Created ${file.path}`));
            console.log(chalk.dim(`    Cost: $${result.cost.toFixed(4)} | Total: $${totalCost.toFixed(4)}`));
            if (config.debugMode) {
                console.log(chalk.dim(`    Model: ${result.model} | Tokens: ${result.tokens}`));
            }
        } catch (error) {
            console.log(chalk.red(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`));
        }

        console.log();
    }

    // Summary
    console.log(chalk.cyan('─'.repeat(50)));
    console.log(chalk.green.bold(`\n✨ Project generation complete!`));
    console.log(chalk.dim(`📁 Generated: ${filesGenerated}/${projectPlan.files.length} files`));
    console.log(chalk.dim(`💰 Total cost: $${totalCost.toFixed(4)}`));
    if (config.budget > 0) {
        const remaining = config.budget - totalCost;
        console.log(chalk.dim(`💵 Budget remaining: $${remaining.toFixed(4)}`));
    }
    console.log();

    // Next steps
    if (filesGenerated > 0) {
        console.log(chalk.yellow('📖 Next steps:'));
        console.log(chalk.dim('  1. cd ' + (config.outputDir || '.')));
        console.log(chalk.dim('  2. npm install  (or your package manager)'));
        console.log(chalk.dim('  3. Review generated files'));
        if (config.enableTests) {
            console.log(chalk.dim('  4. npm test'));
        }
        console.log();
    }
}

/**
 * Get project configuration from user input or options
 */
async function getProjectConfig(
    description: string | undefined,
    options: Record<string, unknown>
): Promise<ProjectConfig> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                resolve(answer.trim());
            });
        });
    };

    let config: ProjectConfig = {
        description: '',
        budget: 0,
        maxLayer: 'L1',
        enableTests: true,
        debugMode: false,
        outputDir: options.output as string | undefined
    };

    try {
        // Get description
        if (!description) {
            config.description = await question(chalk.yellow('Project description: '));
        } else {
            config.description = description;
        }

        if (!config.description) {
            console.log(chalk.red('\n❌ Project description is required'));
            process.exit(1);
        }

        // Get budget (if not provided)
        if (options.budget === undefined) {
            const budgetStr = await question(chalk.yellow('Budget (USD, 0 for no limit): '));
            config.budget = parseFloat(budgetStr) || 0;
        } else {
            config.budget = options.budget as number;
        }

        // Get max layer (if not provided)
        if (!options.maxLayer) {
            const layerStr = await question(chalk.yellow('Maximum layer (L0/L1/L2/L3) [L1]: '));
            const layer = layerStr.toUpperCase();
            config.maxLayer = (['L0', 'L1', 'L2', 'L3'].includes(layer) ? layer : 'L1') as 'L0' | 'L1' | 'L2' | 'L3';
        } else {
            const layer = options.maxLayer.toString().toUpperCase();
            config.maxLayer = (['L0', 'L1', 'L2', 'L3'].includes(layer) ? layer : 'L1') as 'L0' | 'L1' | 'L2' | 'L3';
        }

        // Validate layer
        if (!['L0', 'L1', 'L2', 'L3'].includes(config.maxLayer)) {
            config.maxLayer = 'L1';
        }

        // Get test preference (if not provided)
        if (options.noTests === undefined) {
            const testsStr = await question(chalk.yellow('Enable testing? (y/n) [y]: '));
            config.enableTests = testsStr.toLowerCase() !== 'n';
        } else {
            config.enableTests = !options.noTests;
        }

        // Debug mode
        config.debugMode = (options.debug as boolean) || false;

    } finally {
        rl.close();
    }

    return config;
}

/**
 * Analyze project requirements and create file plan
 */
async function analyzeProjectRequirements(
    client: MCPClient,
    config: ProjectConfig
): Promise<{ files: FileToGenerate[]; context: string } | null> {
    const prompt = `You are a project scaffolding expert. Analyze this project requirement and create a comprehensive file structure plan.

Project: ${config.description}
Tests: ${config.enableTests ? 'Include test files' : 'No tests'}
Max Layer: ${config.maxLayer} (L0=free/basic, L1=cheap/good, L2=mid/better, L3=premium/best)

Respond with a JSON object containing:
{
  "projectName": "suggested-project-name",
  "framework": "main framework/stack",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "purpose": "brief description of what this file does",
      "priority": 1
    }
  ],
  "dependencies": ["package1", "package2"],
  "context": "overall project context and architecture notes"
}

Generate a realistic, production-ready project structure. Include:
- Configuration files (package.json, tsconfig.json, etc.)
- Source code files
- Documentation (README.md)
${config.enableTests ? '- Test files' : ''}
- Entry points

Prioritize files by importance (1=most important).`;

    try {
        const context = client.getCurrentContext();
        const response = await client.send({
            mode: 'chat',
            message: prompt,
            ...context,
        });

        // Parse JSON from response
        const jsonMatch = response.message.match(/```json\n([\s\S]+?)\n```/) ||
            response.message.match(/\{[\s\S]+\}/);

        if (!jsonMatch) {
            console.log(chalk.red('Failed to parse project plan from AI response'));
            if (config.debugMode) {
                console.log(chalk.dim('Response:'), response.message);
            }
            return null;
        }

        const planData = JSON.parse(jsonMatch[1] || jsonMatch[0]);

        return {
            files: planData.files || [],
            context: `Project: ${planData.projectName}\nFramework: ${planData.framework}\n\nDependencies:\n${planData.dependencies?.join('\n')}\n\n${planData.context}`
        };
    } catch (error) {
        console.log(chalk.red('Error analyzing project:'), error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Generate a single file
 */
async function generateFile(
    client: MCPClient,
    config: ProjectConfig,
    file: FileToGenerate,
    projectContext: string
): Promise<{ content: string; cost: number; model: string; tokens: number } | null> {
    const prompt = `Generate the complete content for this file in the project.

${projectContext}

File: ${file.path}
Purpose: ${file.purpose}
Max Layer: ${config.maxLayer}

Requirements:
- Production-ready code
- Follow best practices
- Include necessary imports
- Add helpful comments
- Handle edge cases

Respond with ONLY the file content, no explanations or markdown code blocks.`;

    try {
        const context = client.getCurrentContext();
        const response = await client.send({
            mode: 'code',
            message: prompt,
            ...context,
        });

        // Extract code from markdown if present
        let content = response.message;
        const codeBlockMatch = content.match(/```[\w]*\n([\s\S]+?)\n```/);
        if (codeBlockMatch) {
            content = codeBlockMatch[1];
        }

        return {
            content,
            cost: response.cost || 0,
            model: response.model || 'unknown',
            tokens: response.tokens?.total || 0
        };
    } catch (error) {
        console.log(chalk.red('Error generating file:'), error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Confirm before generation
 */
async function confirmGeneration(): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow('\n▶  Proceed with generation? (y/n) [y]: '), (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() !== 'n');
        });
    });
}
