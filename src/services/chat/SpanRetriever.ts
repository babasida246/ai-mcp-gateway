/**
 * @file Span Retriever Service
 * @description Retrieves semantically relevant message spans from conversation history
 * using pgvector similarity search.
 * 
 * **Span Retrieval Algorithm:**
 * 1. Generate embedding for the query (user's current message)
 * 2. Find top-K semantically similar messages in the conversation
 * 3. Expand each hit by ±radius messages to create continuous spans
 * 4. Merge overlapping spans
 * 5. Apply token budget constraints
 * 6. Return messages sorted by turn_index
 * 
 * @example
 * ```typescript
 * const retriever = new SpanRetriever();
 * const spans = await retriever.retrieveSpans({
 *   conversationId: 'conv-123',
 *   queryEmbedding: [0.1, 0.2, ...],
 *   topK: 5,
 *   radius: 2,
 *   tokenBudget: 2000,
 * });
 * ```
 */

import { db } from '../../db/postgres.js';
import { logger } from '../../logging/logger.js';
import { EmbeddingService, embeddingService } from './EmbeddingService.js';
import { TokenEstimator, tokenEstimator } from './TokenEstimator.js';

/**
 * Retrieved message from database
 */
export interface RetrievedMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    turnIndex: number;
    tokenEstimate: number | null;
    similarity?: number;
    isAnchor?: boolean;  // Whether this message was a direct similarity hit
}

/**
 * Span of continuous messages
 */
export interface MessageSpan {
    messages: RetrievedMessage[];
    startTurnIndex: number;
    endTurnIndex: number;
    totalTokens: number;
    anchorCount: number;  // Number of similarity hits in this span
}

/**
 * Configuration for span retrieval
 */
export interface SpanRetrievalConfig {
    /**
     * Number of similar messages to retrieve
     * @default 5
     */
    topK?: number;

    /**
     * Number of messages to include around each hit
     * @default 2
     */
    radius?: number;

    /**
     * Maximum token budget for spans
     * @default 2000
     */
    tokenBudget?: number;

    /**
     * Minimum similarity score (0-1) to include a message
     * @default 0.3
     */
    minSimilarity?: number;

    /**
     * Whether to include system messages in spans
     * @default false
     */
    includeSystemMessages?: boolean;
}

/**
 * Span retrieval request
 */
export interface SpanRetrievalRequest {
    conversationId: string;
    queryText?: string;
    queryEmbedding?: number[];
    excludeTurnIndex?: number;  // Exclude current message
    config?: SpanRetrievalConfig;
}

/**
 * Span retrieval result
 */
export interface SpanRetrievalResult {
    spans: MessageSpan[];
    allMessages: RetrievedMessage[];
    totalTokens: number;
    anchorCount: number;
    method: 'embedding' | 'fallback-recent';
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SpanRetrievalConfig> = {
    topK: 5,
    radius: 2,
    tokenBudget: 2000,
    minSimilarity: 0.3,
    includeSystemMessages: false,
};

/**
 * SpanRetriever class
 * Retrieves relevant message spans using semantic similarity
 */
export class SpanRetriever {
    private embeddingService: EmbeddingService;
    private tokenEstimator: TokenEstimator;

    constructor(
        embeddingSvc?: EmbeddingService,
        tokenEst?: TokenEstimator
    ) {
        this.embeddingService = embeddingSvc || embeddingService;
        this.tokenEstimator = tokenEst || tokenEstimator;
    }

