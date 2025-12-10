/**
 * @file Ops MCP Tools
 * @description Operations tools for cost reporting, tracing, and system monitoring.
 * 
 * Tools in this module:
 * - ops.cost_report: Get cost/token usage analytics
 * - ops.trace_session: Trace and debug session/request lifecycle
 */

import {
    McpToolDefinition,
    McpToolResult,
    OpsCostReportInput,
    OpsCostReportInputSchema,
    OpsTraceSessionInput,
    OpsTraceSessionInputSchema,
} from '../adapter/types.js';
import { logger } from '../../logging/logger.js';
import { db } from '../../db/postgres.js';
import { AnalyticsAggregator } from '../../analytics/aggregator.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert range string to date range.
 */
function rangeToDateRange(range?: string): { startDate?: Date; endDate?: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
        case 'today':
            return { startDate: today };
        case 'yesterday': {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return { startDate: yesterday, endDate: today };
        }
        case 'last_7_days': {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return { startDate: weekAgo };
        }
        case 'this_month':
            return { startDate: new Date(now.getFullYear(), now.getMonth(), 1) };
        case 'last_month': {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            return { startDate: lastMonthStart, endDate: lastMonthEnd };
        }
        default:
            // Default to last 7 days
            const defaultStart = new Date(today);
            defaultStart.setDate(defaultStart.getDate() - 7);
            return { startDate: defaultStart };
    }
}

// =============================================================================
// ops.cost_report Tool
// =============================================================================

/**
 * Cost Report Tool
 * 
 * Generates cost and token usage reports with various groupings.
 */
