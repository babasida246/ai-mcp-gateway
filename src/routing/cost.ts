import { ModelConfig } from '../../config/models.js';

/**
 * Calculate cost for an LLM call
 */
export function estimateCost(
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

/**
 * Compare costs of different models
 */
export function compareCosts(modelA: ModelConfig, modelB: ModelConfig): number {
    return modelA.relativeCost - modelB.relativeCost;
}

/**
 * Get cheapest model from a list
 */
export function getCheapestModel(models: ModelConfig[]): ModelConfig | undefined {
    if (models.length === 0) return undefined;
    return models.reduce((cheapest, current) =>
        current.relativeCost < cheapest.relativeCost ? current : cheapest
    );
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
    if (cost === 0) return 'Free';
    if (cost < 0.001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
}
