-- Create model_configs, layer_configs, task_model_preferences if missing

CREATE TABLE IF NOT EXISTS model_configs (
    id VARCHAR(255) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    api_model_name VARCHAR(255) NOT NULL,
    layer VARCHAR(10) NOT NULL CHECK (layer IN ('L0', 'L1', 'L2', 'L3')),
    relative_cost INTEGER DEFAULT 0,
    price_per_1k_input_tokens DECIMAL(10, 6) DEFAULT 0,
    price_per_1k_output_tokens DECIMAL(10, 6) DEFAULT 0,
    context_window INTEGER DEFAULT 8192,
    enabled BOOLEAN DEFAULT true,
    capabilities JSONB DEFAULT '{"code": true, "general": true, "reasoning": false}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_configs_provider ON model_configs(provider);
CREATE INDEX IF NOT EXISTS idx_model_configs_layer ON model_configs(layer);
CREATE INDEX IF NOT EXISTS idx_model_configs_enabled ON model_configs(enabled);

CREATE TABLE IF NOT EXISTS layer_configs (
    layer VARCHAR(10) PRIMARY KEY CHECK (layer IN ('L0', 'L1', 'L2', 'L3')),
    enabled BOOLEAN DEFAULT true,
    model_ids TEXT[],
    fallback_models TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_model_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('chat', 'code', 'analyze', 'create_project')),
    model_ids TEXT[] NOT NULL,
    enabled BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_model_preferences_task_type ON task_model_preferences(task_type);
CREATE INDEX IF NOT EXISTS idx_task_model_preferences_enabled ON task_model_preferences(enabled);

-- Create triggers relying on update_updated_at_column function
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_model_configs_updated_at'
    ) THEN
        CREATE TRIGGER update_model_configs_updated_at BEFORE UPDATE ON model_configs
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_layer_configs_updated_at'
    ) THEN
        CREATE TRIGGER update_layer_configs_updated_at BEFORE UPDATE ON layer_configs
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_model_preferences_updated_at'
    ) THEN
        CREATE TRIGGER update_task_model_preferences_updated_at BEFORE UPDATE ON task_model_preferences
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;

COMMENT ON TABLE model_configs IS 'Stores LLM model configurations including pricing and capabilities';
COMMENT ON TABLE layer_configs IS 'Stores layer enable/disable state and model assignments';
COMMENT ON TABLE task_model_preferences IS 'Stores task-specific model preferences (chat, code, analyze, etc.)';
