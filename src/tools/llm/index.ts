import { LLMClient } from './client.js';
import { AnthropicClient } from './anthropic.js';
import { OpenAIClient } from './openai.js';
import { OpenRouterClient } from './openrouter.js';
import { OSSLocalClient } from './oss-local.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { logger } from '../../logging/logger.js';
import { metrics } from '../../logging/metrics.js';

/**
 * Registry of all LLM clients
 */
const clients: LLMClient[] = [
    new AnthropicClient(),
    new OpenAIClient(),
    new OpenRouterClient(),
    new OSSLocalClient(),
];

/**
 * Call an LLM with the given model
 */
export async function callLLM(
    request: LLMRequest,
    model: ModelConfig,
): Promise<Omit<LLMResponse, 'routingSummary'>> {
    const client = clients.find((c) => c.canHandle(model.provider));

    if (!client) {
        throw new Error(`No client found for provider: ${model.provider}`);
    }

    logger.debug('Calling LLM', {
        modelId: model.id,
        provider: model.provider,
        layer: model.layer,
    });

    const startTime = Date.now();
    const response = await client.call(request, model);
    const duration = Date.now() - startTime;

    // Record metrics
    metrics.recordLLMCall(
        response.inputTokens,
        response.outputTokens,
        response.cost,
    );

    logger.debug('LLM call completed', {
        modelId: model.id,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(6),
        duration,
    });

    return response;
}

export { LLMClient };
