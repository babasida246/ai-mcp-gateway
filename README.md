# AI MCP Gateway

Model Context Protocol (MCP) server and AI gateway that orchestrates multiple models with layered routing, database-driven configuration, and an admin dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **HTTP API Gateway** - Express server with N-layer, priority-based routing
- **Database-driven Configuration** - All settings stored in PostgreSQL
- **Admin Dashboard** - React-based web UI for monitoring and management
- **Settings UI** - Complete interface for system, providers, layers, tasks, and features
- **MCP Server Mode** - Standalone MCP server for Claude Desktop, VS Code

See [`docs/FEATURE_SUMMARY.md`](docs/FEATURE_SUMMARY.md) for complete feature list.

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose
- At least one LLM provider API key (OpenRouter recommended)

### 1. Clone & Configure

```powershell
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway
copy .env.docker.example .env.docker
```

### 2. Edit `.env.docker`

Add your API keys:
```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
# Optional: OPENAI_API_KEY, ANTHROPIC_API_KEY
```

### 3. Start Services

```powershell
docker-compose up -d
```

### 4. Access Services

- **API Gateway**: http://localhost:3000
- **Admin Dashboard**: http://localhost:5173
- **Settings UI**: http://localhost:5173/settings
- **Health Check**: http://localhost:3000/health

### Running Services

```
✅ mcp-gateway       - Main API server (port 3000)
✅ ai-mcp-dashboard  - Web UI (port 5173)
✅ ai-mcp-postgres   - PostgreSQL database (port 5432)
✅ ai-mcp-redis      - Redis cache (port 6379)
```

---

## ⚙️ Configuration

All configuration managed through **Settings UI** at http://localhost:5173/settings

### Settings Tabs

#### 1. System Config
- API settings (port, host, CORS)
- Logging configuration
- Cost tracking thresholds
- Default layer, auto-escalation

#### 2. Provider Credentials
- Manage API keys (OpenRouter, OpenAI, Anthropic)
- Enable/disable providers
- Configure API endpoints
- **Encrypted storage** in PostgreSQL

#### 3. Layer Configuration
- **L0** (Free) - Free models (Llama, Grok)
- **L1** (Cheap) - Affordable models (GPT-4o-mini, Gemini)
- **L2** (Balanced) - Claude Haiku, GPT-4o
- **L3** (Premium) - Claude Sonnet, o1-preview
- Enable/disable layers, set priorities

#### 4. Task Configuration
- **Chat** - Conversational models
- **Code** - Code generation (Qwen Coder, DeepSeek)
- **Analyze** - Code review models
- **Create Project** - Scaffolding models
- Set preferred & fallback models per task

#### 5. Feature Flags
- Auto-escalate between layers
- Cross-check responses
- Cost tracking
- Advanced routing features

**All changes saved to PostgreSQL** - No restart required!

---

## 🏗️ Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Setup

```powershell
npm install
copy .env.example .env
```

### Edit `.env`

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=postgres
CONFIG_ENCRYPTION_KEY=your-32-character-encryption-key-here

# Provider API Keys (at least one)
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API Server
API_PORT=3000
API_HOST=0.0.0.0
```

### Build & Run

```powershell
npm run build
npm run start:api     # Start API server
# or
npm run start:mcp     # Start MCP server
```

---

## 🎯 Architecture

### N-Layer Routing

Requests automatically route through layers based on cost/capability:

```
L0 (Free)     → meta-llama/llama-3.3-70b-instruct:free, x-ai/grok-4.1-fast:free
L1 (Cheap)    → google/gemini-flash-1.5, openai/gpt-4o-mini  
L2 (Balanced) → anthropic/claude-3-haiku, openai/gpt-4o
L3 (Premium)  → anthropic/claude-3.5-sonnet, openai/o1-preview
```

**Auto-escalation**: Failed requests automatically try next layer.

### Task-Specific Routing

Different tasks use optimized models:

- **Chat**: Conversational models
- **Code**: Code-specialized models (Qwen Coder, DeepSeek)
- **Analyze**: Analysis-focused models
- **Create Project**: Scaffolding models

### Database Schema

All configuration in PostgreSQL:

```
system_config         - System settings (key-value pairs)
provider_credentials  - API keys (AES-256 encrypted)
layer_config          - Layer assignments & priorities
task_config           - Task routing rules
feature_flags         - Feature toggles
```

---

## 📊 Admin Dashboard

Access at **http://localhost:5173**

### Pages

- **Dashboard** - Real-time metrics, request volume, costs
- **Settings** - Complete configuration management (5 tabs)
- **Monitoring** - Request logs, performance analytics
- **Providers** - Provider status, rate limits

### Settings UI Features

- ✅ Live configuration editing
- ✅ Encrypted credential storage
- ✅ Input validation
- ✅ Instant save to database
- ✅ No service restart required
- ✅ Responsive design

---

## 🔧 API Endpoints

### Health & Status
```bash
GET  /health              # Health check
GET  /v1/status          # Gateway status  
GET  /v1/server-stats    # Server statistics
```

### Configuration API
```bash
# System Config
GET    /v1/config/system
PUT    /v1/config/system

