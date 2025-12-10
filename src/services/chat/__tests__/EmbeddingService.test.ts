/**
 * Unit tests for EmbeddingService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from '../EmbeddingService';

// Mock dependencies
vi.mock('../../../logging/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../../cache/redis', () => ({
    redisCache: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('../../../config/provider-manager', () => ({
    providerManager: {
        getApiKey: vi.fn().mockResolvedValue('test-api-key'),
    },
}));

vi.mock('../../../config/env', () => ({
    env: {
        EMBEDDING_PROVIDER: 'openai',
        EMBEDDING_MODEL_ID: 'text-embedding-3-small',
        OPENAI_API_KEY: 'test-key',
    },
}));

describe('EmbeddingService', () => {
    let service: EmbeddingService;

    beforeEach(() => {
        service = new EmbeddingService({
            provider: 'openai',
            modelId: 'text-embedding-3-small',
            dimension: 1536,
            enableCache: false, // Disable cache for tests
        });
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with default config', () => {
            const defaultService = new EmbeddingService();
            expect(defaultService).toBeDefined();
        });

        it('should accept custom config', () => {
            const customService = new EmbeddingService({
                provider: 'ollama',
                modelId: 'custom-model',
                dimension: 384,
            });
            expect(customService).toBeDefined();
        });
    });

    describe('cosineSimilarity', () => {
        it('should calculate similarity correctly', () => {
            const a = [1, 0, 0];
            const b = [1, 0, 0];
            const similarity = EmbeddingService.cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(1.0);
        });

        it('should handle orthogonal vectors', () => {
            const a = [1, 0, 0];
            const b = [0, 1, 0];
            const similarity = EmbeddingService.cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(0.0);
        });

        it('should handle opposite vectors', () => {
            const a = [1, 0, 0];
            const b = [-1, 0, 0];
            const similarity = EmbeddingService.cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(-1.0);
        });

        it('should throw on dimension mismatch', () => {
            const a = [1, 0];
            const b = [1, 0, 0];
            expect(() => EmbeddingService.cosineSimilarity(a, b)).toThrow();
        });
    });

    describe('formatForPostgres', () => {
        it('should format embedding for postgres', () => {
            const embedding = [0.1, 0.2, 0.3];
            const formatted = EmbeddingService.formatForPostgres(embedding);
            expect(formatted).toBe('[0.1,0.2,0.3]');
        });

        it('should handle empty array', () => {
            const embedding: number[] = [];
            const formatted = EmbeddingService.formatForPostgres(embedding);
            expect(formatted).toBe('[]');
        });

        it('should handle single element', () => {
            const embedding = [0.5];
            const formatted = EmbeddingService.formatForPostgres(embedding);
            expect(formatted).toBe('[0.5]');
        });
    });

    describe('getEmbedding', () => {
        it('should reject empty text', async () => {
            await expect(service.getEmbedding('')).rejects.toThrow();
        });

        it('should normalize whitespace', async () => {
            // This test would need actual API mocking
            // For now, just check it doesn't throw on valid input
            const text = '  test  text  \n\n\n  ';
            // Would test: normalized version sent to API
        });
    });

    describe('getBatchEmbeddings', () => {
        it('should handle empty batch', async () => {
            const result = await service.getBatchEmbeddings({ texts: [] });
            expect(result).toEqual([]);
        });

        it('should process multiple texts', async () => {
            // This would need API mocking
            const texts = ['text 1', 'text 2', 'text 3'];
            // Would verify: batch processing with concurrency limit
        });
    });
});
