import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';

/**
 * Base interface for all LLM clients
 */
export interface LLMClient {
    /**
     * Call the LLM with the given request
     */
    call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>>;

    /**
     * Check if this client can handle the given provider
     */
    canHandle(provider: string): boolean;
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
}

/**
 * Calculate cost based on tokens and model pricing
 */
export function calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelConfig,
): number {
    if (!model.pricePer1kInputTokens || !model.pricePer1kOutputTokens) {
        return 0;
    }

    const inputCost = (inputTokens / 1000) * model.pricePer1kInputTokens;
    const outputCost = (outputTokens / 1000) * model.pricePer1kOutputTokens;

    return inputCost + outputCost;
}
