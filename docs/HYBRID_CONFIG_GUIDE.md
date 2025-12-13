# Quick Start Guide - Hybrid Configuration

## Overview

AI MCP Gateway now uses a **hybrid configuration approach**:
- **Bootstrap config** (`.env.bootstrap`): Database connection + encryption key only
- **Business config** (Database): Provider keys, models, layers, features

This provides the best of both worlds:
- Simple bootstrap without complex initial setup
- Dynamic configuration via web UI
- Secure storage with encryption for sensitive data

## First-Time Setup

### Option 1: Interactive Setup (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway

# 2. Install dependencies
npm install

# 3. Start PostgreSQL and Redis
docker-compose up -d postgres redis

# 4. Run interactive setup
npm run setup:config
```

The setup wizard will:
- Prompt for database credentials
- Generate encryption key automatically
- Run all migrations
- Ask for provider API keys (optional - can add later via UI)
- Create `.env.bootstrap` file

### Option 2: Manual Setup

```bash
# 1. Create .env.bootstrap file
cat > .env.bootstrap << EOF
# Database Connection (required for startup)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_SSL=false

# Encryption Key (required for decrypting config from DB)
CONFIG_ENCRYPTION_KEY=$(openssl rand -base64 32 | cut -c1-32)
EOF

# 2. Run migrations
npm run db:migrate

# 3. Build and start
npm run build
npm start
```

## Configuration Management

### Via Web UI (Recommended)

```bash
# Start server
npm start

# Access admin dashboard
open http://localhost:3000/admin
```

Navigate to **Settings** to configure:
- **Providers**: Add/update API keys for OpenRouter, OpenAI, Anthropic
- **Layers**: Configure L0-L3 model priorities
- **Tasks**: Set preferred models for chat, code, analyze
- **Features**: Toggle feature flags

### Via API

```bash
# Add OpenRouter API key
curl -X POST http://localhost:3000/v1/config/providers/openrouter \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-or-v1-...",
    "endpoint": "https://openrouter.ai/api/v1",
    "configuration": {
      "fallback_models": ["meta-llama/llama-3.3-70b-instruct:free"]
    }
  }'

# Update layer configuration
curl -X PUT http://localhost:3000/v1/config/layers/L1 \
  -H "Content-Type: application/json" \
  -d '{
    "models": ["google/gemini-flash-1.5", "openai/gpt-4o-mini"],
    "priority": 1,
    "enabled": true
  }'

# Enable feature flag
curl -X PUT http://localhost:3000/v1/config/features/ENABLE_ORCHESTRATOR \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Get all system config
curl http://localhost:3000/v1/config/system

# Get all providers
curl http://localhost:3000/v1/config/providers

# Get all layers
curl http://localhost:3000/v1/config/layers

# Get all tasks
curl http://localhost:3000/v1/config/tasks

# Get all feature flags
curl http://localhost:3000/v1/config/features
```

## Docker Deployment

### docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_mcp_gateway
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  gateway:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    environment:
      # Bootstrap config only
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ai_mcp_gateway
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD:-changeme}
      CONFIG_ENCRYPTION_KEY: ${ENCRYPTION_KEY}

volumes:
  pgdata:
```

### First Run

```bash
# 1. Generate encryption key
export ENCRYPTION_KEY=$(openssl rand -base64 32 | cut -c1-32)
export DB_PASSWORD=your_secure_password

# 2. Start services
docker-compose up -d

# 3. Run setup (interactive)
docker-compose exec gateway npm run setup:config

# Or run migrations manually
docker-compose exec gateway npm run db:migrate

# 4. Access UI to configure providers
open http://localhost:3000/admin
```

## Configuration Reference

### .env.bootstrap (Minimal - Required for Startup)

```ini
# Database connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=your_password

# Encryption key (32 characters)
CONFIG_ENCRYPTION_KEY=your-32-character-key-here!!
```

**That's it!** All other configuration is in the database.

### Database Tables

- `system_config`: Server, API, Redis, logging settings
- `provider_credentials`: API keys (AES-256 encrypted)
- `layer_config`: L0-L3 model configurations
- `task_config`: Task-specific model preferences
- `feature_flags`: Feature toggles

## Migration from Old .env

If you have an existing `.env` file:

```bash
# 1. Run setup
npm run setup:config

# 2. When prompted for provider keys, paste from your .env:
#    - OPENROUTER_API_KEY
#    - OPENAI_API_KEY
#    - ANTHROPIC_API_KEY

# 3. After setup, you can delete .env (keep .env.bootstrap)
rm .env
```

Your old `.env` variables will be automatically migrated to the database.

## Security

### Encryption

- Provider API keys stored with AES-256-CBC encryption
- Encryption key stored in `.env.bootstrap` (should be in secrets manager for production)
- Each encrypted value has unique IV (Initialization Vector)

### Best Practices

**Development:**
```bash
# Keep .env.bootstrap in .gitignore (already configured)
# Store encryption key in password manager
```

**Production:**
```bash
# Use Kubernetes secrets
kubectl create secret generic mcp-config \
  --from-literal=DB_PASSWORD=... \
  --from-literal=CONFIG_ENCRYPTION_KEY=...

# Or use HashiCorp Vault, AWS Secrets Manager, etc.
```

## Troubleshooting

### "Bootstrap configuration not found"

```bash
# Solution: Run setup
npm run setup:config
```

### "Database connection failed"

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check credentials in .env.bootstrap
cat .env.bootstrap

# Test connection manually
psql -h localhost -U postgres -d ai_mcp_gateway
```

### "Failed to decrypt API key"

```bash
# Encryption key changed - re-enter API keys via UI
# Or clear encrypted data and re-setup:
npm run db:migrate -- --rollback 009
npm run db:migrate
npm run setup:config
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/config/system` | GET | Get all system config |
| `/v1/config/system/:key` | PUT | Update system config |
| `/v1/config/providers` | GET | List all providers |
| `/v1/config/providers/:provider` | GET | Get provider details |
| `/v1/config/providers/:provider` | POST | Add/update provider |
| `/v1/config/providers/:provider` | DELETE | Disable provider |
| `/v1/config/layers` | GET | List all layers |
| `/v1/config/layers/:layer` | GET | Get layer config |
| `/v1/config/layers/:layer` | PUT | Update layer config |
| `/v1/config/tasks` | GET | List all tasks |
| `/v1/config/tasks/:task` | GET | Get task config |
| `/v1/config/tasks/:task` | PUT | Update task config |
| `/v1/config/features` | GET | List all feature flags |
| `/v1/config/features/:flag` | PUT | Update feature flag |
| `/v1/config/cache/clear` | POST | Clear config cache |

## What's in the Database vs .env.bootstrap?

| Configuration | Location | Reason |
|--------------|----------|--------|
| DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD | `.env.bootstrap` | Needed before DB connection |
| CONFIG_ENCRYPTION_KEY | `.env.bootstrap` | Needed to decrypt DB values |
| Provider API keys | Database (encrypted) | Dynamic, managed via UI |
| Model layers | Database | Dynamic, managed via UI |
| Task preferences | Database | Dynamic, managed via UI |
| Feature flags | Database | Dynamic, managed via UI |
| Server settings | Database (with fallbacks) | Can be changed without restart |

## Support

For issues or questions:
- Check logs: `logs/mcp-gateway.log`
- API health: `curl http://localhost:3000/health`
- Database status: `npm run db:status`
