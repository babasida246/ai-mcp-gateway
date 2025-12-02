import { OpenRouter } from '@openrouter/sdk';
import { LLMClient, estimateTokens, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { providerManager } from '../../config/provider-manager.js';

/**
 * OpenRouter LLM client (uses official OpenRouter SDK)
 */
export class OpenRouterClient implements LLMClient {
    private client: OpenRouter | null = null;

    private async getClient(): Promise<OpenRouter> {
        if (!this.client) {
            // Try to get API key from database first
            let apiKey = await providerManager.getApiKey('openrouter');

            // Fallback to environment variable
            if (!apiKey) {
                apiKey = env.OPENROUTER_API_KEY;
            }

            if (!apiKey) {
                throw new Error('OPENROUTER_API_KEY is not configured in database or environment');
            }

            this.client = new OpenRouter({
                apiKey,
            });
        }
        return this.client;
    }

    canHandle(provider: string): boolean {
        return provider === 'openrouter';
    }

    async call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>> {
        const client = await this.getClient();

        logger.debug('Calling OpenRouter API', {
            model: model.apiModelName,
            promptLength: request.prompt.length,
        });

        try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

            if (request.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: request.systemPrompt,
                });
            }

            messages.push({
                role: 'user',
                content: request.prompt,
            });

            const response = await client.chat.send({
                model: model.apiModelName,
                messages,
                maxTokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7,
            });

            const content = response.choices[0]?.message?.content || '';
            const inputTokens = response.usage?.promptTokens || estimateTokens(request.prompt);
            const outputTokens = response.usage?.completionTokens || estimateTokens(content);
            const cost = calculateCost(inputTokens, outputTokens, model);

            return {
                content,
                modelId: model.id,
                provider: model.provider,
                inputTokens,
                outputTokens,
                cost,
            };
        } catch (error) {
            logger.error('OpenRouter API error', {
                model: model.apiModelName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}
