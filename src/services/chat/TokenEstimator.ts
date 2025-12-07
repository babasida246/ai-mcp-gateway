/**
 * @file Token Estimator Service
 * @description Estimates token counts for messages to help with context budget management.
 * 
 * Supports multiple tokenization strategies:
 * 1. tiktoken (OpenAI's tokenizer) - Most accurate for GPT models
 * 2. Heuristic estimation - Fast fallback based on character/word count
 * 
 * @example
 * ```typescript
 * const estimator = new TokenEstimator();
 * const tokens = await estimator.estimate("Hello, world!");
 * // Returns ~3 tokens
 * 
 * const multiTokens = await estimator.estimateMessages([
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi there!' }
 * ]);
 * // Returns estimated tokens for entire message array
 * ```
 */

import { logger } from '../../logging/logger.js';

/**
 * Message structure for token estimation
 */
export interface TokenMessage {
    role: string;
    content: string;
    name?: string;
}

/**
 * Token estimation result with breakdown
 */
export interface TokenEstimationResult {
    totalTokens: number;
    breakdown?: {
        content: number;
        overhead: number;  // Role markers, formatting, etc.
    };
    method: 'tiktoken' | 'heuristic';
}

/**
 * Configuration for token estimation
 */
export interface TokenEstimatorConfig {
    /**
     * Model name for tiktoken encoding selection
     * @default 'gpt-4'
     */
    model?: string;

    /**
     * Whether to use heuristic as primary method (faster but less accurate)
     * @default false
     */
    preferHeuristic?: boolean;

    /**
     * Characters per token ratio for heuristic estimation
     * @default 4 (English average is ~4 chars/token)
     */
    charsPerToken?: number;
}

/**
 * Token overhead per message (approximate)
 * - Each message has ~4 tokens overhead for role/formatting
 * - System messages have slightly more overhead
 */
const MESSAGE_OVERHEAD = {
    system: 5,
    user: 4,
    assistant: 4,
    tool: 5,
    function: 5,
};

/**
 * TokenEstimator class
 * Provides token estimation for text and chat messages
 */
export class TokenEstimator {
    private config: Required<TokenEstimatorConfig>;
    private tiktokenEncoder: { encode: (text: string) => number[]; free?: () => void } | null = null;
    private tiktokenAvailable = false;
    private initialized = false;

    constructor(config: TokenEstimatorConfig = {}) {
        this.config = {
            model: config.model ?? 'gpt-4',
            preferHeuristic: config.preferHeuristic ?? false,
            charsPerToken: config.charsPerToken ?? 4,
        };
    }