# Providers
GET    /v1/config/providers
POST   /v1/config/providers
PUT    /v1/config/providers/:id
DELETE /v1/config/providers/:id

# Layers
GET    /v1/config/layers
PUT    /v1/config/layers/:id

# Tasks
GET    /v1/config/tasks
PUT    /v1/config/tasks/:id

# Features
GET    /v1/config/features
PUT    /v1/config/features/:id
```

### Chat & Generation
```bash
POST /v1/chat/completions    # OpenAI-compatible chat
POST /v1/generate            # Text generation
POST /v1/mcp-cli             # MCP CLI commands
```

---

## 📖 Documentation

### Setup & Deployment
- [`docs/DEPLOYMENT_QUICK_START.md`](docs/DEPLOYMENT_QUICK_START.md) - Complete deployment guide
- [`docs/DOCKER-DEPLOYMENT.md`](docs/DOCKER-DEPLOYMENT.md) - Docker setup details

### Features & Usage
- [`docs/FEATURE_SUMMARY.md`](docs/FEATURE_SUMMARY.md) - All features explained
- [`docs/SETTINGS_UI.md`](docs/SETTINGS_UI.md) - Settings UI documentation
- [`docs/API-GUIDE.md`](docs/API-GUIDE.md) - API reference

### Technical Details
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System architecture
- [`docs/HYBRID_CONFIG_GUIDE.md`](docs/HYBRID_CONFIG_GUIDE.md) - Configuration system

---

## 🔐 Security

### Encryption
- Provider API keys encrypted with AES-256-CBC
- Encryption key from `CONFIG_ENCRYPTION_KEY` environment variable
- 32-character key required

### Best Practices
- Never commit `.env` or `.env.docker` to git
- Use `.env.example` as template only
- Rotate encryption keys periodically
- Use environment variables in production

---

## 🚢 Deployment

### Docker Production

```powershell
# 1. Configure production environment
copy .env.docker.example .env.docker
# Edit with production API keys

# 2. Start services
docker-compose up -d

# 3. Verify health
curl http://localhost:3000/health
```

### Environment Variables (Docker)

Required in `docker-compose.yml`:
```yaml
environment:
  DB_HOST: postgres
  DB_PORT: 5432
  DB_NAME: ai_mcp_gateway
  DB_USER: postgres
  DB_PASSWORD: postgres
  CONFIG_ENCRYPTION_KEY: your-key-here
  OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
```

---

## 🛠️ Development

### Project Structure

```
ai-mcp-gateway/
├── src/
│   ├── api/           # Express API server
│   ├── db/            # Database & bootstrap
│   ├── services/      # Business logic
│   ├── config/        # Configuration service
│   └── index.ts       # Main entry point
├── admin-dashboard/   # React admin UI
│   ├── src/
│   │   ├── pages/     # Settings.tsx, etc.
│   │   └── components/
│   └── Dockerfile
├── docker-compose.yml # Container orchestration
├── migrations/        # Database migrations
└── docs/              # Documentation
```

### Build Commands

```powershell
npm run build         # Build TypeScript
npm run dev           # Development mode
npm run start:api     # Start API server
npm run start:mcp     # Start MCP server
```

### Database Migrations

Migrations run automatically on first startup. Manual execution:

```powershell
# Local
npm run db:migrate

# Docker
docker-compose exec mcp-gateway npm run db:migrate
```

### Dev container (avoid rebuilding on code changes)

If you want to run the API in a container during development and avoid rebuilding the image every time you change code, use the provided `docker-compose.dev.yml`. It builds a small image that installs dependencies once and mounts the project directory into the container so code edits are visible immediately.

Example (PowerShell):

```powershell
# build the dev image (installs deps once)
docker compose -f docker-compose.dev.yml build
# run the dev container with source mounted
docker compose -f docker-compose.dev.yml up

# Now edit files locally — the container runs `npm run dev` so changes are picked up.
```

Notes:
- The dev compose uses a `dev` build target that caches dependencies. You only need to rebuild the image if you change `package.json` or native dependencies.
- The container preserves the image's `node_modules` via an anonymous volume to avoid host/permission issues on Windows.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details

---

## 🆘 Troubleshooting

### Container Won't Start

**Check logs:**
```powershell
docker-compose logs mcp-gateway
```

**Common issues:**
- Missing `CONFIG_ENCRYPTION_KEY` in docker-compose.yml
- Database not ready - wait for `postgres` healthy status
- Port conflicts - check if 3000, 5173, 5432, 6379 are available

### Database Connection Failed

**Verify environment:**
```powershell
docker-compose exec mcp-gateway printenv | Select-String "DB_"
```

**Should show:**
```
DB_HOST=postgres
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=postgres
```

### Settings Not Saving

**Check ConfigService initialization:**
```powershell
docker-compose logs mcp-gateway | Select-String "Configuration service"
```

**Should see:**
```
Configuration service initialized from database
```

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/babasida246/ai-mcp-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/babasida246/ai-mcp-gateway/discussions)
- **Documentation**: [docs/](docs/)

---

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io/) - Anthropic's MCP specification
- [Express](https://expressjs.com/) - Web framework
- [React](https://react.dev/) - UI library
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Made with ❤️ by the AI MCP Gateway team**
