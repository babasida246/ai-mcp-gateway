import { redisCache, CacheKeys } from '../cache/redis.js';
import { db } from '../db/postgres.js';
import { logger } from '../logging/logger.js';

/**
 * Context summary structure
 */
export interface ContextSummary {
    conversationId: string;
    stack?: string[];
    architecture?: string;
    modules?: string[];
    mainFiles?: string[];
    decisions?: string[];
    todos?: TodoItem[];
    lastUpdated: string;
}

/**
 * TODO item structure
 */
export interface TodoItem {
    id: number;
    title: string;
    description: string;
    status: 'not-started' | 'in-progress' | 'completed';
}

/**
 * Message structure
 */
export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    metadata?: Record<string, unknown>;
    timestamp?: string;
}

/**
 * Context Manager
 * Manages conversation context with Redis (hot) + DB (cold) layers
 */
export class ContextManager {
    /**
     * Get context summary for a conversation
     * First tries Redis (hot), then DB (cold)
     */
    async getSummary(conversationId: string): Promise<ContextSummary | null> {
        // Try Redis first (hot layer)
        const cachedSummary = await redisCache.get<ContextSummary>(
            CacheKeys.conversationSummary(conversationId)
        );

        if (cachedSummary) {
            logger.debug('Context summary loaded from Redis', {
                conversationId,
            });
            return cachedSummary;
        }

        // Fallback to DB (cold layer)
        const result = await db.query<{
            summary: string;
            created_at: Date;
        }>(
            `SELECT summary, created_at FROM context_summaries 
             WHERE conversation_id = $1 
             ORDER BY version DESC LIMIT 1`,
            [conversationId]
        );

        if (result && result.rows.length > 0) {
            const dbSummary: ContextSummary = JSON.parse(
                result.rows[0].summary
            );
            // Cache in Redis for future access
            await redisCache.set(
                CacheKeys.conversationSummary(conversationId),
                dbSummary,
                3600 // 1 hour TTL
            );

            logger.debug('Context summary loaded from DB and cached', {
                conversationId,
            });
            return dbSummary;
        }

        logger.debug('No context summary found', { conversationId });
        return null;
    }

    /**
     * Update context summary
     * Writes to both Redis (hot) and DB (cold)
     */
    async updateSummary(
        conversationId: string,
        summary: ContextSummary
    ): Promise<void> {
        summary.lastUpdated = new Date().toISOString();

        // Update Redis (hot layer)
        await redisCache.set(
            CacheKeys.conversationSummary(conversationId),
            summary,
            3600 // 1 hour TTL
        );

        // Update DB (cold layer)
        try {
            // Get current version
            const versionResult = await db.query<{ version: number }>(
                `SELECT MAX(version) as version FROM context_summaries WHERE conversation_id = $1`,
                [conversationId]
            );

            const nextVersion =
                (versionResult?.rows[0]?.version ?? 0) + 1;

            await db.insert('context_summaries', {
                conversation_id: conversationId,
                summary: JSON.stringify(summary),
                version: nextVersion,
            });

            logger.debug('Context summary updated', { conversationId });
        } catch (error) {
            logger.error('Failed to update context summary in DB', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Get recent messages for a conversation
     */
    async getRecentMessages(
        conversationId: string,
        limit = 10
    ): Promise<Message[]> {
        // Try Redis first
        const cachedMessages = await redisCache.get<Message[]>(
            CacheKeys.contextMessages(conversationId)
        );

        if (cachedMessages) {
            return cachedMessages.slice(-limit);
        }

        // Fallback to DB
        const result = await db.query<{
            role: string;
            content: string;
            metadata: Record<string, unknown>;
            created_at: Date;
        }>(
            `SELECT role, content, metadata, created_at 
             FROM messages 
             WHERE conversation_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [conversationId, limit]
        );

        if (!result || result.rows.length === 0) {
            return [];
        }

        const messages: Message[] = result.rows.reverse().map((row) => ({
            role: row.role as Message['role'],
            content: row.content,
            metadata: row.metadata,
            timestamp: row.created_at.toISOString(),
        }));

        // Cache in Redis
        await redisCache.set(
            CacheKeys.contextMessages(conversationId),
            messages,
            1800 // 30 minutes TTL
        );

        return messages;
    }

    /**
     * Add a message to conversation
     */
    async addMessage(
        conversationId: string,
        message: Message
    ): Promise<void> {
        // Save to DB
        try {
            await db.insert('messages', {
                conversation_id: conversationId,
                role: message.role,
                content: message.content,
                metadata: message.metadata
                    ? JSON.stringify(message.metadata)
                    : '{}',
            });
        } catch (error) {
            logger.error('Failed to save message to DB', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }

        // Update Redis cache
        const cachedMessages = await redisCache.get<Message[]>(
            CacheKeys.contextMessages(conversationId)
        );
        const messages = cachedMessages || [];
        messages.push(message);

        // Keep only last 50 messages in cache
        const trimmedMessages = messages.slice(-50);
        await redisCache.set(
            CacheKeys.contextMessages(conversationId),
            trimmedMessages,
            1800 // 30 minutes TTL
        );
    }

    /**
     * Compress context by summarizing old messages
     */
    async compressContext(conversationId: string): Promise<string> {
        const summary = await this.getSummary(conversationId);
        const recentMessages = await this.getRecentMessages(
            conversationId,
            20
        );

        // Build compressed context
        const compressed = {
            summary: summary || {
                conversationId,
                lastUpdated: new Date().toISOString(),
            },
            recentMessages: recentMessages.slice(-5), // Only keep last 5
        };

        return JSON.stringify(compressed, null, 2);
    }

    /**
     * Create or ensure conversation exists
     */
    async ensureConversation(
        conversationId: string,
        userId?: string,
        projectId?: string
    ): Promise<void> {
        try {
            const exists = await db.query(
                `SELECT id FROM conversations WHERE id = $1`,
                [conversationId]
            );

            if (!exists || exists.rows.length === 0) {
                await db.insert('conversations', {
                    id: conversationId,
                    user_id: userId || null,
                    project_id: projectId || null,
                });

                logger.info('Created new conversation', { conversationId });
            }
        } catch (error) {
            logger.error('Failed to ensure conversation', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }
}

// Singleton instance
export const contextManager = new ContextManager();