    /**
     * Initialize tiktoken encoder (lazy loading)
     */
    private async initTiktoken(): Promise<boolean> {
        if (this.initialized) {
            return this.tiktokenAvailable;
        }

        this.initialized = true;

        if (this.config.preferHeuristic) {
            logger.debug('TokenEstimator: Using heuristic method (preferred)');
            return false;
        }

        try {
            // Dynamic import of tiktoken (optional dependency)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tiktoken = await import('tiktoken') as any;

            // Get encoding for the model
            try {
                this.tiktokenEncoder = tiktoken.encoding_for_model(this.config.model);
            } catch {
                // Fallback to cl100k_base encoding (used by GPT-4, GPT-3.5-turbo)
                this.tiktokenEncoder = tiktoken.get_encoding('cl100k_base');
            }

            this.tiktokenAvailable = true;
            logger.debug('TokenEstimator: tiktoken initialized', { model: this.config.model });
            return true;
        } catch (error) {
            // tiktoken not installed or failed to load
            logger.debug('TokenEstimator: tiktoken not available, using heuristic', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }

    /**
     * Estimate token count for a single text string
     * 
     * @param text - The text to estimate tokens for
     * @returns Token count estimation
     */
    async estimate(text: string): Promise<number> {
        if (!text || text.length === 0) {
            return 0;
        }

        const hasTiktoken = await this.initTiktoken();

        if (hasTiktoken && this.tiktokenEncoder) {
            try {
                const tokens = this.tiktokenEncoder.encode(text);
                return tokens.length;
            } catch (error) {
                logger.warn('TokenEstimator: tiktoken encoding failed, falling back to heuristic', {
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }

        // Heuristic estimation
        return this.estimateHeuristic(text);
    }

    /**
     * Heuristic-based token estimation
     * Uses character count and word boundaries for estimation
     * 
     * @param text - Text to estimate
     * @returns Estimated token count
     */
    private estimateHeuristic(text: string): number {
        if (!text || text.length === 0) {
            return 0;
        }

        // Base estimation: characters / chars_per_token
        const charBasedEstimate = Math.ceil(text.length / this.config.charsPerToken);

        // Word-based adjustment (some words are multiple tokens)
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;

        // Count words that are likely multi-token (long words, non-ASCII, punctuation-heavy)
        // eslint-disable-next-line no-control-regex
        const nonAsciiRegex = /[^\u0000-\u007F]/;
        const punctuationRegex = /[^a-zA-Z0-9\s]/;
        const complexWords = words.filter(w =>
            w.length > 10 ||
            nonAsciiRegex.test(w) ||  // Non-ASCII
            punctuationRegex.test(w)   // Punctuation
        ).length;

        // Adjust estimate: average of char-based and word-based with complexity factor
        const wordBasedEstimate = wordCount + Math.ceil(complexWords * 0.5);

        // Take weighted average, favoring char-based for short text and word-based for long text
        const textLength = text.length;
        const weight = Math.min(textLength / 500, 1); // 0-1 based on text length

        const estimate = Math.ceil(
            charBasedEstimate * (1 - weight * 0.3) +
            wordBasedEstimate * (weight * 0.3)
        );

        return Math.max(1, estimate);
    }

    /**
     * Estimate token count for a chat message
     * Includes overhead for role markers and formatting
     * 
     * @param message - Chat message to estimate
     * @returns Token estimation with breakdown
     */
    async estimateMessage(message: TokenMessage): Promise<TokenEstimationResult> {
        const contentTokens = await this.estimate(message.content);
        const overhead = MESSAGE_OVERHEAD[message.role as keyof typeof MESSAGE_OVERHEAD] || 4;

        // Add name overhead if present
        const nameOverhead = message.name ? Math.ceil(message.name.length / this.config.charsPerToken) + 1 : 0;

        return {
            totalTokens: contentTokens + overhead + nameOverhead,
            breakdown: {
                content: contentTokens,
                overhead: overhead + nameOverhead,
            },
            method: this.tiktokenAvailable ? 'tiktoken' : 'heuristic',
        };
    }

    /**
     * Estimate total tokens for an array of chat messages
     * 
     * @param messages - Array of chat messages
     * @returns Total token count
     */
    async estimateMessages(messages: TokenMessage[]): Promise<number> {
        if (!messages || messages.length === 0) {
            return 0;
        }

        let totalTokens = 0;

        // Base overhead for the message array (conversation structure)
        const conversationOverhead = 3;
        totalTokens += conversationOverhead;

        for (const message of messages) {
            const result = await this.estimateMessage(message);
            totalTokens += result.totalTokens;
        }

        return totalTokens;
    }

    /**
     * Estimate tokens for a messages array and return detailed breakdown
     * 
     * @param messages - Array of chat messages
     * @returns Detailed token estimation
     */
    async estimateMessagesDetailed(messages: TokenMessage[]): Promise<{
        total: number;
        perMessage: Array<{ role: string; tokens: number }>;
        method: 'tiktoken' | 'heuristic';
    }> {
        const perMessage: Array<{ role: string; tokens: number }> = [];
        let total = 3; // Conversation overhead

        for (const message of messages) {
            const result = await this.estimateMessage(message);
            perMessage.push({
                role: message.role,
                tokens: result.totalTokens,
            });
            total += result.totalTokens;
        }

        return {
            total,
            perMessage,
            method: this.tiktokenAvailable ? 'tiktoken' : 'heuristic',
        };
    }

    /**
     * Check if a message array fits within a token budget
     * 
     * @param messages - Messages to check
     * @param budget - Maximum token budget
     * @returns Whether messages fit and how many tokens remaining
     */
    async fitsInBudget(messages: TokenMessage[], budget: number): Promise<{
        fits: boolean;
        totalTokens: number;
        remaining: number;
    }> {
        const totalTokens = await this.estimateMessages(messages);
        return {
            fits: totalTokens <= budget,
            totalTokens,
            remaining: budget - totalTokens,
        };
    }

    /**
     * Truncate messages to fit within a token budget
     * Removes oldest messages first (keeps most recent)
     * 
     * @param messages - Messages to truncate
     * @param budget - Maximum token budget
     * @param keepFirst - Number of messages to always keep from start (e.g., system prompt)
     * @returns Truncated message array
     */
    async truncateToFit(
        messages: TokenMessage[],
        budget: number,
        keepFirst: number = 1
    ): Promise<TokenMessage[]> {
        if (messages.length === 0) {
            return [];
        }

        const { fits, totalTokens } = await this.fitsInBudget(messages, budget);

        if (fits) {
            return messages;
        }

        // Keep first N messages (usually system prompt) and last message
        const protectedStart = messages.slice(0, keepFirst);
        const lastMessage = messages[messages.length - 1];
        const middleMessages = messages.slice(keepFirst, -1);

        let result = [...protectedStart];
        let currentTokens = await this.estimateMessages(protectedStart);
        const lastMessageTokens = await this.estimateMessages([lastMessage]);

        // Reserve space for last message
        const availableBudget = budget - lastMessageTokens;

        // Add messages from the end of middle section (most recent first)
        for (let i = middleMessages.length - 1; i >= 0; i--) {
            const messageTokens = (await this.estimateMessage(middleMessages[i])).totalTokens;
            if (currentTokens + messageTokens <= availableBudget) {
                result.splice(keepFirst, 0, middleMessages[i]);
                currentTokens += messageTokens;
            }
        }

        // Add last message
        result.push(lastMessage);

        logger.debug('TokenEstimator: Truncated messages to fit budget', {
            original: messages.length,
            truncated: result.length,
            originalTokens: totalTokens,
            finalTokens: await this.estimateMessages(result),
            budget,
        });

        return result;
    }

    /**
     * Free tiktoken encoder resources
     */
    dispose(): void {
        if (this.tiktokenEncoder && typeof this.tiktokenEncoder.free === 'function') {
            this.tiktokenEncoder.free();
            this.tiktokenEncoder = null;
        }
    }
}

/**
 * Singleton instance with default configuration
 */
export const tokenEstimator = new TokenEstimator();

/**
 * Quick estimation helper (uses singleton)
 */
export async function estimateTokens(text: string): Promise<number> {
    return tokenEstimator.estimate(text);
}

/**
 * Synchronous quick estimation helper using heuristic method
 * Useful when async is not practical (e.g., in reduce callbacks)
 * 
 * @param text - Text to estimate tokens for
 * @param _modelId - Model ID (optional, reserved for future use)
 * @returns Estimated token count
 */
export function estimateTokensSync(text: string, _modelId?: string): number {
    if (!text || text.length === 0) {
        return 0;
    }
    // Use simple heuristic: ~4 characters per token (average for English)
    const charsPerToken = 4;
    return Math.max(1, Math.ceil(text.length / charsPerToken));
}

/**
 * Quick message estimation helper (uses singleton)
 */
export async function estimateMessageTokens(messages: TokenMessage[]): Promise<number> {
    return tokenEstimator.estimateMessages(messages);
}
