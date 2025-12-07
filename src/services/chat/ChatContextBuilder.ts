/**
 * ChatContextBuilder - Main orchestrator for chat context optimization
 * 
 * Implements multiple strategies for building optimal message context:
 * - full: Include all messages (no optimization)
 * - last-n: Include only the last N messages
 * - summary+recent: Combine conversation summary with recent messages
 * - span-retrieval: Use embedding-based retrieval for relevant spans + recent
 * 
 * @module services/chat/ChatContextBuilder
 */

import { db } from '../../db/postgres.js';
import { logger } from '../../logging/logger.js';
import { tokenEstimator, estimateTokensSync } from './TokenEstimator.js';
import { embeddingService } from './EmbeddingService.js';
import { SpanRetriever, SpanRetrievalConfig } from './SpanRetriever.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Context building strategy
 */
export type ChatContextStrategy = 'full' | 'last-n' | 'summary+recent' | 'span-retrieval';

/**
 * Configuration for ChatContextBuilder
 */
export interface ChatContextConfig {
    /** Strategy to use for context building */
    strategy: ChatContextStrategy;

    /** Maximum tokens allowed for the entire prompt (system + context + user message) */
    maxPromptTokens: number;

    /** Minimum number of recent messages to always include */
    recentMinMessages: number;

    /** Maximum recent messages to include (for last-n strategy) */
    recentMaxMessages: number;

    /** Number of top similar spans to retrieve (for span-retrieval) */
    spanTopK: number;

    /** Radius around each hit to expand (for span-retrieval) */
    spanRadius: number;

    /** Fraction of token budget for span retrieval vs recent (0.0-1.0) */
    spanBudgetRatio: number;

    /** Minimum similarity score for span retrieval */
    spanMinSimilarity: number;

    /** Token threshold to trigger summarization */
    summarizationThreshold: number;

    /** System prompt to prepend (optional) */
    systemPrompt?: string;
}

/**
 * A single message in the context
 */
export interface ContextMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
    tokenEstimate?: number;
}

/**
 * Parameters for building context
 */
export interface BuildContextParams {
    /** Conversation/thread ID */
    conversationId: string;

    /** The current user message to respond to */
    currentUserMessage: string;

    /** Model ID (affects token estimation) */
    modelId?: string;

    /** Override config for this specific build */
    configOverrides?: Partial<ChatContextConfig>;

    /** Project ID for config resolution */
    projectId?: string;

    /** Tool ID for config resolution */
    toolId?: string;
}

/**
 * Result of building context
 */
export interface BuildContextResult {
    /** The final messages array to send to LLM */
    messages: ContextMessage[];

    /** Total estimated tokens */
    totalTokens: number;

    /** Strategy that was used */
    strategyUsed: ChatContextStrategy;

    /** Whether summarization was triggered */
    summarizationTriggered: boolean;

    /** Number of messages included */
    messageCount: number;

    /** Metadata for observability */
    metadata: {
        recentMessagesIncluded: number;
        spansRetrieved: number;
        summaryIncluded: boolean;
        tokenBudget: number;
        tokenUsed: number;
    };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CHAT_CONTEXT_CONFIG: ChatContextConfig = {
    strategy: 'summary+recent',
    maxPromptTokens: 4096,
    recentMinMessages: 4,
    recentMaxMessages: 20,
    spanTopK: 5,
    spanRadius: 2,
    spanBudgetRatio: 0.4, // 40% for spans, 60% for recent
    spanMinSimilarity: 0.7,
    summarizationThreshold: 2000, // Summarize when old messages exceed this
    systemPrompt: undefined,
};

// ============================================================================
// ChatContextBuilder Class
// ============================================================================

export class ChatContextBuilder {
    private spanRetriever: SpanRetriever;

    constructor() {
        this.spanRetriever = new SpanRetriever(embeddingService, tokenEstimator);
    }

