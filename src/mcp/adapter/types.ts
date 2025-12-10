/**
 * @file MCP Adapter Types
 * @description Type definitions for MCP (Model Context Protocol) adapter layer.
 * 
 * This module defines the interfaces and types needed to implement a compliant
 * MCP server that can be used by Claude Desktop, VS Code MCP, and other clients.
 * 
 * @see https://spec.modelcontextprotocol.io/ for MCP specification
 */

import { z } from 'zod';

// =============================================================================
// Core MCP Types
// =============================================================================

/**
 * Risk levels for AI operations.
 * Used to determine routing layer and model selection.
 */
export type RiskLevel = 'low' | 'normal' | 'high' | 'prod-critical';

/**
 * Priority modes for AI requests.
 * Influences model selection and cost optimization.
 */
export type PriorityMode = 'speed' | 'quality' | 'cost';

/**
 * MCP Tool definition following the MCP specification.
 * Each tool exposed via MCP must implement this interface.
 */
export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
    /** Unique tool name in format: namespace.action (e.g., ai.chat_router) */
    name: string;

    /** Human-readable description shown to MCP clients */
    description: string;

    /** JSON Schema for input validation */
    inputSchema: {
        type: 'object';
        properties: Record<string, McpPropertySchema>;
        required?: string[];
        additionalProperties?: boolean;
    };

    /** Tool handler function */
    handler: (args: TInput) => Promise<McpToolResult<TOutput>>;

    /** Optional: Tool category for organization */
    category?: 'ai' | 'network' | 'ops' | 'system';

    /** Optional: Requires confirmation before execution */
    requiresConfirmation?: boolean;

    /** Optional: Maximum execution time in ms */
    timeout?: number;
}

/**
 * JSON Schema property definition for tool input schema.
 */
export interface McpPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    default?: unknown;
    enum?: (string | number | boolean)[];
    items?: McpPropertySchema;
    properties?: Record<string, McpPropertySchema>;
    required?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}

/**
 * Result from a tool execution.
 */
export interface McpToolResult<T = unknown> {
    /** Whether the operation succeeded */
    success: boolean;

    /** Result data if successful */
    data?: T;

    /** Error message if failed */
    error?: string;

    /** Error code for programmatic handling */
    errorCode?: string;

    /** Additional metadata about the execution */
    metadata?: {
        /** Model used (for AI tools) */
        model?: string;
        /** Routing layer used (L0-L3) */
        layer?: string;
        /** Input tokens consumed */
        inputTokens?: number;
        /** Output tokens generated */
        outputTokens?: number;
        /** Cost in USD */
        cost?: number;
        /** Execution time in ms */
        duration?: number;
        /** Additional custom metadata */
        [key: string]: unknown;
    };
}

// =============================================================================
// JSON-RPC Types (MCP Transport Layer)
// =============================================================================

/**
 * JSON-RPC 2.0 request format used by MCP.
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response format used by MCP.
 */
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 error object.
 */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

/**
 * Standard JSON-RPC error codes.
 */
export const JsonRpcErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    // Custom MCP error codes
    TOOL_NOT_FOUND: -32001,
    TOOL_EXECUTION_ERROR: -32002,
    TOOL_TIMEOUT: -32003,
    UNAUTHORIZED: -32004,
    RATE_LIMITED: -32005,
} as const;

// =============================================================================
// MCP Protocol Messages
// =============================================================================

/**
 * MCP list_tools request.
 */
export interface McpListToolsRequest extends JsonRpcRequest {
    method: 'list_tools';
}

/**
 * MCP list_tools response.
 */
export interface McpListToolsResponse {
    tools: Array<{
        name: string;
        description: string;
        inputSchema: McpToolDefinition['inputSchema'];
    }>;
}

/**
 * MCP call_tool request.
 */
export interface McpCallToolRequest extends JsonRpcRequest {
    method: 'call_tool';
    params: {
        name: string;
        arguments?: Record<string, unknown>;
    };
}

