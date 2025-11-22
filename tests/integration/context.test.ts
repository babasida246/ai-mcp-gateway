import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { contextManager } from '../../src/context/manager.js';
import { redisCache } from '../../src/cache/redis.js';
import { db } from '../../src/db/postgres.js';

describe('Context Manager', () => {
    const testConvId = 'test-context-manager';

    beforeAll(async () => {
        // Initialize database schema
        await db.initSchema();
        await new Promise((resolve) => setTimeout(resolve, 500));
    });

    beforeEach(async () => {
        // Clean up test data before each test
        try {
            await redisCache.del(`conv:summary:${testConvId}`);
            await redisCache.del(`conv:messages:${testConvId}`);
            await db.delete('context_summaries', {
                conversation_id: testConvId,
            });
            await db.delete('messages', { conversation_id: testConvId });
            await db.delete('conversations', { conversation_id: testConvId });
        } catch {
            // Ignore cleanup errors
        }
    });

    afterAll(async () => {
        // Final cleanup
        try {
            await redisCache.del(`conv:summary:${testConvId}`);
            await redisCache.del(`conv:messages:${testConvId}`);
            await db.delete('context_summaries', {
                conversation_id: testConvId,
            });
            await db.delete('messages', { conversation_id: testConvId });
            await db.delete('conversations', { conversation_id: testConvId });
        } catch {
            // Ignore
        }
        await redisCache.close();
        await db.close();
    });

    describe('Context Summary', () => {
        it('should create and retrieve a summary', async () => {
            const summary = {
                content: 'This is a test summary',
                messageCount: 5,
                lastUpdated: new Date(),
            };

            await contextManager.updateSummary(testConvId, summary);

            const retrieved = await contextManager.getSummary(testConvId);

            expect(retrieved).not.toBeNull();
            expect(retrieved?.content).toBe(summary.content);
            expect(retrieved?.messageCount).toBe(summary.messageCount);
        });

        it('should return null for non-existent summary', async () => {
            const summary = await contextManager.getSummary(
                'nonexistent-conv-id'
            );
            expect(summary).toBeNull();
        });

        it('should update existing summary', async () => {
            const firstSummary = {
                content: 'First summary',
                messageCount: 3,
                lastUpdated: new Date(),
            };

            await contextManager.updateSummary(testConvId, firstSummary);

            const secondSummary = {
                content: 'Updated summary',
                messageCount: 7,
                lastUpdated: new Date(),
            };

            await contextManager.updateSummary(testConvId, secondSummary);

            const retrieved = await contextManager.getSummary(testConvId);

            expect(retrieved?.content).toBe(secondSummary.content);
            expect(retrieved?.messageCount).toBe(secondSummary.messageCount);
        });
    });

    describe('Message Management', () => {
        it('should add and retrieve messages', async () => {
            const messages = [
                { role: 'user' as const, content: 'Hello' },
                { role: 'assistant' as const, content: 'Hi there!' },
                { role: 'user' as const, content: 'How are you?' },
            ];

            for (const msg of messages) {
                await contextManager.addMessage(testConvId, msg);
            }

            const retrieved = await contextManager.getRecentMessages(
                testConvId,
                10
            );

            expect(retrieved).toHaveLength(3);
            expect(retrieved[0].role).toBe('user');
            expect(retrieved[0].content).toBe('Hello');
            expect(retrieved[2].content).toBe('How are you?');
        });

        it('should limit number of retrieved messages', async () => {
            const messages = Array.from({ length: 20 }, (_, i) => ({
                role: (i % 2 === 0 ? 'user' : 'assistant') as
                    | 'user'
                    | 'assistant',
                content: `Message ${i}`,
            }));

            for (const msg of messages) {
                await contextManager.addMessage(testConvId, msg);
            }

            const retrieved = await contextManager.getRecentMessages(
                testConvId,
                5
            );

            expect(retrieved).toHaveLength(5);
            // Should get the most recent 5 messages
            expect(retrieved[4].content).toBe('Message 19');
        });

        it('should return empty array for no messages', async () => {
            const messages = await contextManager.getRecentMessages(
                'nonexistent-conv-id',
                10
            );
            expect(messages).toEqual([]);
        });
    });

    describe('Two-Tier Caching', () => {
        it('should cache summary in Redis (hot cache)', async () => {
            const summary = {
                content: 'Test summary for caching',
                messageCount: 5,
                lastUpdated: new Date(),
            };

            await contextManager.updateSummary(testConvId, summary);

            // Check Redis directly
            const cached = await redisCache.get<{
                content: string;
                messageCount: number;
            }>(`conv:summary:${testConvId}`);

            expect(cached).not.toBeNull();
            expect(cached?.content).toBe(summary.content);
        });

        it('should fall back to database when Redis is empty', async () => {
            const summary = {
                content: 'DB fallback test',
                messageCount: 3,
                lastUpdated: new Date(),
            };

            // Insert directly into database
            await db.insert('conversations', {
                conversation_id: testConvId,
                project_id: 'test-project',
                created_at: new Date(),
            });

            await db.insert('context_summaries', {
                conversation_id: testConvId,
                summary: summary.content,
                message_count: summary.messageCount,
                created_at: new Date(),
            });

            // Ensure Redis is empty
            await redisCache.del(`conv:summary:${testConvId}`);

            // Retrieve should fall back to DB
            const retrieved = await contextManager.getSummary(testConvId);

            expect(retrieved).not.toBeNull();
            expect(retrieved?.content).toBe(summary.content);

            // And should populate Redis for next time
            const nowCached = await redisCache.get<{
                content: string;
                messageCount: number;
            }>(`conv:summary:${testConvId}`);
            expect(nowCached).not.toBeNull();
        });

        it('should cache messages in Redis', async () => {
            const message = { role: 'user' as const, content: 'Test message' };

            await contextManager.addMessage(testConvId, message);

            // Check Redis directly
            const cached = await redisCache.get<
                Array<{ role: string; content: string }>
            >(`conv:messages:${testConvId}`);

            expect(cached).not.toBeNull();
            expect(cached).toHaveLength(1);
            expect(cached?.[0].content).toBe(message.content);
        });
    });

    describe('Context Compression', () => {
        it('should compress large context', async () => {
            const largeMessages = Array.from({ length: 50 }, (_, i) => ({
                role: (i % 2 === 0 ? 'user' : 'assistant') as
                    | 'user'
                    | 'assistant',
                content: `This is a longer message with more content to test compression. Message number ${i}. `.repeat(
                    5
                ),
            }));

            for (const msg of largeMessages) {
                await contextManager.addMessage(testConvId, msg);
            }

            const compressed = await contextManager.compressContext(
                testConvId
            );

            expect(compressed).toBeTruthy();
            expect(compressed.recentMessages).toHaveLength(10); // Last 10 messages
            expect(compressed.summary).toBeTruthy();
            // Compressed summary should be shorter than all messages combined
            const totalLength = largeMessages.reduce(
                (acc, msg) => acc + msg.content.length,
                0
            );
            expect(compressed.summary.length).toBeLessThan(totalLength);
        });

        it('should preserve important information in compression', async () => {
            const messages = [
                {
                    role: 'user' as const,
                    content: 'My name is Alice and I live in Paris',
                },
                {
                    role: 'assistant' as const,
                    content: 'Nice to meet you, Alice!',
                },
                {
                    role: 'user' as const,
                    content: 'I am working on a TypeScript project',
                },
                {
                    role: 'assistant' as const,
                    content: 'Great! How can I help with your TypeScript project?',
                },
            ];

            for (const msg of messages) {
                await contextManager.addMessage(testConvId, msg);
            }

            const compressed = await contextManager.compressContext(
                testConvId
            );

            // Summary should mention key facts
            const summaryLower = compressed.summary.toLowerCase();
            expect(
                summaryLower.includes('alice') ||
                summaryLower.includes('typescript') ||
                summaryLower.includes('paris')
            ).toBe(true);
        });
    });

    describe('Concurrent Access', () => {
        it('should handle concurrent message additions', async () => {
            const promises = Array.from({ length: 10 }, (_, i) =>
                contextManager.addMessage(testConvId, {
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Concurrent message ${i}`,
                })
            );

            await Promise.all(promises);

            const messages = await contextManager.getRecentMessages(
                testConvId,
                20
            );

            expect(messages.length).toBe(10);
        });

        it('should handle concurrent summary updates', async () => {
            const promises = Array.from({ length: 5 }, (_, i) =>
                contextManager.updateSummary(testConvId, {
                    content: `Summary version ${i}`,
                    messageCount: i + 1,
                    lastUpdated: new Date(),
                })
            );

            await Promise.all(promises);

            const summary = await contextManager.getSummary(testConvId);

            // One of the summaries should have been saved
            expect(summary).not.toBeNull();
            expect(summary?.content).toMatch(/Summary version \d/);
        });
    });

    describe('Error Recovery', () => {
        it('should handle Redis unavailability gracefully', async () => {
            // Close Redis
            await redisCache.close();

            const summary = {
                content: 'Summary without Redis',
                messageCount: 1,
                lastUpdated: new Date(),
            };

            // Should fall back to DB
            await expect(
                contextManager.updateSummary(testConvId, summary)
            ).resolves.not.toThrow();

            // Retrieving should also work (DB only)
            const retrieved = await contextManager.getSummary(testConvId);
            expect(retrieved).not.toBeNull();
        });

        it('should handle invalid data gracefully', async () => {
            // Try to add message with missing content
            await expect(
                contextManager.addMessage(testConvId, {
                    role: 'user',
                    content: '',
                })
            ).resolves.not.toThrow();
        });
    });
});
