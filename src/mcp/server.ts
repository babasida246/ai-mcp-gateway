import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { metrics } from '../logging/metrics.js';
import { codeAgentTool } from '../tools/codeAgent/index.js';
import { vitestTool, playwrightTool } from '../tools/testing/index.js';
import { fsReadTool, fsWriteTool, fsListTool } from '../tools/fs/index.js';
import { gitDiffTool, gitStatusTool } from '../tools/git/index.js';
import { redisGetTool, redisSetTool, redisDelTool } from '../tools/cache/index.js';
import { dbQueryTool, dbInsertTool, dbUpdateTool } from '../tools/db/index.js';

/**
 * Tool definition interface
 */
interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
    };
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Registry of all available MCP tools
 */
const tools: ToolDefinition[] = [
    codeAgentTool,
    vitestTool,
    playwrightTool,
    fsReadTool,
    fsWriteTool,
    fsListTool,
    gitDiffTool,
    gitStatusTool,
    redisGetTool,
    redisSetTool,
    redisDelTool,
    dbQueryTool,
    dbInsertTool,
    dbUpdateTool,
];

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
    const server = new Server(
        {
            name: env.MCP_SERVER_NAME,
            version: env.MCP_SERVER_VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    // Handle tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        logger.debug('Listing available tools');
        return {
            tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            })),
        };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const startTime = Date.now();
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            metrics.recordRequest();
            logger.info(`Tool call: ${request.params.name}`, {
                requestId,
                tool: request.params.name,
            });

            // Find the tool
            const tool = tools.find((t) => t.name === request.params.name);
            if (!tool) {
                throw new Error(`Unknown tool: ${request.params.name}`);
            }

            // Execute the tool
            const result = await tool.handler(
                request.params.arguments as Record<string, unknown>,
            );

            const duration = Date.now() - startTime;
            metrics.recordDuration(duration);

            logger.info(`Tool completed: ${request.params.name}`, {
                requestId,
                duration,
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            logger.error(`Tool failed: ${request.params.name}`, {
                requestId,
                error: errorMessage,
                duration,
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: false,
                                error: errorMessage,
                            },
                            null,
                            2,
                        ),
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
    const server = createMCPServer();
    const transport = new StdioServerTransport();

    logger.info('Starting AI MCP Gateway', {
        name: env.MCP_SERVER_NAME,
        version: env.MCP_SERVER_VERSION,
        toolsCount: tools.length,
    });

    await server.connect(transport);

    logger.info('AI MCP Gateway is ready');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        logger.info('Shutting down...');
        metrics.printSummary();
        await server.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Shutting down...');
        metrics.printSummary();
        await server.close();
        process.exit(0);
    });
}
