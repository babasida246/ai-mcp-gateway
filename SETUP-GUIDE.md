# 🚀 AI MCP Gateway - Complete Setup Guide

## ✅ All Phases Completed!

This guide covers the complete deployment of AI MCP Gateway with all 6 phases implemented.

## 📋 What's Included

### Phase 1-3: Core Infrastructure
- ✅ Request tracing with multi-tenant support
- ✅ Analytics & quotas
- ✅ Security & RBAC
- ✅ Policy-based routing with 4 default policies

### Phase 4: Semantic Search
- ✅ pgvector integration for code embeddings
- ✅ Semantic code search API
- ✅ Knowledge packs for reusable context

### Phase 5: CLI Enhancements
- ✅ Interactive patch application with backup/rollback
- ✅ Command history tracking
- ✅ System health diagnostics (doctor command)
- ✅ Git hooks templates (pre-commit, post-commit, etc.)

### Phase 6: Web Dashboard
- ✅ React + TypeScript admin dashboard
- ✅ Real-time metrics (requests, cost, tokens, latency)
- ✅ System health monitoring
- ✅ Provider & layer status
- ✅ Token management
- ✅ Docker logs viewer
- ✅ Settings management

## 🐳 Docker Deployment

### Method 1: Automated Script (Recommended)

**Windows:**
```batch
docker-start.bat
```

**Linux/Mac:**
```bash
chmod +x docker-start.sh
./docker-start.sh
```

### Method 2: Manual Setup

1. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your API keys
```

2. **Build and Start**
```bash
docker-compose build
docker-compose up -d
```

3. **Run Migrations**
```bash
docker-compose exec ai-mcp-gateway npm run db:migrate
```

4. **Check Status**
```bash
docker-compose ps
```

## 🌐 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **Admin Dashboard** | http://localhost:5173 | Web UI for management |
| **API Gateway** | http://localhost:3000 | Main API server |
| **Health Check** | http://localhost:3000/health | System health status |
| **Server Stats** | http://localhost:3000/v1/server-stats | Real-time metrics |

## 📊 Admin Dashboard Features

### 1. Dashboard (Home)
- Real-time metrics cards
  - Total requests processed
  - Total cost (USD)
  - Total tokens used
  - Average latency
- System status indicators
- Layer status (L0-L3)
- Healthy providers list
- Database & Redis connection status

### 2. Gateway Tokens
- Create new API tokens
- View all tokens with last used timestamp
- Copy tokens to clipboard
- Show/hide token values
- Delete tokens with confirmation

### 3. Docker Logs
- Real-time log streaming from all containers
- Filter by service
- Search logs
- Auto-scroll to bottom
- Download logs

### 4. Providers
- View all LLM providers
- Health status indicators
- Model availability
- Add/remove providers
- Test provider connections

### 5. Models
- View all configured models by layer
- Model pricing information
- Enable/disable models
- Test model responses
- Performance metrics

### 6. Settings
- Environment configuration
- Layer control (enable/disable L0-L3)
- Cost tracking settings
- Auto-escalation settings
- Cross-check configuration
- API keys management

## 🔧 Configuration

### Environment Variables (.env)

```env
# PostgreSQL
POSTGRES_DB=ai_mcp_gateway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password_here

# Redis
REDIS_PASSWORD=

# API Keys (REQUIRED)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Layer Configuration
LAYER_L0_ENABLED=true
LAYER_L1_ENABLED=true
LAYER_L2_ENABLED=true
LAYER_L3_ENABLED=true

# Features
ENABLE_COST_TRACKING=true
ENABLE_CROSS_CHECK=true
ENABLE_AUTO_ESCALATE=true
COST_ALERT_THRESHOLD=10.00

# OpenRouter Fallback
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet

