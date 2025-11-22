import Anthropic from '@anthropic-ai/sdk';
import { LLMClient, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

/**
 * Anthropic Claude LLM client
 */
export class AnthropicClient implements LLMClient {
    private client: Anthropic | null = null;

    private getClient(): Anthropic {
        if (!this.client) {
            if (!env.ANTHROPIC_API_KEY) {
                throw new Error('ANTHROPIC_API_KEY is not configured');
            }
            this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        }
        return this.client;
    }

    canHandle(provider: string): boolean {
        return provider === 'anthropic';
    }

    async call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>> {
        const client = this.getClient();

        logger.debug('Calling Anthropic API', {
            model: model.apiModelName,
            promptLength: request.prompt.length,
        });

        try {
            const response = await client.messages.create({
                model: model.apiModelName,
                max_tokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7,
                system: request.systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: request.prompt,
                    },
                ],
            });

            const content =
                response.content[0].type === 'text' ? response.content[0].text : '';
            const inputTokens = response.usage.input_tokens;
            const outputTokens = response.usage.output_tokens;
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
            logger.error('Anthropic API error', {
                model: model.apiModelName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}
