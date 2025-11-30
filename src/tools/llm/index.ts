import { LLMClient } from './client.js';
import { AnthropicClient } from './anthropic.js';
import { OpenAIClient } from './openai.js';
import { OpenRouterClient } from './openrouter.js';
import { OSSLocalClient } from './oss-local.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig, ModelProvider } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { metrics } from '../../logging/metrics.js';
import { providerHealth } from '../../config/provider-health.js';

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
 * Get a fallback model configuration when primary provider fails
 */
function getFallbackModel(originalModel: ModelConfig): ModelConfig | null {
    const originalProvider = originalModel.provider;

    // Determine replacement model based on original provider
    let fallbackModelName: string;

    if (originalProvider === 'openai') {
        // Use OpenRouter model configured to replace OpenAI
        fallbackModelName = env.OPENROUTER_REPLACE_OPENAI;
    } else if (originalProvider === 'anthropic') {
        // Use OpenRouter model configured to replace Claude
        fallbackModelName = env.OPENROUTER_REPLACE_CLAUDE;
    } else {
        // For other providers, use first fallback model
        const fallbackModels = env.OPENROUTER_FALLBACK_MODELS.split(',').map((m: string) => m.trim());
        if (fallbackModels.length === 0) return null;
        fallbackModelName = fallbackModels[0];
    }

    return {
        id: `openrouter-fallback-${fallbackModelName}`,
        provider: 'openrouter',
        apiModelName: fallbackModelName,
        layer: originalModel.layer,
        relativeCost: 0,
        capabilities: originalModel.capabilities,
        contextWindow: originalModel.contextWindow,
        enabled: true,
    };
}

/**
 * Try to call LLM with fallback logic based on provider health
 */
async function callLLMWithFallback(
    request: LLMRequest,
    model: ModelConfig,
): Promise<Omit<LLMResponse, 'routingSummary'>> {
    const originalProvider = model.provider;

    // Check if the original provider is healthy
    const isHealthy = await providerHealth.isProviderHealthy(originalProvider);

    if (!isHealthy) {
        logger.warn(`Provider ${originalProvider} is not healthy, attempting fallback`);

        // Try OpenRouter first if not the original provider
        if (originalProvider !== 'openrouter' && await providerHealth.isProviderHealthy('openrouter')) {
            const fallbackModel = getFallbackModel(model);
            if (fallbackModel) {
                logger.info(`Falling back to OpenRouter model: ${fallbackModel.apiModelName}`);
                const openRouterClient = clients.find((c) => c.canHandle('openrouter'));
                if (openRouterClient) {
                    try {
                        return await openRouterClient.call(request, fallbackModel);
                    } catch (error) {
                        logger.error(`OpenRouter fallback failed: ${error}`);
                        providerHealth.markProviderUnhealthy('openrouter');
                    }
                }
            }
        }

        // Try OSS Local as last resort if enabled and healthy
        if (originalProvider !== 'oss-local' && await providerHealth.isProviderHealthy('oss-local')) {
            logger.info('Falling back to OSS Local model');
            const ossClient = clients.find((c) => c.canHandle('oss-local'));
            if (ossClient) {
                const ossModel: ModelConfig = {
                    id: 'oss-local-fallback',
                    provider: 'oss-local',
                    apiModelName: env.OSS_MODEL_NAME,
                    layer: model.layer,
                    relativeCost: 0,
                    capabilities: model.capabilities,
                    contextWindow: model.contextWindow,
                    enabled: true,
                };
                try {
                    return await ossClient.call(request, ossModel);
                } catch (error) {
                    logger.error(`OSS Local fallback failed: ${error}`);
                    providerHealth.markProviderUnhealthy('oss-local');
                }
            }
        }

        throw new Error(`All providers failed for model ${model.id}`);
    }

    // Original provider is healthy, try it
    const client = clients.find((c) => c.canHandle(originalProvider));
    if (!client) {
        throw new Error(`No client found for provider: ${originalProvider}`);
    }

    try {
        return await client.call(request, model);
    } catch (error) {
        logger.warn(`Primary provider ${originalProvider} failed: ${error}`);
        providerHealth.markProviderUnhealthy(originalProvider);

        // Retry with fallback after marking provider unhealthy
        return await callLLMWithFallback(request, model);
    }
}

/**
 * Call an LLM with the given model
 */
export async function callLLM(
    request: LLMRequest,
    model: ModelConfig,
): Promise<Omit<LLMResponse, 'routingSummary'>> {
    logger.debug('Calling LLM', {
        modelId: model.id,
        provider: model.provider,
        layer: model.layer,
    });

    const startTime = Date.now();

    try {
        const response = await callLLMWithFallback(request, model);
        const duration = Date.now() - startTime;

        // Record metrics
        metrics.recordLLMCall(
            response.inputTokens,
            response.outputTokens,
            response.cost,
        );

        logger.debug('LLM call completed', {
            modelId: model.id,
            provider: response.provider,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost.toFixed(6),
            duration,
        });

        return response;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`LLM call failed after all fallbacks`, {
            modelId: model.id,
            provider: model.provider,
            duration,
            error: String(error),
        });
        throw error;
    }
}

export { LLMClient };