# OSS/Local Models (Optional)
OSS_MODEL_ENABLED=false
OSS_MODEL_ENDPOINT=http://ollama:11434
OSS_MODEL_NAME=llama3:8b
```

## 📡 API Endpoints

### Core Endpoints
```
GET  /health                           - Health check
GET  /v1/server-stats                  - Server statistics
POST /v1/route                         - Intelligent routing
POST /v1/chat                          - Chat completion
POST /v1/code-agent                    - Code agent tasks
```

### Context Management
```
GET  /v1/context/:conversationId       - Get conversation context
POST /v1/context/:conversationId       - Update context
```

### Analytics (Phase 1)
```
GET  /v1/analytics                     - Analytics dashboard data
GET  /v1/analytics/top-expensive       - Top expensive requests
GET  /v1/analytics/error-rate          - Error rate by model/layer
```

### Quota Management (Phase 1)
```
GET  /v1/quota/status                  - Get quota status
POST /v1/quota/update                  - Update quota limits
```

### Tracing (Phase 1)
```
GET  /v1/traces/:traceId               - Get trace details
```

### Semantic Search (Phase 4)
```
POST /v1/search/code                   - Search code semantically
POST /v1/search/index                  - Index code files
GET  /v1/search/stats                  - Search statistics
```

### Knowledge Packs (Phase 4)
```
POST /v1/knowledge/pack                - Create knowledge pack
GET  /v1/knowledge/pack/:packId        - Load knowledge pack
GET  /v1/knowledge/search?tags=        - Search packs by tags
```

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Run Integration Tests
```bash
npm run test:integration
```

### Test Coverage
```bash
npm run test:coverage
```

## 📝 Usage Examples

### 1. Chat Request
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Explain AI routing"}
    ],
    "userId": "user123",
    "projectId": "project456"
  }'
```

### 2. Code Agent (Refactor Mode)
```bash
curl -X POST http://localhost:3000/v1/code-agent \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "refactor",
    "code": "function test() { return 1 + 1; }",
    "language": "typescript"
  }'
```

### 3. Semantic Code Search
```bash
curl -X POST http://localhost:3000/v1/search/code \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication function",
    "limit": 5,
    "filters": {
      "language": "typescript"
    }
  }'
```

### 4. Create Knowledge Pack
```bash
curl -X POST http://localhost:3000/v1/knowledge/pack \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auth System",
    "description": "Authentication and authorization code",
    "files": ["src/auth.ts", "src/middleware/auth.ts"],
    "tags": ["auth", "security"]
  }'
```

## 🛠️ Development

### Local Development (Without Docker)

1. **Install Dependencies**
```bash
npm install
cd admin-dashboard && npm install
```

2. **Setup Database**
```bash
# Start PostgreSQL and Redis locally
# Then run migrations
npm run db:migrate
```

3. **Start API Server**
```bash
npm run dev
```

4. **Start Admin Dashboard**
```bash
cd admin-dashboard
npm run dev
```

### Build for Production
```bash
npm run build
cd admin-dashboard && npm run build
```

## 🔍 Monitoring & Debugging

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ai-mcp-gateway
docker-compose logs -f admin-dashboard
```

### Database Access
```bash
docker-compose exec postgres psql -U postgres -d ai_mcp_gateway
```

### Redis CLI
```bash
docker-compose exec redis redis-cli
```

### Container Stats
```bash
docker stats
```

## 🚨 Troubleshooting

### Dashboard Shows "Connection Error"
1. Check API is running: `docker-compose ps ai-mcp-gateway`
2. Test health endpoint: `curl http://localhost:3000/health`
3. Check API logs: `docker-compose logs ai-mcp-gateway`

### Database Connection Failed
```bash
# Check PostgreSQL
docker-compose ps postgres

# Restart database
docker-compose restart postgres

# Re-run migrations
docker-compose exec ai-mcp-gateway npm run db:migrate
```

### Out of Memory
```bash
# Increase Docker memory limit in Docker Desktop
# Settings > Resources > Memory > 4GB+
```

### Port Already in Use
```bash
# Change ports in docker-compose.yml
# Or stop conflicting services
```

## 📚 Documentation

- [Architecture](ARCHITECTURE.md) - System architecture
- [Docker Guide](DOCKER.md) - Detailed Docker guide
- [Testing Guide](TESTING.md) - Testing documentation
- [Phase 2-6 Summary](PHASE2-6-SUMMARY.md) - Implementation details
- [API Documentation](README.md) - API reference

## 🎯 Next Steps

1. ✅ Set API keys in `.env`
2. ✅ Start services: `docker-compose up -d`
3. ✅ Run migrations: `docker-compose exec ai-mcp-gateway npm run db:migrate`
4. ✅ Access dashboard: http://localhost:5173
5. ✅ Test API: http://localhost:3000/health
6. ✅ Create gateway tokens in dashboard
7. ✅ Start making requests!

## 🏆 Production Checklist

- [ ] Set strong PostgreSQL password
- [ ] Configure HTTPS/SSL
- [ ] Set up backup schedule
- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation
- [ ] Configure rate limiting
- [ ] Set up CI/CD pipeline
- [ ] Configure secrets management
- [ ] Set up staging environment
- [ ] Perform load testing

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/yourusername/ai-mcp-gateway/issues)
- Discord: [Join community](https://discord.gg/...)
- Email: support@example.com

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

**Built with ❤️ using TypeScript, Node.js, React, PostgreSQL, Redis, and Docker**