export const opsCostReportTool: McpToolDefinition<OpsCostReportInput, {
    timeRange: {
        start: string;
        end: string;
    };
    summary: {
        totalRequests: number;
        totalCost: number;
        totalTokens: {
            input: number;
            output: number;
            total: number;
        };
        avgCostPerRequest: number;
        avgTokensPerRequest: number;
    };
    breakdown: {
        byLayer?: Record<string, {
            requests: number;
            cost: number;
            tokens: number;
            percentage: number;
        }>;
        byModel?: Record<string, {
            requests: number;
            cost: number;
            tokens: number;
            percentage: number;
        }>;
        byDay?: Array<{
            date: string;
            requests: number;
            cost: number;
            tokens: number;
        }>;
    };
}> = {
    name: 'ops.cost_report',
    description: `Generate cost and token usage analytics reports.

Time ranges:
- today: Current day
- yesterday: Previous day
- last_7_days: Last 7 days (default)
- this_month: Current month
- last_month: Previous month

Grouping options:
- model: Breakdown by AI model
- level/layer: Breakdown by routing layer (L0-L3)
- user: Breakdown by user
- project: Breakdown by project

Returns detailed metrics including:
- Total requests, cost, and tokens
- Average cost and tokens per request
- Breakdown by selected dimension
- Daily trends

Requires database connection for full functionality.`,
    category: 'ops',
    inputSchema: {
        type: 'object',
        properties: {
            range: {
                type: 'string',
                enum: ['today', 'yesterday', 'last_7_days', 'this_month', 'last_month'],
                description: 'Time range for the report',
            },
            groupBy: {
                type: 'string',
                enum: ['model', 'level', 'user', 'project'],
                description: 'Grouping dimension for breakdown',
            },
            project: {
                type: 'string',
                description: 'Filter by specific project',
            },
        },
        required: [],
    },
    handler: async (args: OpsCostReportInput): Promise<McpToolResult<{
        timeRange: {
            start: string;
            end: string;
        };
        summary: {
            totalRequests: number;
            totalCost: number;
            totalTokens: {
                input: number;
                output: number;
                total: number;
            };
            avgCostPerRequest: number;
            avgTokensPerRequest: number;
        };
        breakdown: {
            byLayer?: Record<string, {
                requests: number;
                cost: number;
                tokens: number;
                percentage: number;
            }>;
            byModel?: Record<string, {
                requests: number;
                cost: number;
                tokens: number;
                percentage: number;
            }>;
            byDay?: Array<{
                date: string;
                requests: number;
                cost: number;
                tokens: number;
            }>;
        };
    }>> => {
        try {
            const input = OpsCostReportInputSchema.parse(args);

            logger.info('ops.cost_report called', {
                range: input.range,
                groupBy: input.groupBy,
                project: input.project,
            });

            const { startDate, endDate } = rangeToDateRange(input.range);

            // Check if database is available
            if (!db.isReady()) {
                logger.warn('Database not available for cost report');

                // Return mock data when DB is unavailable
                return {
                    success: true,
                    data: {
                        timeRange: {
                            start: startDate?.toISOString() || 'all',
                            end: endDate?.toISOString() || 'now',
                        },
                        summary: {
                            totalRequests: 0,
                            totalCost: 0,
                            totalTokens: { input: 0, output: 0, total: 0 },
                            avgCostPerRequest: 0,
                            avgTokensPerRequest: 0,
                        },
                        breakdown: {},
                    },
                    metadata: {
                        note: 'Database not available - returning empty report',
                    },
                };
            }

            // Use the analytics aggregator
            const aggregator = new AnalyticsAggregator(db.getPool());

            const analytics = await aggregator.getAnalytics({
                projectId: input.project,
                startDate: startDate?.toISOString(),
                endDate: endDate?.toISOString(),
                groupBy: 'day',
            });

            // Calculate averages
            const totalRequests = analytics.totalRequests;
            const totalTokens = analytics.totalTokens.total;
            const avgCostPerRequest = totalRequests > 0 ? analytics.totalCost / totalRequests : 0;
            const avgTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;

            // Build breakdown based on groupBy
            const breakdown: {
                byLayer?: Record<string, { requests: number; cost: number; tokens: number; percentage: number }>;
                byModel?: Record<string, { requests: number; cost: number; tokens: number; percentage: number }>;
                byDay?: Array<{ date: string; requests: number; cost: number; tokens: number }>;
            } = {};

            if (input.groupBy === 'level' || input.groupBy === 'model' || !input.groupBy) {
                // Convert layer breakdown
                if (analytics.breakdown?.byLayer) {
                    breakdown.byLayer = {};
                    for (const [layer, metrics] of Object.entries(analytics.breakdown.byLayer)) {
                        breakdown.byLayer[layer] = {
                            requests: metrics.requests,
                            cost: metrics.cost,
                            tokens: metrics.inputTokens + metrics.outputTokens,
                            percentage: totalRequests > 0 ? (metrics.requests / totalRequests) * 100 : 0,
                        };
                    }
                }

                // Convert model breakdown
                if (analytics.breakdown?.byModel) {
                    breakdown.byModel = {};
                    for (const [model, metrics] of Object.entries(analytics.breakdown.byModel)) {
                        breakdown.byModel[model] = {
                            requests: metrics.requests,
                            cost: metrics.cost,
                            tokens: metrics.inputTokens + metrics.outputTokens,
                            percentage: totalRequests > 0 ? (metrics.requests / totalRequests) * 100 : 0,
                        };
                    }
                }
            }

            // Always include daily breakdown
            if (analytics.breakdown?.byDay) {
                breakdown.byDay = analytics.breakdown.byDay.map(day => ({
                    date: day.date,
                    requests: day.requests,
                    cost: day.cost,
                    tokens: day.inputTokens + day.outputTokens,
                }));
            }

            return {
                success: true,
                data: {
                    timeRange: {
                        start: startDate?.toISOString() || 'all',
                        end: endDate?.toISOString() || 'now',
                    },
                    summary: {
                        totalRequests,
                        totalCost: analytics.totalCost,
                        totalTokens: analytics.totalTokens,
                        avgCostPerRequest,
                        avgTokensPerRequest,
                    },
                    breakdown,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('ops.cost_report failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'COST_REPORT_ERROR',
            };
        }
    },
};

// =============================================================================
// ops.trace_session Tool
// =============================================================================

/**
 * Trace Session Tool
 * 
 * Traces and debugs request/session lifecycle.
 */
export const opsTraceSessionTool: McpToolDefinition<OpsTraceSessionInput, {
    sessionId: string;
    found: boolean;
    trace?: {
        id: string;
        conversationId: string;
        requestType: string;
        createdAt: string;
        totalDuration: number;
        totalCost: number;
        routing: Array<{
            layer: string;
            model: string;
            reason: string;
            timestamp: string;
        }>;
        llmCalls: Array<{
            model: string;
            layer: string;
            inputTokens: number;
            outputTokens: number;
            cost: number;
            duration: number;
            success: boolean;
        }>;
        toolCalls: Array<{
            tool: string;
            duration: number;
            success: boolean;
            error?: string;
        }>;
        error?: {
            message: string;
            code?: string;
            step?: string;
        };
    };
}> = {
    name: 'ops.trace_session',
    description: `Trace and debug a session or request by ID.

Provides detailed lifecycle information:
- Request type and timestamp
- Routing decisions (which layer/model was selected)
- LLM calls with token counts and costs
- Tool calls with execution times
- Errors encountered at any step

Detail levels:
- summary: Basic info + routing decisions
- full: Complete trace including all LLM/tool calls

Use this for:
- Debugging failed requests
- Understanding routing decisions
- Cost analysis per request
- Performance optimization

Requires database connection for full functionality.`,
    category: 'ops',
    inputSchema: {
        type: 'object',
        properties: {
            sessionId: {
                type: 'string',
                description: 'Session or trace ID to look up',
            },
            detailLevel: {
                type: 'string',
                enum: ['summary', 'full'],
                default: 'summary',
                description: 'Detail level for the trace',
            },
        },
        required: ['sessionId'],
    },
    handler: async (args: OpsTraceSessionInput): Promise<McpToolResult<{
        sessionId: string;
        found: boolean;
        trace?: {
            id: string;
            conversationId: string;
            requestType: string;
            createdAt: string;
            totalDuration: number;
            totalCost: number;
            routing: Array<{
                layer: string;
                model: string;
                reason: string;
                timestamp: string;
            }>;
            llmCalls: Array<{
                model: string;
                layer: string;
                inputTokens: number;
                outputTokens: number;
                cost: number;
                duration: number;
                success: boolean;
            }>;
            toolCalls: Array<{
                tool: string;
                duration: number;
                success: boolean;
                error?: string;
            }>;
            error?: {
                message: string;
                code?: string;
                step?: string;
            };
        };
    }>> => {
        try {
            const input = OpsTraceSessionInputSchema.parse(args);

            logger.info('ops.trace_session called', {
                sessionId: input.sessionId,
                detailLevel: input.detailLevel,
            });

            // Check if database is available
            if (!db.isReady()) {
                logger.warn('Database not available for trace lookup');

                return {
                    success: true,
                    data: {
                        sessionId: input.sessionId,
                        found: false,
                    },
                    metadata: {
                        note: 'Database not available - cannot lookup trace',
                    },
                };
            }

            // Query the trace from database
            const pool = db.getPool();

            const traceQuery = `
                SELECT 
                    rt.id,
                    rt.conversation_id,
                    rt.request_type,
                    rt.routing_decisions,
                    rt.llm_calls,
                    rt.tool_calls,
                    rt.total_cost,
                    rt.total_duration_ms,
                    rt.error_info,
                    rt.created_at
                FROM request_traces rt
                WHERE rt.id = $1 OR rt.conversation_id = $1
                ORDER BY rt.created_at DESC
                LIMIT 1
            `;

            const result = await pool.query(traceQuery, [input.sessionId]);

            if (result.rows.length === 0) {
                return {
                    success: true,
                    data: {
                        sessionId: input.sessionId,
                        found: false,
                    },
                };
            }

            const row = result.rows[0];

            // Parse routing decisions
            const routing = (row.routing_decisions || []).map((rd: any) => ({
                layer: rd.layer || 'unknown',
                model: rd.selectedModel || 'unknown',
                reason: rd.reason || '',
                timestamp: rd.timestamp || row.created_at,
            }));

            // Parse LLM calls
            const llmCalls = (row.llm_calls || []).map((call: any) => ({
                model: call.model || 'unknown',
                layer: call.layer || 'unknown',
                inputTokens: call.inputTokens || 0,
                outputTokens: call.outputTokens || 0,
                cost: call.cost || 0,
                duration: call.durationMs || 0,
                success: !call.error,
            }));

            // Parse tool calls (only for full detail)
            const toolCalls = input.detailLevel === 'full'
                ? (row.tool_calls || []).map((call: any) => ({
                    tool: call.tool || 'unknown',
                    duration: call.durationMs || 0,
                    success: !call.error,
                    error: call.error,
                }))
                : [];

            // Parse error info
            const error = row.error_info ? {
                message: row.error_info.message || 'Unknown error',
                code: row.error_info.code,
                step: row.error_info.step,
            } : undefined;

            return {
                success: true,
                data: {
                    sessionId: input.sessionId,
                    found: true,
                    trace: {
                        id: row.id,
                        conversationId: row.conversation_id,
                        requestType: row.request_type,
                        createdAt: row.created_at.toISOString(),
                        totalDuration: row.total_duration_ms,
                        totalCost: parseFloat(row.total_cost) || 0,
                        routing,
                        llmCalls,
                        toolCalls,
                        error,
                    },
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('ops.trace_session failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'TRACE_SESSION_ERROR',
            };
        }
    },
};

// =============================================================================
// Export all Ops tools
// =============================================================================

export const opsTools: McpToolDefinition[] = [
    opsCostReportTool,
    opsTraceSessionTool,
];

export default opsTools;
