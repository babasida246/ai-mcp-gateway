-- Migration: Provider Management
-- Version: 005
-- Date: 2025-12-02
-- Description: Create tables to manage provider API keys and configurations

-- ============================================
-- Provider Configurations Table
-- ============================================

CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL UNIQUE CHECK (provider_name IN ('openai', 'anthropic', 'openrouter', 'oss-local')),
    display_name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT false,
    api_key TEXT, -- Encrypted or env var reference
    api_endpoint TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    health_status BOOLEAN DEFAULT false,
    last_health_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_provider_name ON provider_configs(provider_name);
CREATE INDEX idx_provider_enabled ON provider_configs(enabled);
CREATE INDEX idx_provider_health ON provider_configs(health_status);

-- ============================================
-- Seed Initial Provider Data
-- ============================================

INSERT INTO provider_configs (id, provider_name, display_name, enabled, api_endpoint, config)
VALUES
    ('provider-openai', 'openai', 'OpenAI', false, 'https://api.openai.com/v1', '{"supports_streaming": true, "max_retries": 3}'::jsonb),
    ('provider-anthropic', 'anthropic', 'Anthropic (Claude)', false, 'https://api.anthropic.com/v1', '{"supports_streaming": true, "max_retries": 3}'::jsonb),
    ('provider-openrouter', 'openrouter', 'OpenRouter', false, 'https://openrouter.ai/api/v1', '{"supports_streaming": true, "max_retries": 3, "site_url": "https://ai-mcp-gateway", "site_name": "AI MCP Gateway"}'::jsonb),
    ('provider-oss-local', 'oss-local', 'OSS/Local Models', false, 'http://localhost:11434', '{"supports_streaming": true, "model_name": "llama3:8b"}'::jsonb)
ON CONFLICT (provider_name) DO NOTHING;

-- ============================================
-- Provider API Key History (for audit)
-- ============================================

CREATE TABLE IF NOT EXISTS provider_key_history (
    id SERIAL PRIMARY KEY,
    provider_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'rotated')),
    key_prefix TEXT, -- First 8 chars for identification
    performed_by TEXT,
    performed_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    FOREIGN KEY (provider_id) REFERENCES provider_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_key_history_provider ON provider_key_history(provider_id);
CREATE INDEX idx_key_history_time ON provider_key_history(performed_at DESC);

-- ============================================
-- Function to update provider health status
-- ============================================

CREATE OR REPLACE FUNCTION update_provider_health(
    p_provider_name TEXT,
    p_health_status BOOLEAN
) RETURNS void AS $$
BEGIN
    UPDATE provider_configs
    SET 
        health_status = p_health_status,
        last_health_check = NOW(),
        updated_at = NOW()
    WHERE provider_name = p_provider_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to get provider API key
-- ============================================

CREATE OR REPLACE FUNCTION get_provider_api_key(
    p_provider_name TEXT
) RETURNS TEXT AS $$
DECLARE
    v_api_key TEXT;
BEGIN
    SELECT api_key INTO v_api_key
    FROM provider_configs
    WHERE provider_name = p_provider_name
    AND enabled = true;
    
    RETURN v_api_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to set provider API key
-- ============================================

CREATE OR REPLACE FUNCTION set_provider_api_key(
    p_provider_name TEXT,
    p_api_key TEXT,
    p_performed_by TEXT DEFAULT 'system'
) RETURNS void AS $$
DECLARE
    v_provider_id TEXT;
    v_key_prefix TEXT;
BEGIN
    -- Get provider ID
    SELECT id INTO v_provider_id
    FROM provider_configs
    WHERE provider_name = p_provider_name;
    
    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Provider % not found', p_provider_name;
    END IF;
    
    -- Extract key prefix for history
    v_key_prefix := SUBSTRING(p_api_key FROM 1 FOR 8);
    
    -- Update provider config
    UPDATE provider_configs
    SET 
        api_key = p_api_key,
        enabled = true,
        updated_at = NOW()
    WHERE provider_name = p_provider_name;
    
    -- Log to history
    INSERT INTO provider_key_history (provider_id, action, key_prefix, performed_by)
    VALUES (v_provider_id, 'updated', v_key_prefix, p_performed_by);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE provider_configs IS 'Stores LLM provider configurations and API keys';
COMMENT ON TABLE provider_key_history IS 'Audit log for API key changes';
COMMENT ON FUNCTION update_provider_health IS 'Updates provider health status from health checks';
COMMENT ON FUNCTION get_provider_api_key IS 'Retrieves API key for an enabled provider';
COMMENT ON FUNCTION set_provider_api_key IS 'Sets API key for a provider and logs the change';
