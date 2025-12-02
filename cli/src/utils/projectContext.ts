/**
 * Project Context Management
 * Handles reading and updating project documentation files
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface ProjectContextFiles {
    sketch?: string;
    logicFlow?: string;
    roadmap?: string;
    instructor?: string;
    history?: string;
}

export interface ProjectHistoryEntry {
    timestamp: string;
    task: string;
    summary: string;
    budgetUsed: number;
    budgetRemaining: number;
    model?: string;
    layer?: string;
}

/**
 * Standard project file names to look for
 */
const PROJECT_FILES = {
    sketch: ['SKETCH.md', 'sketch.md', 'project-sketch.md'],
    logicFlow: ['LOGIC_FLOW.md', 'logic-flow.md', 'logic_flow.md'],
    roadmap: ['ROADMAP.md', 'roadmap.md', 'project-roadmap.md'],
    instructor: ['mcp-instructor.md', 'INSTRUCTOR.md', 'instructor.md'],
    history: ['project-coding-history.md', 'HISTORY.md', 'history.md']
};

/**
 * Read all available project context files
 */
export function readProjectContext(workingDir: string = process.cwd()): ProjectContextFiles {
    const context: ProjectContextFiles = {};

    // Try to find each type of file
    for (const [key, possibleNames] of Object.entries(PROJECT_FILES)) {
        for (const fileName of possibleNames) {
            const filePath = path.join(workingDir, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    context[key as keyof ProjectContextFiles] = content;
                    break; // Use first found file of this type
                } catch (error) {
                    console.log(chalk.yellow(`⚠️  Could not read ${fileName}: ${error}`));
                }
            }
        }
    }

    return context;
}

/**
 * Build enhanced prompt with project context
 */
/**
 * Check if essential project files are missing
 */
export function hasMinimalProjectContext(context: ProjectContextFiles): boolean {
    return !!(context.sketch || context.roadmap || context.instructor);
}

/**
 * Create missing project documentation files based on AI analysis
 */
export async function createMissingProjectFiles(
    workingDir: string,
    summaryContent: string,
    verbose: boolean = false
): Promise<void> {
    if (verbose) {
        console.log(chalk.blue('📝 Creating missing project documentation files...'));
    }

    // Extract sections from summary to create individual files
    const sections = extractSummarySection(summaryContent);

    // Create SKETCH.md if it doesn't exist
    const sketchPath = path.join(workingDir, 'SKETCH.md');
    if (!fs.existsSync(sketchPath) && sections.overview) {
        const sketchContent = `# Project Sketch

${sections.overview}\n\n## Architecture\n\n${sections.architecture || 'To be defined'}\n\n## Key Features\n\n${sections.features || 'To be defined'}`;
        fs.writeFileSync(sketchPath, sketchContent);
        console.log(chalk.green('✅ Created SKETCH.md'));
    }

    // Create ROADMAP.md if it doesn't exist
    const roadmapPath = path.join(workingDir, 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath) && sections.roadmap) {
        const roadmapContent = `# Project Roadmap\n\n${sections.roadmap}\n\n## Next Steps\n\n${sections.nextSteps || 'To be defined'}`;
        fs.writeFileSync(roadmapPath, roadmapContent);
        console.log(chalk.green('✅ Created ROADMAP.md'));
    }

    // Create LOGIC_FLOW.md if architecture information is available
    const logicFlowPath = path.join(workingDir, 'LOGIC_FLOW.md');
    if (!fs.existsSync(logicFlowPath) && sections.architecture) {
        const logicContent = `# Logic Flow\n\n## System Architecture\n\n${sections.architecture}\n\n## Data Flow\n\n${sections.dataFlow || 'To be documented'}`;
        fs.writeFileSync(logicFlowPath, logicContent);
        console.log(chalk.green('✅ Created LOGIC_FLOW.md'));
    }

    // Create mcp-instructor.md with basic project instructions
    const instructorPath = path.join(workingDir, 'mcp-instructor.md');
    if (!fs.existsSync(instructorPath)) {
        const instructorContent = `# Project Instructions\n\n## Overview\n\n${sections.overview || 'Project overview to be defined'}\n\n## Development Guidelines\n\n- Follow established patterns and conventions\n- Maintain code quality and documentation\n- Test thoroughly before committing changes\n\n## Architecture Notes\n\n${sections.architecture || 'Architecture guidelines to be defined'}`;
        fs.writeFileSync(instructorPath, instructorContent);
        console.log(chalk.green('✅ Created mcp-instructor.md'));
    }
}