    /**
     * Find semantically similar messages using pgvector
     */
    private async findSimilarMessages(
        conversationId: string,
        queryEmbedding: number[],
        topK: number,
        excludeTurnIndex?: number,
        minSimilarity?: number
    ): Promise<RetrievedMessage[]> {
        // Format embedding for PostgreSQL vector type
        const embeddingStr = EmbeddingService.formatForPostgres(queryEmbedding);

        // Query using pgvector's <=> operator (cosine distance)
        // Convert to similarity by using 1 - distance
        const query = `
            SELECT 
                id,
                role,
                content,
                turn_index as "turnIndex",
                token_estimate as "tokenEstimate",
                1 - (embedding <=> $2::vector) as similarity
            FROM messages
            WHERE conversation_id = $1
              AND embedding IS NOT NULL
              ${excludeTurnIndex !== undefined ? `AND turn_index < $4` : ''}
              ${minSimilarity !== undefined ? `AND 1 - (embedding <=> $2::vector) >= $${excludeTurnIndex !== undefined ? 5 : 4}` : ''}
            ORDER BY embedding <=> $2::vector
            LIMIT $3
        `;

        const params: (string | number)[] = [conversationId, embeddingStr, topK];
        if (excludeTurnIndex !== undefined) {
            params.push(excludeTurnIndex);
        }
        if (minSimilarity !== undefined) {
            params.push(minSimilarity);
        }

        try {
            const result = await db.query<{
                id: string;
                role: string;
                content: string;
                turnIndex: number;
                tokenEstimate: number | null;
                similarity: number;
            }>(query, params);

            if (!result || result.rows.length === 0) {
                return [];
            }

            return result.rows.map(row => ({
                id: row.id,
                role: row.role as RetrievedMessage['role'],
                content: row.content,
                turnIndex: row.turnIndex,
                tokenEstimate: row.tokenEstimate,
                similarity: row.similarity,
                isAnchor: true,
            }));
        } catch (error) {
            logger.error('SpanRetriever: pgvector query failed', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
        }
    }

    /**
     * Get messages by turn index range
     */
    private async getMessagesByTurnRange(
        conversationId: string,
        startTurn: number,
        endTurn: number,
        includeSystem: boolean
    ): Promise<RetrievedMessage[]> {
        const roleFilter = includeSystem ? '' : `AND role != 'system'`;

        const query = `
            SELECT 
                id,
                role,
                content,
                turn_index as "turnIndex",
                token_estimate as "tokenEstimate"
            FROM messages
            WHERE conversation_id = $1
              AND turn_index >= $2
              AND turn_index <= $3
              ${roleFilter}
            ORDER BY turn_index ASC
        `;

        const result = await db.query<{
            id: string;
            role: string;
            content: string;
            turnIndex: number;
            tokenEstimate: number | null;
        }>(query, [conversationId, startTurn, endTurn]);

        if (!result || result.rows.length === 0) {
            return [];
        }

        return result.rows.map(row => ({
            id: row.id,
            role: row.role as RetrievedMessage['role'],
            content: row.content,
            turnIndex: row.turnIndex,
            tokenEstimate: row.tokenEstimate,
            isAnchor: false,
        }));
    }

    /**
     * Get recent messages (fallback when embedding search fails)
     */
    private async getRecentMessages(
        conversationId: string,
        limit: number,
        includeSystem: boolean
    ): Promise<RetrievedMessage[]> {
        const roleFilter = includeSystem ? '' : `AND role != 'system'`;

        const query = `
            SELECT 
                id,
                role,
                content,
                turn_index as "turnIndex",
                token_estimate as "tokenEstimate"
            FROM messages
            WHERE conversation_id = $1
              ${roleFilter}
            ORDER BY turn_index DESC
            LIMIT $2
        `;

        const result = await db.query<{
            id: string;
            role: string;
            content: string;
            turnIndex: number;
            tokenEstimate: number | null;
        }>(query, [conversationId, limit]);

        if (!result || result.rows.length === 0) {
            return [];
        }

        // Reverse to get chronological order
        return result.rows.reverse().map(row => ({
            id: row.id,
            role: row.role as RetrievedMessage['role'],
            content: row.content,
            turnIndex: row.turnIndex,
            tokenEstimate: row.tokenEstimate,
            isAnchor: false,
        }));
    }

    /**
     * Expand anchor messages by radius to create spans
     */
    private async expandToSpans(
        conversationId: string,
        anchors: RetrievedMessage[],
        radius: number,
        includeSystem: boolean
    ): Promise<MessageSpan[]> {
        if (anchors.length === 0) {
            return [];
        }

        // Calculate turn ranges for each anchor
        const ranges: Array<{ start: number; end: number; anchor: RetrievedMessage }> = anchors.map(anchor => ({
            start: Math.max(0, anchor.turnIndex - radius),
            end: anchor.turnIndex + radius,
            anchor,
        }));

        // Merge overlapping ranges
        ranges.sort((a, b) => a.start - b.start);
        const mergedRanges: Array<{ start: number; end: number; anchors: RetrievedMessage[] }> = [];

        for (const range of ranges) {
            const last = mergedRanges[mergedRanges.length - 1];
            if (last && range.start <= last.end + 1) {
                // Merge overlapping ranges
                last.end = Math.max(last.end, range.end);
                last.anchors.push(range.anchor);
            } else {
                mergedRanges.push({
                    start: range.start,
                    end: range.end,
                    anchors: [range.anchor],
                });
            }
        }

        // Fetch messages for each merged range
        const spans: MessageSpan[] = [];

        for (const range of mergedRanges) {
            const messages = await this.getMessagesByTurnRange(
                conversationId,
                range.start,
                range.end,
                includeSystem
            );

            if (messages.length === 0) continue;

            // Mark anchor messages
            const anchorIds = new Set(range.anchors.map(a => a.id));
            for (const msg of messages) {
                if (anchorIds.has(msg.id)) {
                    msg.isAnchor = true;
                    // Copy similarity score from anchor
                    const anchor = range.anchors.find(a => a.id === msg.id);
                    if (anchor) {
                        msg.similarity = anchor.similarity;
                    }
                }
            }

            // Calculate total tokens
            let totalTokens = 0;
            for (const msg of messages) {
                if (msg.tokenEstimate) {
                    totalTokens += msg.tokenEstimate;
                } else {
                    // Estimate if not pre-calculated
                    totalTokens += await this.tokenEstimator.estimate(msg.content);
                }
            }

            spans.push({
                messages,
                startTurnIndex: messages[0].turnIndex,
                endTurnIndex: messages[messages.length - 1].turnIndex,
                totalTokens,
                anchorCount: range.anchors.length,
            });
        }

        return spans;
    }

    /**
     * Apply token budget to spans, prioritizing spans with more anchors
     */
    private applyTokenBudget(spans: MessageSpan[], budget: number): MessageSpan[] {
        if (spans.length === 0) return [];

        // Sort spans by anchor count (descending), then by total similarity
        const sortedSpans = [...spans].sort((a, b) => {
            if (b.anchorCount !== a.anchorCount) {
                return b.anchorCount - a.anchorCount;
            }
            // Secondary: sum of similarity scores
            const simA = a.messages.reduce((sum, m) => sum + (m.similarity || 0), 0);
            const simB = b.messages.reduce((sum, m) => sum + (m.similarity || 0), 0);
            return simB - simA;
        });

        const selectedSpans: MessageSpan[] = [];
        let usedTokens = 0;

        for (const span of sortedSpans) {
            if (usedTokens + span.totalTokens <= budget) {
                selectedSpans.push(span);
                usedTokens += span.totalTokens;
            } else if (usedTokens < budget && span.messages.length > 0) {
                // Try to include partial span (from the anchor outward)
                const anchorIndex = span.messages.findIndex(m => m.isAnchor);
                if (anchorIndex >= 0) {
                    const partialMessages: RetrievedMessage[] = [];
                    let partialTokens = 0;
                    const remainingBudget = budget - usedTokens;

                    // Start from anchor and expand outward
                    const indices = [anchorIndex];
                    let left = anchorIndex - 1;
                    let right = anchorIndex + 1;

                    while (left >= 0 || right < span.messages.length) {
                        if (right < span.messages.length) {
                            indices.push(right);
                            right++;
                        }
                        if (left >= 0) {
                            indices.unshift(left);
                            left--;
                        }
                    }

                    for (const idx of indices.sort((a, b) => a - b)) {
                        const msg = span.messages[idx];
                        const tokens = msg.tokenEstimate || 50;
                        if (partialTokens + tokens <= remainingBudget) {
                            partialMessages.push(msg);
                            partialTokens += tokens;
                        }
                    }

                    if (partialMessages.length > 0) {
                        selectedSpans.push({
                            messages: partialMessages,
                            startTurnIndex: partialMessages[0].turnIndex,
                            endTurnIndex: partialMessages[partialMessages.length - 1].turnIndex,
                            totalTokens: partialTokens,
                            anchorCount: partialMessages.filter(m => m.isAnchor).length,
                        });
                        usedTokens += partialTokens;
                    }
                }
            }
        }

        // Sort by start turn index for chronological order
        return selectedSpans.sort((a, b) => a.startTurnIndex - b.startTurnIndex);
    }

    /**
     * Main retrieval method
     */
    async retrieveSpans(request: SpanRetrievalRequest): Promise<SpanRetrievalResult> {
        const config = { ...DEFAULT_CONFIG, ...request.config };

        logger.debug('SpanRetriever: Starting span retrieval', {
            conversationId: request.conversationId,
            hasQueryEmbedding: !!request.queryEmbedding,
            hasQueryText: !!request.queryText,
            config,
        });

        try {
            // Get or generate query embedding
            let queryEmbedding = request.queryEmbedding;

            if (!queryEmbedding && request.queryText) {
                const embeddingResult = await this.embeddingService.getEmbedding(request.queryText);
                queryEmbedding = embeddingResult.embedding;
            }

            if (!queryEmbedding) {
                // Fallback to recent messages if no embedding available
                logger.warn('SpanRetriever: No query embedding, falling back to recent messages');

                const recentMessages = await this.getRecentMessages(
                    request.conversationId,
                    Math.ceil(config.tokenBudget / 100), // Rough estimate
                    config.includeSystemMessages
                );

                let totalTokens = 0;
                for (const msg of recentMessages) {
                    totalTokens += msg.tokenEstimate || await this.tokenEstimator.estimate(msg.content);
                }

                return {
                    spans: [{
                        messages: recentMessages,
                        startTurnIndex: recentMessages[0]?.turnIndex || 0,
                        endTurnIndex: recentMessages[recentMessages.length - 1]?.turnIndex || 0,
                        totalTokens,
                        anchorCount: 0,
                    }],
                    allMessages: recentMessages,
                    totalTokens,
                    anchorCount: 0,
                    method: 'fallback-recent',
                };
            }

            // Find similar messages using pgvector
            const anchors = await this.findSimilarMessages(
                request.conversationId,
                queryEmbedding,
                config.topK,
                request.excludeTurnIndex,
                config.minSimilarity
            );

            if (anchors.length === 0) {
                logger.debug('SpanRetriever: No similar messages found');
                return {
                    spans: [],
                    allMessages: [],
                    totalTokens: 0,
                    anchorCount: 0,
                    method: 'embedding',
                };
            }

            // Expand anchors to spans
            const spans = await this.expandToSpans(
                request.conversationId,
                anchors,
                config.radius,
                config.includeSystemMessages
            );

            // Apply token budget
            const budgetedSpans = this.applyTokenBudget(spans, config.tokenBudget);

            // Flatten all messages and deduplicate
            const messageMap = new Map<string, RetrievedMessage>();
            for (const span of budgetedSpans) {
                for (const msg of span.messages) {
                    if (!messageMap.has(msg.id)) {
                        messageMap.set(msg.id, msg);
                    }
                }
            }

            const allMessages = Array.from(messageMap.values())
                .sort((a, b) => a.turnIndex - b.turnIndex);

            const totalTokens = budgetedSpans.reduce((sum, s) => sum + s.totalTokens, 0);
            const anchorCount = allMessages.filter(m => m.isAnchor).length;

            logger.info('SpanRetriever: Span retrieval complete', {
                conversationId: request.conversationId,
                spansRetrieved: budgetedSpans.length,
                messagesRetrieved: allMessages.length,
                totalTokens,
                anchorCount,
                tokenBudget: config.tokenBudget,
            });

            return {
                spans: budgetedSpans,
                allMessages,
                totalTokens,
                anchorCount,
                method: 'embedding',
            };
        } catch (error) {
            logger.error('SpanRetriever: Retrieval failed, falling back to recent', {
                conversationId: request.conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });

            // Fallback to recent messages
            const recentMessages = await this.getRecentMessages(
                request.conversationId,
                20,
                config.includeSystemMessages
            );

            let totalTokens = 0;
            for (const msg of recentMessages) {
                totalTokens += msg.tokenEstimate || await this.tokenEstimator.estimate(msg.content);
            }

            return {
                spans: recentMessages.length > 0 ? [{
                    messages: recentMessages,
                    startTurnIndex: recentMessages[0]?.turnIndex || 0,
                    endTurnIndex: recentMessages[recentMessages.length - 1]?.turnIndex || 0,
                    totalTokens,
                    anchorCount: 0,
                }] : [],
                allMessages: recentMessages,
                totalTokens,
                anchorCount: 0,
                method: 'fallback-recent',
            };
        }
    }
}

/**
 * Singleton instance
 */
export const spanRetriever = new SpanRetriever();
