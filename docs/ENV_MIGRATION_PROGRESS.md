# Full .env Migration Progress

## ✅ Completed (Foundation)

### 1. Database Schema
- ✅ Created `migrations/009_system_configuration.sql`
  - `system_config` table: General configuration (non-sensitive)
  - `provider_credentials` table: API keys (AES-256 encrypted)
  - `layer_config` table: Model layer settings (L0-L3)
  - `task_config` table: Task-specific models (chat, code, analyze, etc.)
  - `feature_flags` table: Feature toggles
  - Default data populated for all tables

### 2. Bootstrap Infrastructure
- ✅ Created `src/db/bootstrap.ts`
  - Minimal DB connection using `.env.bootstrap` file only
  - Loads encryption key from bootstrap config
  - Independent of ConfigService (chicken-egg problem solved)

- ✅ Created `scripts/bootstrap-config.ts`
  - Interactive CLI setup tool
  - Prompts for DB credentials, encryption key, provider keys
  - Runs migrations automatically
  - Creates `.env.bootstrap` with minimal config
  - Usage: `npm run setup:config`

### 3. ConfigService
- ✅ Updated `src/services/config/index.ts`
  - Uses `bootstrapDB` instead of `process.env`
  - AES-256 encryption for sensitive values
  - In-memory caching with TTL
  - Methods: get(), set(), getProvider(), getLayer(), getTask(), getFeatureFlag()

- ✅ Created `src/services/config/helpers.ts`
  - Convenient wrappers: getConfig(), getConfigNumber(), getConfigBoolean()
  - Domain-specific: getProviderKey(), getLayerModels(), getTaskModels()
  - isFeatureEnabled() for feature flags

### 4. Package Updates
- ✅ Added `setup:config` script to package.json
- ✅ dotenv already available in dependencies

## 🚧 TODO: Critical Path

### 5. Refactor All process.env Usage (БОЛЬШАЯ РАБОТА!)

**Files to update (27+):**

```typescript
// PRIORITY 1: Core initialization
src/index.ts
  - Initialize configService before starting servers
  - Replace MODE, MCP_TRANSPORT, API_PORT with configService.get()
  
src/db/postgres.ts
  - Remove env.ts dependency
  - Use bootstrapDB for connection
  
src/config/env.ts
  - DELETE THIS FILE (no longer needed)

// PRIORITY 2: Services  
src/services/chat/integration.ts
  - ENABLE_ORCHESTRATOR → configService.getFeatureFlag('ENABLE_ORCHESTRATOR')
  - ORCHESTRATOR_STRATEGY → configService.get('ORCHESTRATOR_STRATEGY')

src/services/llm/*.ts
  - Provider API keys → configService.getProvider('openrouter').api_key
  - Model configs → configService.getLayer(), getTask()

// PRIORITY 3: API & Tools
src/api/*.ts
  - Redis config → configService.getByCategory('redis')
  - API settings → configService.getByCategory('api')

src/tools/**.ts
  - Various env vars → configService.get()

// PRIORITY 4: CLI
cli/src/*.ts
  - MCP_ENDPOINT, MCP_API_KEY → configService

src/db/terminal-connections.ts
  - TERMINAL_ENCRYPTION_KEY → Use shared encryption key
```

**Migration Pattern:**

```typescript
// BEFORE
const apiPort = process.env.API_PORT || 3000;

// AFTER
const apiPort = await getConfigNumber('API_PORT', 3000);

// For providers
const openrouterKey = process.env.OPENROUTER_API_KEY;
// becomes
const openrouterKey = await getProviderKey('openrouter');
```

### 6. Update Startup Flow

**src/index.ts changes needed:**

```typescript
import { bootstrapDB } from './db/bootstrap.js';
import { configService } from './services/config/index.js';

async function main() {
    try {
        // 1. Initialize bootstrap DB connection
        console.log('Initializing database connection...');
        await bootstrapDB.initialize();
        
        // 2. Initialize ConfigService
        console.log('Loading configuration from database...');
        await configService.initialize();
        
        // 3. Get runtime mode from config
        const mode = await configService.get('MODE', 'api');
        
        // 4. Start appropriate server
        if (mode === 'api') {
            await startAPIServer();
        } else {
            await startMCPServer();
        }
        
    } catch (error) {
        if (error.message.includes('Bootstrap configuration not found')) {
            console.error('\n❌ No configuration found!');
            console.error('Run setup: npm run setup:config\n');
        } else {
            console.error('Startup failed:', error);
        }
        process.exit(1);
    }
}
```

