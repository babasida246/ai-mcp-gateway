/**
 * Agent Memory System
 * Implements short-term and long-term memory with semantic search
 *
 * Inspired by AutoGPT's memory architecture:
 * - Episodic: Specific events and interactions
 * - Semantic: General knowledge and facts
 * - Procedural: How to do things (patterns, heuristics)
 */

import { db } from '../db/postgres.js';
import { redisCache, CacheKeys } from '../cache/redis.js';
import { logger } from '../logging/logger.js';
import type { MemoryEntry } from './types.js';

/**
 * Memory configuration
 */
export interface MemoryConfig {
    maxShortTermItems: number;
    shortTermTTL: number; // seconds
    importanceThreshold: number;
    maxRetrievalResults: number;
}

/**
 * Default memory configuration
 */
const DEFAULT_CONFIG: MemoryConfig = {
    maxShortTermItems: 50,
    shortTermTTL: 3600, // 1 hour
    importanceThreshold: 0.5,
    maxRetrievalResults: 10,
};

/**
 * Agent Memory Manager
 * Manages episodic, semantic, and procedural memory
 */
export class AgentMemory {
    private config: MemoryConfig;
    private shortTermCache: Map<string, MemoryEntry> = new Map();
    private conversationId: string;

    constructor(conversationId: string, config: Partial<MemoryConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.conversationId = conversationId;
    }

    /**
     * Initialize memory tables in database
     */
    static async initializeTables(): Promise<void> {
        try {
            // Try to enable vector extension if available
            let hasVector = false;
            try {
                await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
                hasVector = true;
            } catch {
                logger.warn('Vector extension not available, using text search fallback');
            }

            // Memory entries table - use TEXT for embedding if vector not available
            const embeddingType = hasVector ? 'vector(1536)' : 'TEXT';
            await db.query(`
                CREATE TABLE IF NOT EXISTS agent_memories (
                    id TEXT PRIMARY KEY,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    embedding ${embeddingType},
                    conversation_id TEXT,
                    task_id TEXT,
                    importance DECIMAL(3,2) DEFAULT 0.5,
                    access_count INTEGER DEFAULT 0,
                    last_accessed TIMESTAMP DEFAULT NOW(),
                    tags TEXT[] DEFAULT '{}',
                    metadata JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Create indexes
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(memory_type);
                CREATE INDEX IF NOT EXISTS idx_memories_conversation ON agent_memories(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_memories_importance ON agent_memories(importance DESC);
                CREATE INDEX IF NOT EXISTS idx_memories_tags ON agent_memories USING GIN(tags);
            `);

            logger.info('Agent memory tables initialized', { hasVector });
        } catch (error) {
            logger.error('Failed to initialize memory tables', { error });
            throw error;
        }
    }

    /**
     * Store a memory entry
     */
    async store(
        content: string,
        type: 'episodic' | 'semantic' | 'procedural',
        options: {
            importance?: number;
            tags?: string[];
            taskId?: string;
            metadata?: Record<string, unknown>;
        } = {}
    ): Promise<MemoryEntry> {
        const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        const entry: MemoryEntry = {
            id,
            type,
            content,
            metadata: {
                conversationId: this.conversationId,
                taskId: options.taskId,
                timestamp: now,
                importance: options.importance ?? 0.5,
                accessCount: 0,
                lastAccessed: now,
                tags: options.tags || [],
            },
        };

        // Store in short-term cache
        this.shortTermCache.set(id, entry);
        await this.pruneShortTermCache();

        // Also cache in Redis for quick access
        await redisCache.set(
            `${CacheKeys.agentMemory}:${this.conversationId}:${id}`,
            entry,
            this.config.shortTermTTL
        );

        // Store in long-term database if important enough
        if (entry.metadata.importance >= this.config.importanceThreshold) {
            await this.persistToDatabase(entry);
        }

        logger.debug('Memory stored', { id, type, importance: entry.metadata.importance });
        return entry;
    }

    /**
     * Persist memory to database
     */
    private async persistToDatabase(entry: MemoryEntry): Promise<void> {
        try {
            await db.query(
                `INSERT INTO agent_memories 
                 (id, memory_type, content, conversation_id, task_id, importance, tags, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET
                 access_count = agent_memories.access_count + 1,
                 last_accessed = NOW()`,
                [
                    entry.id,
                    entry.type,
                    entry.content,
                    entry.metadata.conversationId,
                    entry.metadata.taskId,
                    entry.metadata.importance,
                    entry.metadata.tags,
                    JSON.stringify(entry.metadata),
                ]
            );
        } catch (error) {
            logger.error('Failed to persist memory', { id: entry.id, error });
        }
    }

