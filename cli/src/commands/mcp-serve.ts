/**
 * @file MCP Serve Command
 * @description CLI command to start the MCP server in server mode.
 * 
 * This command starts the AI MCP Gateway as an MCP server that can be
 * connected to by Claude Desktop, VS Code MCP, or other MCP clients.
 * 
 * Usage:
 *   mcp mcp-serve                    # Start with stdio (default)
 *   mcp mcp-serve --transport stdio  # Explicit stdio transport
 *   mcp mcp-serve --port 3001        # Custom port for WebSocket
 */

import chalk from 'chalk';
import * as readline from 'readline';

export interface McpServeOptions {
    transport: 'stdio' | 'websocket';
    port: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    endpoint?: string;
    apiKey?: string;
}

// MCP Tool definitions for the server
interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

// Define available tools
const MCP_TOOLS: McpTool[] = [
    {
        name: 'ai.chat_router',
        description: 'Route chat messages through AI MCP Gateway\'s N-layer architecture (L0-L3) for optimal cost/quality balance',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The chat message to process' },
                context: { type: 'string', description: 'Additional context for the AI' },
                max_layer: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3'], description: 'Maximum layer to use' },
            },
            required: ['message'],
        },
    },
    {
        name: 'ai.code_agent',
        description: 'Generate or analyze code using the AI code agent with full context awareness',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The code generation/analysis prompt' },
                file_path: { type: 'string', description: 'Target file path for context' },
                language: { type: 'string', description: 'Programming language hint' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'net.fw_log_search',
        description: 'Search and analyze firewall logs from multiple sources',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query for firewall logs' },
                source_ip: { type: 'string', description: 'Filter by source IP' },
                dest_ip: { type: 'string', description: 'Filter by destination IP' },
                time_range: { type: 'string', description: 'Time range (e.g., "1h", "24h", "7d")' },
            },
            required: ['query'],
        },
    },
    {
        name: 'net.topology_scan',
        description: 'Scan and visualize network topology',
        inputSchema: {
            type: 'object',
            properties: {
                network: { type: 'string', description: 'Network CIDR to scan (e.g., "192.168.1.0/24")' },
                depth: { type: 'number', description: 'Scan depth for neighbors' },
            },
            required: ['network'],
        },
    },
    {
        name: 'net.mikrotik_api',
        description: 'Execute MikroTik RouterOS API commands',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'RouterOS command to execute' },
                device: { type: 'string', description: 'Target device identifier' },
            },
            required: ['command'],
        },
    },
    {
        name: 'ops.cost_report',
        description: 'Generate cost reports for AI usage across tenants and time periods',
        inputSchema: {
            type: 'object',
            properties: {
                tenant_id: { type: 'string', description: 'Tenant ID to report on' },
                period: { type: 'string', enum: ['day', 'week', 'month'], description: 'Reporting period' },
                group_by: { type: 'string', enum: ['model', 'layer', 'user'], description: 'Group results by' },
            },
            required: ['period'],
        },
    },
    {
        name: 'ops.trace_session',
        description: 'Trace and debug AI request sessions with full context',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID to trace' },
                include_prompts: { type: 'boolean', description: 'Include full prompts in trace' },
            },
            required: ['session_id'],
        },
    },
];

// Tool category summary
const TOOL_SUMMARY = {
    ai: {
        description: 'AI Core Tools - Chat routing and code generation',
        tools: MCP_TOOLS.filter(t => t.name.startsWith('ai.')),
    },
    network: {
        description: 'Network & Security Tools - Firewall, topology, device management',
        tools: MCP_TOOLS.filter(t => t.name.startsWith('net.')),
    },
    ops: {
        description: 'Operations Tools - Cost reporting, tracing, debugging',
        tools: MCP_TOOLS.filter(t => t.name.startsWith('ops.')),
    },
};

/**
 * Start the MCP server.
 */
