/**
 * @file CLI Module for AI MCP Gateway
 * @description Command-line interface for system management and monitoring.
 * 
 * **Available Commands:**
 * - `help` - Display help message and usage instructions
 * - `status` - Check gateway health (API, Redis, Database)
 * - `models list` - List all models by layer with priority and status
 * - `models info <id>` - Show detailed model configuration
 * - `providers` - List configured AI providers
 * - `db status` - Show database connection status
 * - `config show` - Display current configuration
 * - `config set <key> <value>` - Update configuration
 * 
 * **Design Notes:**
 * - Runs without server initialization (fast startup)
 * - Uses fetch API to communicate with running gateway
 * - Beautiful console output with box-drawing characters
 * - Supports environment variable configuration
 * 
 * @example
 * ```bash
 * # Show gateway status
 * npm run start -- status
 * 
 * # List all models
 * npm run start -- models list
 * 
 * # Using Docker
 * docker exec gateway node dist/index.js status
 * ```
 * 
 * @see {@link ../index.ts} for CLI entry point detection
 */

import { logger } from '../logging/logger.js';

/** Current CLI version - should match package.json */
const VERSION = '0.1.0';

/**
 * CLI Command definition interface.
 * Used to define the command tree with handlers and subcommands.
 */
interface CLICommand {
    /** Command name as typed by user */
    name: string;
    /** Human-readable description for help text */
    description: string;
    /** Alternative names for the command */
    aliases?: string[];
    /** Nested subcommands (e.g., 'models list', 'config set') */
    subcommands?: CLICommand[];
    /** Async handler function to execute the command */
    handler?: (args: string[]) => Promise<void>;
}

/**
 * API Base URL for gateway communication.
 * Override with API_URL environment variable for remote gateways.
 */
const API_BASE = process.env.API_URL || 'http://localhost:3000';

/**
 * Make a GET request to the gateway API.
 * Handles connection errors with user-friendly messages.
 * 
 * @param endpoint - API endpoint path (e.g., '/health', '/v1/models')
 * @returns Promise resolving to parsed JSON response
 * @throws Error if API is unreachable or returns error status
 */
async function fetchAPI(endpoint: string): Promise<unknown> {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
            console.error('❌ Cannot connect to AI MCP Gateway API');
            console.error('   Make sure the gateway is running with: npm run start:api');
            process.exit(1);
        }
        throw error;
    }
}

/**
 * Display CLI help message with usage instructions and examples.
 * Called when user runs `help`, `--help`, or `-h`.
 */
