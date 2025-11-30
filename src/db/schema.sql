-- Database Schema for AI MCP Gateway
-- Version: 1.0.0
-- Description: Creates tables for conversations, messages, context summaries, and LLM call logs

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    project_id VARCHAR(255),
    mode VARCHAR(50) DEFAULT 'web',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0.00
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0
);

-- Index for faster message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);

-- Context summaries table
CREATE TABLE IF NOT EXISTS context_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    summary JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_count_at_summary INTEGER DEFAULT 0
);

-- Index for faster summary retrieval
CREATE INDEX IF NOT EXISTS idx_context_summaries_conversation_id ON context_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_context_summaries_version ON context_summaries(conversation_id, version DESC);

-- LLM calls table (for cost tracking and analytics)
CREATE TABLE IF NOT EXISTS llm_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE SET NULL,
    model_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    layer VARCHAR(10) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0.00,
    actual_cost DECIMAL(10, 6),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    cached BOOLEAN DEFAULT false,
    cross_check_used BOOLEAN DEFAULT false,
    escalated BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_llm_calls_conversation_id ON llm_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_model_id ON llm_calls(model_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_layer ON llm_calls(layer);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_success ON llm_calls(success);

-- Routing hints table (for optimization)
CREATE TABLE IF NOT EXISTS routing_hints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(255),
    task_pattern TEXT,
    recommended_layer VARCHAR(10),
    recommended_model VARCHAR(255),
    success_rate DECIMAL(5, 4),
    avg_cost DECIMAL(10, 6),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_routing_hints_project_id ON routing_hints(project_id);

-- Todo items table (for code agent)
CREATE TABLE IF NOT EXISTS todo_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'completed')),
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_items_conversation_id ON todo_items(conversation_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_status ON todo_items(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_summaries_updated_at BEFORE UPDATE ON context_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routing_hints_updated_at BEFORE UPDATE ON routing_hints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todo_items_updated_at BEFORE UPDATE ON todo_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for conversation statistics
CREATE OR REPLACE VIEW conversation_stats AS
SELECT 
    c.id,
    c.user_id,
    c.project_id,
    c.created_at,
    c.message_count,
    c.total_cost,
    COUNT(DISTINCT m.id) as actual_message_count,
    COUNT(DISTINCT l.id) as llm_call_count,
    SUM(l.estimated_cost) as calculated_cost,
    AVG(l.duration_ms) as avg_response_time_ms
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN llm_calls l ON c.id = l.conversation_id
GROUP BY c.id, c.user_id, c.project_id, c.created_at, c.message_count, c.total_cost;

-- View for model performance
CREATE OR REPLACE VIEW model_performance AS
SELECT 
    model_id,
    provider,
    layer,
    COUNT(*) as total_calls,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(estimated_cost) as total_cost,
    SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cache_hits
FROM llm_calls
GROUP BY model_id, provider, layer;

-- Comments for documentation
COMMENT ON TABLE conversations IS 'Stores conversation metadata and tracking';
COMMENT ON TABLE messages IS 'Stores all messages in conversations';
COMMENT ON TABLE context_summaries IS 'Stores compressed context summaries for long conversations';
COMMENT ON TABLE llm_calls IS 'Logs all LLM API calls for cost tracking and analytics';
COMMENT ON TABLE routing_hints IS 'Stores learned routing patterns for optimization';
COMMENT ON TABLE todo_items IS 'Stores TODO items for code agent tasks';