    /**
     * Build optimized context for a chat completion request
     */
    async buildContext(params: BuildContextParams): Promise<BuildContextResult> {
        const startTime = Date.now();
        const config = this.resolveConfig(params);

        logger.debug('[ChatContextBuilder] Building context', {
            conversationId: params.conversationId,
            strategy: config.strategy,
            maxTokens: config.maxPromptTokens,
        });

        try {
            let result: BuildContextResult;

            switch (config.strategy) {
                case 'full':
                    result = await this.buildFullContext(params, config);
                    break;
                case 'last-n':
                    result = await this.buildLastNContext(params, config);
                    break;
                case 'summary+recent':
                    result = await this.buildSummaryRecentContext(params, config);
                    break;
                case 'span-retrieval':
                    result = await this.buildSpanRetrievalContext(params, config);
                    break;
                default:
                    // Fallback to summary+recent
                    result = await this.buildSummaryRecentContext(params, config);
            }

            const duration = Date.now() - startTime;
            logger.info('[ChatContextBuilder] Context built successfully', {
                conversationId: params.conversationId,
                strategy: result.strategyUsed,
                totalTokens: result.totalTokens,
                messageCount: result.messageCount,
                durationMs: duration,
            });

            return result;

        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to build context', {
                conversationId: params.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            // Fallback: return just the current message
            return this.buildFallbackContext(params, config);
        }
    }

    /**
     * Resolve configuration from various sources
     */
    private resolveConfig(params: BuildContextParams): ChatContextConfig {
        // Start with defaults
        let config = { ...DEFAULT_CHAT_CONTEXT_CONFIG };

        // TODO: Load project-specific config from DB
        // if (params.projectId) {
        //   const projectConfig = await this.loadProjectConfig(params.projectId);
        //   config = { ...config, ...projectConfig };
        // }

        // TODO: Load tool-specific config
        // if (params.toolId) {
        //   const toolConfig = await this.loadToolConfig(params.toolId);
        //   config = { ...config, ...toolConfig };
        // }

        // TODO: Load model-specific limits
        // if (params.modelId) {
        //   const modelLimits = await this.loadModelLimits(params.modelId);
        //   config.maxPromptTokens = Math.min(config.maxPromptTokens, modelLimits.contextWindow);
        // }

        // Apply runtime overrides
        if (params.configOverrides) {
            config = { ...config, ...params.configOverrides };
        }

        return config;
    }

    // --------------------------------------------------------------------------
    // Strategy: Full (no optimization)
    // --------------------------------------------------------------------------

    private async buildFullContext(
        params: BuildContextParams,
        config: ChatContextConfig
    ): Promise<BuildContextResult> {
        const messages: ContextMessage[] = [];
        let totalTokens = 0;

        // Add system prompt if configured
        if (config.systemPrompt) {
            const systemTokens = estimateTokensSync(config.systemPrompt, params.modelId);
            messages.push({ role: 'system', content: config.systemPrompt, tokenEstimate: systemTokens });
            totalTokens += systemTokens;
        }

        // Load all messages from conversation
        const allMessages = await this.loadAllMessages(params.conversationId);

        for (const msg of allMessages) {
            const tokenEstimate = msg.token_estimate ||
                estimateTokensSync(msg.content, params.modelId);
            messages.push({
                role: msg.role,
                content: msg.content,
                tokenEstimate,
            });
            totalTokens += tokenEstimate;
        }

        // Add current user message
        const currentTokens = estimateTokensSync(params.currentUserMessage, params.modelId);
        messages.push({
            role: 'user',
            content: params.currentUserMessage,
            tokenEstimate: currentTokens,
        });
        totalTokens += currentTokens;

        return {
            messages,
            totalTokens,
            strategyUsed: 'full',
            summarizationTriggered: false,
            messageCount: messages.length,
            metadata: {
                recentMessagesIncluded: allMessages.length,
                spansRetrieved: 0,
                summaryIncluded: false,
                tokenBudget: config.maxPromptTokens,
                tokenUsed: totalTokens,
            },
        };
    }

    // --------------------------------------------------------------------------
    // Strategy: Last-N
    // --------------------------------------------------------------------------

