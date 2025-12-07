/**
 * Unit tests for ChatContextBuilder
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ChatContextBuilder,
    ChatContextConfig,
    DEFAULT_CHAT_CONTEXT_CONFIG,
    BuildContextParams,
} from '../ChatContextBuilder';

// Mock dependencies
vi.mock('../../../db', () => ({
    db: {
        query: vi.fn(),
        insert: vi.fn(),
    },
}));

vi.mock('../../../utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../EmbeddingService', () => ({
    embeddingService: {
        getEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
        getBatchEmbeddings: vi.fn().mockResolvedValue([]),
    },
}));

import { db } from '../../../db';

describe('ChatContextBuilder', () => {
    let builder: ChatContextBuilder;
    const mockDb = db as any;

    beforeEach(() => {
        builder = new ChatContextBuilder();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('DEFAULT_CHAT_CONTEXT_CONFIG', () => {
        it('should have sensible defaults', () => {
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.strategy).toBe('summary+recent');
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.maxPromptTokens).toBe(4096);
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.recentMinMessages).toBe(4);
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.recentMaxMessages).toBe(20);
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.spanTopK).toBe(5);
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.spanRadius).toBe(2);
            expect(DEFAULT_CHAT_CONTEXT_CONFIG.spanBudgetRatio).toBe(0.4);
        });
    });

    describe('buildContext - full strategy', () => {
        it('should include all messages', async () => {
            // Mock DB responses
            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('FROM conversations')) {
                    return { rows: [{ id: 'conv-1', summary: null }] };
                }
                if (query.includes('FROM messages')) {
                    return {
                        rows: [
                            { id: 'm1', role: 'user', content: 'Hello', turn_index: 0, token_estimate: 5 },
                            { id: 'm2', role: 'assistant', content: 'Hi there!', turn_index: 1, token_estimate: 8 },
                        ],
                    };
                }
                return { rows: [] };
            });

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'How are you?',
                configOverrides: { strategy: 'full' },
            });

            expect(result.strategyUsed).toBe('full');
            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.messages[result.messages.length - 1].content).toBe('How are you?');
        });
    });

    describe('buildContext - last-n strategy', () => {
        it('should limit messages to maxMessages', async () => {
            // Create many mock messages
            const mockMessages = Array.from({ length: 30 }, (_, i) => ({
                id: `m${i}`,
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
                turn_index: i,
                token_estimate: 10,
            }));

            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('FROM conversations')) {
                    return { rows: [{ id: 'conv-1', summary: null }] };
                }
                if (query.includes('ORDER BY turn_index DESC')) {
                    return { rows: mockMessages.slice(0, 10).reverse() };
                }
                return { rows: [] };
            });

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'Current message',
                configOverrides: {
                    strategy: 'last-n',
                    recentMaxMessages: 10,
                },
            });

            expect(result.strategyUsed).toBe('last-n');
            // Should have limited messages + current message
            expect(result.metadata.recentMessagesIncluded).toBeLessThanOrEqual(10);
        });
    });

    describe('buildContext - summary+recent strategy', () => {
        it('should include summary when available', async () => {
            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('FROM conversations')) {
                    return {
                        rows: [{
                            id: 'conv-1',
                            summary: 'Previous conversation was about testing.',
                            summary_token_estimate: 20,
                        }]
                    };
                }
                if (query.includes('ORDER BY turn_index DESC')) {
                    return {
                        rows: [
                            { id: 'm1', role: 'user', content: 'Recent message', turn_index: 10, token_estimate: 10 },
                        ],
                    };
                }
                if (query.includes('WITH recent')) {
                    return { rows: [] };
                }
                return { rows: [] };
            });

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'New question',
                configOverrides: { strategy: 'summary+recent' },
            });

            expect(result.strategyUsed).toBe('summary+recent');
            expect(result.metadata.summaryIncluded).toBe(true);

            // Should have summary message
            const summaryMessage = result.messages.find(m =>
                m.content.includes('Previous conversation summary')
            );
            expect(summaryMessage).toBeDefined();
        });

        it('should trigger summarization when threshold exceeded', async () => {
            // Mock old messages with high token count
            const oldMessages = Array.from({ length: 20 }, (_, i) => ({
                id: `m${i}`,
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: 'A'.repeat(500), // Long messages
                turn_index: i,
                token_estimate: 150,
            }));

            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('FROM conversations')) {
                    return { rows: [{ id: 'conv-1', summary: null }] };
                }
                if (query.includes('ORDER BY turn_index DESC')) {
                    return { rows: [{ id: 'm20', role: 'user', content: 'Recent', turn_index: 20, token_estimate: 10 }] };
                }
                if (query.includes('WITH recent')) {
                    return { rows: oldMessages };
                }
                return { rows: [] };
            });

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'Question',
                configOverrides: {
                    strategy: 'summary+recent',
                    summarizationThreshold: 1000,
                },
            });

            expect(result.summarizationTriggered).toBe(true);
        });
    });

    describe('buildContext - fallback behavior', () => {
        it('should return fallback context on error', async () => {
            mockDb.query.mockRejectedValue(new Error('Database error'));

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'Test message',
            });

            // Should still return a valid result
            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.messages[result.messages.length - 1].content).toBe('Test message');
        });
    });

    describe('config resolution', () => {
        it('should apply config overrides', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const result = await builder.buildContext({
                conversationId: 'conv-1',
                currentUserMessage: 'Test',
                configOverrides: {
                    strategy: 'full',
                    maxPromptTokens: 8000,
                },
            });

            expect(result.strategyUsed).toBe('full');
        });
    });

    describe('message embedding', () => {
        it('should generate embedding for message', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            // Should not throw
            await expect(
                builder.generateMessageEmbedding('m1', 'Test content')
            ).resolves.not.toThrow();
        });
    });
});