    /**
     * Retrieve memories by semantic similarity (using text search fallback)
     */
    async retrieve(
        query: string,
        options: {
            type?: 'episodic' | 'semantic' | 'procedural';
            limit?: number;
            minImportance?: number;
            tags?: string[];
        } = {}
    ): Promise<MemoryEntry[]> {
        const limit = options.limit ?? this.config.maxRetrievalResults;
        const minImportance = options.minImportance ?? 0;

        // First check short-term cache
        const shortTermResults: MemoryEntry[] = [];
        for (const entry of this.shortTermCache.values()) {
            if (options.type && entry.type !== options.type) continue;
            if (entry.metadata.importance < minImportance) continue;
            if (entry.content.toLowerCase().includes(query.toLowerCase())) {
                shortTermResults.push(entry);
            }
        }

        // Then query database
        let dbQuery = `
            SELECT id, memory_type, content, conversation_id, task_id,
                   importance, access_count, last_accessed, tags, metadata, created_at
            FROM agent_memories
            WHERE content ILIKE $1
        `;
        const params: unknown[] = [`%${query}%`];
        let paramIndex = 2;

        if (options.type) {
            dbQuery += ` AND memory_type = $${paramIndex}`;
            params.push(options.type);
            paramIndex++;
        }

        if (minImportance > 0) {
            dbQuery += ` AND importance >= $${paramIndex}`;
            params.push(minImportance);
            paramIndex++;
        }

        if (options.tags && options.tags.length > 0) {
            dbQuery += ` AND tags && $${paramIndex}`;
            params.push(options.tags);
            paramIndex++;
        }

        dbQuery += ` ORDER BY importance DESC, last_accessed DESC LIMIT $${paramIndex}`;
        params.push(limit);

        try {
            const result = await db.query<{
                id: string;
                memory_type: string;
                content: string;
                conversation_id: string;
                task_id: string;
                importance: number;
                access_count: number;
                last_accessed: Date;
                tags: string[];
                metadata: Record<string, unknown>;
                created_at: Date;
            }>(dbQuery, params);

            const dbResults: MemoryEntry[] = (result?.rows || []).map((row) => ({
                id: row.id,
                type: row.memory_type as 'episodic' | 'semantic' | 'procedural',
                content: row.content,
                metadata: {
                    conversationId: row.conversation_id,
                    taskId: row.task_id,
                    timestamp: row.created_at.getTime(),
                    importance: Number(row.importance),
                    accessCount: row.access_count,
                    lastAccessed: row.last_accessed.getTime(),
                    tags: row.tags,
                },
            }));

            // Update access counts for retrieved memories
            for (const entry of dbResults) {
                await this.updateAccessCount(entry.id);
            }

            // Merge and deduplicate
            const allResults = [...shortTermResults, ...dbResults];
            const uniqueResults = Array.from(
                new Map(allResults.map((e) => [e.id, e])).values()
            );

            return uniqueResults.slice(0, limit);
        } catch (error) {
            logger.error('Failed to retrieve memories', { query, error });
            return shortTermResults.slice(0, limit);
        }
    }

    /**
     * Update access count for a memory
     */
    private async updateAccessCount(id: string): Promise<void> {
        try {
            await db.query(
                `UPDATE agent_memories 
                 SET access_count = access_count + 1, last_accessed = NOW()
                 WHERE id = $1`,
                [id]
            );
        } catch {
            // Ignore update errors
        }
    }

    /**
     * Get recent memories from conversation
     */
    async getRecent(limit: number = 10): Promise<MemoryEntry[]> {
        const entries: MemoryEntry[] = [];

        // First from short-term cache
        const cacheEntries = Array.from(this.shortTermCache.values())
            .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
            .slice(0, limit);
        entries.push(...cacheEntries);

        if (entries.length < limit) {
            try {
                const result = await db.query<{
                    id: string;
                    memory_type: string;
                    content: string;
                    conversation_id: string;
                    task_id: string;
                    importance: number;
                    access_count: number;
                    last_accessed: Date;
                    tags: string[];
                    metadata: Record<string, unknown>;
                    created_at: Date;
                }>(
                    `SELECT * FROM agent_memories 
                     WHERE conversation_id = $1 
                     ORDER BY created_at DESC 
                     LIMIT $2`,
                    [this.conversationId, limit - entries.length]
                );

                for (const row of result?.rows || []) {
                    entries.push({
                        id: row.id,
                        type: row.memory_type as 'episodic' | 'semantic' | 'procedural',
                        content: row.content,
                        metadata: {
                            conversationId: row.conversation_id,
                            taskId: row.task_id,
                            timestamp: row.created_at.getTime(),
                            importance: Number(row.importance),
                            accessCount: row.access_count,
                            lastAccessed: row.last_accessed.getTime(),
                            tags: row.tags,
                        },
                    });
                }
            } catch (error) {
                logger.error('Failed to get recent memories', { error });
            }
        }

        return entries;
    }

