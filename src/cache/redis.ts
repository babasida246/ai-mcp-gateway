import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

/**
 * Redis client singleton for caching
 */
class RedisCache {
    private client: Redis | null = null;
    private isConnected = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        try {
            this.client = new Redis({
                host: env.REDIS_HOST || 'localhost',
                port: parseInt(env.REDIS_PORT || '6379'),
                password: env.REDIS_PASSWORD || undefined,
                db: parseInt(env.REDIS_DB || '0'),
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                logger.info('Redis connected successfully');
            });

            this.client.on('error', (error) => {
                this.isConnected = false;
                logger.error('Redis connection error', { error: error.message });
            });

            this.client.on('close', () => {
                this.isConnected = false;
                logger.warn('Redis connection closed');
            });
        } catch (error) {
            logger.error('Failed to initialize Redis', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Get value from cache
     */
    async get<T = string>(key: string): Promise<T | null> {
        if (!this.client || !this.isConnected) {
            logger.debug('Redis not available for GET', { key });
            return null;
        }

        try {
            const value = await this.client.get(key);
            if (!value) return null;

            // Try to parse as JSON, fallback to string
            try {
                return JSON.parse(value) as T;
            } catch {
                return value as T;
            }
        } catch (error) {
            logger.error('Redis GET error', {
                key,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return null;
        }
    }

    /**
     * Set value in cache with optional TTL (in seconds)
     */
    async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
        if (!this.client || !this.isConnected) {
            logger.debug('Redis not available for SET', { key });
            return false;
        }

        try {
            const serialized =
                typeof value === 'string' ? value : JSON.stringify(value);

            if (ttl) {
                await this.client.setex(key, ttl, serialized);
            } else {
                await this.client.set(key, serialized);
            }

            return true;
        } catch (error) {
            logger.error('Redis SET error', {
                key,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }

    /**
     * Delete key from cache
     */
    async del(key: string): Promise<boolean> {
        if (!this.client || !this.isConnected) {
            logger.debug('Redis not available for DEL', { key });
            return false;
        }

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis DEL error', {
                key,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key: string): Promise<boolean> {
        if (!this.client || !this.isConnected) {
            return false;
        }

        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Redis EXISTS error', {
                key,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }

    /**
     * Get multiple keys
     */
    async mget<T = string>(keys: string[]): Promise<(T | null)[]> {
        if (!this.client || !this.isConnected || keys.length === 0) {
            return keys.map(() => null);
        }

        try {
            const values = await this.client.mget(...keys);
            return values.map((value) => {
                if (!value) return null;
                try {
                    return JSON.parse(value) as T;
                } catch {
                    return value as T;
                }
            });
        } catch (error) {
            logger.error('Redis MGET error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return keys.map(() => null);
        }
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
            logger.info('Redis connection closed');
        }
    }

    /**
     * Check if Redis is connected
     */
    isReady(): boolean {
        return this.isConnected;
    }
}

// Singleton instance
export const redisCache = new RedisCache();

/**
 * Cache key builders for consistent naming
 */
export const CacheKeys = {
    llmResponse: (modelId: string, promptHash: string) =>
        `llm:cache:${modelId}:${promptHash}`,
    conversationSummary: (conversationId: string) =>
        `conv:summary:${conversationId}`,
    routingHints: (projectId: string) => `routing:hints:${projectId}`,
    contextMessages: (conversationId: string) =>
        `conv:messages:${conversationId}`,
    todoList: (conversationId: string) => `todo:list:${conversationId}`,
};
