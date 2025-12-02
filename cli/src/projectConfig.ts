/**
 * Project Configuration Management
 * Handles mcp.config.json for tracking project settings and engine mode
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';

/**
 * MCP Project Configuration
 * Stores metadata about project creation and execution engine preferences
 */
export interface McpProjectConfig {
    /** Project name (parsed from description or user input) */
    projectName: string;

    /** Original project description/prompt */
    description: string;

    /** ISO-8601 UTC datetime when project was created */
    createdAt: string;

    /** CLI version used to create the project */
    cliVersion: string;

    /** Execution engine: multi-layer (API-based) or claude-code (local binary) */
    engine: 'multi-layer' | 'claude-code';

    /** Quick boolean flag for Claude Code usage */
    useClaudeCode: boolean;

    /** Layer routing configuration */
    layers: {
        /** Whether layer-based routing is enabled */
        enabled: boolean;

        /** Default escalation path */
        defaultEscalation: string[];
    };

    /** Cost tracking preferences */
    costTracking: {
        /** Include planning phase costs in total */
        includePlanningPhase: boolean;
    };
}

const CONFIG_FILENAME = 'mcp.config.json';

/**
 * Load project configuration from directory
 * 
 * @param projectRoot Root directory of the project
 * @returns Configuration object or null if not found
 */
export async function loadProjectConfig(projectRoot: string): Promise<McpProjectConfig | null> {
    const configPath = join(projectRoot, CONFIG_FILENAME);

    if (!existsSync(configPath)) {
        return null;
    }

    try {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content) as Partial<McpProjectConfig>;

        // Validate and apply defaults for missing fields
        const config: McpProjectConfig = {
            projectName: parsed.projectName || 'Unnamed Project',
            description: parsed.description || '',
            createdAt: parsed.createdAt || new Date().toISOString(),
            cliVersion: parsed.cliVersion || '0.1.0',
            engine: parsed.engine || 'multi-layer',
            useClaudeCode: parsed.useClaudeCode ?? (parsed.engine === 'claude-code'),
            layers: {
                enabled: parsed.layers?.enabled ?? true,
                defaultEscalation: parsed.layers?.defaultEscalation || ['L0', 'L1', 'L2', 'L3'],
            },
            costTracking: {
                includePlanningPhase: parsed.costTracking?.includePlanningPhase ?? true,
            },
        };

        return config;
    } catch (error) {
        console.error(chalk.yellow(`⚠️  Failed to parse ${CONFIG_FILENAME}: ${error instanceof Error ? error.message : String(error)}`));
        return null;
    }
}

/**
 * Save project configuration to directory
 * 
 * @param projectRoot Root directory of the project
 * @param config Configuration object to save
 */
export async function saveProjectConfig(projectRoot: string, config: McpProjectConfig): Promise<void> {
    const configPath = join(projectRoot, CONFIG_FILENAME);

    try {
        // Ensure directory exists
        const dir = dirname(configPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        // Write with pretty formatting
        const content = JSON.stringify(config, null, 2);
        writeFileSync(configPath, content, 'utf-8');

        console.log(chalk.dim(`  📝 Created ${CONFIG_FILENAME}`));
    } catch (error) {
        console.error(chalk.red(`❌ Failed to save ${CONFIG_FILENAME}: ${error instanceof Error ? error.message : String(error)}`));
        throw error;
    }
}

/**
 * Create default project configuration
 * 
 * @param projectName Name of the project
 * @param description Project description/prompt
 * @param cliVersion Current CLI version
 * @param useClaudeCode Whether to use Claude Code engine
 * @returns Default configuration object
 */
export function createDefaultConfig(
    projectName: string,
    description: string,
    cliVersion: string,
    useClaudeCode: boolean = false
): McpProjectConfig {
    return {
        projectName,
        description,
        createdAt: new Date().toISOString(),
        cliVersion,
        engine: useClaudeCode ? 'claude-code' : 'multi-layer',
        useClaudeCode,
        layers: {
            enabled: true,
            defaultEscalation: ['L0', 'L1', 'L2', 'L3'],
        },
        costTracking: {
            includePlanningPhase: true,
        },
    };
}

/**
 * Find project root by searching for mcp.config.json upwards
 * 
 * @param startDir Starting directory (default: cwd)
 * @param maxDepth Maximum depth to search upwards (default: 5)
 * @returns Project root path or null if not found
 */
export function findProjectRoot(startDir: string = process.cwd(), maxDepth: number = 5): string | null {
    let currentDir = startDir;
    let depth = 0;

    while (depth < maxDepth) {
        const configPath = join(currentDir, CONFIG_FILENAME);
        if (existsSync(configPath)) {
            return currentDir;
        }

        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached filesystem root
            break;
        }

        currentDir = parentDir;
        depth++;
    }

    return null;
}
