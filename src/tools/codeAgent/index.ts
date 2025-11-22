import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CodeAgentRequestSchema } from '../../mcp/types.js';
import { routeRequest } from '../../routing/router.js';
import { logger } from '../../logging/logger.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load system instructions
const INSTRUCTIONS = readFileSync(
    join(__dirname, 'instructions.md'),
    'utf-8',
);

/**
 * Code Agent MCP Tool
 * Handles coding tasks with multi-model orchestration
 */
export const codeAgentTool = {
    name: 'code_agent',
    description:
        'AI Code Agent that can analyze requirements, write code, refactor, debug, and write tests. Uses multi-model orchestration with cost optimization.',
    inputSchema: {
        type: 'object',
        properties: {
            task: {
                type: 'string',
                description: 'The coding task description',
            },
            context: {
                type: 'object',
                description: 'Additional context for the task',
                properties: {
                    language: { type: 'string' },
                    framework: { type: 'string' },
                    existingCode: { type: 'string' },
                    requirements: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            },
            quality: {
                type: 'string',
                enum: ['normal', 'high', 'critical'],
                description: 'Quality requirement level',
                default: 'normal',
            },
        },
        required: ['task'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            // Validate input
            const request = CodeAgentRequestSchema.parse(args);

            logger.info('Code Agent task received', {
                taskPreview: request.task.substring(0, 100),
                quality: request.quality,
                language: request.context?.language,
            });

            // Build system prompt with instructions
            const systemPrompt = INSTRUCTIONS;

            // Build user prompt with task and context
            let userPrompt = `Task: ${request.task}\n\n`;

            if (request.context) {
                if (request.context.language) {
                    userPrompt += `Language: ${request.context.language}\n`;
                }
                if (request.context.framework) {
                    userPrompt += `Framework: ${request.context.framework}\n`;
                }
                if (request.context.existingCode) {
                    userPrompt += `\nExisting Code:\n\`\`\`\n${request.context.existingCode}\n\`\`\`\n`;
                }
                if (request.context.requirements) {
                    userPrompt += `\nRequirements:\n${request.context.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`;
                }
            }

            // Determine complexity (simple heuristic)
            const taskLower = request.task.toLowerCase();
            let complexity: 'low' | 'medium' | 'high' = 'medium';

            if (
                taskLower.includes('simple') ||
                taskLower.includes('basic') ||
                request.task.length < 100
            ) {
                complexity = 'low';
            } else if (
                taskLower.includes('complex') ||
                taskLower.includes('advanced') ||
                taskLower.includes('refactor') ||
                taskLower.includes('architecture')
            ) {
                complexity = 'high';
            }

            // Route the request
            const response = await routeRequest(
                {
                    prompt: userPrompt,
                    systemPrompt,
                    maxTokens: 8000,
                    temperature: 0.7,
                },
                {
                    taskType: 'code',
                    complexity,
                    quality: request.quality,
                    enableCrossCheck: request.quality !== 'normal', // Enable cross-check for high/critical
                },
            );

            logger.info('Code Agent task completed', {
                modelUsed: response.modelId,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                cost: response.cost,
            });

            return {
                success: true,
                data: {
                    result: response.content,
                    routing: {
                        summary: response.routingSummary,
                        modelId: response.modelId,
                        provider: response.provider,
                        tokens: {
                            input: response.inputTokens,
                            output: response.outputTokens,
                            total: response.inputTokens + response.outputTokens,
                        },
                        cost: response.cost,
                    },
                },
            };
        } catch (error) {
            logger.error('Code Agent error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};
