-- Migration: Chat Context Optimization
-- Description: Add fields for context optimization with summary, token estimation, and embedding support
-- Version: 007
-- Date: 2024-12-06
--
-- Purpose:
-- 1. Enable progressive summarization of conversation history
-- 2. Track token usage per message for budget calculation
-- 3. Store embeddings for semantic span retrieval
-- 4. Support turn-based message ordering

-- Ensure pgvector extension is enabled (should already exist from migration 004)
CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- CONVERSATIONS TABLE UPDATES
-- ==========================================

-- Add summary column to store progressive conversation summary
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN conversations.summary IS 'Progressive summary of conversation history for context optimization';

-- Add summary token estimate for quick budget calculation
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS summary_token_estimate INTEGER DEFAULT 0;

COMMENT ON COLUMN conversations.summary_token_estimate IS 'Estimated token count of the summary for budget calculations';

-- Add last_summarized_at to track when summary was last updated
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS last_summarized_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.last_summarized_at IS 'Timestamp of last summary update';

-- ==========================================
-- MESSAGES TABLE UPDATES
-- ==========================================

-- Add turn_index for message ordering within conversation
-- This allows efficient retrieval of messages by position
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS turn_index INTEGER;

COMMENT ON COLUMN messages.turn_index IS 'Sequential index of message within conversation (0,1,2,3...)';

-- Add token_estimate for budget calculation without re-tokenizing
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS token_estimate INTEGER;

COMMENT ON COLUMN messages.token_estimate IS 'Estimated token count of message content';

-- Add is_summarized flag to track which messages have been compressed into summary
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_summarized BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN messages.is_summarized IS 'Whether this message has been included in the conversation summary';

-- Add embedding column for semantic similarity search
-- Using 1536 dimensions for OpenAI text-embedding-3-small or 384 for all-MiniLM-L6-v2
-- Default to 1536 for compatibility with OpenAI, can be adjusted via config
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN messages.embedding IS 'Vector embedding for semantic similarity search (span retrieval)';

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Index for efficient turn-based retrieval
CREATE INDEX IF NOT EXISTS idx_messages_turn_index 
ON messages(conversation_id, turn_index ASC);

-- Index for finding unsummarized messages
CREATE INDEX IF NOT EXISTS idx_messages_is_summarized 
ON messages(conversation_id, is_summarized) 
WHERE is_summarized = false;

-- Vector index for semantic similarity search (cosine distance)
-- Using IVFFlat for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_messages_embedding
ON messages
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for token budget calculations
CREATE INDEX IF NOT EXISTS idx_messages_token_estimate
ON messages(conversation_id, token_estimate);

-- ==========================================
-- BACKFILL TURN_INDEX FOR EXISTING DATA
-- ==========================================

-- Set turn_index for existing messages based on created_at order
-- This ensures backward compatibility with existing data
WITH ranked_messages AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY conversation_id 
            ORDER BY created_at ASC
        ) - 1 AS calculated_turn_index
    FROM messages
    WHERE turn_index IS NULL
)
UPDATE messages m
SET turn_index = rm.calculated_turn_index
FROM ranked_messages rm
WHERE m.id = rm.id;

-- ==========================================
-- CHAT CONTEXT CONFIG TABLE
-- ==========================================

-- Table to store per-project/tool context configuration
CREATE TABLE IF NOT EXISTS chat_context_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scope: either project_id OR tool_id, or both
    project_id VARCHAR(255),
    tool_id VARCHAR(255),
    
    -- Strategy configuration
    strategy VARCHAR(50) NOT NULL DEFAULT 'summary+recent'
        CHECK (strategy IN ('full', 'last-n', 'summary+recent', 'span-retrieval')),
    
    -- Token budget settings
    max_prompt_tokens INTEGER DEFAULT 4096,
    recent_min_messages INTEGER DEFAULT 5,
    
    -- Summarization settings
    enable_summarization BOOLEAN DEFAULT true,
    summary_trigger_tokens INTEGER DEFAULT 2000,
    summary_model_id VARCHAR(255),  -- Model to use for summarization (default: L0)
    
    -- Span retrieval settings
    span_top_k INTEGER DEFAULT 5,
    span_radius INTEGER DEFAULT 2,
    span_budget_ratio DECIMAL(3,2) DEFAULT 0.6,
    
    -- Embedding settings
    embedding_model_id VARCHAR(255),  -- Model/service for embeddings
    embedding_dimension INTEGER DEFAULT 1536,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique config per scope
    CONSTRAINT unique_project_tool_config UNIQUE NULLS NOT DISTINCT (project_id, tool_id)
);

-- Indexes for config lookup
CREATE INDEX IF NOT EXISTS idx_chat_context_config_project 
ON chat_context_config(project_id);

CREATE INDEX IF NOT EXISTS idx_chat_context_config_tool 
ON chat_context_config(tool_id);

-- Trigger for updated_at
CREATE TRIGGER update_chat_context_config_updated_at
BEFORE UPDATE ON chat_context_config
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE chat_context_config IS 'Configuration for chat context optimization strategies per project/tool';
COMMENT ON COLUMN chat_context_config.strategy IS 'Context building strategy: full (all messages), last-n (recent only), summary+recent, or span-retrieval';
COMMENT ON COLUMN chat_context_config.span_top_k IS 'Number of semantically similar messages to retrieve';
COMMENT ON COLUMN chat_context_config.span_radius IS 'Number of adjacent messages to include around each retrieved message';
COMMENT ON COLUMN chat_context_config.span_budget_ratio IS 'Fraction of token budget allocated to span retrieval (0.0-1.0)';

-- ==========================================
-- INSERT DEFAULT CONFIGURATION
-- ==========================================

-- Default config (applies when no project/tool specific config exists)
INSERT INTO chat_context_config (
    project_id,
    tool_id,
    strategy,
    max_prompt_tokens,
    recent_min_messages,
    enable_summarization,
    summary_trigger_tokens,
    span_top_k,
    span_radius,
    span_budget_ratio
) VALUES (
    NULL,  -- Global default
    NULL,
    'summary+recent',  -- Default to summary+recent strategy
    4096,
    5,
    true,
    2000,
    5,
    2,
    0.6
) ON CONFLICT (project_id, tool_id) DO NOTHING;

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to get next turn_index for a conversation
CREATE OR REPLACE FUNCTION get_next_turn_index(p_conversation_id VARCHAR(255))
RETURNS INTEGER AS $$
DECLARE
    next_idx INTEGER;
BEGIN
    SELECT COALESCE(MAX(turn_index), -1) + 1
    INTO next_idx
    FROM messages
    WHERE conversation_id = p_conversation_id;
    
    RETURN next_idx;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_turn_index IS 'Returns the next turn_index for a new message in a conversation';

-- Function to find semantically similar messages
CREATE OR REPLACE FUNCTION find_similar_messages(
    p_conversation_id VARCHAR(255),
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 5,
    p_exclude_turn_index INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    role VARCHAR(50),
    content TEXT,
    turn_index INTEGER,
    token_estimate INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.role,
        m.content,
        m.turn_index,
        m.token_estimate,
        1 - (m.embedding <=> p_query_embedding) AS similarity
    FROM messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.embedding IS NOT NULL
      AND (p_exclude_turn_index IS NULL OR m.turn_index < p_exclude_turn_index)
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_similar_messages IS 'Find messages semantically similar to a query embedding using cosine similarity';

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================
