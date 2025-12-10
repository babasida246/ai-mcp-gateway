/**
 * @file Unified Tool System - Base
 * @description Core tool definitions and interfaces that work for both MCP and API
 */

import { z } from 'zod';

/**
 * Tool execution context - contains runtime information
 */
export interface ToolContext {
    /** Unique execution ID */
    executionId: string;
    /** User/session ID if available */
    userId?: string;
    /** Project/workspace context */
    projectId?: string;
    /** Conversation ID for chat context */
    conversationId?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = any> {
    /** Whether execution was successful */
    success: boolean;
    /** Result data if successful */
    data?: T;
    /** Error information if failed */
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    /** Execution metadata */
    metadata?: {
        duration?: number;
        tokensUsed?: number;
        cost?: number;
        [key: string]: any;
    };
}

/**
 * Tool category for organization
 */
export type ToolCategory =
    | 'ai'           // AI/LLM operations
    | 'network'      // Network management
    | 'ops'          // Operations/monitoring
    | 'security'     // Security operations
    | 'database'     // Database operations
    | 'file'         // File system operations
    | 'code'         // Code analysis/generation
    | 'chat'         // Chat/conversation management
    | 'search'       // Search/indexing
    | 'system';      // System utilities

/**
 * Unified tool definition that works for both MCP and API
 */
export interface UnifiedToolDefinition<TInput = any, TOutput = any> {
    /** Unique tool identifier (e.g., 'ai.chat_router', 'db.query') */
    name: string;

    /** Human-readable description */
    description: string;

    /** Tool category for organization */
    category: ToolCategory;

    /** Input schema using Zod */
    inputSchema: z.ZodType<TInput>;

    /** Optional output schema for validation */
    outputSchema?: z.ZodType<TOutput>;

    /** Tool handler function */
    handler: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;

    /** Optional metadata */
    metadata?: {
        /** Whether tool requires authentication */
        requiresAuth?: boolean;
        /** Rate limit (calls per minute) */
        rateLimit?: number;
        /** Estimated execution time (ms) */
        estimatedDuration?: number;
        /** Tags for filtering */
        tags?: string[];
        /** Examples of usage */
        examples?: Array<{
            input: TInput;
            description: string;
        }>;
    };
}

/**
 * Tool registry interface
 */
export interface IToolRegistry {
    /** Register a new tool */
    register<TInput, TOutput>(tool: UnifiedToolDefinition<TInput, TOutput>): void;

    /** Unregister a tool */
    unregister(name: string): boolean;

    /** Get a tool by name */
    get(name: string): UnifiedToolDefinition | undefined;

    /** List all tools */
    list(filter?: { category?: ToolCategory; tags?: string[] }): UnifiedToolDefinition[];

    /** Execute a tool */
    execute<TInput, TOutput>(
        name: string,
        input: TInput,
        context: ToolContext
    ): Promise<ToolResult<TOutput>>;

    /** Get tool statistics */
    getStats(name: string): {
        callCount: number;
        errorCount: number;
        avgDuration: number;
        lastCalled?: Date;
    } | undefined;
}

/**
 * Tool middleware for pre/post processing
 */
export interface ToolMiddleware {
    /** Called before tool execution */
    before?: (
        tool: UnifiedToolDefinition,
        input: any,
        context: ToolContext
    ) => Promise<void>;

    /** Called after tool execution */
    after?: (
        tool: UnifiedToolDefinition,
        input: any,
        result: ToolResult,
        context: ToolContext
    ) => Promise<void>;

    /** Called on error */
    onError?: (
        tool: UnifiedToolDefinition,
        input: any,
        error: Error,
        context: ToolContext
    ) => Promise<void>;
}

// Re-export registry for convenience (tests expect UnifiedToolRegistry export from base)
export { UnifiedToolRegistry, unifiedRegistry } from './registry.js';
