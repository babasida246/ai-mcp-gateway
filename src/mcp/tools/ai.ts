/**
 * @file AI MCP Tools
 * @description AI-related MCP tools for chat routing and code generation.
 * 
 * Tools in this module:
 * - ai.chat_router: Route chat requests through the N-layer model system
 * - ai.code_agent: Execute coding tasks with multi-model orchestration
 */

import {
    McpToolDefinition,
    McpToolResult,
    AiChatRouterInput,
    AiChatRouterInputSchema,
    AiCodeAgentInput,
    AiCodeAgentInputSchema,
    RiskLevel,
    PriorityMode,
} from '../adapter/types.js';
import { routeRequest, detectComplexity } from '../../routing/router.js';
import { codeAgentTool } from '../../tools/codeAgent/index.js';
import { logger } from '../../logging/logger.js';
import { ModelLayer, LAYERS_IN_ORDER } from '../../config/models.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map risk level to routing layer.
 */
function riskLevelToLayer(riskLevel: RiskLevel): ModelLayer | undefined {
    switch (riskLevel) {
        case 'low':
            return 'L0';
        case 'normal':
            return undefined; // Use default routing
        case 'high':
            return 'L1';
        case 'prod-critical':
            return 'L2';
        default:
            return undefined;
    }
}

/**
 * Map priority mode to routing parameters.
 */
function priorityModeToParams(priority: PriorityMode): {
    quality: 'normal' | 'high' | 'critical';
    preferCost: boolean;
} {
    switch (priority) {
        case 'speed':
            return { quality: 'normal', preferCost: true };
        case 'quality':
            return { quality: 'high', preferCost: false };
        case 'cost':
            return { quality: 'normal', preferCost: true };
        default:
            return { quality: 'normal', preferCost: false };
    }
}

// =============================================================================
// ai.chat_router Tool
// =============================================================================

/**
 * AI Chat Router Tool
 * 
 * Routes chat requests through the gateway's N-layer model system.
 * The gateway automatically selects the best model based on task complexity,
 * risk level, and cost optimization settings.
 */
