import { redisCache } from '../../cache/redis.js';
import { logger } from '../../logging/logger.js';

/**
 * Redis GET tool
 */
export const redisGetTool = {
    name: 'redis_get',
    description: 'Get a value from Redis cache by key',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'The Redis key to retrieve',
            },
        },
        required: ['key'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const key = args.key as string;

            const value = await redisCache.get(key);

            return {
                success: true,
                data: {
                    key,
                    value,
                    exists: value !== null,
                },
            };
        } catch (error) {
            logger.error('Redis GET error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Redis SET tool
 */
export const redisSetTool = {
    name: 'redis_set',
    description: 'Set a value in Redis cache with optional TTL (in seconds)',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'The Redis key to set',
            },
            value: {
                description: 'The value to store (any JSON-serializable type)',
            },
            ttl: {
                type: 'number',
                description: 'Time to live in seconds (optional)',
            },
        },
        required: ['key', 'value'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const key = args.key as string;
            const value = args.value;
            const ttl = args.ttl as number | undefined;

            const success = await redisCache.set(key, value, ttl);

            return {
                success,
                data: {
                    key,
                    ttl,
                },
            };
        } catch (error) {
            logger.error('Redis SET error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Redis DEL tool
 */
export const redisDelTool = {
    name: 'redis_del',
    description: 'Delete a key from Redis cache',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'The Redis key to delete',
            },
        },
        required: ['key'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const key = args.key as string;

            const success = await redisCache.del(key);

            return {
                success,
                data: {
                    key,
                    deleted: success,
                },
            };
        } catch (error) {
            logger.error('Redis DEL error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};
