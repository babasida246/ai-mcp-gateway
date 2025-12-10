/**
 * @file MCP Adapter for Unified Tools
 * @description Converts unified tools to MCP format
 */

import { z } from 'zod';
import {
    McpToolDefinition,
    McpToolResult,
    McpListToolsResponse,
} from '../../mcp/adapter/types.js';
import {
    UnifiedToolDefinition,
    ToolContext,
    ToolResult,
} from './base.js';
import { unifiedRegistry } from '../registry.js';
import { logger } from '../../../logging/logger.js';

/**
 * Convert Zod schema to JSON Schema for MCP
 */
function zodToJsonSchema(schema: z.ZodType): any {
    // Basic conversion - in production, use zod-to-json-schema library
    if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const properties: any = {};
        const required: string[] = [];

        Object.entries(shape).forEach(([key, value]) => {
            properties[key] = zodToJsonSchemaProperty(value as z.ZodType);
            if (!(value as z.ZodType).isOptional()) {
                required.push(key);
            }
        });

        return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        };
    }

    return { type: 'string' }; // Fallback
}

function zodToJsonSchemaProperty(schema: z.ZodType): any {
    if (schema instanceof z.ZodString) {
        return { type: 'string', description: schema.description };
    }
    if (schema instanceof z.ZodNumber) {
        return { type: 'number', description: schema.description };
    }
    if (schema instanceof z.ZodBoolean) {
        return { type: 'boolean', description: schema.description };
    }
    if (schema instanceof z.ZodArray) {
        return {
            type: 'array',
            items: zodToJsonSchemaProperty(schema.element),
            description: schema.description,
        };
    }
    if (schema instanceof z.ZodOptional) {
        return zodToJsonSchemaProperty(schema.unwrap());
    }
    if (schema instanceof z.ZodObject) {
        return zodToJsonSchema(schema);
    }
    return { type: 'string' };
}

/**
 * Convert unified tool to MCP tool
 */
export function toMcpTool<TInput, TOutput>(
    tool: UnifiedToolDefinition<TInput, TOutput>
): McpToolDefinition<TInput, TOutput> {
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
        handler: async (input: TInput): Promise<McpToolResult<TOutput>> => {
            const context: ToolContext = {
                executionId: `mcp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                metadata: { source: 'mcp' },
            };

            const result = await unifiedRegistry.execute<TInput, TOutput>(
                tool.name,
                input,
                context
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: result.success
                            ? JSON.stringify(result.data, null, 2)
                            : `Error: ${result.error?.message || 'Unknown error'}`,
                    },
                ],
                isError: !result.success,
            };
        },
    };
}

/**
 * Register unified tool as MCP tool
 */
export function registerAsMcpTool<TInput, TOutput>(
    tool: UnifiedToolDefinition<TInput, TOutput>
): void {
    // Register in unified registry
    unifiedRegistry.register(tool);

    logger.info('Registered unified tool for MCP', {
        toolName: tool.name,
        category: tool.category,
    });
}

/**
 * Get MCP list_tools response from unified registry
 */
export function getMcpToolsList(filter?: {
    category?: string;
    tags?: string[];
}): McpListToolsResponse {
    const tools = unifiedRegistry.list(filter as any);

    return {
        tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.inputSchema),
        })),
    };
}

/**
 * Execute tool via MCP format
 */
export async function executeMcpTool<TInput, TOutput>(
    name: string,
    input: TInput
): Promise<McpToolResult<TOutput>> {
    const context: ToolContext = {
        executionId: `mcp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        metadata: { source: 'mcp' },
    };

    const result = await unifiedRegistry.execute<TInput, TOutput>(name, input, context);

    return {
        content: [
            {
                type: 'text',
                text: result.success
                    ? JSON.stringify(result.data, null, 2)
                    : `Error: ${result.error?.message || 'Unknown error'}`,
            },
        ],
        isError: !result.success,
    };
}
