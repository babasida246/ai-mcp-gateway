import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { redisCache, CacheKeys } from '../../src/cache/redis.js';

describe('Redis Cache', () => {
    beforeAll(async () => {
        // Ensure Redis is connected
        await new Promise((resolve) => setTimeout(resolve, 100));
    });

    afterAll(async () => {
        // Clean up test keys
        const testKeys = ['test:key', 'test:object', 'test:multi:*'];
        for (const pattern of testKeys) {
            try {
                if (pattern.includes('*')) {
                    // Scan and delete pattern-matched keys
                    const keys = await redisCache['client']?.keys(pattern);
                    if (keys && keys.length > 0) {
                        await redisCache['client']?.del(...keys);
                    }
                } else {
                    await redisCache.del(pattern);
                }
            } catch {
                // Ignore errors during cleanup
            }
        }
        await redisCache.close();
    });

    beforeEach(async () => {
        // Clean up between tests
        await redisCache.del('test:key');
        await redisCache.del('test:object');
    });

    describe('Basic Operations', () => {
        it('should set and get a string value', async () => {
            const key = 'test:key';
            const value = 'test-value';

            await redisCache.set(key, value);
            const retrieved = await redisCache.get<string>(key);

            expect(retrieved).toBe(value);
        });

        it('should set and get an object value', async () => {
            const key = 'test:object';
            const value = { foo: 'bar', count: 42 };

            await redisCache.set(key, value);
            const retrieved = await redisCache.get<typeof value>(key);

            expect(retrieved).toEqual(value);
        });

        it('should return null for non-existent key', async () => {
            const retrieved = await redisCache.get<string>('nonexistent:key');
            expect(retrieved).toBeNull();
        });

        it('should delete a key', async () => {
            const key = 'test:key';
            await redisCache.set(key, 'value');

            const deleted = await redisCache.del(key);
            expect(deleted).toBe(true);

            const retrieved = await redisCache.get<string>(key);
            expect(retrieved).toBeNull();
        });

        it('should check if key exists', async () => {
            const key = 'test:key';

            let exists = await redisCache.exists(key);
            expect(exists).toBe(false);

            await redisCache.set(key, 'value');
            exists = await redisCache.exists(key);
            expect(exists).toBe(true);
        });
    });

    describe('TTL Support', () => {
        it('should set value with TTL', async () => {
            const key = 'test:key';
            const value = 'expiring-value';
            const ttl = 1; // 1 second

            await redisCache.set(key, value, ttl);
            const retrieved = await redisCache.get<string>(key);
            expect(retrieved).toBe(value);

            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const expired = await redisCache.get<string>(key);
            expect(expired).toBeNull();
        });

        it('should respect default TTL from CacheKeys', async () => {
            const key = CacheKeys.llmResponse('gpt-4', 'hash123');
            const value = { response: 'cached response' };

            await redisCache.set(key, value);
            const retrieved = await redisCache.get<typeof value>(key);
            expect(retrieved).toEqual(value);
        });
    });

    describe('Multi-get Operations', () => {
        it('should get multiple keys at once', async () => {
            const keys = ['test:multi:1', 'test:multi:2', 'test:multi:3'];
            const values = ['value1', 'value2', 'value3'];

            // Set values
            for (let i = 0; i < keys.length; i++) {
                await redisCache.set(keys[i], values[i]);
            }

            // Get all at once
            const retrieved = await redisCache.mget<string>(keys);
            expect(retrieved).toEqual(values);
        });

        it('should handle missing keys in multi-get', async () => {
            const keys = ['test:multi:exists', 'test:multi:missing'];
            await redisCache.set(keys[0], 'exists');

            const retrieved = await redisCache.mget<string>(keys);
            expect(retrieved).toEqual(['exists', null]);
        });
    });

    describe('CacheKeys Helper', () => {
        it('should generate llmResponse key', () => {
            const key = CacheKeys.llmResponse('gpt-4', 'abc123');
            expect(key).toBe('llm:cache:gpt-4:abc123');
        });

        it('should generate conversationSummary key', () => {
            const key = CacheKeys.conversationSummary('conv-456');
            expect(key).toBe('conv:summary:conv-456');
        });

        it('should generate routingHints key', () => {
            const key = CacheKeys.routingHints('project-789');
            expect(key).toBe('routing:hints:project-789');
        });

        it('should generate todoList key', () => {
            const key = CacheKeys.todoList('session-abc');
            expect(key).toBe('todo:list:session-abc');
        });

        it('should generate contextMessages key', () => {
            const key = CacheKeys.contextMessages('conv-xyz');
            expect(key).toBe('conv:messages:conv-xyz');
        });
    });

    describe('Error Handling', () => {
        it('should handle gracefully when Redis is unavailable', async () => {
            // Close connection
            await redisCache.close();

            // Operations should not throw
            await expect(redisCache.get('test:key')).resolves.toBeNull();
            await expect(redisCache.set('test:key', 'value')).resolves.toBeUndefined();
            await expect(redisCache.del('test:key')).resolves.toBe(false);
            await expect(redisCache.exists('test:key')).resolves.toBe(false);
        });
    });

    describe('Complex Data Types', () => {
        it('should handle nested objects', async () => {
            const key = 'test:object';
            const value = {
                user: { id: 1, name: 'Test' },
                settings: { theme: 'dark', notifications: true },
                metadata: { tags: ['a', 'b', 'c'] },
            };

            await redisCache.set(key, value);
            const retrieved = await redisCache.get<typeof value>(key);
            expect(retrieved).toEqual(value);
        });

        it('should handle arrays', async () => {
            const key = 'test:array';
            const value = [1, 2, 3, 4, 5];

            await redisCache.set(key, value);
            const retrieved = await redisCache.get<number[]>(key);
            expect(retrieved).toEqual(value);
        });

        it('should handle null and undefined correctly', async () => {
            const key = 'test:key';

            await redisCache.set(key, null);
            let retrieved = await redisCache.get(key);
            expect(retrieved).toBeNull();

            await redisCache.set(key, undefined);
            retrieved = await redisCache.get(key);
            expect(retrieved).toBeNull();
        });
    });
});