export async function mcpServeCommand(options: McpServeOptions): Promise<void> {
    console.error(chalk.blue('🚀 Starting AI MCP Gateway Server...'));
    console.error();

    // Display configuration (to stderr so it doesn't interfere with JSON-RPC)
    console.error(chalk.dim('Configuration:'));
    console.error(chalk.dim(`  Transport: ${options.transport}`));
    if (options.transport === 'websocket') {
        console.error(chalk.dim(`  Port: ${options.port}`));
    }
    console.error(chalk.dim(`  Log Level: ${options.logLevel}`));
    console.error();

    console.error(chalk.green(`✅ MCP Server ready with ${MCP_TOOLS.length} tools`));
    console.error();
    console.error(chalk.dim('Available tool categories:'));
    for (const [category, info] of Object.entries(TOOL_SUMMARY)) {
        console.error(chalk.dim(`  - ${category}: ${info.tools.length} tools`));
    }
    console.error();
    console.error(chalk.yellow('Waiting for MCP client connection...'));
    console.error(chalk.dim('Press Ctrl+C to stop the server'));
    console.error();

    // Start stdio transport
    if (options.transport === 'stdio') {
        await startStdioServer(options);
    } else if (options.transport === 'websocket') {
        console.error(chalk.yellow('WebSocket transport not yet implemented. Using stdio.'));
        await startStdioServer(options);
    }
}

/**
 * Start MCP server with stdio transport (JSON-RPC over stdin/stdout).
 */
async function startStdioServer(options: McpServeOptions): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });

    let buffer = '';

    rl.on('line', async (line) => {
        buffer += line;

        try {
            const request = JSON.parse(buffer);
            buffer = '';

            const response = await handleJsonRpcRequest(request, options);
            if (response) {
                console.log(JSON.stringify(response));
            }
        } catch {
            // Not complete JSON yet, or parse error - wait for more data
            // If it's a parse error on complete data, we'll handle next time
        }
    });

    rl.on('close', () => {
        console.error(chalk.dim('MCP client disconnected'));
        process.exit(0);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.error(chalk.yellow('\n👋 Shutting down MCP server...'));
        rl.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.error(chalk.yellow('\n👋 Shutting down MCP server...'));
        rl.close();
        process.exit(0);
    });
}

/**
 * Handle JSON-RPC request.
 */
