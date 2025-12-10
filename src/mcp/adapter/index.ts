/**
 * @file MCP Adapter
 * @description Main MCP adapter that handles JSON-RPC messages and routes to tools.
 * 
 * This adapter provides:
 * - JSON-RPC 2.0 message parsing and response formatting
 * - MCP protocol handling (list_tools, call_tool, list_resources, read_resource)
 * - Multiple transport support (stdio, HTTP/WebSocket planned)
 * - Tool execution with validation and error handling
 * - Logging and metrics collection
 * 
 * @example
 * ```typescript
 * import { createMcpAdapter, startMcpServer } from './mcp/adapter';
 * 
 * // Create adapter with config
 * const adapter = createMcpAdapter({ transport: 'stdio' });
 * 
 * // Or use the convenience function
 * await startMcpServer({ transport: 'stdio' });
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
    McpAdapterConfig,
    defaultMcpConfig,
    McpToolResult,
    McpListToolsResponse,
    McpCallToolResponse,
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcError,
    JsonRpcErrorCodes,
    McpResource,
} from './types.js';
import { mcpRegistry, initializeToolRegistry } from '../tools/index.js';
import { mcpToolSettingsService } from '../settings/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { metrics } from '../../logging/metrics.js';
import { WebSocketServer } from 'ws';

// =============================================================================
// MCP Adapter Class
// =============================================================================

/**
 * MCP Adapter - Handles MCP protocol and routes to tools.
 */
export class McpAdapter {
    private config: McpAdapterConfig;
    private server: Server | null = null;
    private initialized = false;

    constructor(config: Partial<McpAdapterConfig> = {}) {
        this.config = { ...defaultMcpConfig, ...config };
    }

    /**
     * Initialize the adapter with tools.
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        logger.info('Initializing MCP Adapter', {
            transport: this.config.transport,
            logLevel: this.config.logLevel,
        });

        // Initialize tool registry
        initializeToolRegistry();

        // Initialize tool settings service
        await mcpToolSettingsService.initialize();

        logger.info('MCP Adapter initialized', {
            toolCount: mcpRegistry.size,
            categories: mcpRegistry.getCategories(),
        });

        this.initialized = true;
    }

    /**
     * Create the MCP server with handlers.
     */
    createServer(): Server {
        const server = new Server(
            {
                name: env.MCP_SERVER_NAME || 'mcp-gateway',
                version: env.MCP_SERVER_VERSION || '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                    resources: {},
                },
            },
        );

        // Handle list_tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.debug('MCP list_tools request');

            const toolList = mcpRegistry.listTools();

            // Filter by enabled status from settings
            const enabledTools = toolList.tools.filter(tool => {
                const setting = mcpToolSettingsService.getToolSetting(tool.name);
                return setting.enabled;
            });

