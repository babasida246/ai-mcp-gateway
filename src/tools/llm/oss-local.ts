import { LLMClient, estimateTokens } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

/**
 * OSS/Local model client (e.g., Ollama)
 * This is a stub implementation - you'll need to implement based on your local setup
 */
export class OSSLocalClient implements LLMClient {
    canHandle(provider: string): boolean {
        return provider === 'oss-local';
    }

    async call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>> {
        if (!env.OSS_MODEL_ENABLED) {
            throw new Error('OSS local models are not enabled');
        }

        logger.debug('Calling OSS Local Model', {
            endpoint: env.OSS_MODEL_ENDPOINT,
            model: model.apiModelName,
            promptLength: request.prompt.length,
        });

        try {
            // Example: Ollama-compatible API
            const response = await fetch(`${env.OSS_MODEL_ENDPOINT}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model.apiModelName,
                    prompt: request.systemPrompt
                        ? `${request.systemPrompt}\n\n${request.prompt}`
                        : request.prompt,
                    stream: false,
                    options: {
                        temperature: request.temperature || 0.7,
                        num_predict: request.maxTokens || 4096,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`OSS Local API error: ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.response || '';

            // Estimate tokens since local models might not report them
            const inputTokens = estimateTokens(request.prompt);
            const outputTokens = estimateTokens(content);
            const cost = 0; // Local models are free

            return {
                content,
                modelId: model.id,
                provider: model.provider,
                inputTokens,
                outputTokens,
                cost,
            };
        } catch (error) {
            logger.error('OSS Local Model error', {
                model: model.apiModelName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}
