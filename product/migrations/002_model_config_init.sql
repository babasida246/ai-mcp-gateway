-- Migration: Initialize model and layer configurations from environment
-- Version: 1.0.0
-- Description: Seeds initial model and layer configs into database from .env values

-- Insert initial layer configurations
INSERT INTO layer_configs
    (layer, enabled, model_ids, fallback_models, metadata)
VALUES
    ('L0', true, ARRAY
[]::TEXT[], ARRAY[]::TEXT[], '{}'),
('L1', true, ARRAY[]::TEXT[], ARRAY[]::TEXT[], '{}'),
('L2', true, ARRAY[]::TEXT[], ARRAY[]::TEXT[], '{}'),
('L3', true, ARRAY[]::TEXT[], ARRAY[]::TEXT[], '{}')
ON CONFLICT
(layer) DO NOTHING;

-- Insert default model configurations (will be overridden by env loader)
-- These are fallback defaults in case no .env config exists

-- L0 Models (Free tier)
INSERT INTO model_configs
    (id, provider, api_model_name, layer, relative_cost, price_per_1k_input_tokens, price_per_1k_output_tokens, context_window, enabled, capabilities)
VALUES
    ('openrouter-llama-3.3-70b-free', 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free', 'L0', 0, 0, 0, 131072, true, '{"code": true, "general": true, "reasoning": true}'),
    ('openrouter-grok-free', 'openrouter', 'x-ai/grok-4.1-fast:free', 'L0', 0, 0, 0, 131072, true, '{"code": true, "general": true, "reasoning": true}')
ON CONFLICT
(id) DO
UPDATE SET
    api_model_name = EXCLUDED.api_model_name,
    enabled = EXCLUDED.enabled,
    updated_at = CURRENT_TIMESTAMP;

-- L1 Models (Low cost)
INSERT INTO model_configs
    (id, provider, api_model_name, layer, relative_cost, price_per_1k_input_tokens, price_per_1k_output_tokens, context_window, enabled, capabilities)
VALUES
    ('openrouter-gemini-flash', 'openrouter', 'google/gemini-flash-1.5', 'L1', 1, 0.00005, 0.00015, 1048576, true, '{"code": true, "general": true, "reasoning": true}'),
    ('openrouter-gpt-4o-mini', 'openrouter', 'openai/gpt-4o-mini', 'L1', 1, 0.00015, 0.0006, 128000, true, '{"code": true, "general": true, "reasoning": true}')
ON CONFLICT
(id) DO
UPDATE SET
    api_model_name = EXCLUDED.api_model_name,
    price_per_1k_input_tokens = EXCLUDED.price_per_1k_input_tokens,
    price_per_1k_output_tokens = EXCLUDED.price_per_1k_output_tokens,
    updated_at = CURRENT_TIMESTAMP;

-- L2 Models (Mid tier)
INSERT INTO model_configs
    (id, provider, api_model_name, layer, relative_cost, price_per_1k_input_tokens, price_per_1k_output_tokens, context_window, enabled, capabilities)
VALUES
    ('openrouter-claude-haiku', 'openrouter', 'anthropic/claude-3-haiku', 'L2', 5, 0.00025, 0.00125, 200000, true, '{"code": true, "general": true, "reasoning": true}'),
    ('openrouter-gpt-4o', 'openrouter', 'openai/gpt-4o', 'L2', 5, 0.0025, 0.01, 128000, true, '{"code": true, "general": true, "reasoning": true}')
ON CONFLICT
(id) DO
UPDATE SET
    api_model_name = EXCLUDED.api_model_name,
    price_per_1k_input_tokens = EXCLUDED.price_per_1k_input_tokens,
    price_per_1k_output_tokens = EXCLUDED.price_per_1k_output_tokens,
    updated_at = CURRENT_TIMESTAMP;

-- L3 Models (Premium tier)
INSERT INTO model_configs
    (id, provider, api_model_name, layer, relative_cost, price_per_1k_input_tokens, price_per_1k_output_tokens, context_window, enabled, capabilities)
VALUES
    ('openrouter-claude-sonnet', 'openrouter', 'anthropic/claude-3.5-sonnet', 'L3', 10, 0.003, 0.015, 200000, true, '{"code": true, "general": true, "reasoning": true}'),
    ('openrouter-o1-preview', 'openrouter', 'openai/o1-preview', 'L3', 100, 0.015, 0.06, 128000, false, '{"code": true, "general": true, "reasoning": true}')
ON CONFLICT
(id) DO
UPDATE SET
    api_model_name = EXCLUDED.api_model_name,
    price_per_1k_input_tokens = EXCLUDED.price_per_1k_input_tokens,
    price_per_1k_output_tokens = EXCLUDED.price_per_1k_output_tokens,
    updated_at = CURRENT_TIMESTAMP;

-- Insert task-specific model preferences
INSERT INTO task_model_preferences
    (task_type, model_ids, enabled)
VALUES
    ('chat', ARRAY
['openrouter-llama-3.3-70b-free', 'openrouter-gemini-flash'], true),
('code', ARRAY['openrouter-llama-3.3-70b-free', 'openrouter-grok-free'], true),
('analyze', ARRAY['openrouter-grok-free', 'openrouter-claude-haiku'], true),
('create_project', ARRAY['openrouter-llama-3.3-70b-free', 'openrouter-gpt-4o-mini'], true)
ON CONFLICT DO NOTHING;

