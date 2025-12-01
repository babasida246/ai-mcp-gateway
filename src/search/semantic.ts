/**
 * Phase 4: Semantic Code Search with pgvector
 * Vector embeddings for intelligent code search
 */

import { Pool } from 'pg';
import { callLLM } from '../tools/llm/index.js';
import { getModelsByLayer } from '../config/models.js';
import { logger } from '../logging/logger.js';

export interface CodeEmbedding {
    id: string;
    filePath: string;
    codeChunk: string;
    embedding: number[];
    language: string;
    chunkType: 'function' | 'class' | 'interface' | 'type' | 'module';
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface SearchResult {
    id: string;
    filePath: string;
    codeChunk: string;
    similarity: number;
    chunkType: string;
    metadata: Record<string, unknown>;
}

/**
 * Semantic Code Search Engine
 */
export class SemanticSearch {
    constructor(private db: Pool) { }

    /**
     * Generate embedding for text using LLM
     */
    async generateEmbedding(text: string): Promise<number[]> {
        // Use OpenAI or similar embedding model
        // For now, simulate with hash-based approach
        // In production, use: text-embedding-ada-002 or similar

        logger.info('Generating embedding', {
            textLength: text.length,
        });

        // Placeholder: In production, call embedding API
        // Example: OpenAI text-embedding-ada-002
        const embedding = this.simulateEmbedding(text);

        return embedding;
    }

    /**
     * Simulate embedding (replace with real embedding API)
     */
    private simulateEmbedding(text: string): number[] {
        // Create a 384-dimensional vector (simulated)
        const dim = 384;
        const embedding = new Array(dim).fill(0);

        // Simple hash-based simulation
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            embedding[i % dim] += charCode / 1000;
        }

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map((val) => val / magnitude);
    }

    /**
     * Index code file for semantic search
     */
    async indexCodeFile(
        filePath: string,
        code: string,
        language: string,
    ): Promise<void> {
        logger.info('Indexing code file', { filePath, language });

        // Split code into chunks (functions, classes, etc.)
        const chunks = await this.splitIntoChunks(code, language);

        for (const chunk of chunks) {
            const embedding = await this.generateEmbedding(chunk.code);

            await this.db.query(
                `INSERT INTO code_embeddings (
                    file_path,
                    code_chunk,
                    embedding,
                    language,
                    chunk_type,
                    metadata,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (file_path, chunk_type, code_chunk) DO UPDATE
                SET embedding = $3, updated_at = NOW()`,
                [
                    filePath,
                    chunk.code,
                    JSON.stringify(embedding),
                    language,
                    chunk.type,
                    JSON.stringify(chunk.metadata),
                ],
            );
        }

        logger.info(`Indexed ${chunks.length} chunks for ${filePath}`);
    }

    /**
     * Split code into semantic chunks
     */
    private async splitIntoChunks(
        code: string,
        language: string,
    ): Promise<Array<{
        code: string;
        type: CodeEmbedding['chunkType'];
        metadata: Record<string, unknown>;
    }>> {
        const chunks: Array<{
            code: string;
            type: CodeEmbedding['chunkType'];
            metadata: Record<string, unknown>;
        }> = [];

        // Extract functions
        const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*{[^}]*}/g;
        let match;
        while ((match = functionRegex.exec(code)) !== null) {
            chunks.push({
                code: match[0],
                type: 'function',
                metadata: { name: match[1], language },
            });
        }

