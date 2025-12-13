-- Rollback migration: 009_system_configuration
-- Drops all configuration tables

DROP TRIGGER IF EXISTS update_feature_flags_updated_at
ON feature_flags;
DROP TRIGGER IF EXISTS update_task_config_updated_at
ON task_config;
DROP TRIGGER IF EXISTS update_layer_config_updated_at
ON layer_config;
DROP TRIGGER IF EXISTS update_provider_credentials_updated_at
ON provider_credentials;
DROP TRIGGER IF EXISTS update_system_config_updated_at
ON system_config;

DROP FUNCTION IF EXISTS update_updated_at_column
();

DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS task_config;
DROP TABLE IF EXISTS layer_config;
DROP TABLE IF EXISTS provider_credentials;
DROP TABLE IF EXISTS system_config;