    private async buildLastNContext(
        params: BuildContextParams,
        config: ChatContextConfig
    ): Promise<BuildContextResult> {
        const messages: ContextMessage[] = [];
        let totalTokens = 0;

        // Add system prompt if configured
        if (config.systemPrompt) {
            const systemTokens = estimateTokensSync(config.systemPrompt, params.modelId);
            messages.push({ role: 'system', content: config.systemPrompt, tokenEstimate: systemTokens });
            totalTokens += systemTokens;
        }

        // Reserve tokens for current message
        const currentTokens = estimateTokensSync(params.currentUserMessage, params.modelId);
        // Note: availableBudget calculated for future use in pagination
        const _availableBudget = config.maxPromptTokens - totalTokens - currentTokens;

        // Load recent messages (up to maxMessages)
        const recentMessages = await this.loadRecentMessages(
            params.conversationId,
            config.recentMaxMessages
        );

        // Add messages until budget is exhausted
        let recentIncluded = 0;
        for (const msg of recentMessages) {
            const tokenEstimate = msg.token_estimate ||
                estimateTokensSync(msg.content, params.modelId);

            if (totalTokens + tokenEstimate + currentTokens > config.maxPromptTokens) {
                // Budget exceeded, but ensure we include at least minMessages
                if (recentIncluded >= config.recentMinMessages) {
                    break;
                }
            }

            messages.push({
                role: msg.role,
                content: msg.content,
                tokenEstimate,
            });
            totalTokens += tokenEstimate;
            recentIncluded++;
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: params.currentUserMessage,
            tokenEstimate: currentTokens,
        });
        totalTokens += currentTokens;

        return {
            messages,
            totalTokens,
            strategyUsed: 'last-n',
            summarizationTriggered: false,
            messageCount: messages.length,
            metadata: {
                recentMessagesIncluded: recentIncluded,
                spansRetrieved: 0,
                summaryIncluded: false,
                tokenBudget: config.maxPromptTokens,
                tokenUsed: totalTokens,
            },
        };
    }

    // --------------------------------------------------------------------------
    // Strategy: Summary + Recent
    // --------------------------------------------------------------------------

    private async buildSummaryRecentContext(
        params: BuildContextParams,
        config: ChatContextConfig
    ): Promise<BuildContextResult> {
        const messages: ContextMessage[] = [];
        let totalTokens = 0;
        let summarizationTriggered = false;
        let summaryIncluded = false;

        // Add system prompt if configured
        if (config.systemPrompt) {
            const systemTokens = estimateTokensSync(config.systemPrompt, params.modelId);
            messages.push({ role: 'system', content: config.systemPrompt, tokenEstimate: systemTokens });
            totalTokens += systemTokens;
        }

        // Reserve tokens for current message
        const currentTokens = estimateTokensSync(params.currentUserMessage, params.modelId);

        // Load conversation to get existing summary
        const conversation = await this.loadConversation(params.conversationId);

        // Check if we need to generate/update summary
        const oldMessages = await this.loadOldMessages(params.conversationId, config.recentMaxMessages);
        const oldMessagesTokens = oldMessages.reduce((sum, m) =>
            sum + (m.token_estimate || estimateTokensSync(m.content, params.modelId)), 0
        );

        if (oldMessagesTokens > config.summarizationThreshold && !conversation?.summary) {
            // Trigger summarization asynchronously (don't block the request)
            summarizationTriggered = true;
            this.triggerSummarizationAsync(params.conversationId, oldMessages);
        }

        // Include summary if available
        if (conversation?.summary) {
            const summaryTokens = conversation.summary_token_estimate ||
                estimateTokensSync(conversation.summary, params.modelId);

            // Wrap summary in a system or assistant message
            const summaryMessage: ContextMessage = {
                role: 'system',
                content: `[Previous conversation summary]\n${conversation.summary}`,
                tokenEstimate: summaryTokens,
            };
            messages.push(summaryMessage);
            totalTokens += summaryTokens;
            summaryIncluded = true;
        }

        // Calculate remaining budget for recent messages
        // Note: recentBudget calculated for reference
        const _recentBudget = config.maxPromptTokens - totalTokens - currentTokens;

        // Load recent messages
        const recentMessages = await this.loadRecentMessages(
            params.conversationId,
            config.recentMaxMessages
        );

        // Add recent messages within budget
        let recentIncluded = 0;
        for (const msg of recentMessages) {
            const tokenEstimate = msg.token_estimate ||
                estimateTokensSync(msg.content, params.modelId);

            if (totalTokens + tokenEstimate + currentTokens > config.maxPromptTokens) {
                if (recentIncluded >= config.recentMinMessages) {
                    break;
                }
            }

            messages.push({
                role: msg.role,
                content: msg.content,
                tokenEstimate,
            });
            totalTokens += tokenEstimate;
            recentIncluded++;
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: params.currentUserMessage,
            tokenEstimate: currentTokens,
        });
        totalTokens += currentTokens;

