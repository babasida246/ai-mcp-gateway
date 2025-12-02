-- Rollback Migration: Provider Management
-- Version: 005
-- Description: Rollback provider management tables and functions

-- Drop functions
DROP FUNCTION IF EXISTS set_provider_api_key
(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_provider_api_key
(TEXT);
DROP FUNCTION IF EXISTS update_provider_health
(TEXT, BOOLEAN);

-- Drop tables
DROP TABLE IF EXISTS provider_key_history
CASCADE;
DROP TABLE IF EXISTS provider_configs
CASCADE;
