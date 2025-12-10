import OpenAI from 'openai';
import { LLMClient, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { providerManager } from '../../config/provider-manager.js';

/**
 * OpenAI GPT LLM client
 */
export class OpenAIClient implements LLMClient {
    private client: OpenAI | null = null;

    private async getClient(): Promise<OpenAI> {
        if (!this.client) {
            // Try to get API key from database first
            let apiKey = await providerManager.getApiKey('openai');

            // Fallback to environment variable
            if (!apiKey) {
                apiKey = env.OPENAI_API_KEY;
            }

            if (!apiKey) {
                throw new Error('OPENAI_API_KEY is not configured in database or environment');
            }

            this.client = new OpenAI({ apiKey });
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
        const client = await this.getClient();

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

            // Log full prompt for debugging
            logger.info('[OpenAI] Sending prompt to model', {
                model: model.apiModelName,
                systemPrompt: request.systemPrompt ? request.systemPrompt.substring(0, 200) + '...' : 'none',
                userPrompt: request.prompt.substring(0, 500) + (request.prompt.length > 500 ? '...' : ''),
                fullPromptLength: request.prompt.length,
                maxTokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7,
            });

            // Log complete messages array for detailed debugging
            logger.debug('[OpenAI] Complete messages array', {
                messagesCount: messages.length,
                messages: messages.map(m => ({
                    role: m.role,
                    contentPreview: typeof m.content === 'string'
                        ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
                        : '[complex content]'
                })),
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
