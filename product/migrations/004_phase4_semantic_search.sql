-- Phase 4: Semantic Search with pgvector
-- Enables vector similarity search for code

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Code embeddings table
CREATE TABLE IF NOT EXISTS code_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    code_chunk TEXT NOT NULL,
    embedding vector(384),  -- 384-dimensional vector (adjustable)
    language TEXT NOT NULL,
    chunk_type TEXT NOT NULL CHECK (chunk_type IN ('function', 'class', 'interface', 'type', 'module')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (file_path, chunk_type, code_chunk)
);

-- Create index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_code_embeddings_vector
ON code_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_code_embeddings_language ON code_embeddings(language);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_chunk_type ON code_embeddings(chunk_type);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_file_path ON code_embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_metadata ON code_embeddings USING gin(metadata);

-- Knowledge packs table
CREATE TABLE IF NOT EXISTS knowledge_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    files JSONB NOT NULL DEFAULT '[]',
    tags JSONB NOT NULL DEFAULT '[]',
    embedding_ids JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tag search
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_tags ON knowledge_packs USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_name ON knowledge_packs(name);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_code_embeddings_updated_at
BEFORE UPDATE ON code_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_packs_updated_at
BEFORE UPDATE ON knowledge_packs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE code_embeddings IS 'Vector embeddings for semantic code search';
COMMENT ON TABLE knowledge_packs IS 'Reusable context bundles for AI agents';
COMMENT ON COLUMN code_embeddings.embedding IS '384-dimensional vector for similarity search';
COMMENT ON COLUMN code_embeddings.chunk_type IS 'Type of code chunk (function, class, etc.)';
COMMENT ON COLUMN knowledge_packs.files IS 'Array of file paths included in pack';
COMMENT ON COLUMN knowledge_packs.tags IS 'Searchable tags for pack discovery';
