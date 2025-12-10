/**
 * @file MCP Tool Registry
 * @description Centralized registry for all MCP tools with type-safe registration and lookup.
 * 
 * The registry provides:
 * - Type-safe tool registration
 * - Tool lookup by name
 * - Tool listing for MCP list_tools
 * - Input validation using Zod schemas
 * - Categorized tool organization
 * 
 * @example
 * ```typescript
 * // Register a tool
 * mcpRegistry.register(aiChatRouterTool);
 * 
 * // Get all tools
 * const tools = mcpRegistry.listTools();
 * 
 * // Call a tool
 * const result = await mcpRegistry.callTool('ai.chat_router', { task: 'Hello' });
 * ```
 */

import { z } from 'zod';
import {
    McpToolDefinition,
    McpToolResult,
    McpListToolsResponse,
    JsonRpcError,
    JsonRpcErrorCodes,
} from '../adapter/types.js';
import { logger } from '../../logging/logger.js';

/**
 * Tool registry entry with metadata.
 */
interface RegistryEntry {
    tool: McpToolDefinition;
    registeredAt: Date;
    callCount: number;
    lastCalledAt?: Date;
    totalDuration: number;
    errorCount: number;
}

/**
 * MCP Tool Registry - Singleton class for managing tools.
 */
class McpToolRegistry {
    private tools: Map<string, RegistryEntry> = new Map();
    private categories: Map<string, Set<string>> = new Map();

    constructor() {
        // Initialize default categories
        this.categories.set('ai', new Set());
        this.categories.set('network', new Set());
        this.categories.set('ops', new Set());
        this.categories.set('system', new Set());
    }