    /**
     * Increase importance of a memory
     */
    async reinforce(id: string, amount: number = 0.1): Promise<void> {
        // Update in cache
        const cached = this.shortTermCache.get(id);
        if (cached) {
            cached.metadata.importance = Math.min(1, cached.metadata.importance + amount);

            // Persist if now above threshold
            if (cached.metadata.importance >= this.config.importanceThreshold) {
                await this.persistToDatabase(cached);
            }
        }

        // Update in database
        try {
            await db.query(
                `UPDATE agent_memories 
                 SET importance = LEAST(1, importance + $2)
                 WHERE id = $1`,
                [id, amount]
            );
        } catch (error) {
            logger.error('Failed to reinforce memory', { id, error });
        }
    }

    /**
     * Decay old memories (reduce importance over time)
     */
    async decay(decayFactor: number = 0.01): Promise<number> {
        try {
            const result = await db.query(
                `UPDATE agent_memories 
                 SET importance = GREATEST(0, importance - $1)
                 WHERE last_accessed < NOW() - INTERVAL '1 day'
                 RETURNING id`,
                [decayFactor]
            );
            return result?.rows?.length || 0;
        } catch (error) {
            logger.error('Failed to decay memories', { error });
            return 0;
        }
    }

    /**
     * Prune short-term cache
     */
    private async pruneShortTermCache(): Promise<void> {
        if (this.shortTermCache.size <= this.config.maxShortTermItems) {
            return;
        }

        // Sort by importance and recency
        const entries = Array.from(this.shortTermCache.entries())
            .sort((a, b) => {
                const importanceDiff = b[1].metadata.importance - a[1].metadata.importance;
                if (importanceDiff !== 0) return importanceDiff;
                return b[1].metadata.timestamp - a[1].metadata.timestamp;
            });

        // Keep top items, persist and remove others
        const toRemove = entries.slice(this.config.maxShortTermItems);
        for (const [id, entry] of toRemove) {
            if (entry.metadata.importance >= this.config.importanceThreshold) {
                await this.persistToDatabase(entry);
            }
            this.shortTermCache.delete(id);
        }
    }

    /**
     * Clear all memories for this conversation
     */
    async clear(): Promise<void> {
        this.shortTermCache.clear();

        try {
            await db.query(
                `DELETE FROM agent_memories WHERE conversation_id = $1`,
                [this.conversationId]
            );
            logger.info('Cleared agent memories', { conversationId: this.conversationId });
        } catch (error) {
            logger.error('Failed to clear memories', { error });
        }
    }

    /**
     * Export memories for analysis or backup
     */
    async export(): Promise<MemoryEntry[]> {
        const entries: MemoryEntry[] = [];

        // Add short-term cache
        entries.push(...this.shortTermCache.values());

        // Add database entries
        try {
            const result = await db.query<{
                id: string;
                memory_type: string;
                content: string;
                conversation_id: string;
                task_id: string;
                importance: number;
                access_count: number;
                last_accessed: Date;
                tags: string[];
                metadata: Record<string, unknown>;
                created_at: Date;
            }>(
                `SELECT * FROM agent_memories 
                 WHERE conversation_id = $1 
                 ORDER BY created_at`,
                [this.conversationId]
            );

            for (const row of result?.rows || []) {
                entries.push({
                    id: row.id,
                    type: row.memory_type as 'episodic' | 'semantic' | 'procedural',
                    content: row.content,
                    metadata: {
                        conversationId: row.conversation_id,
                        taskId: row.task_id,
                        timestamp: row.created_at.getTime(),
                        importance: Number(row.importance),
                        accessCount: row.access_count,
                        lastAccessed: row.last_accessed.getTime(),
                        tags: row.tags,
                    },
                });
            }
        } catch (error) {
            logger.error('Failed to export memories', { error });
        }

        return entries;
    }
}

/**
 * Create a memory manager for a conversation
 */
export function createAgentMemory(
    conversationId: string,
    config?: Partial<MemoryConfig>
): AgentMemory {
    return new AgentMemory(conversationId, config);
}
