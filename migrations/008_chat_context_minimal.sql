-- Migration: Chat Context Optimization (Minimal - No pgvector)
-- Description: Add essential fields for context optimization without vector extension
-- Version: 008
-- Date: 2024-12-08
--
-- This migration adds only the non-vector columns needed for chat context optimization
-- The embedding column will remain NULL until pgvector is properly installed

-- ==========================================
-- CONVERSATIONS TABLE UPDATES
-- ==========================================

-- Add summary column to store progressive conversation summary
ALTER TABLE conversations
ADD COLUMN
IF NOT EXISTS summary TEXT;

-- Add summary token estimate for quick budget calculation
ALTER TABLE conversations
ADD COLUMN
IF NOT EXISTS summary_token_estimate INTEGER DEFAULT 0;

-- Add summary_updated_at to track when summary was last updated
ALTER TABLE conversations
ADD COLUMN
IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

-- ==========================================
-- MESSAGES TABLE UPDATES
-- ==========================================

-- Add turn_index for message ordering within conversation
ALTER TABLE messages
ADD COLUMN
IF NOT EXISTS turn_index INTEGER;

-- Add token_estimate for budget calculation without re-tokenizing
ALTER TABLE messages
ADD COLUMN
IF NOT EXISTS token_estimate INTEGER;

-- Add is_summarized flag to track which messages have been compressed into summary
ALTER TABLE messages
ADD COLUMN
IF NOT EXISTS is_summarized BOOLEAN NOT NULL DEFAULT false;

-- Note: embedding column (vector type) will be added later when pgvector is available
-- For now, span-retrieval strategy will fall back to recent messages

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Index for efficient turn-based retrieval
CREATE INDEX
IF NOT EXISTS idx_messages_turn_index 
ON messages
(conversation_id, turn_index ASC);

-- Index for finding unsummarized messages
CREATE INDEX
IF NOT EXISTS idx_messages_is_summarized 
ON messages
(conversation_id, is_summarized) 
WHERE is_summarized = false;

-- Index for token budget calculations
CREATE INDEX
IF NOT EXISTS idx_messages_token_estimate
ON messages
(conversation_id, token_estimate);

-- ==========================================
-- BACKFILL TURN_INDEX FOR EXISTING DATA
-- ==========================================

-- Set turn_index for existing messages based on created_at order
WITH
    ranked_messages
    AS
    (
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
SET turn_index
= rm.calculated_turn_index
FROM ranked_messages rm
WHERE m.id = rm.id;

-- ==========================================
-- CHAT CONTEXT CONFIG TABLE
-- ==========================================

-- Table to store per-project/tool context configuration
CREATE TABLE
IF NOT EXISTS chat_context_config
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid
(),
    
    -- Scope: either project_id OR tool_id, or both
    project_id VARCHAR
(255),
    tool_id VARCHAR
(255),
    
    -- Strategy configuration
    strategy VARCHAR
(50) NOT NULL DEFAULT 'summary+recent'
        CHECK
(strategy IN
('full', 'last-n', 'summary+recent', 'span-retrieval')),
    
    -- Token budget settings
    max_prompt_tokens INTEGER DEFAULT 4096,
    recent_min_messages INTEGER DEFAULT 5,
    
    -- Summarization settings
    enable_summarization BOOLEAN DEFAULT true,
    summary_trigger_tokens INTEGER DEFAULT 2000,
    summary_model_id VARCHAR
(255),
    
    -- Span retrieval settings (will work once pgvector is installed)
    span_top_k INTEGER DEFAULT 5,
    span_radius INTEGER DEFAULT 2,
    span_budget_ratio DECIMAL
(3,2) DEFAULT 0.6,
    
    -- Embedding settings
    embedding_model_id VARCHAR
(255),
    embedding_dimension INTEGER DEFAULT 1536,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW
(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW
(),
    
    -- Ensure unique config per scope
    CONSTRAINT unique_project_tool_config UNIQUE NULLS NOT DISTINCT
(project_id, tool_id)
);

-- Indexes for config lookup
CREATE INDEX
IF NOT EXISTS idx_chat_context_config_project 
ON chat_context_config
(project_id);

CREATE INDEX
IF NOT EXISTS idx_chat_context_config_tool 
ON chat_context_config
(tool_id);

-- Trigger for updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_chat_context_config_updated_at') THEN
    CREATE TRIGGER update_chat_context_config_updated_at
        BEFORE
    UPDATE ON chat_context_config
        FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column
    ();
END
IF;
END $$;

-- ==========================================
-- INSERT DEFAULT CONFIGURATION
-- ==========================================

-- Default config (applies when no project/tool specific config exists)
INSERT INTO chat_context_config
    (
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
    )
VALUES
    (
        NULL,
        NULL,
        'summary+recent',
        4096,
        5,
        true,
        2000,
        5,
        2,
        0.6
)
ON CONFLICT
(project_id, tool_id) DO NOTHING;

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to get next turn_index for a conversation
CREATE OR REPLACE FUNCTION get_next_turn_index
(p_conversation_id VARCHAR
(255))
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

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================
-- Note: To enable span-retrieval strategy with semantic search:
-- 1. Install pgvector extension properly in PostgreSQL
-- 2. Run: CREATE EXTENSION vector;
-- 3. Run: ALTER TABLE messages ADD COLUMN embedding vector(1536);
-- 4. Run: CREATE INDEX idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- 5. Create find_similar_messages function from migration 007
