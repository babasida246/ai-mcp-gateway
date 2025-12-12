-- GPT Plus Sessions Table
-- Stores encrypted session data for ChatGPT Plus integration

CREATE TABLE
IF NOT EXISTS gpt_plus_sessions
(
    id VARCHAR
(255) PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    session_token TEXT,
    user_email VARCHAR
(255) NOT NULL,
    is_premium BOOLEAN DEFAULT true,
    expires_at TIMESTAMP
WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP
WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX
IF NOT EXISTS idx_gpt_plus_sessions_email ON gpt_plus_sessions
(user_email);
CREATE INDEX
IF NOT EXISTS idx_gpt_plus_sessions_expires ON gpt_plus_sessions
(expires_at);

-- Add GPT Plus as a provider type (if not using enum, this is just documentation)
COMMENT ON TABLE gpt_plus_sessions IS 'Stores ChatGPT Plus session tokens for browser-based authentication';
