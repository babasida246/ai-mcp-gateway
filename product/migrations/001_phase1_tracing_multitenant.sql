-- Migration: Phase 1 - Tracing & Multi-tenant Infrastructure
-- Version: 001
-- Date: 2025-12-01

-- ============================================
-- Request Tracing Tables
-- ============================================

CREATE TABLE IF NOT EXISTS request_traces (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    request_type TEXT NOT NULL CHECK (request_type IN ('route', 'chat', 'code-agent', 'mcp-cli', 'analyze', 'create-project')),
    request_payload JSONB NOT NULL,
    routing_decisions JSONB[] DEFAULT ARRAY[]::JSONB[],
    llm_calls JSONB[] DEFAULT ARRAY[]::JSONB[],
    tool_calls JSONB[] DEFAULT ARRAY[]::JSONB[],
    total_cost DECIMAL(10, 6) DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    error_info JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_traces_conversation ON request_traces(conversation_id);
CREATE INDEX idx_traces_created ON request_traces(created_at DESC);
CREATE INDEX idx_traces_type ON request_traces(request_type);
CREATE INDEX idx_traces_cost ON request_traces(total_cost DESC);

-- ============================================
-- Multi-tenant Tables
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_org ON projects(organization_id);

CREATE TABLE IF NOT EXISTS user_quotas (
    user_id TEXT PRIMARY KEY,
    project_id TEXT,
    max_tokens_daily INTEGER DEFAULT 1000000,
    max_cost_daily DECIMAL(10, 2) DEFAULT 10.00,
    current_tokens_today INTEGER DEFAULT 0,
    current_cost_today DECIMAL(10, 6) DEFAULT 0,
    reset_at TIMESTAMP DEFAULT NOW() + INTERVAL '1 day',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_quotas_project ON user_quotas(project_id);
CREATE INDEX idx_quotas_reset ON user_quotas(reset_at);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'developer', 'admin', 'owner')),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_roles_project ON user_roles(project_id);
CREATE INDEX idx_roles_user ON user_roles(user_id);

-- ============================================
-- Add project_id to existing tables (nullable for gradual migration)
-- ============================================

-- Add to conversations if column doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE conversations ADD COLUMN project_id TEXT;
        ALTER TABLE conversations ADD CONSTRAINT fk_conversations_project 
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
        CREATE INDEX idx_conv_project ON conversations(project_id);
    END IF;
END $$;

-- Add to request_traces if conversation_id FK doesn't exist yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'request_traces_conversation_id_fkey'
    ) THEN
        -- Drop the column if it exists without FK
        ALTER TABLE request_traces DROP COLUMN IF EXISTS conversation_id;
        -- Re-add with FK
        ALTER TABLE request_traces ADD COLUMN conversation_id TEXT;
        ALTER TABLE request_traces ADD CONSTRAINT request_traces_conversation_id_fkey
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- Default organization and project for existing data
-- ============================================

-- Insert default organization
INSERT INTO organizations (id, name, metadata)
VALUES (
    'default-org',
    'Default Organization',
    '{"description": "Auto-created for existing data migration"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Insert default project
INSERT INTO projects (id, organization_id, name, config)
VALUES (
    'default-project',
    'default-org',
    'Default Project',
    '{
        "routing": {
            "defaultLayer": "L0",
            "maxLayer": "L3",
            "enableCrossCheck": true,
            "enableAutoEscalate": false
        }
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Backfill existing conversations with default project
UPDATE conversations 
SET project_id = 'default-project'
WHERE project_id IS NULL;

-- ============================================
-- Functions and Triggers
-- ============================================

-- Function to reset quotas daily
CREATE OR REPLACE FUNCTION reset_expired_quotas()
RETURNS void AS $$
BEGIN
    UPDATE user_quotas
    SET 
        current_tokens_today = 0,
        current_cost_today = 0,
        reset_at = NOW() + INTERVAL '1 day'
    WHERE reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_quotas_updated_at BEFORE UPDATE ON user_quotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE request_traces IS 'Complete audit trail of all requests through the gateway';
COMMENT ON TABLE organizations IS 'Top-level tenant entity for multi-tenant support';
COMMENT ON TABLE projects IS 'Project-level configuration and isolation';
COMMENT ON TABLE user_quotas IS 'Per-user token and cost limits with daily reset';
COMMENT ON TABLE user_roles IS 'Role-based access control per project';

COMMENT ON COLUMN request_traces.routing_decisions IS 'Array of routing decisions made during request processing';
COMMENT ON COLUMN request_traces.llm_calls IS 'Detailed trace of all LLM API calls';
COMMENT ON COLUMN request_traces.tool_calls IS 'MCP tool invocations during request';
COMMENT ON COLUMN projects.config IS 'Project-specific routing policies and feature flags';
COMMENT ON COLUMN user_quotas.reset_at IS 'Timestamp when quota counters will be reset';