        return {
            messages,
            totalTokens,
            strategyUsed: 'summary+recent',
            summarizationTriggered,
            messageCount: messages.length,
            metadata: {
                recentMessagesIncluded: recentIncluded,
                spansRetrieved: 0,
                summaryIncluded,
                tokenBudget: config.maxPromptTokens,
                tokenUsed: totalTokens,
            },
        };
    }

    // --------------------------------------------------------------------------
    // Strategy: Span Retrieval
    // --------------------------------------------------------------------------

    private async buildSpanRetrievalContext(
        params: BuildContextParams,
        config: ChatContextConfig
    ): Promise<BuildContextResult> {
        const messages: ContextMessage[] = [];
        let totalTokens = 0;
        let summarizationTriggered = false;
        let summaryIncluded = false;

        // Add system prompt if configured
        if (config.systemPrompt) {
            const systemTokens = estimateTokensSync(config.systemPrompt, params.modelId);
            messages.push({ role: 'system', content: config.systemPrompt, tokenEstimate: systemTokens });
            totalTokens += systemTokens;
        }

        // Reserve tokens for current message
        const currentTokens = estimateTokensSync(params.currentUserMessage, params.modelId);

        // Load conversation for summary
        const conversation = await this.loadConversation(params.conversationId);

        // Include summary if available
        if (conversation?.summary) {
            const summaryTokens = conversation.summary_token_estimate ||
                estimateTokensSync(conversation.summary, params.modelId);

            const summaryMessage: ContextMessage = {
                role: 'system',
                content: `[Previous conversation summary]\n${conversation.summary}`,
                tokenEstimate: summaryTokens,
            };
            messages.push(summaryMessage);
            totalTokens += summaryTokens;
            summaryIncluded = true;
        }

        // Calculate budget splits
        const availableBudget = config.maxPromptTokens - totalTokens - currentTokens;
        const spanBudget = Math.floor(availableBudget * config.spanBudgetRatio);
        // Note: recentBudget calculated for potential future use in pagination
        const _recentBudget = availableBudget - spanBudget;

        // Retrieve relevant spans using embeddings
        const spanConfig: SpanRetrievalConfig = {
            topK: config.spanTopK,
            radius: config.spanRadius,
            tokenBudget: spanBudget,
            minSimilarity: config.spanMinSimilarity,
        };

        let spansRetrieved = 0;
        try {
            const spanResult = await this.spanRetriever.retrieveSpans({
                conversationId: params.conversationId,
                queryText: params.currentUserMessage,
                config: spanConfig,
            });

            // Add span messages (marked with context)
            if (spanResult.allMessages.length > 0) {
                const spanContent = spanResult.allMessages.map(s =>
                    `[${s.role}]: ${s.content}`
                ).join('\n---\n');

                const spanTokens = estimateTokensSync(spanContent, params.modelId);

                messages.push({
                    role: 'system',
                    content: `[Relevant context from earlier in conversation]\n${spanContent}`,
                    tokenEstimate: spanTokens,
                });
                totalTokens += spanTokens;
                spansRetrieved = spanResult.allMessages.length;
            }
        } catch (error) {
            logger.warn('[ChatContextBuilder] Span retrieval failed, falling back to recent only', {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // Add recent messages
        const recentMessages = await this.loadRecentMessages(
            params.conversationId,
            config.recentMaxMessages
        );

        let recentIncluded = 0;
        for (const msg of recentMessages) {
            const tokenEstimate = msg.token_estimate ||
                estimateTokensSync(msg.content, params.modelId);

            if (totalTokens + tokenEstimate + currentTokens > config.maxPromptTokens) {
                if (recentIncluded >= config.recentMinMessages) {
                    break;
                }
            }

            messages.push({
                role: msg.role,
                content: msg.content,
                tokenEstimate,
            });
            totalTokens += tokenEstimate;
            recentIncluded++;
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: params.currentUserMessage,
            tokenEstimate: currentTokens,
        });
        totalTokens += currentTokens;

        // Check if summarization should be triggered
        const oldMessages = await this.loadOldMessages(params.conversationId, config.recentMaxMessages);
        const oldMessagesTokens = oldMessages.reduce((sum, m) =>
            sum + (m.token_estimate || estimateTokensSync(m.content, params.modelId)), 0
        );

        if (oldMessagesTokens > config.summarizationThreshold && !conversation?.summary) {
            summarizationTriggered = true;
            this.triggerSummarizationAsync(params.conversationId, oldMessages);
        }

        return {
            messages,
            totalTokens,
            strategyUsed: 'span-retrieval',
            summarizationTriggered,
            messageCount: messages.length,
            metadata: {
                recentMessagesIncluded: recentIncluded,
                spansRetrieved,
                summaryIncluded,
                tokenBudget: config.maxPromptTokens,
                tokenUsed: totalTokens,
            },
        };
    }

    // --------------------------------------------------------------------------
    // Fallback Context
    // --------------------------------------------------------------------------

    private buildFallbackContext(
        params: BuildContextParams,
        config: ChatContextConfig
    ): BuildContextResult {
        const messages: ContextMessage[] = [];
        let totalTokens = 0;

        // Add system prompt if configured
        if (config.systemPrompt) {
            const systemTokens = estimateTokensSync(config.systemPrompt, params.modelId);
            messages.push({ role: 'system', content: config.systemPrompt, tokenEstimate: systemTokens });
            totalTokens += systemTokens;
        }

        // Add only current user message
        const currentTokens = estimateTokensSync(params.currentUserMessage, params.modelId);
        messages.push({
            role: 'user',
            content: params.currentUserMessage,
            tokenEstimate: currentTokens,
        });
        totalTokens += currentTokens;

        return {
            messages,
            totalTokens,
            strategyUsed: 'full',
            summarizationTriggered: false,
            messageCount: messages.length,
            metadata: {
                recentMessagesIncluded: 0,
                spansRetrieved: 0,
                summaryIncluded: false,
                tokenBudget: config.maxPromptTokens,
                tokenUsed: totalTokens,
            },
        };
    }

    // --------------------------------------------------------------------------
    // Database Helpers
    // --------------------------------------------------------------------------

    private async loadConversation(conversationId: string): Promise<{
        id: string;
        summary?: string;
        summary_token_estimate?: number;
        summary_updated_at?: Date;
    } | null> {
        try {
            const result = await db.query<{
                id: string;
                summary?: string;
                summary_token_estimate?: number;
                summary_updated_at?: Date;
            }>(
                `SELECT id, summary, summary_token_estimate, summary_updated_at 
         FROM conversations 
         WHERE id = $1`,
                [conversationId]
            );
            if (!result || result.rows.length === 0) {
                return null;
            }
            return result.rows[0];
        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to load conversation', { conversationId, error });
            return null;
        }
    }

    private async loadAllMessages(conversationId: string): Promise<Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        turn_index: number;
        token_estimate?: number;
    }>> {
        try {
            const result = await db.query<{
                id: string;
                role: 'user' | 'assistant';
                content: string;
                turn_index: number;
                token_estimate?: number;
            }>(
                `SELECT id, role, content, turn_index, token_estimate 
         FROM messages 
         WHERE conversation_id = $1 
         ORDER BY turn_index ASC`,
                [conversationId]
            );
            if (!result) return [];
            return result.rows;
        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to load messages', { conversationId, error });
            return [];
        }
    }

    private async loadRecentMessages(conversationId: string, limit: number): Promise<Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        turn_index: number;
        token_estimate?: number;
    }>> {
        try {
            // Get the most recent N messages, then reverse to maintain chronological order
            const result = await db.query<{
                id: string;
                role: 'user' | 'assistant';
                content: string;
                turn_index: number;
                token_estimate?: number;
            }>(
                `SELECT id, role, content, turn_index, token_estimate 
         FROM messages 
         WHERE conversation_id = $1 
         ORDER BY turn_index DESC 
         LIMIT $2`,
                [conversationId, limit]
            );
            if (!result) return [];
            return result.rows.reverse();
        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to load recent messages', { conversationId, error });
            return [];
        }
    }

    private async loadOldMessages(conversationId: string, recentCount: number): Promise<Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        turn_index: number;
        token_estimate?: number;
    }>> {
        try {
            // Get messages older than the most recent N
            const result = await db.query<{
                id: string;
                role: 'user' | 'assistant';
                content: string;
                turn_index: number;
                token_estimate?: number;
            }>(
                `WITH recent AS (
           SELECT turn_index FROM messages 
           WHERE conversation_id = $1 
           ORDER BY turn_index DESC 
           LIMIT $2
         )
         SELECT m.id, m.role, m.content, m.turn_index, m.token_estimate 
         FROM messages m
         WHERE m.conversation_id = $1 
           AND m.turn_index < COALESCE((SELECT MIN(turn_index) FROM recent), 999999)
           AND m.is_summarized = false
         ORDER BY m.turn_index ASC`,
                [conversationId, recentCount]
            );
            if (!result) return [];
            return result.rows;
        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to load old messages', { conversationId, error });
            return [];
        }
    }

    // --------------------------------------------------------------------------
    // Summarization
    // --------------------------------------------------------------------------

    /**
     * Trigger summarization in background (non-blocking)
     */
    private triggerSummarizationAsync(
        conversationId: string,
        messages: Array<{ role: string; content: string; id: string }>
    ): void {
        // Run summarization without awaiting
        this.generateSummary(conversationId, messages).catch(error => {
            logger.error('[ChatContextBuilder] Async summarization failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }

    /**
     * Generate a summary for old messages and store it
     */
    private async generateSummary(
        conversationId: string,
        messages: Array<{ role: string; content: string; id: string }>
    ): Promise<void> {
        if (messages.length === 0) return;

        logger.info('[ChatContextBuilder] Generating summary', {
            conversationId,
            messageCount: messages.length,
        });

        try {
            // Format messages for summarization
            const transcript = messages.map(m =>
                `${m.role.toUpperCase()}: ${m.content}`
            ).join('\n\n');

            // TODO: Call L0 model to generate summary
            // For now, we'll use a simple approach - in production, this would call the router
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _summaryPrompt = `Please provide a concise summary of the following conversation, 
capturing the key points, decisions made, and important context that would be helpful 
for continuing the conversation. Keep the summary under 500 words.

Conversation:
${transcript}

Summary:`;

            // Placeholder: In production, this would call the L0 router
            // const summaryResult = await router.routeRequest({
            //   messages: [{ role: 'user', content: summaryPrompt }],
            //   model: 'gpt-4o-mini', // Use efficient model for summarization
            // });
            // const summary = summaryResult.content;

            // For now, create a simple extractive summary
            const summary = this.createExtractiveSum(messages);
            const summaryTokens = estimateTokensSync(summary);

            // Update conversation with summary
            await db.query(
                `UPDATE conversations 
         SET summary = $1, 
             summary_token_estimate = $2, 
             summary_updated_at = NOW() 
         WHERE id = $3`,
                [summary, summaryTokens, conversationId]
            );

            // Mark messages as summarized
            const messageIds = messages.map(m => m.id);
            await db.query(
                `UPDATE messages 
         SET is_summarized = true 
         WHERE id = ANY($1)`,
                [messageIds]
            );

            logger.info('[ChatContextBuilder] Summary generated and stored', {
                conversationId,
                summaryTokens,
                messagesMarked: messageIds.length,
            });

        } catch (error) {
            logger.error('[ChatContextBuilder] Failed to generate summary', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Simple extractive summarization (placeholder until LLM integration)
     */
    private createExtractiveSum(messages: Array<{ role: string; content: string }>): string {
        // Take first and last messages, plus key points
        const parts: string[] = [];

        if (messages.length > 0) {
            parts.push(`Initial topic: ${messages[0].content.slice(0, 200)}...`);
        }

        if (messages.length > 2) {
            const midpoint = Math.floor(messages.length / 2);
            parts.push(`Mid-conversation: ${messages[midpoint].content.slice(0, 150)}...`);
        }

        if (messages.length > 1) {
            const last = messages[messages.length - 1];
            parts.push(`Recent context: ${last.content.slice(0, 200)}...`);
        }

        parts.push(`Total exchanges: ${messages.length} messages`);

        return parts.join('\n\n');
    }

    // --------------------------------------------------------------------------
    // Embedding Generation (for new messages)
    // --------------------------------------------------------------------------

    /**
     * Generate and store embedding for a message
     */
    async generateMessageEmbedding(messageId: string, content: string): Promise<void> {
        try {
            const embeddingResult = await embeddingService.getEmbedding(content);

            await db.query(
                `UPDATE messages 
         SET embedding = $1 
         WHERE id = $2`,
                [`[${embeddingResult.embedding.join(',')}]`, messageId]
            );

            logger.debug('[ChatContextBuilder] Message embedding stored', { messageId });

        } catch (error) {
            logger.warn('[ChatContextBuilder] Failed to generate message embedding', {
                messageId,
                error: error instanceof Error ? error.message : String(error),
            });
            // Non-critical, don't throw
        }
    }

    /**
     * Batch generate embeddings for messages without embeddings
     */
    async backfillEmbeddings(conversationId: string, batchSize: number = 10): Promise<number> {
        let processed = 0;

        try {
            // Find messages without embeddings
            const result = await db.query<{ id: string; content: string }>(
                `SELECT id, content 
         FROM messages 
         WHERE conversation_id = $1 
           AND embedding IS NULL 
         ORDER BY turn_index ASC 
         LIMIT $2`,
                [conversationId, batchSize]
            );

            if (!result || result.rows.length === 0) {
                return 0;
            }

            // Generate embeddings in batch
            const texts = result.rows.map(r => r.content);
            const embeddings = await embeddingService.getBatchEmbeddings({ texts });

            // Store embeddings
            for (let i = 0; i < result.rows.length; i++) {
                const messageId = result.rows[i].id;
                const embeddingResult = embeddings[i];

                if (embeddingResult) {
                    await db.query(
                        `UPDATE messages 
             SET embedding = $1 
             WHERE id = $2`,
                        [`[${embeddingResult.embedding.join(',')}]`, messageId]
                    );
                    processed++;
                }
            }

            logger.info('[ChatContextBuilder] Backfilled embeddings', {
                conversationId,
                processed,
                total: result.rows.length,
            });

        } catch (error) {
            logger.error('[ChatContextBuilder] Embedding backfill failed', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return processed;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const chatContextBuilder = new ChatContextBuilder();

// ============================================================================
// Config Resolution Helper (for integration)
// ============================================================================

/**
 * Resolve chat context config for a specific project/tool/model combination
 * TODO: Implement DB-backed configuration
 */
export async function resolveChatContextConfig(
    _projectId?: string,
    _toolId?: string,
    modelId?: string
): Promise<ChatContextConfig> {
    // Start with defaults
    let config = { ...DEFAULT_CHAT_CONTEXT_CONFIG };

    // TODO: Load from database
    // const projectConfig = await loadProjectConfig(projectId);
    // const toolConfig = await loadToolConfig(toolId);
    // const modelConfig = await loadModelConfig(modelId);

    // Adjust token limits based on model
    if (modelId) {
        if (modelId.includes('gpt-4')) {
            config.maxPromptTokens = 8192;
        } else if (modelId.includes('claude-3')) {
            config.maxPromptTokens = 100000;
        } else if (modelId.includes('gpt-3.5')) {
            config.maxPromptTokens = 4096;
        }
    }

    return config;
}
