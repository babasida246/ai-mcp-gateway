/**
 * @file API Adapter for Unified Tools
 * @description Converts unified tools to Express API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import {
    UnifiedToolDefinition,
    ToolContext,
    ToolResult,
} from '../base.js';
import { unifiedRegistry } from '../registry.js';
import { logger } from '../../../logging/logger.js';

/**
 * Create Express middleware for a unified tool
 */
export function createToolEndpoint<TInput, TOutput>(
    tool: UnifiedToolDefinition<TInput, TOutput>
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const input = req.body as TInput;

            const context: ToolContext = {
                executionId: `api-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                userId: (req as any).user?.id,
                projectId: req.headers['x-project-id'] as string,
                conversationId: req.headers['x-conversation-id'] as string,
                metadata: {
                    source: 'api',
                    userAgent: req.headers['user-agent'],
                    ip: req.ip,
                },
            };

            const result = await unifiedRegistry.execute<TInput, TOutput>(
                tool.name,
                input,
                context
            );

            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    metadata: result.metadata,
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error,
                    metadata: result.metadata,
                });
            }
        } catch (error) {
            logger.error('API tool execution error', {
                toolName: tool.name,
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error instanceof Error ? error.message : 'Internal server error',
                },
            });
        }
    };
}

/**
 * Register unified tool as API endpoint
 */
export function registerAsApiEndpoint<TInput, TOutput>(
    tool: UnifiedToolDefinition<TInput, TOutput>,
    router: any, // Express Router
    options?: {
        path?: string; // Custom path, defaults to /tools/:toolName
        method?: 'get' | 'post' | 'put' | 'delete';
        middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
    }
): void {
    // Register in unified registry
    unifiedRegistry.register(tool);

    // Create API endpoint
    const path = options?.path || `/tools/${tool.name}`;
    const method = options?.method || 'post';
    const middlewares = options?.middleware || [];

    const handler = createToolEndpoint(tool);

    // Register route with Express router
    router[method](path, ...middlewares, handler);

    logger.info('Registered unified tool as API endpoint', {
        toolName: tool.name,
        category: tool.category,
        path,
        method,
    });
}

/**
 * Get tool list API response
 */
export function getApiToolsList(filter?: {
    category?: string;
    tags?: string[];
}) {
    const tools = unifiedRegistry.list(filter as any);

    return {
        success: true,
        data: {
            tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                category: tool.category,
                requiresAuth: tool.metadata?.requiresAuth,
                rateLimit: tool.metadata?.rateLimit,
                tags: tool.metadata?.tags,
                inputSchema: tool.inputSchema._def, // Zod schema definition
            })),
            total: tools.length,
        },
    };
}

/**
 * Execute tool via API format
 */
export async function executeApiTool<TInput, TOutput>(
    name: string,
    input: TInput,
    context: Partial<ToolContext> = {}
): Promise<ToolResult<TOutput>> {
    const fullContext: ToolContext = {
        executionId: context.executionId || `api-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        userId: context.userId,
        projectId: context.projectId,
        conversationId: context.conversationId,
        metadata: {
            source: 'api',
            ...context.metadata,
        },
    };

    return await unifiedRegistry.execute<TInput, TOutput>(name, input, fullContext);
}

/**
 * Create API routes for all registered tools
 */
export function createToolRoutes(router: any) {
    // List all tools
    router.get('/tools', (req: Request, res: Response) => {
        const { category, tags } = req.query;

        const result = getApiToolsList({
            category: category as string,
            tags: tags ? (tags as string).split(',') : undefined,
        });

        res.json(result);
    });

    // Get tool stats
    router.get('/tools/stats', (req: Request, res: Response) => {
        const stats = unifiedRegistry.getAllStats();
        res.json({
            success: true,
            data: stats,
        });
    });

    // Get specific tool info
    router.get('/tools/:name', (req: Request, res: Response) => {
        const tool = unifiedRegistry.get(req.params.name);

        if (!tool) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TOOL_NOT_FOUND',
                    message: `Tool not found: ${req.params.name}`,
                },
            });
        }

        const stats = unifiedRegistry.getStats(req.params.name);

        res.json({
            success: true,
            data: {
                name: tool.name,
                description: tool.description,
                category: tool.category,
                metadata: tool.metadata,
                stats,
            },
        });
    });

    logger.info('Created unified tool API routes');
}
