import { startMCPServer } from './mcp/server.js';
import { apiServer } from './api/server.js';
import { db } from './db/postgres.js';
import { redisCache } from './cache/redis.js';
import { logger } from './logging/logger.js';
import { selfImprovement } from './improvement/manager.js';

/**
 * Main entry point for AI MCP Gateway
 * Supports both MCP mode (stdio) and HTTP API mode
 */
async function main() {
    try {
        // Initialize self-improvement tables
        await selfImprovement.initializeTables();

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
            logger.info('Starting in MCP mode (stdio)');
            await startMCPServer();
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
