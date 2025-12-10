/**
 * @file Main entry point for AI MCP Gateway
 * @description Intelligent AI Model orchestration gateway supporting multiple operation modes:
 * 
 * **Operation Modes:**
 * - **CLI Mode**: Command-line interface for system management (status, models, providers, db, config)
 * - **MCP Mode**: Model Context Protocol server for AI tool integration (stdio transport)
 * - **API Mode**: HTTP REST API server for web applications and integrations
 * 
 * **Architecture:**
 * - N-layer routing: Routes requests to models based on cost/capability/priority
 * - Multi-provider support: OpenAI, Anthropic, OpenRouter, Local (Ollama)
 * - Database-driven configuration: Model priorities stored in PostgreSQL
 * - Redis caching: Response caching and session management
 * 
 * @author AI MCP Gateway Team
 * @version 1.0.0
 * @see {@link docs/ARCHITECTURE.md} for system architecture details
 */

// Make this a module for top-level await support
export { };

/**
 * Command-line arguments passed to the application.
 * First argument determines the operation mode or CLI command.
 */
const args = process.argv.slice(2);
const firstArg = args[0]?.toLowerCase();

/**
 * CLI commands that run without server initialization.
 * These commands use the lightweight CLI module and exit immediately.
 * @see {@link ./cli/index.ts} for CLI implementation
 */
const cliCommands = ['help', '--help', '-h', 'status', 'models', 'providers', 'db', 'config', 'mcp-serve', 'mcp', '--version', '-v'];

// Early exit for CLI commands - avoids loading heavy server modules (db, redis, etc.)
if (firstArg && cliCommands.some(cmd => firstArg === cmd || firstArg.startsWith(cmd))) {
    // Dynamic import to avoid loading server modules
    const { runCLI } = await import('./cli/index.js');
    await runCLI(args);

    // If the CLI command was used to start the MCP server, do not exit the process
    // because the MCP server runs in-process and must keep the event loop alive.
    if (firstArg === 'mcp-serve') {
        // Return to allow the MCP server to keep running
    } else {
        process.exit(0);
    }
}

/**
 * Server modules - dynamically imported only when running in server mode.
 * This pattern keeps CLI commands fast by avoiding unnecessary module loading.
 */
const { apiServer } = await import('./api/server.js');
// MCP adapter provides advanced transport options (stdio/websocket)
const { startMcpServer } = await import('./mcp/adapter/index.js');
const { db } = await import('./db/postgres.js');
const { redisCache } = await import('./cache/redis.js');
const { logger } = await import('./logging/logger.js');
const { selfImprovement } = await import('./improvement/manager.js');
const { providerManager } = await import('./config/provider-manager.js');

/**
 * Main application bootstrap function.
 * Initializes all services and starts the appropriate server mode.
 * 
 * @async
 * @throws {Error} If server initialization fails
 * 
 * **Initialization sequence:**
 * 1. Initialize self-improvement tables (learning from past requests)
 * 2. Load provider configurations from environment variables
 * 3. Initialize distributed tracing (if database available)
 * 4. Start server in configured mode (API or MCP)
 * 5. Register graceful shutdown handlers
 */
async function main() {
    try {
        // Initialize self-improvement tables
        await selfImprovement.initializeTables();

        // Initialize provider configurations from environment
        if (db.isReady()) {
            try {
                await providerManager.initializeFromEnv();
                logger.info('Provider configurations initialized from environment');
            } catch (error) {
                logger.warn('Failed to initialize provider configurations', {
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }

        // Initialize tracer if database is available
        if (db.isReady()) {
            try {
                const { initTracer } = await import('./tracing/tracer.js');
                initTracer(db.getPool());
                logger.info('Tracer initialized successfully');
            } catch (error) {
                logger.warn('Failed to initialize tracer', {
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }

        // Check if running in HTTP API mode
        const mode = process.env.MODE || 'mcp';

        if (mode === 'api') {
            logger.info('Starting in HTTP API mode');
            await apiServer.start();
        } else {
            // Allow selecting transport via environment for containerized deployments
            const mcpTransport = (process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT_TYPE || '').toLowerCase();
            const wsPort = process.env.MCP_WEBSOCKET_PORT ? parseInt(process.env.MCP_WEBSOCKET_PORT, 10) : undefined;

            if (mcpTransport === 'websocket') {
                logger.info(`Starting in MCP mode (websocket) on port ${wsPort || 3001}`);
                await startMcpServer({ transport: 'websocket', port: wsPort });
            } else if (mcpTransport === 'stdio') {
                logger.info('Starting in MCP mode (stdio)');
                await startMcpServer({ transport: 'stdio' });
            } else {
                logger.info('Starting in MCP mode (stdio)');
                await startMcpServer();
            }
        }

        // Graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down gracefully...');
            await redisCache.close();
            await db.close();
            if (mode === 'api') {
                await apiServer.stop();
            }
            process.exit(0);
        });
    } catch (error) {
        logger.error('Failed to start server', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        process.exit(1);
    }
}

main();
