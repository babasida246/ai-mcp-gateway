-- Migration: 009_system_configuration
-- Description: Create tables for storing all system configuration previously in .env
-- Replaces: .env file with database-backed configuration

-- Table for general system configuration (non-sensitive)
CREATE TABLE
IF NOT EXISTS system_config
(
    id SERIAL PRIMARY KEY,
    key VARCHAR
(255) NOT NULL UNIQUE,
    value TEXT,
    value_type VARCHAR
(50) DEFAULT 'string', -- string, number, boolean, json
    category VARCHAR
(100) NOT NULL, -- server, api, logging, features, redis
    description TEXT,
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for provider credentials and API keys (encrypted)
CREATE TABLE
IF NOT EXISTS provider_credentials
(
    id SERIAL PRIMARY KEY,
    provider VARCHAR
(100) NOT NULL UNIQUE, -- openrouter, openai, anthropic, ollama
    api_key_encrypted TEXT, -- AES-256 encrypted
    api_endpoint TEXT,
    enabled BOOLEAN DEFAULT true,
    configuration JSONB, -- Additional provider-specific config
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for layer and model configuration
CREATE TABLE
IF NOT EXISTS layer_config
(
    id SERIAL PRIMARY KEY,
    layer_name VARCHAR
(50) NOT NULL UNIQUE, -- L0, L1, L2, L3
    models TEXT[], -- Array of model names
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    configuration JSONB, -- Layer-specific settings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for task-specific model configuration
CREATE TABLE
IF NOT EXISTS task_config
(
    id SERIAL PRIMARY KEY,
    task_type VARCHAR
(100) NOT NULL UNIQUE, -- chat, code, analyze, create_project
    models TEXT[], -- Array of preferred models
    fallback_models TEXT[],
    enabled BOOLEAN DEFAULT true,
    configuration JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for feature flags and toggles
CREATE TABLE
IF NOT EXISTS feature_flags
(
    id SERIAL PRIMARY KEY,
    flag_key VARCHAR
(255) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT false,
    description TEXT,
    metadata JSONB, -- Additional flag metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_system_config_category ON system_config(category);
CREATE INDEX idx_system_config_key ON system_config
(key);
CREATE INDEX idx_provider_credentials_provider ON provider_credentials(provider);
CREATE INDEX idx_provider_credentials_enabled ON provider_credentials(enabled);
CREATE INDEX idx_layer_config_layer ON layer_config(layer_name);
CREATE INDEX idx_task_config_task ON task_config(task_type);
CREATE INDEX idx_feature_flags_key ON feature_flags(flag_key);

-- Insert default system configuration
INSERT INTO system_config
    (key, value, value_type, category, description, is_required, default_value)
VALUES
    -- Server config
    ('MCP_SERVER_NAME', 'mcp-gateway', 'string', 'server', 'MCP server name', false, 'mcp-gateway'),
    ('MCP_SERVER_VERSION', '0.1.0', 'string', 'server', 'Server version', false, '0.1.0'),
    ('MODE', 'api', 'string', 'server', 'Server mode: api or mcp', false, 'api'),
    ('MCP_TRANSPORT', 'stdio', 'string', 'server', 'MCP transport type: stdio or websocket', false, 'stdio'),
    ('MCP_WEBSOCKET_PORT', '8080', 'number', 'server', 'WebSocket port for MCP', false, '8080'),

    -- API config
    ('API_PORT', '3000', 'number', 'api', 'HTTP API server port', true, '3000'),
    ('API_HOST', '0.0.0.0', 'string', 'api', 'API server host', false, '0.0.0.0'),
    ('API_CORS_ORIGIN', '*', 'string', 'api', 'CORS allowed origins', false, '*'),

    -- Redis config
    ('REDIS_HOST', 'localhost', 'string', 'redis', 'Redis server host', true, 'localhost'),
    ('REDIS_PORT', '6379', 'number', 'redis', 'Redis server port', true, '6379'),
    ('REDIS_PASSWORD', '', 'string', 'redis', 'Redis password (if any)', false, ''),
    ('REDIS_DB', '0', 'number', 'redis', 'Redis database number', false, '0'),

    -- Logging
    ('LOG_LEVEL', 'info', 'string', 'logging', 'Logging level: debug, info, warn, error', false, 'info'),
    ('LOG_FILE', 'logs/mcp-gateway.log', 'string', 'logging', 'Log file path', false, 'logs/mcp-gateway.log'),

    -- Ollama/OSS
    ('OSS_MODEL_ENABLED', 'false', 'boolean', 'features', 'Enable Ollama local models', false, 'false'),
    ('OSS_MODEL_ENDPOINT', 'http://localhost:11434', 'string', 'features', 'Ollama endpoint URL', false, 'http://localhost:11434'),
    ('OSS_MODEL_NAME', 'llama3:8b', 'string', 'features', 'Default Ollama model', false, 'llama3:8b'),

    -- Orchestrator features
    ('ENABLE_ORCHESTRATOR', 'false', 'boolean', 'features', 'Enable multi-pass orchestrator', false, 'false'),
    ('ORCHESTRATOR_STRATEGY', 'two-pass', 'string', 'features', 'Orchestrator strategy: two-pass or three-pass', false, 'two-pass'),
    ('ORCHESTRATOR_INCLUDE_REFINEMENT', 'false', 'boolean', 'features', 'Include refinement step in orchestration', false, 'false')
ON CONFLICT
(key) DO NOTHING;

-- Insert default provider credentials (empty, to be filled via UI)
INSERT INTO provider_credentials
    (provider, enabled, api_endpoint, configuration)
VALUES
    ('openrouter', false, 'https://openrouter.ai/api/v1', '{"fallback_models": ["meta-llama/llama-3.3-70b-instruct:free", "x-ai/grok-4.1-fast:free"]}'
::jsonb),
('openai', false, 'https://api.openai.com/v1', '{}'::jsonb),
('anthropic', false, 'https://api.anthropic.com/v1', '{}'::jsonb),
('ollama', false, 'http://localhost:11434', '{}'::jsonb)
ON CONFLICT
(provider) DO NOTHING;

-- Insert default layer configuration
INSERT INTO layer_config
    (layer_name, models, priority, enabled, configuration)
VALUES
    ('L0', ARRAY
['meta-llama/llama-3.3-70b-instruct:free', 'x-ai/grok-4.1-fast:free'], 0, true, '{"description": "Free/fallback tier"}'::jsonb),
('L1', ARRAY['google/gemini-flash-1.5', 'openai/gpt-4o-mini'], 1, true, '{"description": "Fast cheap models"}'::jsonb),
('L2', ARRAY['anthropic/claude-3-haiku', 'openai/gpt-4o'], 2, true, '{"description": "Mid-tier balanced"}'::jsonb),
('L3', ARRAY['anthropic/claude-3.5-sonnet', 'openai/o1-preview'], 3, true, '{"description": "Premium models"}'::jsonb)
ON CONFLICT
(layer_name) DO NOTHING;

-- Insert default task configuration
INSERT INTO task_config
    (task_type, models, fallback_models, enabled, configuration)
VALUES
    ('chat', ARRAY
['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-flash-1.5'], ARRAY['x-ai/grok-4.1-fast:free'], true, '{"description": "General conversation"}'::jsonb),
('code', ARRAY['qwen/qwen-2.5-coder-32b-instruct:free', 'deepseek/deepseek-coder-33b-instruct:free'], ARRAY['meta-llama/llama-3.3-70b-instruct:free'], true, '{"description": "Code generation"}'::jsonb),
('analyze', ARRAY['x-ai/grok-4.1-fast:free', 'anthropic/claude-3-haiku'], ARRAY['google/gemini-flash-1.5'], true, '{"description": "Code review and analysis"}'::jsonb),
('create_project', ARRAY['qwen/qwen-2.5-coder-32b-instruct:free', 'openai/gpt-4o-mini'], ARRAY['google/gemini-flash-1.5'], true, '{"description": "Project scaffolding"}'::jsonb)
ON CONFLICT
(task_type) DO NOTHING;

-- Insert default feature flags
INSERT INTO feature_flags
    (flag_key, enabled, description, metadata)
VALUES
    ('ENABLE_ORCHESTRATOR', false, 'Enable multi-pass orchestrator for complex tasks', '{"strategies": ["two-pass", "three-pass"]}'
::jsonb),
('ENABLE_CACHING', true, 'Enable response caching', '{"ttl": 3600}'::jsonb),
('ENABLE_RATE_LIMITING', true, 'Enable API rate limiting', '{"requests_per_minute": 60}'::jsonb),
('ENABLE_ANALYTICS', true, 'Enable usage analytics', '{}'::jsonb)
ON CONFLICT
(flag_key) DO NOTHING;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column
()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_system_config_updated_at BEFORE
UPDATE ON system_config FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();
CREATE TRIGGER update_provider_credentials_updated_at BEFORE
UPDATE ON provider_credentials FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();
CREATE TRIGGER update_layer_config_updated_at BEFORE
UPDATE ON layer_config FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();
CREATE TRIGGER update_task_config_updated_at BEFORE
UPDATE ON task_config FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();
CREATE TRIGGER update_feature_flags_updated_at BEFORE
UPDATE ON feature_flags FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();

COMMENT ON TABLE system_config IS 'General system configuration replacing .env variables';
COMMENT ON TABLE provider_credentials IS 'LLM provider API keys and credentials (encrypted)';
COMMENT ON TABLE layer_config IS 'Model layer configuration (L0-L3)';
COMMENT ON TABLE task_config IS 'Task-specific model preferences';
COMMENT ON TABLE feature_flags IS 'Feature flags and toggles';