### 7. Admin Dashboard Settings UI

**Create: `admin-dashboard/src/pages/Settings.tsx`**

Tabs:
- **System**: Server, API, Logging, Redis configs
- **Providers**: Add/edit API keys for OpenRouter, OpenAI, Anthropic
- **Layers**: Configure L0-L3 model priorities
- **Tasks**: Set preferred models for chat, code, analyze
- **Features**: Toggle feature flags

**API endpoints needed:**

```typescript
// GET /api/v1/config/system
// GET /api/v1/config/providers
// POST /api/v1/config/providers/:provider
// GET /api/v1/config/layers
// PUT /api/v1/config/layers/:layer
// GET /api/v1/config/tasks
// GET /api/v1/config/features
// PUT /api/v1/config/features/:flag
```

### 8. Merge Admin Dashboard

**Goal:** Single monorepo, shared dependencies

```bash
# Move admin-dashboard source into main repo
mv admin-dashboard/src src/admin-ui
mv admin-dashboard/public public/admin

# Update package.json
- Add admin-dashboard dependencies to main package.json
- Add build scripts: "build:admin": "vite build src/admin-ui"

# Update Dockerfile
- Build both backend AND frontend
- Serve admin UI from Express static route

# Update docker-compose.yml
- Remove separate admin-dashboard service
- Single container serves API + Admin UI
```

### 9. Update Docker

**Dockerfile changes:**

```dockerfile
# Build stage - backend
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Build stage - frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/admin-ui ./src/admin-ui
COPY public ./public
RUN npm run build:admin

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/dist-admin ./public/admin
COPY package*.json ./
RUN npm ci --only=production

# No .env needed! Config in DB
EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml:**

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
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  gateway:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    # ONLY minimal bootstrap config via environment
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ai_mcp_gateway
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD:-changeme}
      CONFIG_ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    # First run: docker-compose run gateway npm run setup:config
    # Then: docker-compose up -d

volumes:
  pgdata:
```

### 10. Update Documentation

**docs/CONFIGURATION_GUIDE.md:**

```markdown
# Configuration Guide

## First-Time Setup

1. Start database:
   docker-compose up -d postgres redis

2. Run configuration setup:
   npm run setup:config
   
   This will:
   - Prompt for database credentials
   - Generate encryption key
   - Run migrations
   - Create .env.bootstrap file
   - Store all config in database

3. Start server:
   npm run build
   npm start

4. Access admin UI:
   http://localhost:3000/admin
   
5. Configure providers and settings via web interface

## Configuration Storage

- **Bootstrap only**: .env.bootstrap (DB connection + encryption key)
- **All other config**: Stored in database, managed via web UI
- **Sensitive data**: AES-256 encrypted in database

## Changing Configuration

Use web UI at /admin/settings or API:

curl -X POST http://localhost:3000/api/v1/config/providers/openrouter \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sk-or-v1-...", "enabled": true}'
```

## 📊 Estimated Effort

| Task | Status | Effort | Risk |
|------|--------|--------|------|
| Bootstrap infrastructure | ✅ Done | 2h | Low |
| Refactor process.env (27+ files) | 🚧 TODO | 4-6h | High |
| Update index.ts startup | 🚧 TODO | 1h | Medium |
| Settings UI | 🚧 TODO | 3-4h | Low |
| Merge admin-dashboard | 🚧 TODO | 2-3h | Medium |
| Update Docker | 🚧 TODO | 1h | Low |
| Testing | 🚧 TODO | 2-3h | High |
| **TOTAL** | | **15-20h** | |

## 🎯 Next Steps

Choose one:

**Option 1: I Continue (Recommended)**
- I'll systematically refactor all 27+ files
- Update startup flow
- Create Settings UI
- Merge admin-dashboard
- Full testing
- **ETA: 3-4 hours of focused work**

**Option 2: You Take Over**
- Use this doc as roadmap
- Start with critical path (index.ts, services)
- Foundation is ready (migrations, ConfigService, bootstrap)

**Option 3: Hybrid**
- I do critical refactoring (process.env → ConfigService)
- You handle UI and Docker merge
- Collaborate on testing

What would you like me to do?