async function handleJsonRpcRequest(
    request: { jsonrpc: string; id?: string | number; method: string; params?: unknown },
    options: McpServeOptions
): Promise<unknown> {
    const { method, id, params } = request;

    if (options.logLevel === 'debug') {
        console.error(chalk.dim(`[DEBUG] Received: ${method}`));
    }

    try {
        switch (method) {
            case 'initialize':
                return createResponse(id, {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                    },
                    serverInfo: {
                        name: 'ai-mcp-gateway',
                        version: '0.1.0',
                    },
                });

            case 'notifications/initialized':
                // No response needed for notifications
                return null;

            case 'tools/list':
                return createResponse(id, {
                    tools: MCP_TOOLS.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    })),
                });

            case 'tools/call':
                const toolParams = params as { name: string; arguments?: Record<string, unknown> };
                const result = await executeToolCall(toolParams.name, toolParams.arguments || {}, options);
                return createResponse(id, {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                        },
                    ],
                });

            default:
                return createErrorResponse(id, -32601, `Method not found: ${method}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(id, -32603, message);
    }
}

/**
 * Execute a tool call.
 */
async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    options: McpServeOptions
): Promise<unknown> {
    if (options.logLevel === 'debug') {
        console.error(chalk.dim(`[DEBUG] Executing tool: ${toolName}`));
        console.error(chalk.dim(`[DEBUG] Args: ${JSON.stringify(args)}`));
    }

    // Find the tool
    const tool = MCP_TOOLS.find(t => t.name === toolName);
    if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
    }

    // Execute tool based on name
    switch (toolName) {
        case 'ai.chat_router':
            return await executeChatRouter(args, options);

        case 'ai.code_agent':
            return await executeCodeAgent(args, options);

        case 'net.fw_log_search':
        case 'net.topology_scan':
        case 'net.mikrotik_api':
            return {
                status: 'mock',
                message: `Network tool ${toolName} is not yet connected to backend. Configure network integrations in gateway settings.`,
                tool: toolName,
                args,
            };

        case 'ops.cost_report':
            return {
                status: 'mock',
                message: 'Cost reporting requires database connection. Start the full gateway server.',
                period: args.period,
                tenant: args.tenant_id || 'all',
            };

        case 'ops.trace_session':
            return {
                status: 'mock',
                message: 'Session tracing requires database connection. Start the full gateway server.',
                session_id: args.session_id,
            };

        default:
            throw new Error(`Tool implementation not found: ${toolName}`);
    }
}

/**
 * Execute ai.chat_router tool.
 */
async function executeChatRouter(
    args: Record<string, unknown>,
    options: McpServeOptions
): Promise<unknown> {
    const message = args.message as string;
    const context = args.context as string | undefined;
    const maxLayer = args.max_layer as string | undefined;

    // Check if we have an endpoint to forward to
    if (options.endpoint) {
        try {
            const response = await fetch(`${options.endpoint}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}),
                },
                body: JSON.stringify({
                    message,
                    context,
                    maxLayer,
                }),
            });

            if (!response.ok) {
                throw new Error(`Gateway returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return {
                status: 'error',
                message: `Failed to reach gateway: ${msg}`,
                fallback: true,
                suggestion: 'Start the AI MCP Gateway server with `npm start` or use a different endpoint',
            };
        }
    }

    // Return guidance when no endpoint is configured
    return {
        status: 'no_endpoint',
        message: 'No gateway endpoint configured. The ai.chat_router tool needs a running AI MCP Gateway server.',
        suggestion: 'Start the gateway server and use --endpoint option, or set MCP_ENDPOINT environment variable.',
        received: {
            message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            context: context ? 'provided' : 'none',
            maxLayer: maxLayer || 'auto',
        },
    };
}

/**
 * Execute ai.code_agent tool.
 */
async function executeCodeAgent(
    args: Record<string, unknown>,
    options: McpServeOptions
): Promise<unknown> {
    const prompt = args.prompt as string;
    const filePath = args.file_path as string | undefined;
    const language = args.language as string | undefined;

    // Check if we have an endpoint to forward to
    if (options.endpoint) {
        try {
            const response = await fetch(`${options.endpoint}/api/code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}),
                },
                body: JSON.stringify({
                    prompt,
                    filePath,
                    language,
                }),
            });

            if (!response.ok) {
                throw new Error(`Gateway returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return {
                status: 'error',
                message: `Failed to reach gateway: ${msg}`,
            };
        }
    }

    return {
        status: 'no_endpoint',
        message: 'No gateway endpoint configured for code agent.',
        suggestion: 'Start the gateway server and use --endpoint option.',
        received: {
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
            filePath,
            language,
        },
    };
}

/**
 * Create JSON-RPC success response.
 */
function createResponse(id: string | number | undefined, result: unknown): unknown {
    return {
        jsonrpc: '2.0',
        id,
        result,
    };
}

/**
 * Create JSON-RPC error response.
 */
function createErrorResponse(id: string | number | undefined, code: number, message: string): unknown {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
        },
    };
}

/**
 * Print Claude Desktop configuration example.
 */
export function printClaudeConfigExample(): void {
    console.log(chalk.blue('\n📝 Claude Desktop Configuration Example'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
    console.log(chalk.white('Add this to your Claude Desktop config file:'));
    console.log(chalk.dim('(macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)'));
    console.log(chalk.dim('(Windows: %APPDATA%\\Claude\\claude_desktop_config.json)'));
    console.log();

    const configExample = {
        mcpServers: {
            'ai-mcp-gateway': {
                command: 'npx',
                args: ['ai-mcp-gateway', 'serve'],
                env: {
                    MCP_LOG_LEVEL: 'info',
                }
            }
        }
    };

    console.log(chalk.green(JSON.stringify(configExample, null, 2)));
    console.log();
    console.log(chalk.dim('Or if installed globally:'));
    console.log();

    const globalConfigExample = {
        mcpServers: {
            'ai-mcp-gateway': {
                command: 'ai-mcp-gateway',
                args: ['serve'],
            }
        }
    };

    console.log(chalk.green(JSON.stringify(globalConfigExample, null, 2)));
}

/**
 * Print VS Code MCP configuration example.
 */
export function printVSCodeConfigExample(): void {
    console.log(chalk.blue('\n📝 VS Code MCP Configuration Example'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
    console.log(chalk.white('Add this to your VS Code settings.json:'));
    console.log();

    const vscodeConfig = {
        'mcp.servers': {
            'ai-mcp-gateway': {
                command: 'npx',
                args: ['ai-mcp-gateway', 'serve'],
            }
        }
    };

    console.log(chalk.green(JSON.stringify(vscodeConfig, null, 2)));
}

export default mcpServeCommand;
