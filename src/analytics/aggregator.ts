/**
 * Analytics Aggregator - SQL queries for usage analytics
 */

import { Pool } from 'pg';
import type {
    AnalyticsQuery,
    AnalyticsResponse,
    LayerMetrics,
    ModelMetrics,
    DailyMetrics,
} from '../types/tracing.js';

export class AnalyticsAggregator {
    constructor(private db: Pool) {}

    async getAnalytics(
        query: AnalyticsQuery,
    ): Promise<AnalyticsResponse> {
        const { projectId, userId, startDate, endDate, groupBy = 'day' } = query;

        // Build WHERE clause
        const conditions: string[] = ['1=1'];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (projectId) {
            params.push(projectId);
            conditions.push(`c.project_id = $${paramIndex++}`);
        }

        if (userId) {
            params.push(userId);
            conditions.push(`c.user_id = $${paramIndex++}`);
        }

        if (startDate) {
            params.push(startDate);
            conditions.push(`rt.created_at >= $${paramIndex++}`);
        }

        if (endDate) {
            params.push(endDate);
            conditions.push(`rt.created_at <= $${paramIndex++}`);
        }

        const whereClause = conditions.join(' AND ');

        // Get totals
        const totalsQuery = `
            SELECT
                COUNT(*) as total_requests,
                COALESCE(SUM((llm_call->>'inputTokens')::int), 0) as input_tokens,
                COALESCE(SUM((llm_call->>'outputTokens')::int), 0) as output_tokens,
                COALESCE(SUM(total_cost), 0) as total_cost
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            CROSS JOIN LATERAL jsonb_array_elements(rt.llm_calls) AS llm_call
            WHERE ${whereClause}
        `;

        const totalsResult = await this.db.query(totalsQuery, params);
        const totals = totalsResult.rows[0];

        // Get breakdown by layer
        const byLayer = await this.getLayerBreakdown(whereClause, params);

        // Get breakdown by model
        const byModel = await this.getModelBreakdown(whereClause, params);

        // Get daily metrics
        const byDay = await this.getDailyMetrics(whereClause, params, groupBy);

        return {
            timeRange: {
                start: startDate || 'all',
                end: endDate || 'all',
            },
            totalRequests: parseInt(totals.total_requests),
            totalTokens: {
                input: parseInt(totals.input_tokens),
                output: parseInt(totals.output_tokens),
                total: parseInt(totals.input_tokens) + parseInt(totals.output_tokens),
            },
            totalCost: parseFloat(totals.total_cost),
            breakdown: {
                byLayer,
                byModel,
                byDay,
            },
        };
    }

    private async getLayerBreakdown(
        whereClause: string,
        params: unknown[],
    ): Promise<Record<string, LayerMetrics>> {
        const query = `
            SELECT
                routing_decision->>'layer' as layer,
                COUNT(*) as requests,
                COALESCE(SUM((llm_call->>'inputTokens')::int + (llm_call->>'outputTokens')::int), 0) as tokens,
                COALESCE(SUM(total_cost), 0) as cost,
                COALESCE(AVG(total_duration_ms), 0) as avg_duration_ms,
                (1.0 - COALESCE(SUM(CASE WHEN error_info IS NOT NULL THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0)) as success_rate
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            CROSS JOIN LATERAL jsonb_array_elements(rt.routing_decisions) AS routing_decision
            LEFT JOIN LATERAL jsonb_array_elements(rt.llm_calls) AS llm_call ON true
            WHERE ${whereClause}
            GROUP BY routing_decision->>'layer'
        `;

        const result = await this.db.query(query, params);

        const breakdown: Record<string, LayerMetrics> = {};
        for (const row of result.rows) {
            breakdown[row.layer] = {
                requests: parseInt(row.requests),
                tokens: parseInt(row.tokens),
                cost: parseFloat(row.cost),
                avgDurationMs: parseFloat(row.avg_duration_ms),
                successRate: parseFloat(row.success_rate),
            };
        }

        return breakdown;
    }

