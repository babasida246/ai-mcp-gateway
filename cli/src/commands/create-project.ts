/**
 * Create Project Command - AI-powered project scaffolding
 * Generates complete project structure with budget tracking and layer control
 */

import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { MCPClient } from '../client.js';
import { createDefaultConfig, saveProjectConfig, loadProjectConfig } from '../projectConfig.js';

interface ProjectConfig {
    description: string;
    budget: number; // USD, 0 = free tier (L0 only)
    maxLayer: 'L0' | 'L1' | 'L2' | 'L3';
    enableTests: boolean;
    debugMode: boolean;
    outputDir?: string;
    useClaudeCode: boolean; // NEW: Claude Code engine preference
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
        useClaudeCode?: boolean; // NEW: Flag to enable Claude Code mode
    }
): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 MCP Project Generator\n'));
    console.log(chalk.dim('─'.repeat(50)));

    const client = new MCPClient(options.endpoint, options.apiKey);

    // Auto-detect mcp-instructor.md if no description provided
    let finalDescription = description;
    if (!finalDescription) {
        const instructorPath = 'mcp-instructor.md';
        if (fs.existsSync(instructorPath)) {
            console.log(chalk.green(`📖 Found ${instructorPath}, using as project description...`));
            try {
                finalDescription = fs.readFileSync(instructorPath, 'utf-8').trim();
                console.log(chalk.dim(`   Loaded ${finalDescription.length} characters from instructor file`));
            } catch (error) {
                console.log(chalk.yellow(`⚠️  Could not read ${instructorPath}, falling back to interactive input`));
            }
        } else {
            // Try to auto-generate project context if no description and no instructor file
            console.log(chalk.yellow('🔍 No description provided and no mcp-instructor.md found.'));
            console.log(chalk.yellow('Analyzing existing project files to generate context...'));

            try {
                const { readProjectContext, hasMinimalProjectContext } = await import('../utils/projectContext.js');
                const projectContext = readProjectContext();

                if (!hasMinimalProjectContext(projectContext)) {
                    const { summarizeProject } = await import('./summarize.js');
                    await summarizeProject({
                        output: 'temp-project-summary.md',
                        budget: 0,
                        verbose: true
                    });

                    if (fs.existsSync('temp-project-summary.md')) {
                        const summaryContent = fs.readFileSync('temp-project-summary.md', 'utf-8');
                        const { createMissingProjectFiles } = await import('../utils/projectContext.js');
                        await createMissingProjectFiles(process.cwd(), summaryContent, true);

                        // Use the generated instructor file
                        if (fs.existsSync(instructorPath)) {
                            finalDescription = fs.readFileSync(instructorPath, 'utf-8').trim();
                            console.log(chalk.green('📖 Generated and loaded mcp-instructor.md'));
                        }

                        // Clean up temp file
                        try { fs.unlinkSync('temp-project-summary.md'); } catch { }
                    }
                }
            } catch (error) {
                console.log(chalk.yellow('⚠️  Could not auto-generate project context.'));
            }
        }
    }

    // Get project configuration
    const config = await getProjectConfig(finalDescription, options);

    console.log(chalk.yellow('\n📋 Project Configuration:'));
    console.log(chalk.dim(`  Description: ${config.description}`));
    console.log(chalk.dim(`  Budget: ${config.budget === 0 ? 'Free tier (L0 only)' : '$' + config.budget.toFixed(2)}`));
    console.log(chalk.dim(`  Max Layer: ${config.maxLayer}`));
    console.log(chalk.dim(`  Engine: ${config.useClaudeCode ? 'Claude Code' : 'Multi-layer API'}`));
    console.log(chalk.dim(`  Tests: ${config.enableTests ? 'Yes' : 'No'}`));
    console.log(chalk.dim(`  Debug: ${config.debugMode ? 'Yes' : 'No'}`));
    if (config.outputDir) {
        console.log(chalk.dim(`  Output: ${config.outputDir}`));
    }
    console.log();

    // Step 1: Generate planning documents (SKETCH, LOGIC_FLOW, ROADMAP)
    console.log(chalk.cyan('📐 Generating project planning documents...\n'));
    const outputDir = config.outputDir || process.cwd();

    // Create mcp.config.json FIRST (before planning documents)
    const projectName = extractProjectName(config.description);
    const mcpConfig = createDefaultConfig(
        projectName,
        config.description,
        '0.1.0', // CLI version from package.json
        config.useClaudeCode
    );

    // Check if config already exists
    const existingConfig = await loadProjectConfig(outputDir);
    if (existingConfig) {
        console.log(chalk.yellow(`\n⚠️  Found existing ${chalk.bold('mcp.config.json')}`));
        console.log(chalk.dim(`   Project: ${existingConfig.projectName}`));
        console.log(chalk.dim(`   Engine: ${existingConfig.engine}`));
        console.log(chalk.dim(`   Created: ${new Date(existingConfig.createdAt).toLocaleString()}`));
        console.log(chalk.yellow(`   Reusing existing configuration.\n`));
    } else {
        await saveProjectConfig(outputDir, mcpConfig);
    }

    const planningDocs = await generatePlanningDocuments(client, config, outputDir);

    if (!planningDocs.success) {
        console.log(chalk.red('\n❌ Failed to generate planning documents'));
        process.exit(1);
    }

    console.log(chalk.green('\n✓ Planning documents created!'));
    console.log(chalk.dim(`  📄 ${planningDocs.files.join('\n  📄 ')}`));
    console.log(chalk.yellow('\n💡 Review the planning documents before proceeding with generation.\n'));

    // Confirm before continuing
    const continueAfterPlanning = await confirmStep('Proceed with project analysis?');
    if (!continueAfterPlanning) {
        console.log(chalk.yellow('\n⚠️  Stopped at planning phase. Review the documents and run again when ready.'));
        process.exit(0);
    }

    // Step 2: Analyze project requirements
    console.log(chalk.cyan('\n🔍 Analyzing project requirements...'));
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
    const confirmed = await confirmStep('Proceed with file generation?');
    if (!confirmed) {
        console.log(chalk.yellow('\n⚠️  Project generation cancelled'));
        process.exit(0);
    }

    // Step 3: Generate files with budget tracking
    console.log(chalk.cyan('\n📝 Generating project files...\n'));
    let totalCost = planningDocs.cost; // Include planning cost
    let filesGenerated = 0;

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
 * Extract project name from description
 */