            return {
                tools: enabledTools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                })),
            };
        });

        // Handle call_tool
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const startTime = Date.now();
            const requestId = `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            try {
                metrics.recordRequest();

                const toolName = request.params.name;
                const args = (request.params.arguments || {}) as Record<string, unknown>;

                logger.info('MCP call_tool request', {
                    requestId,
                    tool: toolName,
                });

                // Validate tool exists
                if (!mcpRegistry.hasTool(toolName)) {
                    logger.warn('Tool not found', { requestId, tool: toolName });
                    return this.formatErrorResponse(`Unknown tool: ${toolName}`);
                }

                // ===== ATTT cấp 3: Enforce tool settings =====
                const settingsEnforcement = mcpToolSettingsService.enforceSettings(toolName, args);
                if (!settingsEnforcement.valid) {
                    logger.warn('Tool settings violation', {
                        requestId,
                        tool: toolName,
                        violations: settingsEnforcement.violations,
                    });
                    return this.formatErrorResponse(
                        `MCP_TOOL_SETTING_VIOLATION: ${settingsEnforcement.violations.join('; ')}`
                    );
                }

                // Use sanitized args (with clamped limits)
                const sanitizedArgs = settingsEnforcement.sanitized;

                // Validate input
                const validation = mcpRegistry.validateInput(toolName, sanitizedArgs);
                if (!validation.valid) {
                    logger.warn('Invalid tool input', {
                        requestId,
                        tool: toolName,
                        errors: validation.errors,
                    });
                    return this.formatErrorResponse(
                        `Invalid input: ${validation.errors?.join(', ')}`
                    );
                }

                // Execute tool
                const result = await mcpRegistry.callTool(
                    toolName,
                    validation.sanitized || sanitizedArgs
                );

                const duration = Date.now() - startTime;
                metrics.recordDuration(duration);

                logger.info('MCP call_tool completed', {
                    requestId,
                    tool: toolName,
                    success: result.success,
                    duration,
                });

                // Format response
                if (result.success) {
                    return this.formatSuccessResponse(result);
                } else {
                    return this.formatErrorResponse(result.error || 'Tool execution failed');
                }
            } catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                logger.error('MCP call_tool failed', {
                    requestId,
                    error: errorMessage,
                    duration,
                });

                return this.formatErrorResponse(errorMessage);
            }
        });

        // Handle list_resources (optional capability)
        server.setRequestHandler(ListResourcesRequestSchema, async () => {
            logger.debug('MCP list_resources request');

            // Return available resources (currently just tool stats)
            const resources: McpResource[] = [
                {
                    uri: 'mcp://gateway/tools/stats',
                    name: 'Tool Statistics',
                    description: 'Statistics about tool usage',
                    mimeType: 'application/json',
                },
                {
                    uri: 'mcp://gateway/config',
                    name: 'Gateway Configuration',
                    description: 'Current gateway configuration',
                    mimeType: 'application/json',
                },
            ];

            return { resources };
        });

        // Handle read_resource
        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const uri = request.params.uri;
            logger.debug('MCP read_resource request', { uri });

            if (uri === 'mcp://gateway/tools/stats') {
                const stats = mcpRegistry.getStats();
                return {
                    contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(stats, null, 2),
                    }],
                };
            }

            if (uri === 'mcp://gateway/config') {
                const config = {
                    serverName: env.MCP_SERVER_NAME,
                    serverVersion: env.MCP_SERVER_VERSION,
                    defaultLayer: env.DEFAULT_LAYER,
                    maxEscalationLayer: env.MAX_ESCALATION_LAYER,
                    toolCount: mcpRegistry.size,
                    categories: mcpRegistry.getCategories(),
                };
                return {
                    contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(config, null, 2),
                    }],
                };
            }

            throw new Error(`Resource not found: ${uri}`);
        });

        this.server = server;
        return server;
    }

    /**
     * Format a successful tool response for MCP.
     */
    private formatSuccessResponse(result: McpToolResult): McpCallToolResponse {
        let text: string;

        if (result.data !== undefined) {
            text = typeof result.data === 'string'
                ? result.data
                : JSON.stringify(result.data, null, 2);
        } else {
            text = JSON.stringify({ success: true }, null, 2);
        }

        // Add metadata if available
        if (result.metadata) {
            const metaLines: string[] = [];
            if (result.metadata.model) metaLines.push(`Model: ${result.metadata.model}`);
            if (result.metadata.layer) metaLines.push(`Layer: ${result.metadata.layer}`);
            if (result.metadata.cost !== undefined) metaLines.push(`Cost: $${result.metadata.cost.toFixed(6)}`);
            if (result.metadata.duration !== undefined) metaLines.push(`Duration: ${result.metadata.duration}ms`);

            if (metaLines.length > 0) {
                text += `\n\n---\n${metaLines.join(' | ')}`;
            }
        }

        return {
            content: [{
                type: 'text',
                text,
            }],
        };
    }

    /**
     * Format an error response for MCP.
     */
    private formatErrorResponse(error: string): McpCallToolResponse {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ success: false, error }, null, 2),
            }],
            isError: true,
        };
    }

    /**
     * Start the MCP server with stdio transport.
     */
    async startStdio(): Promise<void> {
        await this.initialize();

        const server = this.createServer();
        const transport = new StdioServerTransport();

        logger.info('Starting MCP server with stdio transport', {
            name: env.MCP_SERVER_NAME,
            version: env.MCP_SERVER_VERSION,
            toolCount: mcpRegistry.size,
        });

        await server.connect(transport);

        logger.info('MCP server is ready (stdio)');

        // Graceful shutdown handlers
        const shutdown = async () => {
            logger.info('Shutting down MCP server...');

            // Print stats before shutdown
            const stats = mcpRegistry.getStats();
            logger.info('Final tool statistics', {
                totalCalls: stats.totalCalls,
                totalErrors: stats.totalErrors,
                averageDuration: `${stats.averageDuration.toFixed(2)}ms`,
            });

            metrics.printSummary();
            await server.close();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }

    /**
     * Start the MCP server with a WebSocket transport.
     * This accepts JSON-RPC 2.0 messages over WebSocket and dispatches
     * them to the internal tool registry (mcpRegistry).
     */
    async startWebsocket(port: number = 3001): Promise<void> {
        await this.initialize();

        logger.info('Starting MCP WebSocket transport', { port });

        const wss = new WebSocketServer({ port });

        wss.on('connection', (ws) => {
            logger.info('MCP WebSocket client connected');

            ws.on('message', async (data) => {
                let req: any;
                try {
                    req = JSON.parse(data.toString());
                } catch (err) {
                    const errResp = {
                        jsonrpc: '2.0',
                        id: null,
                        error: { code: -32700, message: 'Parse error' },
                    };
                    ws.send(JSON.stringify(errResp));
                    return;
                }

                const id = req.id;
                const method = req.method;
                const params = req.params || {};

                try {
                    if (method === 'initialize') {
                        const result = {
                            protocolVersion: '2024-11-05',
                            serverInfo: { name: env.MCP_SERVER_NAME, version: env.MCP_SERVER_VERSION },
                        };
                        ws.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
                        return;
                    }

                    if (method === 'tools/list' || method === 'list_tools') {
                        const list = mcpRegistry.listTools();
                        const result = { tools: list.tools };
                        ws.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
                        return;
                    }

                    if (method === 'tools/call' || method === 'call_tool') {
                        const toolName = params.name;
                        const args = params.arguments || {};

                        if (!mcpRegistry.hasTool(toolName)) {
                            const errResp = { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
                            ws.send(JSON.stringify(errResp));
                            return;
                        }

                        const validation = mcpRegistry.validateInput(toolName, args);
                        if (!validation.valid) {
                            const errResp = { jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid input: ${validation.errors?.join(', ')}` } };
                            ws.send(JSON.stringify(errResp));
                            return;
                        }

                        const result = await mcpRegistry.callTool(toolName, validation.sanitized || args);

                        // Format response using adapter formatter
                        if (result.success) {
                            const formatted = this.formatSuccessResponse(result);
                            ws.send(JSON.stringify({ jsonrpc: '2.0', id, result: formatted }));
                        } else {
                            const formatted = this.formatErrorResponse(result.error || 'Tool execution failed');
                            ws.send(JSON.stringify({ jsonrpc: '2.0', id, result: formatted }));
                        }
                        return;
                    }

                    // Unknown method
                    const errResp = { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
                    ws.send(JSON.stringify(errResp));
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Unknown error';
                    const errResp = { jsonrpc: '2.0', id, error: { code: -32603, message } };
                    ws.send(JSON.stringify(errResp));
                }
            });

            ws.on('close', () => {
                logger.info('MCP WebSocket client disconnected');
            });
        });

        wss.on('listening', () => logger.info('MCP WebSocket server listening', { port }));

        // Graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down MCP WebSocket server...');
            wss.close();
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }

    /**
     * Get the underlying server instance.
     */
    getServer(): Server | null {
        return this.server;
    }

    /**
     * Get registry statistics.
     */
    getStats() {
        return mcpRegistry.getStats();
    }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an MCP adapter with the given configuration.
 */
export function createMcpAdapter(config: Partial<McpAdapterConfig> = {}): McpAdapter {
    return new McpAdapter(config);
}

/**
 * Start the MCP server with default configuration.
 * Convenience function for quick startup.
 */
export async function startMcpServer(config: Partial<McpAdapterConfig> = {}): Promise<McpAdapter> {
    const adapter = createMcpAdapter(config);

    const transport = config.transport || defaultMcpConfig.transport;

    switch (transport) {
        case 'stdio':
            await adapter.startStdio();
            break;
        case 'websocket':
            // Start WebSocket transport on provided port or default
            await adapter.startWebsocket(config.port || 3001);
            break;
        case 'http':
            // TODO: HTTP transport - fall back to WebSocket or stdio
            logger.warn(`Transport ${transport} not yet implemented, falling back to WebSocket`);
            await adapter.startWebsocket(config.port || 3001);
            break;
        default:
            await adapter.startStdio();
    }

    return adapter;
}

// =============================================================================
// Exports
// =============================================================================

export {
    McpAdapterConfig,
    defaultMcpConfig,
} from './types.js';

export default McpAdapter;