/**
 * MCP call_tool response.
 */
export interface McpCallToolResponse {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}

/**
 * MCP list_resources request.
 */
export interface McpListResourcesRequest extends JsonRpcRequest {
    method: 'list_resources';
}

/**
 * MCP resource definition.
 */
export interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

/**
 * MCP list_resources response.
 */
export interface McpListResourcesResponse {
    resources: McpResource[];
}

/**
 * MCP read_resource request.
 */
export interface McpReadResourceRequest extends JsonRpcRequest {
    method: 'read_resource';
    params: {
        uri: string;
    };
}

/**
 * MCP read_resource response.
 */
export interface McpReadResourceResponse {
    contents: Array<{
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
    }>;
}

// =============================================================================
// MCP Adapter Configuration
// =============================================================================

/**
 * Configuration options for the MCP adapter.
 */
export interface McpAdapterConfig {
    /** Transport type: stdio (default) or websocket */
    transport: 'stdio' | 'websocket' | 'http';

    /** Port for websocket/http transport */
    port?: number;

    /** Host for websocket/http transport */
    host?: string;

    /** Logging level */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';

    /** Enable request/response logging */
    enableLogging?: boolean;

    /** Maximum concurrent tool executions */
    maxConcurrency?: number;

    /** Default timeout for tool executions (ms) */
    defaultTimeout?: number;

    /** Enable tool result caching */
    enableCache?: boolean;

    /** Cache TTL in seconds */
    cacheTtl?: number;
}

/**
 * Default MCP adapter configuration.
 */
export const defaultMcpConfig: McpAdapterConfig = {
    transport: 'stdio',
    logLevel: 'info',
    enableLogging: true,
    maxConcurrency: 10,
    defaultTimeout: 30000,
    enableCache: false,
    cacheTtl: 300,
};

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Schema for ai.chat_router input.
 */
export const AiChatRouterInputSchema = z.object({
    task: z.string().describe('The task or question for the AI'),
    context: z.string().optional().describe('Additional context (system info, sensitive data flag, etc.)'),
    riskLevel: z.enum(['low', 'normal', 'high', 'prod-critical']).default('normal').describe('Risk level for routing'),
    priority: z.enum(['speed', 'quality', 'cost']).default('quality').describe('Priority mode for model selection'),
    maxTokens: z.number().optional().describe('Maximum tokens for response'),
    temperature: z.number().min(0).max(2).optional().describe('Temperature for generation'),
});
export type AiChatRouterInput = z.infer<typeof AiChatRouterInputSchema>;

/**
 * Schema for ai.code_agent input.
 */
export const AiCodeAgentInputSchema = z.object({
    task: z.string().describe('The coding task description'),
    repoPath: z.string().optional().describe('Path to the repository'),
    language: z.string().optional().describe('Programming language'),
    framework: z.string().optional().describe('Framework being used'),
    existingCode: z.string().optional().describe('Existing code to modify'),
    constraints: z.string().optional().describe('Constraints or requirements'),
    allowClaudeCode: z.boolean().default(false).describe('Allow using Claude Code for complex tasks'),
    quality: z.enum(['normal', 'high', 'critical']).default('normal').describe('Quality requirement'),
});
export type AiCodeAgentInput = z.infer<typeof AiCodeAgentInputSchema>;

/**
 * Schema for net.fw_log_search input.
 */
export const NetFwLogSearchInputSchema = z.object({
    source: z.enum(['fortigate', 'mikrotik', 'syslog', 'elastic']).describe('Log source'),
    ip: z.string().optional().describe('IP address to search for'),
    keyword: z.string().optional().describe('Keyword to search'),
    timeRangeMinutes: z.number().default(15).describe('Time range in minutes'),
    maxRows: z.number().default(200).describe('Maximum rows to return'),
});
export type NetFwLogSearchInput = z.infer<typeof NetFwLogSearchInputSchema>;

/**
 * Schema for net.topology_scan input.
 */
