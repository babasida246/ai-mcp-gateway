/**
 * @file Unified Tools - Main Export
 * @description Central export point for unified tool system
 */

// Base types and interfaces
export {
    ToolContext,
    ToolResult,
    ToolCategory,
    UnifiedToolDefinition,
    IToolRegistry,
    ToolMiddleware,
} from './base.js';

// Registry
export {
    UnifiedToolRegistry,
    unifiedRegistry,
} from './registry.js';

// Adapters
export {
    toMcpTool,
    registerAsMcpTool,
    getMcpToolsList,
    executeMcpTool,
} from './adapters/mcp.js';

export {
    createToolEndpoint,
    registerAsApiEndpoint,
    getApiToolsList,
    executeApiTool,
    createToolRoutes,
} from './adapters/api.js';

// Example tools
export {
    aiChatTool,
    dbQueryTool,
    contextStatsTool,
    exampleTools,
} from './examples/index.js';

/**
 * Quick setup function for unified tools
 */
export function setupUnifiedTools(options?: {
    registerExamples?: boolean;
    enableMiddleware?: boolean;
}) {
    const { registerExamples = true, enableMiddleware = true } = options || {};

    if (registerExamples) {
        const { exampleTools } = require('./examples/index.js');
        exampleTools.forEach((tool: any) => {
            unifiedRegistry.register(tool);
        });
    }

    if (enableMiddleware) {
        // Add logging middleware
        unifiedRegistry.use({
            before: async (tool, input, context) => {
                console.log(`[UnifiedTools] Executing: ${tool.name}`, {
                    executionId: context.executionId,
                    category: tool.category,
                });
            },
            after: async (tool, input, result, context) => {
                console.log(`[UnifiedTools] Completed: ${tool.name}`, {
                    executionId: context.executionId,
                    success: result.success,
                    duration: result.metadata?.duration,
                });
            },
        });
    }

    return unifiedRegistry;
}
