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

    /**
     * Get TODO list for a conversation
     */
    async getTodoList(conversationId: string): Promise<TodoItem[]> {
        // Try Redis first
        const cachedTodos = await redisCache.get<TodoItem[]>(
            CacheKeys.todoList(conversationId)
        );

        if (cachedTodos) {
            return cachedTodos;
        }

        // Fallback to DB
        const result = await db.query<{
            id: number;
            title: string;
            description: string;
            status: string;
        }>(
            `SELECT id, title, description, status 
             FROM todo_items 
             WHERE conversation_id = $1 
             ORDER BY created_at ASC`,
            [conversationId]
        );

        if (!result || result.rows.length === 0) {
            return [];
        }

        const todos: TodoItem[] = result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status as TodoItem['status'],
        }));

        // Cache in Redis
        await redisCache.set(
            CacheKeys.todoList(conversationId),
            todos,
            1800 // 30 minutes
        );

        return todos;
    }

    /**
     * Update TODO list
     */
    async updateTodoList(conversationId: string, todos: TodoItem[]): Promise<void> {
        // Update Redis
        await redisCache.set(
            CacheKeys.todoList(conversationId),
            todos,
            1800
        );

        // Update DB (simplified - delete and recreate)
        try {
            await db.query(
                'DELETE FROM todo_items WHERE conversation_id = $1',
                [conversationId]
            );

            for (const todo of todos) {
                await db.insert('todo_items', {
                    conversation_id: conversationId,
                    title: todo.title,
                    description: todo.description,
                    status: todo.status,
                });
            }

            logger.debug('TODO list updated', { conversationId, count: todos.length });
        } catch (error) {
            logger.error('Failed to update TODO list in DB', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Build context for LLM prompt
     */
    async buildPromptContext(
        conversationId: string,
        includeMessages = 5
    ): Promise<string> {
        const summary = await this.getSummary(conversationId);
        const messages = await this.getRecentMessages(conversationId, includeMessages);
        const todos = await this.getTodoList(conversationId);

        const context = {
            summary: summary || { conversationId },
            recentMessages: messages,
            todos: todos.filter(t => t.status !== 'completed'),
        };

        return JSON.stringify(context, null, 2);
    }

    /**
     * Auto-summarize long conversations
     */
    async autoSummarize(conversationId: string): Promise<void> {
        const messageCount = await this.getMessageCount(conversationId);

        // Only summarize if we have enough messages
        if (messageCount < 10) {
            return;
        }

        const summary = await this.getSummary(conversationId);        // Build new summary from messages
        const newSummary: ContextSummary = {
            conversationId,
            stack: summary?.stack || [],
            architecture: summary?.architecture || '',
            modules: summary?.modules || [],
            mainFiles: summary?.mainFiles || [],
            decisions: summary?.decisions || [],
            todos: await this.getTodoList(conversationId),
            lastUpdated: new Date().toISOString(),
        };

        await this.updateSummary(conversationId, newSummary);
        logger.info('Auto-summarized conversation', { conversationId, messageCount });
    }

    /**
     * Get message count for a conversation
     */
    async getMessageCount(conversationId: string): Promise<number> {
        const result = await db.query<{ count: number }>(
            `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
            [conversationId]
        );

        return result?.rows[0]?.count || 0;
    }

    /**
     * Clear conversation context from cache
     */
    async clearCache(conversationId: string): Promise<void> {
        await redisCache.del(CacheKeys.conversationSummary(conversationId));
        await redisCache.del(CacheKeys.contextMessages(conversationId));
        await redisCache.del(CacheKeys.todoList(conversationId));
        await redisCache.del(CacheKeys.conversationMeta(conversationId));

        logger.info('Cleared conversation cache', { conversationId });
    }
}

// Singleton instance
export const contextManager = new ContextManager();
