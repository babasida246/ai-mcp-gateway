-- Migration: Add priority column to model_configs
-- Version: 1.1.0
-- Description: Adds priority field for model selection ordering within layers

-- Add priority column to model_configs table
ALTER TABLE model_configs 
ADD COLUMN
IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Add index for efficient priority-based sorting within layers
CREATE INDEX
IF NOT EXISTS idx_model_configs_layer_priority_enabled 
ON model_configs
(layer, priority ASC, enabled DESC);

-- Update existing models with default priorities based on current order
-- L0 models
UPDATE model_configs SET priority = 0 WHERE id = 'openrouter-llama-3.3-70b-free';
UPDATE model_configs SET priority = 1 WHERE id = 'openrouter-grok-free';
UPDATE model_configs SET priority = 10 WHERE id = 'oss-llama-3-8b';

-- L1 models
UPDATE model_configs SET priority = 0 WHERE id = 'openrouter-gemini-flash';
UPDATE model_configs SET priority = 1 WHERE id = 'openrouter-gpt-4o-mini';
UPDATE model_configs SET priority = 2 WHERE id = 'openai-gpt-4o-mini';

-- L2 models
UPDATE model_configs SET priority = 0 WHERE id = 'openrouter-haiku';
UPDATE model_configs SET priority = 1 WHERE id = 'openrouter-gpt-4o-mini-l2';
UPDATE model_configs SET priority = 2 WHERE id = 'anthropic-haiku';
UPDATE model_configs SET priority = 3 WHERE id = 'openai-gpt-4o';

-- L3 models
UPDATE model_configs SET priority = 0 WHERE id = 'openrouter-sonnet';
UPDATE model_configs SET priority = 1 WHERE id = 'anthropic-sonnet';
UPDATE model_configs SET priority = 2 WHERE id = 'openai-o1-preview';
UPDATE model_configs SET priority = 3 WHERE id = 'openai-o1-mini';

-- Set higher priority for any models that might not have been explicitly set
UPDATE model_configs SET priority = 99 WHERE priority IS NULL;