/**
 * Extract sections from AI-generated summary
 */
function extractSummarySection(content: string): {
    overview?: string;
    architecture?: string;
    features?: string;
    roadmap?: string;
    nextSteps?: string;
    dataFlow?: string;
} {
    const sections: any = {};

    // Simple extraction based on common markdown headers
    const overviewMatch = content.match(/##?\s*(?:Project\s+)?Overview[\s\S]*?(?=\n##|$)/i);
    if (overviewMatch) {
        sections.overview = overviewMatch[0].replace(/##?\s*(?:Project\s+)?Overview\s*/i, '').trim();
    }

    const architectureMatch = content.match(/##?\s*(?:Architecture|Technology\s+Stack)[\s\S]*?(?=\n##|$)/i);
    if (architectureMatch) {
        sections.architecture = architectureMatch[0].replace(/##?\s*(?:Architecture|Technology\s+Stack)\s*/i, '').trim();
    }

    const featuresMatch = content.match(/##?\s*(?:Key\s+)?Features[\s\S]*?(?=\n##|$)/i);
    if (featuresMatch) {
        sections.features = featuresMatch[0].replace(/##?\s*(?:Key\s+)?Features\s*/i, '').trim();
    }

    const roadmapMatch = content.match(/##?\s*(?:Roadmap|Future\s+Development)[\s\S]*?(?=\n##|$)/i);
    if (roadmapMatch) {
        sections.roadmap = roadmapMatch[0].replace(/##?\s*(?:Roadmap|Future\s+Development)\s*/i, '').trim();
    }

    const nextStepsMatch = content.match(/##?\s*Next\s+Steps[\s\S]*?(?=\n##|$)/i);
    if (nextStepsMatch) {
        sections.nextSteps = nextStepsMatch[0].replace(/##?\s*Next\s+Steps\s*/i, '').trim();
    }

    return sections;
}

export function buildContextualPrompt(
    originalPrompt: string,
    context: ProjectContextFiles,
    taskType: 'code' | 'analysis' | 'planning' = 'code'
): string {
    let prompt = originalPrompt;

    // Add project context if available
    const contextParts: string[] = [];

    if (context.instructor) {
        contextParts.push(`## Project Instructions\n${context.instructor}`);
    }

    if (context.sketch) {
        contextParts.push(`## Project Sketch\n${context.sketch}`);
    }

    if (context.logicFlow) {
        contextParts.push(`## Logic Flow\n${context.logicFlow}`);
    }

    if (context.roadmap) {
        contextParts.push(`## Roadmap\n${context.roadmap}`);
    }

    if (context.history) {
        const recentHistory = extractRecentHistory(context.history);
        if (recentHistory) {
            contextParts.push(`## Recent Work History\n${recentHistory}`);
        }
    }

    if (contextParts.length > 0) {
        const contextSection = contextParts.join('\n\n');
        prompt = `# Project Context\n\n${contextSection}\n\n# Current Task\n\n${originalPrompt}`;
    }

    return prompt;
}

/**
 * Extract recent history entries (last 5)
 */
function extractRecentHistory(historyContent: string): string | null {
    try {
        const lines = historyContent.split('\n');
        const entries: string[] = [];
        let currentEntry: string[] = [];
        let entryCount = 0;

        for (const line of lines) {
            if (line.startsWith('## ') && entryCount < 5) {
                if (currentEntry.length > 0) {
                    entries.push(currentEntry.join('\n'));
                    entryCount++;
                }
                currentEntry = [line];
            } else if (currentEntry.length > 0) {
                currentEntry.push(line);
            }
        }

        // Add last entry if exists
        if (currentEntry.length > 0 && entryCount < 5) {
            entries.push(currentEntry.join('\n'));
        }

        return entries.length > 0 ? entries.join('\n\n') : null;
    } catch (error) {
        return null;
    }
}

/**
 * Append entry to project coding history
 */
export function appendToHistory(
    workingDir: string,
    entry: ProjectHistoryEntry
): boolean {
    try {
        const historyFile = path.join(workingDir, 'project-coding-history.md');
        const timestamp = new Date().toISOString();

        const entryText = `## ${entry.timestamp} - ${entry.task}

**Summary:** ${entry.summary}

**Budget:** $${entry.budgetUsed.toFixed(4)} used, $${entry.budgetRemaining.toFixed(4)} remaining
${entry.model ? `**Model:** ${entry.model}` : ''}
${entry.layer ? `**Layer:** ${entry.layer}` : ''}

---

`;

        // Create file if it doesn't exist
        if (!fs.existsSync(historyFile)) {
            const header = `# Project Coding History

This file tracks all coding tasks, summaries, and budget usage for this project.

---

`;
            fs.writeFileSync(historyFile, header + entryText);
        } else {
            // Prepend to existing file (newest first)
            const existing = fs.readFileSync(historyFile, 'utf-8');
            const headerEnd = existing.indexOf('\n---\n');
            if (headerEnd !== -1) {
                const header = existing.substring(0, headerEnd + 5);
                const rest = existing.substring(headerEnd + 5);
                fs.writeFileSync(historyFile, header + entryText + rest);
            } else {
                fs.appendFileSync(historyFile, entryText);
            }
        }

        return true;
    } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not update history: ${error}`));
        return false;
    }
}

/**
 * Update project documentation files after task completion
 */
export function updateProjectFiles(
    workingDir: string,
    updates: {
        sketch?: string;
        logicFlow?: string;
        roadmap?: string;
    }
): boolean {
    try {
        let updated = false;

        if (updates.sketch) {
            const sketchFile = findProjectFile(workingDir, PROJECT_FILES.sketch);
            if (sketchFile) {
                fs.writeFileSync(sketchFile, updates.sketch);
                console.log(chalk.green(`✓ Updated ${path.basename(sketchFile)}`));
                updated = true;
            }
        }

        if (updates.logicFlow) {
            const flowFile = findProjectFile(workingDir, PROJECT_FILES.logicFlow);
            if (flowFile) {
                fs.writeFileSync(flowFile, updates.logicFlow);
                console.log(chalk.green(`✓ Updated ${path.basename(flowFile)}`));
                updated = true;
            }
        }

        if (updates.roadmap) {
            const roadmapFile = findProjectFile(workingDir, PROJECT_FILES.roadmap);
            if (roadmapFile) {
                fs.writeFileSync(roadmapFile, updates.roadmap);
                console.log(chalk.green(`✓ Updated ${path.basename(roadmapFile)}`));
                updated = true;
            }
        }

        return updated;
    } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not update project files: ${error}`));
        return false;
    }
}

/**
 * Find the first existing file from a list of possible names
 */
function findProjectFile(workingDir: string, possibleNames: string[]): string | null {
    for (const fileName of possibleNames) {
        const filePath = path.join(workingDir, fileName);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}

/**
 * Create simple task summary for history tracking
 */
export function createSimpleTaskSummary(
    type: 'create' | 'review' | 'analyze',
    fileName: string,
    prompt: string
): string {
    const action = type === 'create' ? 'Generated' : type === 'review' ? 'Reviewed' : 'Analyzed';
    const shortPrompt = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
    return `${action} ${fileName}: ${shortPrompt}`;
}

/**
 * Display project context summary
 */
export function displayContextSummary(context: ProjectContextFiles): void {
    const foundFiles: string[] = [];

    if (context.instructor) foundFiles.push('📋 Instructor');
    if (context.sketch) foundFiles.push('📐 Sketch');
    if (context.logicFlow) foundFiles.push('🔄 Logic Flow');
    if (context.roadmap) foundFiles.push('🗺️ Roadmap');
    if (context.history) foundFiles.push('📚 History');

    if (foundFiles.length > 0) {
        console.log(chalk.cyan(`\n🔍 Found project context: ${foundFiles.join(', ')}`));
    }
}