async function showHelp(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AI MCP Gateway CLI v${VERSION}                  ║
╚═══════════════════════════════════════════════════════════════╝

Usage: ai-mcp-gateway <command> [subcommand] [options]

Commands:
  help                      Show this help message
  status                    Show gateway status and health
  models list               List all available models by layer
  models info <id>          Show detailed info about a model
  providers                 List configured providers and their status
  db status                 Show database connection status
  config show               Show current configuration
  config set <key> <value>  Set a configuration value

Examples:
  ai-mcp-gateway status
  ai-mcp-gateway models list
  ai-mcp-gateway providers
  ai-mcp-gateway config show

Environment Variables:
  API_URL                   Gateway API URL (default: http://localhost:3000)
  MODE                      Run mode: 'api' or 'mcp' (default: mcp)

For more information, visit: https://github.com/babasida246/ai-mcp-gateway
`);
}

/**
 * Display gateway status including API health, Redis, and Database connections.
 * Shows server stats with formatted output.
 */
async function showStatus(): Promise<void> {
    console.log('\n🔍 Checking AI MCP Gateway status...\n');

    try {
        const health = await fetchAPI('/health') as {
            status: string;
            redis: boolean;
            database: boolean;
            timestamp: string;
            providers: Record<string, boolean>;
            healthyProviders: string[];
            layers: Record<string, { enabled: boolean; models: Array<{ id: string }> }>;
        };

        const statusIcon = health.status === 'ok' ? '✅' : '❌';
        const redisIcon = health.redis ? '✅' : '❌';
        const dbIcon = health.database ? '✅' : '❌';

        console.log('┌─────────────────────────────────────────────────────┐');
        console.log('│                  Gateway Status                      │');
        console.log('├─────────────────────────────────────────────────────┤');
        console.log(`│  Status:      ${statusIcon} ${health.status.toUpperCase().padEnd(35)}│`);
        console.log(`│  Database:    ${dbIcon} ${(health.database ? 'Connected' : 'Disconnected').padEnd(35)}│`);
        console.log(`│  Redis:       ${redisIcon} ${(health.redis ? 'Connected' : 'Disconnected').padEnd(35)}│`);
        console.log(`│  Timestamp:   ${health.timestamp.padEnd(37)}│`);
        console.log('├─────────────────────────────────────────────────────┤');
        console.log('│                  Active Providers                    │');
        console.log('├─────────────────────────────────────────────────────┤');

        if (health.healthyProviders.length > 0) {
            health.healthyProviders.forEach(provider => {
                console.log(`│  ✅ ${provider.padEnd(46)}│`);
            });
        } else {
            console.log('│  ⚠️  No active providers                           │');
        }

        console.log('├─────────────────────────────────────────────────────┤');
        console.log('│                  Layer Summary                       │');
        console.log('├─────────────────────────────────────────────────────┤');

        for (const [layer, data] of Object.entries(health.layers)) {
            const enabledIcon = data.enabled ? '✅' : '⬛';
            const modelCount = data.models?.length || 0;
            console.log(`│  ${enabledIcon} ${layer}: ${modelCount} model(s)`.padEnd(52) + '│');
        }

        console.log('└─────────────────────────────────────────────────────┘\n');
    } catch (error) {
        console.error('❌ Failed to get status:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Models list command
async function listModels(): Promise<void> {
    console.log('\n📋 Listing all available models...\n');

    try {
        const data = await fetchAPI('/v1/models/layers') as {
            layers: Record<string, {
                enabled: boolean;
                models: Array<{
                    id: string;
                    provider: string;
                    apiModelName: string;
                    enabled: boolean;
                    priority: number;
                }>;
            }>;
        };

        for (const [layerName, layer] of Object.entries(data.layers)) {
            const enabledIcon = layer.enabled ? '🟢' : '🔴';
            console.log(`\n${enabledIcon} ${layerName} (${layer.enabled ? 'Enabled' : 'Disabled'})`);
            console.log('─'.repeat(60));

            if (layer.models.length === 0) {
                console.log('   No models configured');
                continue;
            }

            console.log('   Priority │ ID                              │ Provider');
            console.log('   ─────────┼─────────────────────────────────┼──────────');

            layer.models.forEach(model => {
                const statusIcon = model.enabled ? '✓' : '✗';
                const priority = model.priority.toString().padStart(2);
                const id = model.id.substring(0, 30).padEnd(30);
                const provider = model.provider;
                console.log(`   ${statusIcon} ${priority}    │ ${id} │ ${provider}`);
            });
        }
        console.log('\n');
    } catch (error) {
        console.error('❌ Failed to list models:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Model info command
async function showModelInfo(modelId: string): Promise<void> {
    console.log(`\n📋 Model Info: ${modelId}\n`);

    try {
        const data = await fetchAPI('/v1/models/layers') as {
            layers: Record<string, {
                models: Array<{
                    id: string;
                    provider: string;
                    apiModelName: string;
                    enabled: boolean;
                    priority: number;
                }>;
            }>;
        };

        let found = false;
        for (const [layerName, layer] of Object.entries(data.layers)) {
            const model = layer.models.find(m => m.id === modelId || m.id.includes(modelId));
            if (model) {
                found = true;
                console.log('┌─────────────────────────────────────────────────────┐');
                console.log(`│  ID:        ${model.id.padEnd(39)}│`);
                console.log(`│  Provider:  ${model.provider.padEnd(39)}│`);
                console.log(`│  API Name:  ${model.apiModelName.substring(0, 39).padEnd(39)}│`);
                console.log(`│  Layer:     ${layerName.padEnd(39)}│`);
                console.log(`│  Priority:  ${model.priority.toString().padEnd(39)}│`);
                console.log(`│  Enabled:   ${(model.enabled ? 'Yes' : 'No').padEnd(39)}│`);
                console.log('└─────────────────────────────────────────────────────┘\n');
                break;
            }
        }

        if (!found) {
            console.log(`❌ Model not found: ${modelId}`);
            console.log('   Use "ai-mcp-gateway models list" to see available models');
        }
    } catch (error) {
        console.error('❌ Failed to get model info:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Providers command
async function listProviders(): Promise<void> {
    console.log('\n🔌 Configured Providers\n');

    try {
        const health = await fetchAPI('/health') as {
            providers: Record<string, boolean>;
            healthyProviders: string[];
        };

        console.log('┌─────────────────────────────────────────────────────┐');
        console.log('│  Provider          │ Status      │ API Key         │');
        console.log('├────────────────────┼─────────────┼─────────────────┤');

        for (const [provider, hasKey] of Object.entries(health.providers)) {
            const isHealthy = health.healthyProviders.includes(provider);
            const statusIcon = isHealthy ? '✅ Active' : (hasKey ? '⚠️ Error' : '⬛ Inactive');
            const keyStatus = hasKey ? '✓ Configured' : '✗ Missing';
            console.log(`│  ${provider.padEnd(18)}│ ${statusIcon.padEnd(12)}│ ${keyStatus.padEnd(16)}│`);
        }

        console.log('└─────────────────────────────────────────────────────┘\n');
    } catch (error) {
        console.error('❌ Failed to list providers:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// DB Status command
async function showDbStatus(): Promise<void> {
    console.log('\n🗄️ Database Status\n');

    try {
        const health = await fetchAPI('/health') as {
            database: boolean;
        };

        const dbIcon = health.database ? '✅' : '❌';

        console.log('┌─────────────────────────────────────────────────────┐');
        console.log(`│  PostgreSQL:  ${dbIcon} ${(health.database ? 'Connected' : 'Disconnected').padEnd(35)}│`);
        console.log('└─────────────────────────────────────────────────────┘\n');

        if (health.database) {
            // Try to get more DB stats
            try {
                const stats = await fetchAPI('/v1/stats') as {
                    totalRequests?: number;
                    totalCost?: number;
                };
                if (stats) {
                    console.log('📊 Usage Statistics:');
                    console.log(`   Total Requests: ${stats.totalRequests || 'N/A'}`);
                    console.log(`   Total Cost: $${stats.totalCost?.toFixed(4) || 'N/A'}\n`);
                }
            } catch {
                // Stats endpoint might not exist
            }
        }
    } catch (error) {
        console.error('❌ Failed to get DB status:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Config show command
async function showConfig(): Promise<void> {
    console.log('\n⚙️ Current Configuration\n');

    try {
        const health = await fetchAPI('/health') as {
            configuration: {
                logLevel: string;
                defaultLayer: string;
                enableCrossCheck: boolean;
                enableAutoEscalate: boolean;
                maxEscalationLayer: string;
                enableCostTracking: boolean;
                costAlertThreshold: number;
            };
        };

        const config = health.configuration;

        console.log('┌─────────────────────────────────────────────────────┐');
        console.log('│                  Runtime Configuration               │');
        console.log('├─────────────────────────────────────────────────────┤');
        console.log(`│  Log Level:           ${(config.logLevel || 'info').padEnd(29)}│`);
        console.log(`│  Default Layer:       ${(config.defaultLayer || 'L0').padEnd(29)}│`);
        console.log(`│  Cross Check:         ${(config.enableCrossCheck ? 'Enabled' : 'Disabled').padEnd(29)}│`);
        console.log(`│  Auto Escalate:       ${(config.enableAutoEscalate ? 'Enabled' : 'Disabled').padEnd(29)}│`);
        console.log(`│  Max Escalation:      ${(config.maxEscalationLayer || 'L0').padEnd(29)}│`);
        console.log(`│  Cost Tracking:       ${(config.enableCostTracking ? 'Enabled' : 'Disabled').padEnd(29)}│`);
        console.log(`│  Cost Alert Threshold: $${(config.costAlertThreshold || 1).toString().padEnd(27)}│`);
        console.log('└─────────────────────────────────────────────────────┘\n');

        console.log('Environment Variables:');
        console.log(`   MODE=${process.env.MODE || 'mcp'}`);
        console.log(`   API_URL=${API_BASE}`);
        console.log(`   LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}\n`);
    } catch (error) {
        console.error('❌ Failed to get config:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Config set command
async function setConfig(key: string, value: string): Promise<void> {
    console.log(`\n⚙️ Setting ${key} = ${value}...\n`);

    try {
        const response = await fetch(`${API_BASE}/v1/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value }),
        });

        if (!response.ok) {
            const error = await response.json() as { error?: string };
            throw new Error(error.error || 'Failed to update config');
        }

        console.log(`✅ Configuration updated: ${key} = ${value}\n`);
    } catch (error) {
        console.error('❌ Failed to set config:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Main CLI entry point
export async function runCLI(args: string[]): Promise<void> {
    const command = args[0]?.toLowerCase();
    const subcommand = args[1]?.toLowerCase();

    // Handle version
    if (command === '--version' || command === '-v') {
        console.log(`ai-mcp-gateway v${VERSION}`);
        return;
    }

    // Handle help
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        await showHelp();
        return;
    }

    // Handle status
    if (command === 'status') {
        await showStatus();
        return;
    }

    // Handle models
    if (command === 'models') {
        if (!subcommand || subcommand === 'list') {
            await listModels();
            return;
        }
        if (subcommand === 'info' && args[2]) {
            await showModelInfo(args[2]);
            return;
        }
        console.error('Usage: ai-mcp-gateway models [list|info <id>]');
        process.exit(1);
    }

    // Handle providers
    if (command === 'providers') {
        await listProviders();
        return;
    }

    // Handle db
    if (command === 'db') {
        if (!subcommand || subcommand === 'status') {
            await showDbStatus();
            return;
        }
        console.error('Usage: ai-mcp-gateway db [status]');
        process.exit(1);
    }

    // Handle config
    if (command === 'config') {
        if (!subcommand || subcommand === 'show') {
            await showConfig();
            return;
        }
        if (subcommand === 'set' && args[2] && args[3]) {
            await setConfig(args[2], args[3]);
            return;
        }
        console.error('Usage: ai-mcp-gateway config [show|set <key> <value>]');
        process.exit(1);
    }

    // Unknown command
    console.error(`Unknown command: ${command}`);
    console.error('Run "ai-mcp-gateway help" for usage information');
    process.exit(1);
}
