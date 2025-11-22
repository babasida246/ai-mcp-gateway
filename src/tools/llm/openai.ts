import OpenAI from 'openai';
import { LLMClient, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

/**
 * OpenAI GPT LLM client
 */
export class OpenAIClient implements LLMClient {
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            if (!env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY is not configured');
            }
            this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
        }
        return this.client;
    }

    canHandle(provider: string): boolean {
        return provider === 'openai';
    }

    async call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>> {
        const client = this.getClient();

        logger.debug('Calling OpenAI API', {
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
            const inputTokens = response.usage?.prompt_tokens || 0;
            const outputTokens = response.usage?.completion_tokens || 0;
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
            logger.error('OpenAI API error', {
                model: model.apiModelName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}