    private async getModelBreakdown(
        whereClause: string,
        params: unknown[],
    ): Promise<Record<string, ModelMetrics>> {
        const query = `
            SELECT
                llm_call->>'model' as model,
                COUNT(*) as requests,
                COALESCE(SUM((llm_call->>'inputTokens')::int), 0) as input_tokens,
                COALESCE(SUM((llm_call->>'outputTokens')::int), 0) as output_tokens,
                COALESCE(SUM((llm_call->>'cost')::float), 0) as cost,
                COALESCE(AVG((llm_call->>'durationMs')::int), 0) as avg_duration_ms,
                SUM(CASE WHEN llm_call->>'error' IS NOT NULL THEN 1 ELSE 0 END) as errors
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            CROSS JOIN LATERAL jsonb_array_elements(rt.llm_calls) AS llm_call
            WHERE ${whereClause}
            GROUP BY llm_call->>'model'
        `;

        const result = await this.db.query(query, params);

        const breakdown: Record<string, ModelMetrics> = {};
        for (const row of result.rows) {
            breakdown[row.model] = {
                requests: parseInt(row.requests),
                tokens: {
                    input: parseInt(row.input_tokens),
                    output: parseInt(row.output_tokens),
                    total: parseInt(row.input_tokens) + parseInt(row.output_tokens),
                },
                cost: parseFloat(row.cost),
                avgDurationMs: parseFloat(row.avg_duration_ms),
                errors: parseInt(row.errors),
            };
        }

        return breakdown;
    }

    private async getDailyMetrics(
        whereClause: string,
        params: unknown[],
        groupBy: 'day' | 'week' | 'month',
    ): Promise<DailyMetrics[]> {
        const dateFormat =
            groupBy === 'day'
                ? 'YYYY-MM-DD'
                : groupBy === 'week'
                  ? 'YYYY-"W"IW'
                  : 'YYYY-MM';

        const query = `
            SELECT
                TO_CHAR(rt.created_at, '${dateFormat}') as date,
                COUNT(*) as requests,
                COALESCE(SUM((llm_call->>'inputTokens')::int + (llm_call->>'outputTokens')::int), 0) as tokens,
                COALESCE(SUM(total_cost), 0) as cost,
                COALESCE(AVG(total_duration_ms), 0) as avg_duration_ms
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            LEFT JOIN LATERAL jsonb_array_elements(rt.llm_calls) AS llm_call ON true
            WHERE ${whereClause}
            GROUP BY TO_CHAR(rt.created_at, '${dateFormat}')
            ORDER BY date DESC
            LIMIT 30
        `;

        const result = await this.db.query(query, params);

        return result.rows.map((row) => ({
            date: row.date,
            requests: parseInt(row.requests),
            tokens: parseInt(row.tokens),
            cost: parseFloat(row.cost),
            avgDurationMs: parseFloat(row.avg_duration_ms),
        }));
    }

    /**
     * Get top N most expensive requests
     */
    async getTopExpensiveRequests(
        projectId: string,
        limit = 10,
    ): Promise<Array<{
        traceId: string;
        cost: number;
        durationMs: number;
        requestType: string;
        createdAt: Date;
    }>> {
        const query = `
            SELECT
                rt.id as trace_id,
                rt.total_cost as cost,
                rt.total_duration_ms as duration_ms,
                rt.request_type,
                rt.created_at
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            WHERE c.project_id = $1
            ORDER BY rt.total_cost DESC
            LIMIT $2
        `;

        const result = await this.db.query(query, [projectId, limit]);

        return result.rows.map((row) => ({
            traceId: row.trace_id,
            cost: parseFloat(row.cost),
            durationMs: row.duration_ms,
            requestType: row.request_type,
            createdAt: row.created_at,
        }));
    }

    /**
     * Get error rate by model
     */
    async getErrorRateByModel(
        projectId: string,
    ): Promise<Array<{
        model: string;
        totalCalls: number;
        errors: number;
        errorRate: number;
    }>> {
        const query = `
            SELECT
                llm_call->>'model' as model,
                COUNT(*) as total_calls,
                SUM(CASE WHEN llm_call->>'error' IS NOT NULL THEN 1 ELSE 0 END) as errors,
                (SUM(CASE WHEN llm_call->>'error' IS NOT NULL THEN 1 ELSE 0 END)::float / COUNT(*)) as error_rate
            FROM request_traces rt
            LEFT JOIN conversations c ON rt.conversation_id = c.id
            CROSS JOIN LATERAL jsonb_array_elements(rt.llm_calls) AS llm_call
            WHERE c.project_id = $1
            GROUP BY llm_call->>'model'
            ORDER BY error_rate DESC
        `;

        const result = await this.db.query(query, [projectId]);

        return result.rows.map((row) => ({
            model: row.model,
            totalCalls: parseInt(row.total_calls),
            errors: parseInt(row.errors),
            errorRate: parseFloat(row.error_rate),
        }));
    }
}
