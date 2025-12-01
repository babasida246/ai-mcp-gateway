-- Rollback: Phase 1 - Tracing & Multi-tenant Infrastructure
-- Version: 001
-- Date: 2025-12-01

-- WARNING: This will drop all tracing and multi-tenant data!
-- Only run this in development or if you're sure you want to lose this data.

-- Drop triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_user_quotas_updated_at ON user_quotas;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS reset_expired_quotas();

-- Remove project_id from conversations
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_conversations_project;
DROP INDEX IF EXISTS idx_conv_project;
ALTER TABLE conversations DROP COLUMN IF EXISTS project_id;

-- Drop new tables (in reverse dependency order)
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS user_quotas;
DROP TABLE IF EXISTS request_traces;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS organizations;