    /**
     * Register a tool in the registry.
     * @param tool - The tool definition to register
     * @throws Error if tool with same name already exists
     */
    register<TInput, TOutput>(tool: McpToolDefinition<TInput, TOutput>): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool already registered: ${tool.name}`);
        }

        const entry: RegistryEntry = {
            tool: tool as McpToolDefinition,
            registeredAt: new Date(),
            callCount: 0,
            totalDuration: 0,
            errorCount: 0,
        };

        this.tools.set(tool.name, entry);

        // Add to category
        const category = tool.category || 'system';
        if (!this.categories.has(category)) {
            this.categories.set(category, new Set());
        }
        this.categories.get(category)!.add(tool.name);

        logger.info('Tool registered', {
            name: tool.name,
            category,
            description: tool.description.substring(0, 50) + '...',
        });
    }

    /**
     * Register multiple tools at once.
     * @param tools - Array of tool definitions
     */
    registerMany(tools: McpToolDefinition[]): void {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    /**
     * Unregister a tool by name.
     * @param name - Tool name to unregister
     * @returns true if tool was found and removed
     */
    unregister(name: string): boolean {
        const entry = this.tools.get(name);
        if (!entry) {
            return false;
        }

        this.tools.delete(name);

        // Remove from category
        const category = entry.tool.category || 'system';
        this.categories.get(category)?.delete(name);

        logger.info('Tool unregistered', { name });
        return true;
    }

    /**
     * Get a tool definition by name.
     * @param name - Tool name
     * @returns Tool definition or undefined
     */
    getTool(name: string): McpToolDefinition | undefined {
        return this.tools.get(name)?.tool;
    }

    /**
     * Check if a tool exists.
     * @param name - Tool name
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * List all tools in MCP format.
     * @returns McpListToolsResponse
     */
    listTools(): McpListToolsResponse {
        const tools = Array.from(this.tools.values()).map(entry => ({
            name: entry.tool.name,
            description: entry.tool.description,
            inputSchema: entry.tool.inputSchema,
        }));

        return { tools };
    }

    /**
     * List tools by category.
     * @param category - Category name
     */
    listToolsByCategory(category: string): McpToolDefinition[] {
        const toolNames = this.categories.get(category);
        if (!toolNames) {
            return [];
        }

        return Array.from(toolNames)
            .map(name => this.tools.get(name)?.tool)
            .filter((tool): tool is McpToolDefinition => tool !== undefined);
    }

    /**
     * Get all categories.
     */
    getCategories(): string[] {
        return Array.from(this.categories.keys());
    }

    /**
     * Call a tool by name with arguments.
     * @param name - Tool name
     * @param args - Tool arguments
     * @returns Tool result
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        const entry = this.tools.get(name);
        if (!entry) {
            return {
                success: false,
                error: `Tool not found: ${name}`,
                errorCode: 'TOOL_NOT_FOUND',
            };
        }

        const startTime = Date.now();
        entry.callCount++;
        entry.lastCalledAt = new Date();

        try {
            logger.debug('Calling tool', { name, args });

            // Execute handler
            const result = await entry.tool.handler(args);

            const duration = Date.now() - startTime;
            entry.totalDuration += duration;

            // Add duration to metadata
            if (result.metadata) {
                result.metadata.duration = duration;
            } else {
                result.metadata = { duration };
            }

            if (!result.success) {
                entry.errorCount++;
            }

            logger.info('Tool call completed', {
                name,
                success: result.success,
                duration,
            });

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            entry.totalDuration += duration;
            entry.errorCount++;

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logger.error('Tool call failed', {
                name,
                error: errorMessage,
                duration,
            });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'TOOL_EXECUTION_ERROR',
                metadata: { duration },
            };
        }
    }

    /**
     * Validate tool input against its schema.
     * @param name - Tool name
     * @param args - Arguments to validate
     * @returns Validation result
     */
    validateInput(name: string, args: Record<string, unknown>): {
        valid: boolean;
        errors?: string[];
        sanitized?: Record<string, unknown>;
    } {
        const tool = this.getTool(name);
        if (!tool) {
            return { valid: false, errors: [`Tool not found: ${name}`] };
        }

        // Basic schema validation
        const schema = tool.inputSchema;
        const errors: string[] = [];
        const sanitized: Record<string, unknown> = {};

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (args[field] === undefined || args[field] === null) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        // Validate and sanitize each property
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            const value = args[key];

            if (value === undefined) {
                if (propSchema.default !== undefined) {
                    sanitized[key] = propSchema.default;
                }
                continue;
            }

            // Type validation
            const valueType = Array.isArray(value) ? 'array' : typeof value;
            if (propSchema.type !== valueType) {
                // Try to coerce types
                if (propSchema.type === 'number' && typeof value === 'string') {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                        sanitized[key] = num;
                        continue;
                    }
                }
                if (propSchema.type === 'boolean' && typeof value === 'string') {
                    sanitized[key] = value === 'true';
                    continue;
                }
                errors.push(`Invalid type for ${key}: expected ${propSchema.type}, got ${valueType}`);
                continue;
            }

            // Enum validation
            if (propSchema.enum && !propSchema.enum.includes(value as string | number | boolean)) {
                errors.push(`Invalid value for ${key}: must be one of ${propSchema.enum.join(', ')}`);
                continue;
            }

            // String constraints
            if (propSchema.type === 'string' && typeof value === 'string') {
                if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
                    errors.push(`${key} must be at least ${propSchema.minLength} characters`);
                    continue;
                }
                if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
                    errors.push(`${key} must be at most ${propSchema.maxLength} characters`);
                    continue;
                }
                if (propSchema.pattern && !new RegExp(propSchema.pattern).test(value)) {
                    errors.push(`${key} does not match required pattern`);
                    continue;
                }
            }

            // Number constraints
            if (propSchema.type === 'number' && typeof value === 'number') {
                if (propSchema.minimum !== undefined && value < propSchema.minimum) {
                    errors.push(`${key} must be at least ${propSchema.minimum}`);
                    continue;
                }
                if (propSchema.maximum !== undefined && value > propSchema.maximum) {
                    errors.push(`${key} must be at most ${propSchema.maximum}`);
                    continue;
                }
            }

            sanitized[key] = value;
        }

        // Check for unknown fields if additionalProperties is false
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(args)) {
                if (!schema.properties[key]) {
                    errors.push(`Unknown field: ${key}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            sanitized: errors.length === 0 ? sanitized : undefined,
        };
    }

    /**
     * Get registry statistics.
     */
    getStats(): {
        totalTools: number;
        toolsByCategory: Record<string, number>;
        totalCalls: number;
        totalErrors: number;
        averageDuration: number;
        toolStats: Array<{
            name: string;
            callCount: number;
            errorCount: number;
            avgDuration: number;
        }>;
    } {
        let totalCalls = 0;
        let totalErrors = 0;
        let totalDuration = 0;
        const toolStats: Array<{
            name: string;
            callCount: number;
            errorCount: number;
            avgDuration: number;
        }> = [];

        for (const [name, entry] of this.tools) {
            totalCalls += entry.callCount;
            totalErrors += entry.errorCount;
            totalDuration += entry.totalDuration;

            toolStats.push({
                name,
                callCount: entry.callCount,
                errorCount: entry.errorCount,
                avgDuration: entry.callCount > 0 ? entry.totalDuration / entry.callCount : 0,
            });
        }

        const toolsByCategory: Record<string, number> = {};
        for (const [category, tools] of this.categories) {
            toolsByCategory[category] = tools.size;
        }

        return {
            totalTools: this.tools.size,
            toolsByCategory,
            totalCalls,
            totalErrors,
            averageDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
            toolStats: toolStats.sort((a, b) => b.callCount - a.callCount),
        };
    }

    /**
     * Clear all registered tools.
     */
    clear(): void {
        this.tools.clear();
        for (const category of this.categories.keys()) {
            this.categories.get(category)?.clear();
        }
        logger.info('Tool registry cleared');
    }

    /**
     * Get tool count.
     */
    get size(): number {
        return this.tools.size;
    }
}

// Export singleton instance
export const mcpRegistry = new McpToolRegistry();

// Export class for testing
export { McpToolRegistry };