function extractProjectName(description: string): string {
    // Simple extraction: take first few words, sanitize
    const words = description.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2)
        .slice(0, 3);

    return words.join('-') || 'mcp-project';
}

/**
 * Generate planning documents before project scaffolding
 */
async function generatePlanningDocuments(
    client: MCPClient,
    config: ProjectConfig,
    outputDir: string
): Promise<{ success: boolean; files: string[]; cost: number }> {
    const docs = [
        {
            filename: 'SKETCH.md',
            prompt: `Create a project sketch document for: ${config.description}

Generate a comprehensive SKETCH.md that includes:
1. Project Overview - High-level description and goals
2. Key Features - Main functionality and user stories
3. Technology Stack - Languages, frameworks, libraries
4. Architecture Diagram (ASCII/text) - System components
5. UI/UX Considerations - Interface design notes
6. Database Schema (if applicable) - Data models
7. API Endpoints (if applicable) - REST/GraphQL endpoints

Make it detailed but readable. Use Markdown formatting.`
        },
        {
            filename: 'LOGIC_FLOW.md',
            prompt: `Create a logic flow document for: ${config.description}

Generate a comprehensive LOGIC_FLOW.md that includes:
1. User Journey - Step-by-step user interactions
2. Data Flow - How data moves through the system
3. Process Flowcharts (ASCII/text) - Key algorithms
4. State Management - Application state transitions
5. Error Handling - Error scenarios and recovery
6. Security Considerations - Auth, validation, etc.
7. Performance Optimization - Caching, lazy loading, etc.

Use Mermaid diagrams where helpful. Make it actionable.`
        },
        {
            filename: 'ROADMAP.md',
            prompt: `Create a development roadmap for: ${config.description}

Generate a comprehensive ROADMAP.md that includes:
1. Project Phases - MVP, v1.0, v2.0, etc.
2. Sprint Planning - 2-week sprint breakdown
3. Milestone Checklist - Deliverables per phase
4. Technical Debt Items - Known issues to address
5. Future Enhancements - Post-MVP features
6. Dependencies & Risks - External dependencies, blockers
7. Timeline Estimates - Realistic time estimates

Make it practical and achievable. Include checkboxes for tracking.`
        }
    ];

    let totalCost = 0;
    const createdFiles: string[] = [];

    for (const doc of docs) {
        try {
            console.log(chalk.blue(`  Generating ${doc.filename}...`));

            const context = client.getCurrentContext();
            const response = await client.send({
                mode: 'chat',
                message: doc.prompt,
                ...context,
            });

            // Extract markdown content
            let content = response.message;

            // Write file
            const filePath = path.join(outputDir, doc.filename);
            fs.writeFileSync(filePath, content, 'utf-8');

            createdFiles.push(doc.filename);
            totalCost += response.cost || 0;

            console.log(chalk.green(`  ✓ Created ${doc.filename}`));
            console.log(chalk.dim(`    Cost: $${(response.cost || 0).toFixed(4)}`));
        } catch (error) {
            console.log(chalk.red(`  ❌ Failed to generate ${doc.filename}`));
            console.log(chalk.dim(`    Error: ${error instanceof Error ? error.message : String(error)}`));
            return { success: false, files: createdFiles, cost: totalCost };
        }
    }

    return { success: true, files: createdFiles, cost: totalCost };
}