        // Extract classes
        const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*{[^}]*}/g;
        while ((match = classRegex.exec(code)) !== null) {
            chunks.push({
                code: match[0],
                type: 'class',
                metadata: { name: match[1], language },
            });
        }

        // If no functions/classes found, treat as module
        if (chunks.length === 0) {
            chunks.push({
                code,
                type: 'module',
                metadata: { language },
            });
        }

        return chunks;
    }

    /**
     * Search for semantically similar code
     */
    async search(
        query: string,
        limit = 10,
        filters?: {
            language?: string;
            chunkType?: CodeEmbedding['chunkType'];
            filePath?: string;
        },
    ): Promise<SearchResult[]> {
        logger.info('Semantic search', { query, limit });

        // Generate query embedding
        const queryEmbedding = await this.generateEmbedding(query);

        // Build WHERE clause
        const conditions: string[] = ['1=1'];
        const params: unknown[] = [JSON.stringify(queryEmbedding), limit];
        let paramIndex = 3;

        if (filters?.language) {
            params.push(filters.language);
            conditions.push(`language = $${paramIndex++}`);
        }

        if (filters?.chunkType) {
            params.push(filters.chunkType);
            conditions.push(`chunk_type = $${paramIndex++}`);
        }

        if (filters?.filePath) {
            params.push(`%${filters.filePath}%`);
            conditions.push(`file_path LIKE $${paramIndex++}`);
        }

        // Cosine similarity search using pgvector
        const query_sql = `
            SELECT
                id,
                file_path,
                code_chunk,
                chunk_type,
                metadata,
                1 - (embedding <=> $1::vector) as similarity
            FROM code_embeddings
            WHERE ${conditions.join(' AND ')}
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        `;

        const result = await this.db.query(query_sql, params);

        return result.rows.map((row) => ({
            id: row.id,
            filePath: row.file_path,
            codeChunk: row.code_chunk,
            similarity: parseFloat(row.similarity),
            chunkType: row.chunk_type,
            metadata: row.metadata,
        }));
    }

    /**
     * Find similar code to given code snippet
     */
    async findSimilar(
        code: string,
        limit = 5,
    ): Promise<SearchResult[]> {
        return this.search(code, limit);
    }

    /**
     * Delete embeddings for a file
     */
    async deleteFileEmbeddings(filePath: string): Promise<void> {
        await this.db.query(
            'DELETE FROM code_embeddings WHERE file_path = $1',
            [filePath],
        );

        logger.info('Deleted embeddings', { filePath });
    }

    /**
     * Get embedding statistics
     */
    async getStatistics(): Promise<{
        totalChunks: number;
        byLanguage: Record<string, number>;
        byType: Record<string, number>;
    }> {
        const result = await this.db.query(`
            SELECT
                COUNT(*) as total,
                jsonb_object_agg(language, lang_count) as by_language,
                jsonb_object_agg(chunk_type, type_count) as by_type
            FROM (
                SELECT
                    language,
                    chunk_type,
                    COUNT(*) OVER (PARTITION BY language) as lang_count,
                    COUNT(*) OVER (PARTITION BY chunk_type) as type_count
                FROM code_embeddings
            ) stats
        `);

        const row = result.rows[0];

        return {
            totalChunks: parseInt(row.total),
            byLanguage: row.by_language || {},
            byType: row.by_type || {},
        };
    }
}

/**
 * Knowledge Pack - Reusable context bundles
 */
export interface KnowledgePack {
    id: string;
    name: string;
    description: string;
    files: string[];
    tags: string[];
    embeddings: string[]; // Embedding IDs
    createdAt: Date;
    updatedAt: Date;
}

export class KnowledgePackManager {
    constructor(private db: Pool, private search: SemanticSearch) { }

    /**
     * Create knowledge pack from files
     */
    async createPack(
        name: string,
        description: string,
        files: string[],
        tags: string[] = [],
    ): Promise<KnowledgePack> {
        logger.info('Creating knowledge pack', { name, fileCount: files.length });

        // Get embedding IDs for files
        const embeddingIds = await this.getEmbeddingIdsForFiles(files);

        const result = await this.db.query(
            `INSERT INTO knowledge_packs (
                name,
                description,
                files,
                tags,
                embedding_ids,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING *`,
            [
                name,
                description,
                JSON.stringify(files),
                JSON.stringify(tags),
                JSON.stringify(embeddingIds),
            ],
        );

        const pack = result.rows[0];

        return {
            id: pack.id,
            name: pack.name,
            description: pack.description,
            files: pack.files,
            tags: pack.tags,
            embeddings: pack.embedding_ids,
            createdAt: pack.created_at,
            updatedAt: pack.updated_at,
        };
    }

    /**
     * Get embedding IDs for files
     */
    private async getEmbeddingIdsForFiles(files: string[]): Promise<string[]> {
        const result = await this.db.query(
            'SELECT id FROM code_embeddings WHERE file_path = ANY($1)',
            [files],
        );

        return result.rows.map((row) => row.id);
    }

    /**
     * Load knowledge pack context
     */
    async loadPack(packId: string): Promise<{
        pack: KnowledgePack;
        embeddings: SearchResult[];
    }> {
        const packResult = await this.db.query(
            'SELECT * FROM knowledge_packs WHERE id = $1',
            [packId],
        );

        if (packResult.rows.length === 0) {
            throw new Error(`Knowledge pack not found: ${packId}`);
        }

        const pack = packResult.rows[0];

        const embeddingsResult = await this.db.query(
            'SELECT * FROM code_embeddings WHERE id = ANY($1)',
            [pack.embedding_ids],
        );

        const embeddings: SearchResult[] = embeddingsResult.rows.map((row) => ({
            id: row.id,
            filePath: row.file_path,
            codeChunk: row.code_chunk,
            similarity: 1.0,
            chunkType: row.chunk_type,
            metadata: row.metadata,
        }));

        return {
            pack: {
                id: pack.id,
                name: pack.name,
                description: pack.description,
                files: pack.files,
                tags: pack.tags,
                embeddings: pack.embedding_ids,
                createdAt: pack.created_at,
                updatedAt: pack.updated_at,
            },
            embeddings,
        };
    }

    /**
     * Search knowledge packs by tag
     */
    async searchByTags(tags: string[]): Promise<KnowledgePack[]> {
        const result = await this.db.query(
            `SELECT * FROM knowledge_packs
             WHERE tags @> $1::jsonb
             ORDER BY created_at DESC`,
            [JSON.stringify(tags)],
        );

        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            files: row.files,
            tags: row.tags,
            embeddings: row.embedding_ids,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
}
