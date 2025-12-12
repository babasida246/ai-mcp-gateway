-- Phase 1.2: Analytics & Quotas
-- Request analytics and user quotas

-- ============================================
-- Analytics Tables
-- ============================================

CREATE TABLE
IF NOT EXISTS request_analytics
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid
(),
    trace_id TEXT REFERENCES request_traces
(id) ON
DELETE CASCADE,
    layer TEXT
NOT NULL,
    model_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_total INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL
(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW
()
);

-- Indexes for analytics queries
CREATE INDEX idx_analytics_timestamp ON request_analytics(timestamp DESC);
CREATE INDEX idx_analytics_layer ON request_analytics(layer);
CREATE INDEX idx_analytics_model ON request_analytics(model_id);
CREATE INDEX idx_analytics_provider ON request_analytics(provider);
CREATE INDEX idx_analytics_cost ON request_analytics(cost_usd DESC);
CREATE INDEX idx_analytics_success ON request_analytics(success);

-- ============================================
-- Quota Tables
-- ============================================

CREATE TABLE
IF NOT EXISTS user_quotas
(
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC
('day', NOW
()),
    period_end TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC
('day', NOW
() + INTERVAL '1 day'),
    max_requests INTEGER NOT NULL DEFAULT 1000,
    max_tokens INTEGER NOT NULL DEFAULT 100000,
    max_cost_usd DECIMAL
(10, 4) NOT NULL DEFAULT 10.0000,
    used_requests INTEGER NOT NULL DEFAULT 0,
    used_tokens INTEGER NOT NULL DEFAULT 0,
    used_cost_usd DECIMAL
(10, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW
(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW
(),
    PRIMARY KEY
(user_id, project_id, period_start)
);

-- Indexes for quota lookups
CREATE INDEX idx_quotas_user_project ON user_quotas(user_id, project_id);
CREATE INDEX idx_quotas_period ON user_quotas(period_start, period_end);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column
()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW
();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_quotas_updated_at
BEFORE
UPDATE ON user_quotas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column
();

-- Comments
COMMENT ON TABLE request_analytics IS 'Per-request analytics for cost and usage tracking';
COMMENT ON TABLE user_quotas IS 'User/project quotas for rate limiting and cost control';
COMMENT ON COLUMN request_analytics.cost_usd IS 'Cost in USD for this request';
COMMENT ON COLUMN user_quotas.max_cost_usd IS 'Maximum allowed cost per period';