/**
 * Confirm step before proceeding
 */
async function confirmStep(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow(`\n▶  ${message} (y/n) [y]: `), (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() !== 'n');
        });
    });
}

/**
 * Confirm before generation
 */
async function confirmGeneration(): Promise<boolean> {
    return confirmStep('Proceed with generation?');
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
        budget: 0, // Free tier by default
        maxLayer: 'L0', // L0 (free) by default
        enableTests: true,
        debugMode: false,
        outputDir: options.output as string | undefined,
        useClaudeCode: false, // Default to multi-layer
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

        // Ask about Claude Code mode (if not provided via flag)
        if (options.useClaudeCode === undefined) {
            const claudeStr = await question(chalk.yellow('Use Claude Code engine for this project? (y/N) [N]: '));
            config.useClaudeCode = claudeStr.toLowerCase() === 'y';
        } else {
            config.useClaudeCode = options.useClaudeCode as boolean;
        }

        // Get budget (if not provided)  
        if (options.budget === undefined) {
            const budgetStr = await question(chalk.yellow('Budget (USD, 0 for free tier) [0]: '));
            if (budgetStr === '' || budgetStr === '0' || budgetStr.toLowerCase() === 'free') {
                config.budget = 0; // Free tier
            } else {
                const parsedBudget = parseFloat(budgetStr);
                if (isNaN(parsedBudget) || parsedBudget < 0) {
                    console.log(chalk.yellow('⚠️  Invalid budget, using free tier'));
                    config.budget = 0;
                } else {
                    config.budget = parsedBudget;
                }
            }
        } else {
            config.budget = options.budget as number;
            if (config.budget < 0) {
                config.budget = 0; // No negative budgets
            }
        }

        // Free tier restrictions: only L0, no escalation
        if (config.budget === 0) {
            config.maxLayer = 'L0';
            console.log(chalk.dim('   Free tier: Limited to L0, no escalation'));
        }

        // Get max layer (if not provided)
        if (!options.maxLayer) {
            const layerStr = await question(chalk.yellow('Maximum layer (L0/L1/L2/L3) [L0]: '));
            const layer = layerStr.toUpperCase() || 'L0';
            config.maxLayer = (['L0', 'L1', 'L2', 'L3'].includes(layer) ? layer : 'L0') as 'L0' | 'L1' | 'L2' | 'L3';
        } else {
            const layer = options.maxLayer.toString().toUpperCase();
            config.maxLayer = (['L0', 'L1', 'L2', 'L3'].includes(layer) ? layer : 'L0') as 'L0' | 'L1' | 'L2' | 'L3';
        }

        // Validate layer
        if (!['L0', 'L1', 'L2', 'L3'].includes(config.maxLayer)) {
            config.maxLayer = 'L0';
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