export const NetTopologyScanInputSchema = z.object({
    scope: z.string().optional().describe('Scope: core, distribution, access, all, or zone name'),
    mode: z.enum(['snapshot', 'live_scan']).default('snapshot').describe('Scan mode'),
    detailLevel: z.enum(['summary', 'full']).default('summary').describe('Detail level'),
});
export type NetTopologyScanInput = z.infer<typeof NetTopologyScanInputSchema>;

/**
 * Schema for net.mikrotik_api input.
 */
export const NetMikrotikApiInputSchema = z.object({
    deviceId: z.string().optional().describe('Device ID in internal system'),
    address: z.string().optional().describe('IP/hostname for direct connection'),
    apiProfile: z.string().optional().describe('API profile name'),
    action: z.enum(['run_command', 'get_config', 'set_config', 'apply_script']).describe('Action to perform'),
    payload: z.record(z.unknown()).optional().describe('Command/config payload'),
});
export type NetMikrotikApiInput = z.infer<typeof NetMikrotikApiInputSchema>;

/**
 * Schema for net.dhcp_dns_manage input.
 */
export const NetDhcpDnsManageInputSchema = z.object({
    backend: z.enum(['mikrotik', 'pfsense', 'windows_dhcp', 'bind']).describe('Backend system'),
    scope: z.string().optional().describe('Device or zone scope'),
    operation: z.enum([
        'list_config', 'get_lease', 'set_lease', 'delete_lease',
        'list_dns', 'set_dns_record', 'delete_dns_record'
    ]).describe('Operation to perform'),
    payload: z.record(z.unknown()).optional().describe('Operation payload (MAC, IP, hostname, etc.)'),
});
export type NetDhcpDnsManageInput = z.infer<typeof NetDhcpDnsManageInputSchema>;

/**
 * Schema for net.nac_manage input.
 */
export const NetNacManageInputSchema = z.object({
    backend: z.enum(['fortigate', 'mikrotik', 'nac_server']).describe('NAC backend'),
    operation: z.enum(['query_device', 'set_policy', 'quarantine', 'release', 'list_policies']).describe('NAC operation'),
    deviceId: z.string().optional().describe('Internal device ID'),
    mac: z.string().optional().describe('MAC address'),
    policy: z.string().optional().describe('Policy/VLAN/profile name'),
    payload: z.record(z.unknown()).optional().describe('Additional parameters'),
});
export type NetNacManageInput = z.infer<typeof NetNacManageInputSchema>;

/**
 * Schema for ops.cost_report input.
 */
export const OpsCostReportInputSchema = z.object({
    range: z.enum(['today', 'yesterday', 'last_7_days', 'this_month', 'last_month']).optional().describe('Time range'),
    groupBy: z.enum(['model', 'level', 'user', 'project']).optional().describe('Grouping dimension'),
    project: z.string().optional().describe('Filter by project'),
});
export type OpsCostReportInput = z.infer<typeof OpsCostReportInputSchema>;

/**
 * Schema for ops.trace_session input.
 */
export const OpsTraceSessionInputSchema = z.object({
    sessionId: z.string().describe('Session or trace ID to look up'),
    detailLevel: z.enum(['summary', 'full']).default('summary').describe('Detail level'),
});
export type OpsTraceSessionInput = z.infer<typeof OpsTraceSessionInputSchema>;

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract handler input type from a tool definition.
 */
export type ExtractToolInput<T> = T extends McpToolDefinition<infer I, unknown> ? I : never;

/**
 * Extract handler output type from a tool definition.
 */
export type ExtractToolOutput<T> = T extends McpToolDefinition<unknown, infer O> ? O : never;

/**
 * Tool handler function type.
 */
export type ToolHandler<TInput, TOutput> = (args: TInput) => Promise<McpToolResult<TOutput>>;

/**
 * Map of tool names to their handlers.
 */
export type ToolHandlerMap = Map<string, ToolHandler<unknown, unknown>>;