export const aiChatRouterTool: McpToolDefinition<AiChatRouterInput, {
    response: string;
    model: string;
    layer: string;
    tokens: { input: number; output: number; total: number };
    cost: number;
    routingSummary: string;
}> = {
    name: 'ai.chat_router',
    description: `Route a chat/task request through the AI gateway's intelligent N-layer routing system. 
The gateway automatically selects the optimal model based on:
- Task complexity (auto-detected or based on riskLevel)
- Cost optimization (free L0 models first, escalate only when needed)
- Quality requirements (based on priority setting)

Layers:
- L0 (Free): Local/OSS models, no cost
- L1 (Standard): Budget APIs, low cost  
- L2 (Premium): GPT-4, Claude, higher cost
- L3 (Elite): Best models, highest cost

The system uses smart routing to minimize cost while maximizing quality.`,
    category: 'ai',
    inputSchema: {
        type: 'object',
        properties: {
            task: {
                type: 'string',
                description: 'The task or question for the AI to process',
            },
            context: {
                type: 'string',
                description: 'Additional context: system info, data sensitivity, constraints',
            },
            riskLevel: {
                type: 'string',
                enum: ['low', 'normal', 'high', 'prod-critical'],
                default: 'normal',
                description: 'Risk level determines initial routing layer',
            },
            priority: {
                type: 'string',
                enum: ['speed', 'quality', 'cost'],
                default: 'quality',
                description: 'Priority mode: speed (fast/cheap), quality (best results), cost (minimize spend)',
            },
            maxTokens: {
                type: 'number',
                description: 'Maximum tokens for response (default: model-specific)',
                minimum: 1,
                maximum: 100000,
            },
            temperature: {
                type: 'number',
                description: 'Temperature for generation (0-2, default: 0.7)',
                minimum: 0,
                maximum: 2,
            },
        },
        required: ['task'],
    },
    handler: async (args: AiChatRouterInput): Promise<McpToolResult<{
        response: string;
        model: string;
        layer: string;
        tokens: { input: number; output: number; total: number };
        cost: number;
        routingSummary: string;
    }>> => {
        try {
            // Validate input
            const input = AiChatRouterInputSchema.parse(args);

            logger.info('ai.chat_router called', {
                taskPreview: input.task.substring(0, 100),
                riskLevel: input.riskLevel,
                priority: input.priority,
            });

            // Detect complexity if not forcing a specific layer
            const complexity = await detectComplexity(input.task);

            // Build routing context
            const priorityParams = priorityModeToParams(input.priority || 'quality');
            const preferredLayer = riskLevelToLayer(input.riskLevel || 'normal');

            // Build the prompt with context
            let prompt = input.task;
            if (input.context) {
                prompt = `Context: ${input.context}\n\nTask: ${input.task}`;
            }

            // Route the request
            const response = await routeRequest(
                {
                    prompt,
                    maxTokens: input.maxTokens,
                    temperature: input.temperature,
                },
                {
                    taskType: 'general',
                    complexity,
                    quality: priorityParams.quality,
                    preferredLayer,
                    enableCrossCheck: input.riskLevel === 'prod-critical',
                    enableAutoEscalate: input.riskLevel !== 'low',
                    budget: input.priority === 'cost' ? 0 : undefined,
                }
            );

            // Extract layer from model or routing summary
            const layerMatch = response.routingSummary?.match(/layer\s+(L\d)/i);
            const layer = layerMatch ? layerMatch[1] : 'unknown';

            return {
                success: true,
                data: {
                    response: response.content,
                    model: response.modelId,
                    layer,
                    tokens: {
                        input: response.inputTokens,
                        output: response.outputTokens,
                        total: response.inputTokens + response.outputTokens,
                    },
                    cost: response.cost,
                    routingSummary: response.routingSummary,
                },
                metadata: {
                    model: response.modelId,
                    layer,
                    inputTokens: response.inputTokens,
                    outputTokens: response.outputTokens,
                    cost: response.cost,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('ai.chat_router failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'CHAT_ROUTER_ERROR',
            };
        }
    },
};

// =============================================================================
// ai.code_agent Tool
// =============================================================================

/**
 * AI Code Agent Tool
 * 
 * Executes coding tasks with multi-model orchestration.
 * Can write SQL, Svelte, TypeScript, PowerShell, and more.
 */
export const aiCodeAgentTool: McpToolDefinition<AiCodeAgentInput, {
    code: string;
    explanation?: string;
    model: string;
    layer: string;
    tokens: { input: number; output: number; total: number };
    cost: number;
}> = {
    name: 'ai.code_agent',
    description: `Execute coding tasks using the AI gateway's code agent with multi-model orchestration.

Capabilities:
- Write code in any language (TypeScript, Python, SQL, Svelte, PowerShell, etc.)
- Analyze and refactor existing code
- Generate tests and documentation
- Debug and fix issues
- Create Kathara lab configurations

The code agent uses intelligent routing to select the best model for coding tasks,
with options for cost optimization and quality requirements.

Set allowClaudeCode=true for complex refactoring or multi-file tasks (requires Claude Code access).`,
    category: 'ai',
    inputSchema: {
        type: 'object',
        properties: {
            task: {
                type: 'string',
                description: 'The coding task description',
            },
            repoPath: {
                type: 'string',
                description: 'Path to the repository (for context)',
            },
            language: {
                type: 'string',
                description: 'Programming language (auto-detected if not specified)',
            },
            framework: {
                type: 'string',
                description: 'Framework being used (React, Svelte, Express, etc.)',
            },
            existingCode: {
                type: 'string',
                description: 'Existing code to modify/refactor',
            },
            constraints: {
                type: 'string',
                description: 'Constraints or specific requirements',
            },
            allowClaudeCode: {
                type: 'boolean',
                default: false,
                description: 'Allow using Claude Code for complex tasks',
            },
            quality: {
                type: 'string',
                enum: ['normal', 'high', 'critical'],
                default: 'normal',
                description: 'Quality requirement level',
            },
        },
        required: ['task'],
    },
    handler: async (args: AiCodeAgentInput): Promise<McpToolResult<{
        code: string;
        explanation?: string;
        model: string;
        layer: string;
        tokens: { input: number; output: number; total: number };
        cost: number;
    }>> => {
        try {
            // Validate input
            const input = AiCodeAgentInputSchema.parse(args);

            logger.info('ai.code_agent called', {
                taskPreview: input.task.substring(0, 100),
                language: input.language,
                framework: input.framework,
                quality: input.quality,
                allowClaudeCode: input.allowClaudeCode,
            });

            // Build context for the code agent
            const context: Record<string, unknown> = {};
            if (input.language) context.language = input.language;
            if (input.framework) context.framework = input.framework;
            if (input.existingCode) context.existingCode = input.existingCode;
            if (input.constraints) {
                context.requirements = [input.constraints];
            }

            // Call the existing code agent tool
            const result = await codeAgentTool.handler({
                task: input.task,
                context: Object.keys(context).length > 0 ? context : undefined,
                quality: input.quality || 'normal',
            });

            // Parse the result
            if (typeof result === 'object' && result !== null) {
                const typedResult = result as {
                    content?: string;
                    code?: string;
                    explanation?: string;
                    model?: string;
                    layer?: string;
                    inputTokens?: number;
                    outputTokens?: number;
                    cost?: number;
                    routingSummary?: string;
                };

                const code = typedResult.code || typedResult.content || JSON.stringify(result, null, 2);
                const model = typedResult.model || 'unknown';

                // Extract layer from routing summary or default
                const layerMatch = typedResult.routingSummary?.match(/layer\s+(L\d)/i);
                const layer = layerMatch ? layerMatch[1] : typedResult.layer || 'L0';

                return {
                    success: true,
                    data: {
                        code,
                        explanation: typedResult.explanation,
                        model,
                        layer,
                        tokens: {
                            input: typedResult.inputTokens || 0,
                            output: typedResult.outputTokens || 0,
                            total: (typedResult.inputTokens || 0) + (typedResult.outputTokens || 0),
                        },
                        cost: typedResult.cost || 0,
                    },
                    metadata: {
                        model,
                        layer,
                        inputTokens: typedResult.inputTokens,
                        outputTokens: typedResult.outputTokens,
                        cost: typedResult.cost,
                    },
                };
            }

            // Fallback for string result
            return {
                success: true,
                data: {
                    code: String(result),
                    model: 'unknown',
                    layer: 'L0',
                    tokens: { input: 0, output: 0, total: 0 },
                    cost: 0,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('ai.code_agent failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'CODE_AGENT_ERROR',
            };
        }
    },
};

// =============================================================================
// Export all AI tools
// =============================================================================

export const aiTools: McpToolDefinition[] = [
    aiChatRouterTool,
    aiCodeAgentTool,
];

export default aiTools;
