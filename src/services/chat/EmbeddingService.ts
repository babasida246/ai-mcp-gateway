/**
 * @file Embedding Service
 * @description Service for generating text embeddings using various providers.
 * 
 * Supports:
 * - OpenAI text-embedding-3-small (1536 dimensions)
 * - OpenAI text-embedding-ada-002 (1536 dimensions)
 * - Local/OSS models via Ollama
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Provider fallback chain
 * - Caching support
 * - Configurable via environment variables
 * 
 * @example
 * ```typescript
 * const service = new EmbeddingService();
 * const embedding = await service.getEmbedding("Hello, world!");
 * // Returns number[] with 1536 dimensions
 * ```
 */

import { logger } from '../../logging/logger.js';
import { env } from '../../config/env.js';
import { redisCache } from '../../cache/redis.js';
import { providerManager } from '../../config/provider-manager.js';
import crypto from 'crypto';

/**
 * Embedding provider types
 */
export type EmbeddingProvider = 'openai' | 'openrouter' | 'ollama' | 'local';

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
    /**
     * Primary embedding provider
     * @default 'openai'
     */
    provider?: EmbeddingProvider;

    /**
     * Model ID for embedding generation
     * @default 'text-embedding-3-small'
     */
    modelId?: string;

    /**
     * Expected embedding dimension
     * @default 1536
     */
    dimension?: number;

    /**
     * Maximum retry attempts
     * @default 3
     */
    maxRetries?: number;

    /**
     * Base delay between retries (ms)
     * @default 1000
     */
    retryDelayMs?: number;

    /**
     * Whether to cache embeddings
     * @default true
     */
    enableCache?: boolean;

    /**
     * Cache TTL in seconds
     * @default 86400 (24 hours)
     */
    cacheTtlSeconds?: number;
}

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
    embedding: number[];
    model: string;
    provider: EmbeddingProvider;
    cached: boolean;
    tokens?: number;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
    texts: string[];
    skipCache?: boolean;
}

/**
 * EmbeddingService class
 * Generates text embeddings for semantic similarity search
 */
export class EmbeddingService {
    private config: Required<EmbeddingServiceConfig>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private openaiClient: any = null;

    constructor(config: EmbeddingServiceConfig = {}) {
        this.config = {
            provider: (env.EMBEDDING_PROVIDER as EmbeddingProvider) || config.provider || 'openai',
            modelId: env.EMBEDDING_MODEL_ID || config.modelId || 'text-embedding-3-small',
            dimension: config.dimension ?? 1536,
            maxRetries: config.maxRetries ?? 3,
            retryDelayMs: config.retryDelayMs ?? 1000,
            enableCache: config.enableCache ?? true,
            cacheTtlSeconds: config.cacheTtlSeconds ?? 86400,
        };

        logger.info('EmbeddingService initialized', {
            provider: this.config.provider,
            model: this.config.modelId,
            dimension: this.config.dimension,
        });
    }

    /**
     * Get or create OpenAI client
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async getOpenAIClient(): Promise<any> {
        if (this.openaiClient) {
            return this.openaiClient;
        }

        const OpenAI = (await import('openai')).default;

        // Try to get API key from database first
        let apiKey: string | null = await providerManager.getApiKey('openai');

        // Fallback to environment variable
        if (!apiKey) {
            apiKey = env.OPENAI_API_KEY ?? null;
        }

        if (!apiKey) {
            throw new Error('OpenAI API key not configured for embeddings');
        }

        this.openaiClient = new OpenAI({ apiKey });
        return this.openaiClient;
    }

    /**
     * Generate cache key for a text
     */
    private getCacheKey(text: string): string {
        // Use a hash of the text + model for cache key
        const hash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
        return `embedding:${this.config.modelId}:${hash}`;
    }

