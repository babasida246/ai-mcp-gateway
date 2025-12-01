/**
 * Request Tracer - Complete lifecycle tracking
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
    ITracer,
    RequestType,
    RequestTrace,
    RoutingDecision,
    LLMCallTrace,
    ToolCallTrace,
    ErrorInfo,
} from '../types/tracing.js';

export class Tracer implements ITracer {
    private activeTraces = new Map<string, RequestTrace>();

    constructor(private db: Pool) { }

    startTrace(
        requestType: RequestType,
        conversationId: string,
        payload: Record<string, unknown>,
    ): string {
        const traceId = randomUUID();
        const trace: RequestTrace = {
            id: traceId,
            conversationId,
            requestType,
            requestPayload: payload,
            routingDecisions: [],
            llmCalls: [],
            toolCalls: [],
            totalCost: 0,
            totalDurationMs: 0,
            createdAt: new Date(),
        };

        this.activeTraces.set(traceId, trace);
        return traceId;
    }

    recordRoutingDecision(
        traceId: string,
        decision: RoutingDecision,
    ): void {
        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            console.warn(`[Tracer] No active trace for ${traceId}`);
            return;
        }

        trace.routingDecisions.push(decision);
    }

    recordLLMCall(traceId: string, call: LLMCallTrace): void {
        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            console.warn(`[Tracer] No active trace for ${traceId}`);
            return;
        }

        trace.llmCalls.push(call);
        trace.totalCost += call.cost;
    }

    recordToolCall(traceId: string, call: ToolCallTrace): void {
        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            console.warn(`[Tracer] No active trace for ${traceId}`);
            return;
        }

        trace.toolCalls.push(call);
    }

    recordError(traceId: string, error: ErrorInfo): void {
        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            console.warn(`[Tracer] No active trace for ${traceId}`);
            return;
        }

        trace.errorInfo = error;
    }

    async endTrace(
        traceId: string,
        totalDurationMs: number,
    ): Promise<void> {
        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            console.warn(`[Tracer] No active trace for ${traceId}`);
            return;
        }

        trace.totalDurationMs = totalDurationMs;

        // Persist to database
        await this.saveTrace(trace);

        // Clean up
        this.activeTraces.delete(traceId);
    }

    async getTrace(traceId: string): Promise<RequestTrace | null> {
        const result = await this.db.query(
            `SELECT * FROM request_traces WHERE id = $1`,
            [traceId],
        );

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            conversationId: row.conversation_id,
            requestType: row.request_type,
            requestPayload: row.request_payload,
            routingDecisions: row.routing_decisions,
            llmCalls: row.llm_calls,
            toolCalls: row.tool_calls,
            totalCost: parseFloat(row.total_cost),
            totalDurationMs: row.total_duration_ms,
            errorInfo: row.error_info,
            createdAt: row.created_at,
        };
    }

    private async saveTrace(trace: RequestTrace): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO request_traces (
                    id,
                    conversation_id,
                    request_type,
                    request_payload,
                    routing_decisions,
                    llm_calls,
                    tool_calls,
                    total_cost,
                    total_duration_ms,
                    error_info,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    trace.id,
                    trace.conversationId,
                    trace.requestType,
                    JSON.stringify(trace.requestPayload),
                    JSON.stringify(trace.routingDecisions),
                    JSON.stringify(trace.llmCalls),
                    JSON.stringify(trace.toolCalls),
                    trace.totalCost,
                    trace.totalDurationMs,
                    trace.errorInfo
                        ? JSON.stringify(trace.errorInfo)
                        : null,
                    trace.createdAt,
                ],
            );
        } catch (error) {
            console.error('[Tracer] Failed to save trace:', error);
        }
    }
}

/**
 * Singleton instance
 */
let tracerInstance: Tracer | null = null;

export function initTracer(db: Pool): void {
    tracerInstance = new Tracer(db);
}

export function getTracer(): Tracer {
    if (!tracerInstance) {
        throw new Error('Tracer not initialized. Call initTracer() first.');
    }
    return tracerInstance;
}
