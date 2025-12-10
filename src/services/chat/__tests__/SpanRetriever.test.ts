/**
 * Unit tests for SpanRetriever
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpanRetriever } from '../SpanRetriever';
import type { SpanRetrievalRequest } from '../SpanRetriever';

// Mock dependencies
vi.mock('../../../db/postgres', () => ({
    db: {
        query: vi.fn(),
    },
}));

vi.mock('../../../logging/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../EmbeddingService', () => ({
    embeddingService: {
        getEmbedding: vi.fn().mockResolvedValue({
            embedding: new Array(1536).fill(0.1),
            model: 'test-model',
            provider: 'openai',
            cached: false,
        }),
    },
    EmbeddingService: {
        formatForPostgres: (emb: number[]) => `[${emb.join(',')}]`,
    },
}));

vi.mock('../TokenEstimator', () => ({
    tokenEstimator: {
        estimate: vi.fn().mockResolvedValue(50),
    },
}));

import { db } from '../../../db/postgres';

describe('SpanRetriever', () => {
    let retriever: SpanRetriever;
    const mockDb = db as any;

    beforeEach(() => {
        retriever = new SpanRetriever();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('retrieveSpans', () => {
        it('should handle empty conversation', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const request: SpanRetrievalRequest = {
                conversationId: 'conv-1',
                queryText: 'test query',
            };

            const result = await retriever.retrieveSpans(request);

            expect(result.spans).toEqual([]);
            expect(result.allMessages).toEqual([]);
            expect(result.totalTokens).toBe(0);
        });

        it('should fallback to recent on no embedding', async () => {
            // Mock recent messages query
            mockDb.query.mockResolvedValue({
                rows: [
                    {
                        id: 'm1',
                        role: 'user',
                        content: 'Hello',
                        turnIndex: 0,
                        tokenEstimate: 5,
                    },
                    {
                        id: 'm2',
                        role: 'assistant',
                        content: 'Hi there!',
                        turnIndex: 1,
                        tokenEstimate: 8,
                    },
                ],
            });

            const request: SpanRetrievalRequest = {
                conversationId: 'conv-1',
                // No queryText or queryEmbedding - should fallback
            };

            const result = await retriever.retrieveSpans(request);

            expect(result.method).toBe('fallback-recent');
            expect(result.allMessages.length).toBeGreaterThan(0);
        });

        it('should expand anchors with radius', async () => {
            // Mock similarity search returning anchor at turn 10
            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('embedding <=>')) {
                    // Similarity search
                    return Promise.resolve({
                        rows: [
                            {
                                id: 'm10',
                                role: 'user',
                                content: 'Important message',
                                turnIndex: 10,
                                tokenEstimate: 15,
                                similarity: 0.9,
                            },
                        ],
                    });
                } else if (query.includes('turn_index >=')) {
                    // Range query for expansion (turn 8-12 with radius 2)
                    return Promise.resolve({
                        rows: [
                            { id: 'm8', role: 'user', content: 'msg 8', turnIndex: 8, tokenEstimate: 10 },
                            { id: 'm9', role: 'assistant', content: 'msg 9', turnIndex: 9, tokenEstimate: 12 },
                            { id: 'm10', role: 'user', content: 'Important message', turnIndex: 10, tokenEstimate: 15 },
                            { id: 'm11', role: 'assistant', content: 'msg 11', turnIndex: 11, tokenEstimate: 11 },
                            { id: 'm12', role: 'user', content: 'msg 12', turnIndex: 12, tokenEstimate: 10 },
                        ],
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const request: SpanRetrievalRequest = {
                conversationId: 'conv-1',
                queryEmbedding: new Array(1536).fill(0.1),
                config: {
                    topK: 1,
                    radius: 2,
                    tokenBudget: 500,
                },
            };

            const result = await retriever.retrieveSpans(request);

            expect(result.method).toBe('embedding');
            expect(result.spans.length).toBeGreaterThan(0);

            // Should have expanded around anchor (turn 10)
            const span = result.spans[0];
            expect(span.messages.length).toBe(5); // turns 8-12
            expect(span.anchorCount).toBe(1);
        });

        it('should respect token budget', async () => {
            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('embedding <=>')) {
                    return Promise.resolve({
                        rows: [
                            { id: 'm5', role: 'user', content: 'msg 5', turnIndex: 5, tokenEstimate: 100, similarity: 0.9 },
                            { id: 'm15', role: 'user', content: 'msg 15', turnIndex: 15, tokenEstimate: 100, similarity: 0.8 },
                        ],
                    });
                } else if (query.includes('turn_index >=')) {
                    // Return spans that would exceed budget if both included
                    const turn = parseInt((query.match(/turn_index >= \$2/) || [])[0]?.split('$2')[0] || '0');
                    if (turn < 10) {
                        return Promise.resolve({
                            rows: Array.from({ length: 5 }, (_, i) => ({
                                id: `m${turn + i}`,
                                role: 'user',
                                content: `message ${turn + i}`,
                                turnIndex: turn + i,
                                tokenEstimate: 50,
                            })),
                        });
                    }
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            const request: SpanRetrievalRequest = {
                conversationId: 'conv-1',
                queryEmbedding: new Array(1536).fill(0.1),
                config: {
                    topK: 2,
                    radius: 2,
                    tokenBudget: 200, // Should only fit one span
                },
            };

            const result = await retriever.retrieveSpans(request);

            expect(result.totalTokens).toBeLessThanOrEqual(200);
        });

        it('should merge overlapping spans', async () => {
            mockDb.query.mockImplementation((query: string) => {
                if (query.includes('embedding <=>')) {
                    // Two anchors close together (turns 10 and 12)
                    return Promise.resolve({
                        rows: [
                            { id: 'm10', role: 'user', content: 'msg 10', turnIndex: 10, tokenEstimate: 20, similarity: 0.9 },
                            { id: 'm12', role: 'user', content: 'msg 12', turnIndex: 12, tokenEstimate: 20, similarity: 0.85 },
                        ],
                    });
                } else if (query.includes('turn_index >=')) {
                    // With radius 2, spans would be [8-12] and [10-14]
                    // Should merge into [8-14]
                    return Promise.resolve({
                        rows: Array.from({ length: 7 }, (_, i) => ({
                            id: `m${8 + i}`,
                            role: i % 2 === 0 ? 'user' : 'assistant',
                            content: `message ${8 + i}`,
                            turnIndex: 8 + i,
                            tokenEstimate: 20,
                        })),
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const request: SpanRetrievalRequest = {
                conversationId: 'conv-1',
                queryEmbedding: new Array(1536).fill(0.1),
                config: {
                    topK: 2,
                    radius: 2,
                    tokenBudget: 1000,
                },
            };

            const result = await retriever.retrieveSpans(request);

            // Should merge into single span
            expect(result.spans.length).toBe(1);
            expect(result.spans[0].anchorCount).toBe(2);
        });
    });
});