    /**
     * Get embedding from cache
     */
    private async getFromCache(text: string): Promise<number[] | null> {
        if (!this.config.enableCache) {
            return null;
        }

        try {
            const cacheKey = this.getCacheKey(text);
            const cached = await redisCache.get<number[]>(cacheKey);
            return cached;
        } catch (error) {
            logger.debug('EmbeddingService: Cache read failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return null;
        }
    }

    /**
     * Save embedding to cache
     */
    private async saveToCache(text: string, embedding: number[]): Promise<void> {
        if (!this.config.enableCache) {
            return;
        }

        try {
            const cacheKey = this.getCacheKey(text);
            await redisCache.set(cacheKey, embedding, this.config.cacheTtlSeconds);
        } catch (error) {
            logger.debug('EmbeddingService: Cache write failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Sleep helper for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate embedding using OpenAI
     */
    private async getEmbeddingOpenAI(text: string): Promise<{ embedding: number[]; tokens: number }> {
        const client = await this.getOpenAIClient();

        const response = await client.embeddings.create({
            model: this.config.modelId,
            input: text,
            encoding_format: 'float',
        });

        const embedding = response.data[0].embedding;
        const tokens = response.usage?.total_tokens || 0;

        return { embedding, tokens };
    }

    /**
     * Generate embedding using OpenRouter
     */
    private async getEmbeddingOpenRouter(_text: string): Promise<{ embedding: number[]; tokens: number }> {
        // OpenRouter doesn't have native embedding support, but some models do
        // For now, throw an error and suggest using OpenAI
        throw new Error('OpenRouter embedding not implemented. Use OpenAI provider for embeddings.');
    }

    /**
     * Generate embedding using local Ollama
     */
    private async getEmbeddingOllama(text: string): Promise<{ embedding: number[]; tokens: number }> {
        const baseUrl = env.OLLAMA_HOST || 'http://localhost:11434';
        const model = this.config.modelId || 'nomic-embed-text';

        const response = await fetch(`${baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { embedding: number[] };
        return {
            embedding: data.embedding,
            tokens: 0, // Ollama doesn't report token usage
        };
    }

    /**
     * Generate embedding with retry logic
     */
    private async getEmbeddingWithRetry(
        text: string,
        provider: EmbeddingProvider
    ): Promise<{ embedding: number[]; tokens: number }> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                switch (provider) {
                    case 'openai':
                        return await this.getEmbeddingOpenAI(text);
                    case 'openrouter':
                        return await this.getEmbeddingOpenRouter(text);
                    case 'ollama':
                    case 'local':
                        return await this.getEmbeddingOllama(text);
                    default:
                        throw new Error(`Unknown embedding provider: ${provider}`);
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                logger.warn('EmbeddingService: Attempt failed', {
                    attempt,
                    maxRetries: this.config.maxRetries,
                    provider,
                    error: lastError.message,
                });

                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Embedding generation failed');
    }

    /**
     * Get embedding for a single text
     * 
     * @param text - Text to embed
     * @returns Embedding result with metadata
     */
    async getEmbedding(text: string): Promise<EmbeddingResult> {
        if (!text || text.trim().length === 0) {
            throw new Error('Cannot generate embedding for empty text');
        }

        // Normalize text (trim whitespace, remove excessive newlines)
        const normalizedText = text.trim().replace(/\n{3,}/g, '\n\n');

        // Check cache first
        const cached = await this.getFromCache(normalizedText);
        if (cached) {
            logger.debug('EmbeddingService: Cache hit', {
                textLength: normalizedText.length,
            });
            return {
                embedding: cached,
                model: this.config.modelId,
                provider: this.config.provider,
                cached: true,
            };
        }

        // Generate embedding
        const result = await this.getEmbeddingWithRetry(normalizedText, this.config.provider);

        // Validate dimension
        if (result.embedding.length !== this.config.dimension) {
            logger.warn('EmbeddingService: Unexpected embedding dimension', {
                expected: this.config.dimension,
                actual: result.embedding.length,
            });
        }

        // Cache the result
        await this.saveToCache(normalizedText, result.embedding);

        logger.debug('EmbeddingService: Generated embedding', {
            textLength: normalizedText.length,
            tokens: result.tokens,
            dimension: result.embedding.length,
        });

        return {
            embedding: result.embedding,
            model: this.config.modelId,
            provider: this.config.provider,
            cached: false,
            tokens: result.tokens,
        };
    }

    /**
     * Get embeddings for multiple texts in batch
     * 
     * @param request - Batch embedding request
     * @returns Array of embedding results
     */
    async getBatchEmbeddings(request: BatchEmbeddingRequest): Promise<EmbeddingResult[]> {
        const results: EmbeddingResult[] = [];

        // Process in parallel with concurrency limit
        const concurrencyLimit = 5;
        const batches: string[][] = [];

        for (let i = 0; i < request.texts.length; i += concurrencyLimit) {
            batches.push(request.texts.slice(i, i + concurrencyLimit));
        }

        for (const batch of batches) {
            const batchResults = await Promise.all(
                batch.map(text => this.getEmbedding(text))
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Calculate cosine similarity between two embeddings
     */
    static cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0) return 0;

        return dotProduct / magnitude;
    }

    /**
     * Format embedding for PostgreSQL vector type
     */
    static formatForPostgres(embedding: number[]): string {
        return `[${embedding.join(',')}]`;
    }
}

/**
 * Singleton instance with default configuration
 */
export const embeddingService = new EmbeddingService();

/**
 * Quick embedding helper (uses singleton)
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const result = await embeddingService.getEmbedding(text);
    return result.embedding;
}
