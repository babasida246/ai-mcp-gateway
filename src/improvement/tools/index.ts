import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../logging/logger.js';
import {
    selfImprovement,
    RegressionTest,
    RoutingHeuristic,
    BugPattern,
} from '../manager.js';
import { z } from 'zod';

// Tool schemas
const GenerateRegressionTestSchema = z.object({
    testName: z.string().describe('Unique test name'),
    category: z
        .string()
        .describe('Test category (e.g., routing, context, api)'),
    description: z.string().describe('What this test validates'),
    testCode: z.string().describe('Actual test code (TypeScript/Vitest)'),
    expectedBehavior: z.string().describe('Expected behavior description'),
    discoveredFrom: z
        .enum(['bug', 'pattern', 'user-feedback'])
        .describe('How this test was discovered'),
    metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
});

const UpdateRoutingHeuristicSchema = z.object({
    pattern: z.string().describe('Pattern to match (regex)'),
    preferredLayer: z
        .string()
        .describe('Preferred routing layer (fast/balanced/deep)'),
    preferredModel: z
        .string()
        .optional()
        .describe('Preferred model ID (optional)'),
    reasoning: z.string().describe('Why this heuristic is recommended'),
    successRate: z.number().optional().describe('Success rate (0-100)'),
    usageCount: z.number().optional().describe('Number of times used'),
    active: z.boolean().describe('Whether this heuristic is active'),
});

const RecordBugPatternSchema = z.object({
    category: z.string().describe('Bug category (e.g., timeout, parsing)'),
    pattern: z.string().describe('Pattern description'),
    description: z.string().describe('Detailed bug description'),
    solution: z.string().describe('How to fix this bug'),
    severity: z
        .enum(['low', 'medium', 'high', 'critical'])
        .describe('Bug severity level'),
});

const AnalyzeMetricsSchema = z.object({
    taskType: z
        .string()
        .optional()
        .describe('Filter by task type (optional)'),
    includeReport: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include full improvement report'),
});

const GetRegressionTestsSchema = z.object({
    category: z.string().optional().describe('Filter by category (optional)'),
});

const GetRoutingHeuristicsSchema = z.object({
    activeOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe('Return only active heuristics'),
});

const GetBugPatternsSchema = z.object({
    category: z.string().optional().describe('Filter by category (optional)'),
});

const RecordMetricSchema = z.object({
    name: z.string().describe('Metric name'),
    value: z.number().describe('Metric value'),
    unit: z.string().describe('Unit of measurement'),
    context: z.record(z.unknown()).optional().describe('Additional context'),
});

const UpdateModelPerformanceSchema = z.object({
    modelId: z.string().describe('Model identifier'),
    taskType: z.string().describe('Type of task'),
    success: z.boolean().describe('Whether the call was successful'),
    latencyMs: z.number().describe('Latency in milliseconds'),
    cost: z.number().describe('Cost in USD'),
});

/**
 * Register self-improvement MCP tools
 */
