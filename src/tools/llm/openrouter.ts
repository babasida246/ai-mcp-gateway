import OpenAI from 'openai';
import { LLMClient, estimateTokens, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

/**
 * OpenRouter LLM client (uses OpenAI-compatible API)
 */
export class OpenRouterClient implements LLMClient {
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            if (!env.OPENROUTER_API_KEY) {
                throw new Error('OPENROUTER_API_KEY is not configured');
            }
            this.client = new OpenAI({
                apiKey: env.OPENROUTER_API_KEY,
                baseURL: 'https://openrouter.ai/api/v1',
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
        const client = this.getClient();

        logger.debug('Calling OpenRouter API', {
            model: model.apiModelName,
            promptLength: request.prompt.length,
        });

        try {
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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

            const response = await client.chat.completions.create({
                model: model.apiModelName,
                messages,
                max_tokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7,
            });

            const content = response.choices[0]?.message?.content || '';
            const inputTokens = response.usage?.prompt_tokens || estimateTokens(request.prompt);
            const outputTokens = response.usage?.completion_tokens || estimateTokens(content);
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
