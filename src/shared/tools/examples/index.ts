/**
 * @file Example Unified Tools
 * @description Sample tools demonstrating the unified tool system
 */

import { z } from 'zod';
import { UnifiedToolDefinition, ToolContext, ToolResult } from '../base.js';
import { routeRequest } from '../../../routing/index.js';
import { chatContextBuilder } from '../../../services/chat/ChatContextBuilder.js';
import { db } from '../../../db/postgres.js';
import { logger } from '../../../logging/logger.js';

/**
 * AI Chat Tool - Routes chat requests to appropriate LLM
 */
export const aiChatTool: UnifiedToolDefinition<
    {
        message: string;
        conversationId?: string;
        model?: string;
        temperature?: number;
    },
    {
        response: string;
        model: string;
        tokensUsed: number;
        cost: number;
    }
> = {
    name: 'ai.chat',
    description: 'Send a chat message to AI and get a response with automatic model routing',
    category: 'ai',

    inputSchema: z.object({
        message: z.string().min(1).describe('The message to send to AI'),
        conversationId: z.string().optional().describe('Conversation ID for context'),
        model: z.string().optional().describe('Specific model to use (optional)'),
        temperature: z.number().min(0).max(2).optional().describe('Temperature for response generation'),
    }),

    handler: async (input, context): Promise<ToolResult> => {
        try {
            // Build context if conversation ID provided
            let messages = [{ role: 'user' as const, content: input.message }];

            if (input.conversationId) {
                const contextResult = await chatContextBuilder.buildContext({
                    conversationId: input.conversationId,
                    currentMessages: messages,
                    maxTokens: 4096,
                });
                messages = contextResult.messages;
            }

            // Route request
            const result = await routeRequest({
                task: input.message,
                messages,
                model: input.model,
                temperature: input.temperature,
            });

            return {
                success: true,
                data: {
                    response: result.text,
                    model: result.modelUsed,
                    tokensUsed: result.tokensUsed || 0,
                    cost: result.cost || 0,
                },
                metadata: {
                    tokensUsed: result.tokensUsed,
                    cost: result.cost,
                },
            };
        } catch (error) {
            logger.error('AI chat tool error', { error });
            return {
                success: false,
                error: {
                    code: 'AI_CHAT_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to process chat',
                },
            };
        }
    },

    metadata: {
        requiresAuth: false,
        rateLimit: 60, // 60 calls per minute
        estimatedDuration: 3000,
        tags: ['ai', 'chat', 'llm'],
        examples: [
            {
                input: {
                    message: 'Explain quantum computing in simple terms',
                },
                description: 'Simple chat without context',
            },
        ],
    },
};

/**
 * Database Query Tool
 */
export const dbQueryTool: UnifiedToolDefinition<
    {
        query: string;
        params?: any[];
    },
    {
        rows: any[];
        rowCount: number;
    }
> = {
    name: 'db.query',
    description: 'Execute a SQL query on the database',
    category: 'database',

    inputSchema: z.object({
        query: z.string().min(1).describe('SQL query to execute'),
        params: z.array(z.any()).optional().describe('Query parameters'),
    }),

    handler: async (input, context): Promise<ToolResult> => {
        try {
            const result = await db.query(input.query, input.params);

            return {
                success: true,
                data: {
                    rows: result?.rows || [],
                    rowCount: result?.rows?.length || 0,
                },
            };
        } catch (error) {
            logger.error('Database query error', { error, query: input.query });
            return {
                success: false,
                error: {
                    code: 'DB_QUERY_ERROR',
                    message: error instanceof Error ? error.message : 'Query failed',
                },
            };
        }
    },

    metadata: {
        requiresAuth: true,
        rateLimit: 100,
        estimatedDuration: 500,
        tags: ['database', 'query'],
    },
};

/**
 * Context Stats Tool - Get conversation context statistics
 */
export const contextStatsTool: UnifiedToolDefinition<
    {
        conversationId: string;
    },
    {
        totalMessages: number;
        totalTokens: number;
        summarizedMessages: number;
        messagesWithEmbeddings: number;
        hasSummary: boolean;
    }
> = {
    name: 'chat.context_stats',
    description: 'Get statistics about a conversation context',
    category: 'chat',

    inputSchema: z.object({
        conversationId: z.string().describe('Conversation ID to get stats for'),
    }),

    handler: async (input, context): Promise<ToolResult> => {
        try {
            const result = await db.query<{
                total_messages: number;
                total_tokens: number;
                summarized_messages: number;
                messages_with_embeddings: number;
                has_summary: boolean;
            }>(
                `SELECT 
                    COUNT(m.id) as total_messages,
                    COALESCE(SUM(m.token_estimate), 0) as total_tokens,
                    COUNT(CASE WHEN m.is_summarized THEN 1 END) as summarized_messages,
                    COUNT(CASE WHEN m.embedding IS NOT NULL THEN 1 END) as messages_with_embeddings,
                    c.summary IS NOT NULL as has_summary
                 FROM messages m
                 LEFT JOIN conversations c ON c.id = m.conversation_id
                 WHERE m.conversation_id = $1
                 GROUP BY c.summary`,
                [input.conversationId]
            );

            if (!result || result.rows.length === 0) {
                return {
                    success: false,
                    error: {
                        code: 'CONVERSATION_NOT_FOUND',
                        message: 'Conversation not found',
                    },
                };
            }

            const row = result.rows[0];

            return {
                success: true,
                data: {
                    totalMessages: Number(row.total_messages),
                    totalTokens: Number(row.total_tokens),
                    summarizedMessages: Number(row.summarized_messages),
                    messagesWithEmbeddings: Number(row.messages_with_embeddings),
                    hasSummary: Boolean(row.has_summary),
                },
            };
        } catch (error) {
            logger.error('Context stats error', { error, conversationId: input.conversationId });
            return {
                success: false,
                error: {
                    code: 'STATS_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to get stats',
                },
            };
        }
    },

    metadata: {
        requiresAuth: false,
        rateLimit: 100,
        estimatedDuration: 200,
        tags: ['chat', 'context', 'stats'],
    },
};

/**
 * Export all example tools
 */
export const exampleTools = [
    aiChatTool,
    dbQueryTool,
    contextStatsTool,
];