export function registerSelfImprovementTools(server: Server): void {
    const tools: Tool[] = [
        {
            name: 'generate_regression_test',
            description:
                'Generate and store a regression test based on discovered issues or patterns',
            inputSchema: {
                type: 'object',
                properties: {
                    testName: {
                        type: 'string',
                        description: 'Unique test name',
                    },
                    category: {
                        type: 'string',
                        description:
                            'Test category (e.g., routing, context, api)',
                    },
                    description: {
                        type: 'string',
                        description: 'What this test validates',
                    },
                    testCode: {
                        type: 'string',
                        description: 'Actual test code (TypeScript/Vitest)',
                    },
                    expectedBehavior: {
                        type: 'string',
                        description: 'Expected behavior description',
                    },
                    discoveredFrom: {
                        type: 'string',
                        enum: ['bug', 'pattern', 'user-feedback'],
                        description: 'How this test was discovered',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Additional metadata',
                    },
                },
                required: [
                    'testName',
                    'category',
                    'description',
                    'testCode',
                    'expectedBehavior',
                    'discoveredFrom',
                ],
            },
        },
        {
            name: 'update_routing_heuristic',
            description:
                'Update or create routing heuristic based on performance patterns',
            inputSchema: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Pattern to match (regex)' },
                    preferredLayer: {
                        type: 'string',
                        description:
                            'Preferred routing layer (fast/balanced/deep)',
                    },
                    preferredModel: {
                        type: 'string',
                        description: 'Preferred model ID (optional)',
                    },
                    reasoning: {
                        type: 'string',
                        description: 'Why this heuristic is recommended',
                    },
                    successRate: {
                        type: 'number',
                        description: 'Success rate (0-100)',
                    },
                    usageCount: {
                        type: 'number',
                        description: 'Number of times used',
                    },
                    active: {
                        type: 'boolean',
                        description: 'Whether this heuristic is active',
                    },
                },
                required: ['pattern', 'preferredLayer', 'reasoning', 'active'],
            },
        },
        {
            name: 'record_bug_pattern',
            description: 'Record a bug pattern for future reference and prevention',
            inputSchema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Bug category (e.g., timeout, parsing)',
                    },
                    pattern: { type: 'string', description: 'Pattern description' },
                    description: {
                        type: 'string',
                        description: 'Detailed bug description',
                    },
                    solution: {
                        type: 'string',
                        description: 'How to fix this bug',
                    },
                    severity: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical'],
                        description: 'Bug severity level',
                    },
                },
                required: [
                    'category',
                    'pattern',
                    'description',
                    'solution',
                    'severity',
                ],
            },
        },
        {
            name: 'analyze_metrics',
            description:
                'Analyze performance metrics and generate improvement recommendations',
            inputSchema: {
                type: 'object',
                properties: {
                    taskType: {
                        type: 'string',
                        description: 'Filter by task type (optional)',
                    },
                    includeReport: {
                        type: 'boolean',
                        description: 'Include full improvement report',
                        default: true,
                    },
                },
            },
        },
        {
            name: 'get_regression_tests',
            description: 'Get all regression tests, optionally filtered by category',
            inputSchema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Filter by category (optional)',
                    },
                },
            },
        },
        {
            name: 'get_routing_heuristics',
            description: 'Get routing heuristics for optimized routing decisions',
            inputSchema: {
                type: 'object',
                properties: {
                    activeOnly: {
                        type: 'boolean',
                        description: 'Return only active heuristics',
                        default: true,
                    },
                },
            },
        },
        {
            name: 'get_bug_patterns',
            description: 'Get known bug patterns, optionally filtered by category',
            inputSchema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Filter by category (optional)',
                    },
                },
            },
        },
        {
            name: 'record_metric',
            description: 'Record a performance metric for analysis',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Metric name' },
                    value: { type: 'number', description: 'Metric value' },
                    unit: { type: 'string', description: 'Unit of measurement' },
                    context: {
                        type: 'object',
                        description: 'Additional context',
                    },
                },
                required: ['name', 'value', 'unit'],
            },
        },
        {
            name: 'update_model_performance',
            description: 'Update model performance statistics',
            inputSchema: {
                type: 'object',
                properties: {
                    modelId: { type: 'string', description: 'Model identifier' },
                    taskType: { type: 'string', description: 'Type of task' },
                    success: {
                        type: 'boolean',
                        description: 'Whether the call was successful',
                    },
                    latencyMs: {
                        type: 'number',
                        description: 'Latency in milliseconds',
                    },
                    cost: { type: 'number', description: 'Cost in USD' },
                },
                required: ['modelId', 'taskType', 'success', 'latencyMs', 'cost'],
            },
        },
    ];

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case 'generate_regression_test': {
                    const validated = GenerateRegressionTestSchema.parse(args);
                    const test: RegressionTest = {
                        testName: validated.testName,
                        category: validated.category,
                        description: validated.description,
                        testCode: validated.testCode,
                        expectedBehavior: validated.expectedBehavior,
                        discoveredFrom: validated.discoveredFrom,
                        metadata: validated.metadata,
                    };
                    await selfImprovement.addRegressionTest(test);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Regression test "${validated.testName}" added successfully`,
                            },
                        ],
                    };
                }

                case 'update_routing_heuristic': {
                    const validated = UpdateRoutingHeuristicSchema.parse(args);
                    const heuristic: RoutingHeuristic = {
                        pattern: validated.pattern,
                        preferredLayer: validated.preferredLayer,
                        preferredModel: validated.preferredModel,
                        reasoning: validated.reasoning,
                        successRate: validated.successRate,
                        usageCount: validated.usageCount,
                        active: validated.active,
                    };
                    await selfImprovement.updateRoutingHeuristic(heuristic);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Routing heuristic for pattern "${validated.pattern}" updated`,
                            },
                        ],
                    };
                }

                case 'record_bug_pattern': {
                    const validated = RecordBugPatternSchema.parse(args);
                    const pattern: BugPattern = {
                        category: validated.category,
                        pattern: validated.pattern,
                        description: validated.description,
                        solution: validated.solution,
                        severity: validated.severity,
                        occurrences: 1,
                    };
                    await selfImprovement.recordBugPattern(pattern);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Bug pattern recorded: ${validated.pattern}`,
                            },
                        ],
                    };
                }

                case 'analyze_metrics': {
                    const validated = AnalyzeMetricsSchema.parse(args);
                    const analytics = await selfImprovement.getModelAnalytics(
                        validated.taskType
                    );

                    let result = `Model Performance Analysis:\n\n`;
                    analytics.forEach((a) => {
                        result += `${a.modelId} (${a.taskType}):\n`;
                        result += `  Success Rate: ${a.successRate.toFixed(2)}%\n`;
                        result += `  Avg Latency: ${a.avgLatencyMs}ms\n`;
                        result += `  Avg Cost: $${a.avgCost.toFixed(6)}\n`;
                        result += `  Total Calls: ${a.totalCalls}\n\n`;
                    });

                    if (validated.includeReport) {
                        const report = await selfImprovement.generateReport();
                        result += `\nSelf-Improvement Summary:\n`;
                        result += `  Regression Tests: ${report.regressionTests}\n`;
                        result += `  Bug Patterns: ${report.bugPatterns}\n`;
                        result += `  Routing Heuristics: ${report.routingHeuristics}\n`;
                        result += `\nTop Performing Models:\n`;
                        report.topModels.forEach((m) => {
                            result += `  ${m.model}: ${m.successRate.toFixed(2)}%\n`;
                        });
                    }

                    return {
                        content: [{ type: 'text', text: result }],
                    };
                }

                case 'get_regression_tests': {
                    const validated = GetRegressionTestsSchema.parse(args);
                    const tests = await selfImprovement.getRegressionTests(
                        validated.category
                    );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(tests, null, 2),
                            },
                        ],
                    };
                }

                case 'get_routing_heuristics': {
                    const validated = GetRoutingHeuristicsSchema.parse(args);
                    const heuristics =
                        await selfImprovement.getRoutingHeuristics(
                            validated.activeOnly
                        );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(heuristics, null, 2),
                            },
                        ],
                    };
                }

                case 'get_bug_patterns': {
                    const validated = GetBugPatternsSchema.parse(args);
                    const patterns = await selfImprovement.getBugPatterns(
                        validated.category
                    );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(patterns, null, 2),
                            },
                        ],
                    };
                }

                case 'record_metric': {
                    const validated = RecordMetricSchema.parse(args);
                    await selfImprovement.recordMetric(
                        validated.name,
                        validated.value,
                        validated.unit,
                        validated.context
                    );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Metric "${validated.name}" recorded: ${validated.value} ${validated.unit}`,
                            },
                        ],
                    };
                }

                case 'update_model_performance': {
                    const validated = UpdateModelPerformanceSchema.parse(args);
                    await selfImprovement.updateModelPerformance(
                        validated.modelId,
                        validated.taskType,
                        validated.success,
                        validated.latencyMs,
                        validated.cost
                    );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Model performance updated for ${validated.modelId}`,
                            },
                        ],
                    };
                }

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error) {
            logger.error('Self-improvement tool error', {
                tool: name,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
        }
    });

    logger.info('Self-improvement tools registered', { count: tools.length });
}
