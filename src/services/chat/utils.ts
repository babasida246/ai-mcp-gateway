/**
 * Utility functions for Chat Context Optimization
 * 
 * Provides helper functions for managing chat context, embeddings, and configuration
 */

import { db } from '../../db/postgres.js';
import { logger } from '../../logging/logger.js';
import { chatContextBuilder } from './ChatContextBuilder.js';
import { embeddingService } from './EmbeddingService.js';
import type { ChatContextConfig, ChatContextStrategy } from './ChatContextBuilder.js';

/**
 * Update chat context configuration for a project or tool
 */
export async function updateChatContextConfig(params: {
    projectId?: string;
    toolId?: string;
    strategy?: ChatContextStrategy;
    maxPromptTokens?: number;
    recentMinMessages?: number;
    enableSummarization?: boolean;
    summaryTriggerTokens?: number;
    spanTopK?: number;
    spanRadius?: number;
    spanBudgetRatio?: number;
}): Promise<void> {
    const {
        projectId,
        toolId,
        strategy,
        maxPromptTokens,
        recentMinMessages,
        enableSummarization,
        summaryTriggerTokens,
        spanTopK,
        spanRadius,
        spanBudgetRatio,
    } = params;

    if (!projectId && !toolId) {
        throw new Error('Must provide either projectId or toolId');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (strategy !== undefined) {
        updates.push(`strategy = $${paramIndex++}`);
        values.push(strategy);
    }
    if (maxPromptTokens !== undefined) {
        updates.push(`max_prompt_tokens = $${paramIndex++}`);
        values.push(maxPromptTokens);
    }
    if (recentMinMessages !== undefined) {
        updates.push(`recent_min_messages = $${paramIndex++}`);
        values.push(recentMinMessages);
    }
    if (enableSummarization !== undefined) {
        updates.push(`enable_summarization = $${paramIndex++}`);
        values.push(enableSummarization);
    }
    if (summaryTriggerTokens !== undefined) {
        updates.push(`summary_trigger_tokens = $${paramIndex++}`);
        values.push(summaryTriggerTokens);
    }
    if (spanTopK !== undefined) {
        updates.push(`span_top_k = $${paramIndex++}`);
        values.push(spanTopK);
    }
    if (spanRadius !== undefined) {
        updates.push(`span_radius = $${paramIndex++}`);
        values.push(spanRadius);
    }
    if (spanBudgetRatio !== undefined) {
        updates.push(`span_budget_ratio = $${paramIndex++}`);
        values.push(spanBudgetRatio);
    }

    updates.push(`updated_at = NOW()`);

    values.push(projectId || null, toolId || null);

    const query = `
        INSERT INTO chat_context_config (project_id, tool_id, ${updates.join(', ').replace(/= \$\d+/g, '')})
        VALUES ($${paramIndex++}, $${paramIndex++}, ${updates.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (project_id, tool_id)
        DO UPDATE SET ${updates.join(', ')}
    `;

    await db.query(query, values);

    logger.info('Updated chat context config', {
        projectId,
        toolId,
        updates: Object.keys(params).filter(k => k !== 'projectId' && k !== 'toolId'),
    });
}

/**
 * Get chat context configuration for a project or tool
 */
export async function getChatContextConfig(
    projectId?: string,
    toolId?: string
): Promise<ChatContextConfig | null> {
    try {
        const query = `
            SELECT * FROM chat_context_config
            WHERE (project_id = $1 OR (project_id IS NULL AND $1 IS NULL))
              AND (tool_id = $2 OR (tool_id IS NULL AND $2 IS NULL))
            ORDER BY 
                CASE 
                    WHEN project_id IS NOT NULL AND tool_id IS NOT NULL THEN 1
                    WHEN project_id IS NOT NULL THEN 2
                    WHEN tool_id IS NOT NULL THEN 3
                    ELSE 4
                END
            LIMIT 1
        `;

        const result = await db.query<{
            strategy: ChatContextStrategy;
            max_prompt_tokens: number;
            recent_min_messages: number;
            enable_summarization: boolean;
            summary_trigger_tokens: number;
            span_top_k: number;
            span_radius: number;
            span_budget_ratio: number;
        }>(query, [projectId || null, toolId || null]);

        if (!result || result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            strategy: row.strategy,
            maxPromptTokens: row.max_prompt_tokens,
            recentMinMessages: row.recent_min_messages,
            recentMaxMessages: 20, // Default
            spanTopK: row.span_top_k,
            spanRadius: row.span_radius,
            spanBudgetRatio: Number(row.span_budget_ratio),
            spanMinSimilarity: 0.7, // Default
            summarizationThreshold: row.summary_trigger_tokens,
        };
    } catch (error) {
        logger.error('Failed to get chat context config', {
            projectId,
            toolId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Backfill embeddings for all messages in a conversation
 */
export async function backfillConversationEmbeddings(
    conversationId: string,
    options: {
        batchSize?: number;
        maxMessages?: number;
    } = {}
): Promise<{ processed: number; total: number }> {
    const { batchSize = 10, maxMessages = 1000 } = options;

    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore && totalProcessed < maxMessages) {
        const processed = await chatContextBuilder.backfillEmbeddings(
            conversationId,
            batchSize
        );

        totalProcessed += processed;

        if (processed < batchSize) {
            hasMore = false;
        }
    }

    logger.info('Backfilled embeddings for conversation', {
        conversationId,
        processed: totalProcessed,
    });

    return {
        processed: totalProcessed,
        total: totalProcessed,
    };
}

/**
 * Trigger summary generation for a conversation
 */
export async function triggerConversationSummary(
    conversationId: string
): Promise<void> {
    // Get unsummarized messages
    const result = await db.query<{
        id: string;
        role: string;
        content: string;
    }>(
        `SELECT id, role, content
         FROM messages
         WHERE conversation_id = $1
           AND is_summarized = false
         ORDER BY turn_index ASC`,
        [conversationId]
    );

    if (!result || result.rows.length === 0) {
        logger.info('No unsummarized messages found', { conversationId });
        return;
    }

    // Trigger summarization via ChatContextBuilder
    await chatContextBuilder['generateSummary'](conversationId, result.rows);

    logger.info('Triggered conversation summary', {
        conversationId,
        messageCount: result.rows.length,
    });
}

/**
 * Get conversation statistics
 */
export async function getConversationStats(conversationId: string): Promise<{
    totalMessages: number;
    totalTokens: number;
    summarizedMessages: number;
    messagesWithEmbeddings: number;
    hasSummary: boolean;
    summaryTokens: number;
}> {
    const result = await db.query<{
        total_messages: number;
        total_tokens: number;
        summarized_messages: number;
        messages_with_embeddings: number;
        has_summary: boolean;
        summary_tokens: number;
    }>(
        `SELECT 
            COUNT(m.id) as total_messages,
            COALESCE(SUM(m.token_estimate), 0) as total_tokens,
            COUNT(CASE WHEN m.is_summarized THEN 1 END) as summarized_messages,
            COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as messages_with_embeddings,
            c.summary IS NOT NULL as has_summary,
            COALESCE(c.summary_token_estimate, 0) as summary_tokens
         FROM messages m
         LEFT JOIN conversations c ON c.id = m.conversation_id
         WHERE m.conversation_id = $1
         GROUP BY c.summary, c.summary_token_estimate`,
        [conversationId]
    );

    if (!result || result.rows.length === 0) {
        return {
            totalMessages: 0,
            totalTokens: 0,
            summarizedMessages: 0,
            messagesWithEmbeddings: 0,
            hasSummary: false,
            summaryTokens: 0,
        };
    }

    const row = result.rows[0];
    return {
        totalMessages: Number(row.total_messages),
        totalTokens: Number(row.total_tokens),
        summarizedMessages: Number(row.summarized_messages),
        messagesWithEmbeddings: Number(row.messages_with_embeddings),
        hasSummary: Boolean(row.has_summary),
        summaryTokens: Number(row.summary_tokens),
    };
}

/**
 * Clear conversation summary and reset summarization flags
 */
export async function clearConversationSummary(conversationId: string): Promise<void> {
    await db.query(
        `UPDATE conversations 
         SET summary = NULL, 
             summary_token_estimate = 0, 
             summary_updated_at = NULL 
         WHERE id = $1`,
        [conversationId]
    );

    await db.query(
        `UPDATE messages 
         SET is_summarized = false 
         WHERE conversation_id = $1`,
        [conversationId]
    );

    logger.info('Cleared conversation summary', { conversationId });
}

/**
 * Export utilities
 */
export const chatContextUtils = {
    updateConfig: updateChatContextConfig,
    getConfig: getChatContextConfig,
    backfillEmbeddings: backfillConversationEmbeddings,
    triggerSummary: triggerConversationSummary,
    getStats: getConversationStats,
    clearSummary: clearConversationSummary,
};
