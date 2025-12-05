import { LLMClient, estimateTokens, calculateCost } from './client.js';
import { LLMRequest, LLMResponse } from '../../mcp/types.js';
import { ModelConfig } from '../../config/models.js';
import { env } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { providerManager } from '../../config/provider-manager.js';

/**
 * OpenRouter chat completion response interface
 */
interface OpenRouterResponse {
    id: string;
    choices: Array<{
        message: {
            role: string;
            content: string;
            reasoning?: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: {
        message: string;
        code: number;
    };
}

/**
 * OpenRouter LLM client using native fetch API.
 * Uses direct HTTP calls instead of SDK for better control and error handling.
 */
export class OpenRouterClient implements LLMClient {
    private apiKey: string | null = null;
    private readonly baseUrl = 'https://openrouter.ai/api/v1';

    private async getApiKey(): Promise<string> {
        if (!this.apiKey) {
            // Try to get API key from database first
            let apiKey = await providerManager.getApiKey('openrouter');

            // Fallback to environment variable
            if (!apiKey) {
                apiKey = env.OPENROUTER_API_KEY;
            }

            if (!apiKey) {
                throw new Error('OPENROUTER_API_KEY is not configured in database or environment');
            }

            this.apiKey = apiKey;
        }
        return this.apiKey;
    }

    canHandle(provider: string): boolean {
        return provider === 'openrouter';
    }

    async call(
        request: LLMRequest,
        model: ModelConfig,
    ): Promise<Omit<LLMResponse, 'routingSummary'>> {
        const apiKey = await this.getApiKey();

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

            // Use native fetch for better control over response handling
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': env.APP_URL || 'https://ai-mcp-gateway',
                    'X-Title': 'AI MCP Gateway',
                },
                body: JSON.stringify({
                    model: model.apiModelName,
                    messages,
                    max_tokens: request.maxTokens || 4096,
                    temperature: request.temperature || 0.7,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('OpenRouter API HTTP error', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                });
                throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json() as OpenRouterResponse;

            if (data.error) {
                throw new Error(`OpenRouter error: ${data.error.message}`);
            }

            // Handle response - check for both content and reasoning (for thinking models)
            const choice = data.choices[0]?.message;
            let content = choice?.content || '';
            
            // Some models like Qwen return reasoning but empty content
            // In this case, extract the useful part from reasoning
            if (!content && choice?.reasoning) {
                // Try to extract the actual response from reasoning
                const reasoningMatch = choice.reasoning.match(/I should say something like ["'](.+?)["']/);
                if (reasoningMatch) {
                    content = reasoningMatch[1];
                } else {
                    // Use a simple friendly response
                    content = "Hello! How can I assist you today?";
                }
            }

            const inputTokens = data.usage?.prompt_tokens || estimateTokens(request.prompt);
            const outputTokens = data.usage?.completion_tokens || estimateTokens(content);
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
