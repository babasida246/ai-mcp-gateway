/**
 * @file Unified Tools Integration Example
 * @description Example showing how to use unified tools in both MCP and API
 */

import express from 'express';
import {
    setupUnifiedTools,
    unifiedRegistry,
    registerAsMcpTool,
    registerAsApiEndpoint,
    createToolRoutes,
    aiChatTool,
    dbQueryTool,
    contextStatsTool,
} from '../shared/tools/index.js';

/**
 * Setup for MCP Server
 */
export function setupMcpTools() {
    // Initialize unified tools
    setupUnifiedTools({
        registerExamples: true,
        enableMiddleware: true,
    });

    // Register additional MCP-specific tools
    // (they will be available for both MCP and API)

    console.log('✅ MCP tools registered:', unifiedRegistry.list().length);

    return unifiedRegistry;
}

/**
 * Setup for API Server
 */
export function setupApiTools(app: express.Application) {
    // Initialize unified tools
    setupUnifiedTools({
        registerExamples: true,
        enableMiddleware: true,
    });

    const router = express.Router();

    // Create automatic tool routes
    // GET /v1/tools - list all tools
    // GET /v1/tools/stats - all stats
    // GET /v1/tools/:name - tool info
    createToolRoutes(router);

    // Register individual tools as endpoints
    registerAsApiEndpoint(aiChatTool, router, {
        path: '/chat',
        method: 'post',
    });

    registerAsApiEndpoint(dbQueryTool, router, {
        path: '/db/query',
        method: 'post',
        middleware: [
            // Add auth middleware here if needed
            (req, res, next) => {
                // Check authentication
                next();
            },
        ],
    });

    registerAsApiEndpoint(contextStatsTool, router, {
        path: '/chat/stats/:conversationId',
        method: 'get',
    });

    // Mount router
    app.use('/v1', router);

    console.log('✅ API tools registered:', unifiedRegistry.list().length);

    return router;
}

/**
 * Example: Using tools directly in code
 */
export async function exampleDirectUsage() {
    // Initialize
    setupUnifiedTools();

    // Example 1: AI Chat
    console.log('\n--- Example 1: AI Chat ---');
    const chatResult = await unifiedRegistry.execute('ai.chat', {
        message: 'What is TypeScript?',
        temperature: 0.7,
    }, {
        executionId: 'example-1',
        userId: 'demo-user',
    });

    console.log('Chat result:', chatResult);

    // Example 2: Database Query
    console.log('\n--- Example 2: Database Query ---');
    const dbResult = await unifiedRegistry.execute('db.query', {
        query: 'SELECT COUNT(*) as total FROM conversations',
    }, {
        executionId: 'example-2',
    });

    console.log('DB result:', dbResult);

    // Example 3: Context Stats
    console.log('\n--- Example 3: Context Stats ---');
    const statsResult = await unifiedRegistry.execute('chat.context_stats', {
        conversationId: 'conv-123',
    }, {
        executionId: 'example-3',
    });

    console.log('Stats result:', statsResult);

    // Get all statistics
    console.log('\n--- All Tool Statistics ---');
    const allStats = unifiedRegistry.getAllStats();
    console.log(allStats);
}

/**
 * Example: Custom middleware
 */
export function setupCustomMiddleware() {
    // Rate limiting middleware
    const rateLimits = new Map<string, { count: number; resetAt: number }>();

    unifiedRegistry.use({
        before: async (tool, input, context) => {
            const limit = tool.metadata?.rateLimit || Infinity;
            const key = `${context.userId || 'anon'}-${tool.name}`;

            const now = Date.now();
            const rateLimit = rateLimits.get(key);

            if (rateLimit) {
                if (now < rateLimit.resetAt) {
                    if (rateLimit.count >= limit) {
                        throw new Error(`Rate limit exceeded for ${tool.name}`);
                    }
                    rateLimit.count++;
                } else {
                    rateLimits.set(key, { count: 1, resetAt: now + 60000 });
                }
            } else {
                rateLimits.set(key, { count: 1, resetAt: now + 60000 });
            }
        },
    });

    // Authentication middleware
    unifiedRegistry.use({
        before: async (tool, input, context) => {
            if (tool.metadata?.requiresAuth && !context.userId) {
                throw new Error(`Authentication required for ${tool.name}`);
            }
        },
    });

    // Logging middleware
    unifiedRegistry.use({
        after: async (tool, input, result, context) => {
            console.log(`[ToolExecution] ${tool.name}`, {
                success: result.success,
                duration: result.metadata?.duration,
                user: context.userId,
            });
        },
        onError: async (tool, input, error, context) => {
            console.error(`[ToolError] ${tool.name}`, {
                error: error.message,
                user: context.userId,
            });
        },
    });
}

/**
 * Example: List tools by category
 */
export function exampleListByCategory() {
    setupUnifiedTools();

    console.log('\n--- AI Tools ---');
    const aiTools = unifiedRegistry.list({ category: 'ai' });
    aiTools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
    });

    console.log('\n--- Database Tools ---');
    const dbTools = unifiedRegistry.list({ category: 'database' });
    dbTools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
    });

    console.log('\n--- Chat Tools ---');
    const chatTools = unifiedRegistry.list({ category: 'chat' });
    chatTools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
    });
}

// Run examples if this file is executed directly
if (require.main === module) {
    (async () => {
        console.log('=== Unified Tools Integration Examples ===\n');

        setupCustomMiddleware();
        exampleListByCategory();
        await exampleDirectUsage();

        console.log('\n✅ All examples completed!');
    })();
}
