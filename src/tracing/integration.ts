/**
 * Tracing integration for routing and LLM calls
 */

import type { LLMRequest, LLMResponse } from '../mcp/types.js';
import type { ModelConfig } from '../config/models.js';
import type { RoutingDecision, LLMCallTrace } from '../types/tracing.js';

let tracerEnabled = false;
let currentTraceId: string | null = null;

/**
 * Enable tracing for current request
 */
export function enableTracingForRequest(traceId: string): void {
    tracerEnabled = true;
    currentTraceId = traceId;
}

/**
 * Disable tracing
 */
export function disableTracing(): void {
    tracerEnabled = false;
    currentTraceId = null;
}

/**
 * Get current trace ID
 */
export function getCurrentTraceId(): string | null {
    return currentTraceId;
}

/**
 * Record a routing decision
 */
export async function recordRoutingDecision(
    decision: RoutingDecision,
): Promise<void> {
    if (!tracerEnabled || !currentTraceId) return;

    try {
        const { getTracer } = await import('../tracing/tracer.js');
        const tracer = getTracer();
        tracer.recordRoutingDecision(currentTraceId, decision);
    } catch (error) {
        // Silently fail if tracer not initialized
        console.debug('[Tracing] Failed to record routing decision:', error);
    }
}

/**
 * Record an LLM call with timing
 */
export async function recordLLMCall(
    model: ModelConfig,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    durationMs: number,
    error?: string,
): Promise<void> {
    if (!tracerEnabled || !currentTraceId) return;

    try {
        const { getTracer } = await import('../tracing/tracer.js');
        const tracer = getTracer();
        
        const llmCall: LLMCallTrace = {
            model: model.id,
            provider: model.provider,
            inputTokens,
            outputTokens,
            cost,
            durationMs,
            startTime: Date.now() - durationMs,
            endTime: Date.now(),
            error,
        };

        tracer.recordLLMCall(currentTraceId, llmCall);
    } catch (error) {
        console.debug('[Tracing] Failed to record LLM call:', error);
    }
}

/**
 * Wrapper for callLLM that records traces
 */
export async function callLLMWithTracing(
    request: LLMRequest,
    model: ModelConfig,
    originalCallLLM: (req: LLMRequest, model: ModelConfig) => Promise<LLMResponse>,
): Promise<LLMResponse> {
    const startTime = Date.now();
    let response: LLMResponse | undefined;
    let error: string | undefined;

    try {
        response = await originalCallLLM(request, model);
    } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
    } finally {
        const durationMs = Date.now() - startTime;
        
        // Record the LLM call even if it failed
        if (tracerEnabled && currentTraceId && response) {
            await recordLLMCall(
                model,
                response.inputTokens,
                response.outputTokens,
                response.cost,
                durationMs,
                error,
            );
        }
    }

    return response;
}
