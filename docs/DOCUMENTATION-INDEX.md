# Documentation Index

Complete guide to AI MCP Gateway documentation.

## 📚 Core Documentation

### [README.md](../README.md) ⭐ START HERE
**Main project documentation**
- Quick start (Docker & Local)
- Feature highlights  
- CLI tool overview
- HTTP API endpoints
- Configuration guide
- Model layers explanation

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**System architecture and design**
- Stateless design principles
- Two-tier caching (Redis + PostgreSQL)
- Database schema
- Component interactions
- Request flow diagrams

## 🚀 Getting Started

### [DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md) 🐳 RECOMMENDED
**Quick Docker deployment** (5 minutes)
- One-command setup
- Docker Compose configuration
- Environment variable setup
- Health checks and verification

### [DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)
**Advanced Docker deployment**
- Production deployment strategies
- Multi-container orchestration
- Scaling and monitoring
- Backup/restore procedures
- Troubleshooting guide

### [QUICK-REFERENCE.md](./QUICK-REFERENCE.md)
**Command cheat sheet**
- Common Docker commands
- API endpoint quick reference
- Environment variables
- CLI commands
- Troubleshooting quick tips

## 🔌 API & Integration

### [API-GUIDE.md](./API-GUIDE.md)
**Complete HTTP API reference**
- All endpoints with examples
- Request/response formats
- Authentication
- Error handling
- Rate limiting

### CLI Documentation
- **[cli/README.md](../cli/README.md)** - Full CLI reference
- **[cli/QUICKSTART.md](../cli/QUICKSTART.md)** - CLI quick start
- **[cli/USAGE.md](../cli/USAGE.md)** - Usage examples

## 🔧 Features & Guides

### [ESCALATION-CONFIRMATION.md](./ESCALATION-CONFIRMATION.md) 🆕
**Escalation confirmation with optimized prompt**
- How escalation confirmation works
- Viewing optimized prompts before escalation
- Configuration guide
- Implementation details
- Cost control with user confirmation

### [SERVER-STATS-GUIDE.md](./SERVER-STATS-GUIDE.md)
**Server monitoring & statistics**
- `/health` endpoint configuration
- `/v1/server-stats` real-time metrics
- Cost tracking
- Performance monitoring
- Alert configuration

### [PROVIDER-FALLBACK-GUIDE.md](./PROVIDER-FALLBACK-GUIDE.md)
**Provider health & fallback system**
- Automatic provider fallback
- Health monitoring
- Fallback configuration
- OpenRouter free model fallback
- Troubleshooting provider issues

### [TESTING.md](./TESTING.md)
**Comprehensive testing guide**
- Unit tests
- Integration tests
- E2E tests with Playwright
- Writing new tests
- CI/CD integration

## 🎯 New Features (November 2025)

### Task-Specific Models
Configure dedicated models for different task types:
- **CHAT_MODELS**: General conversation (Llama 3.3, Gemini)
- **CODE_MODELS**: Code generation (Qwen Coder, DeepSeek)
- **ANALYZE_MODELS**: Code analysis (Qwen 2.5, Gemini)
- **CREATE_PROJECT_MODELS**: Project scaffolding (Qwen Coder, DeepSeek)

See [Configuration section in README](../README.md#configuration)

### Budget Tracking (CLI)
CLI project creation now supports:
- Per-project budget limits (USD)
- Maximum layer restrictions (L0-L3)
- Real-time cost tracking
- Automatic stop on budget exceed

Example:
```bash
mcp create-project "Todo app"
# Prompts: Budget? $0.50
#          Max layer? L1
#          Enable tests? yes
```

### Escalation Control
When `ENABLE_AUTO_ESCALATE=false`:
- Manual confirmation required for paid models
- Escalation reason displayed
- User can approve/reject each escalation
- Prevents unexpected costs

See configuration in `.env.docker`:
```bash
ENABLE_AUTO_ESCALATE=false
```

### OpenRouter Fallback
Automatic fallback when L0 has no models:
- Fetches free models from OpenRouter API
- Ranks by context window and capabilities
- Uses top 5 models automatically
- Zero configuration required

See [Provider Fallback Guide](./PROVIDER-FALLBACK-GUIDE.md)

## 📖 Quick Navigation

### I want to...

**Get started quickly**
→ [Docker Quickstart](./DOCKER-QUICKSTART.md)

**Use the CLI tool**
→ [CLI README](../cli/README.md)

**Integrate via HTTP API**
→ [API Guide](./API-GUIDE.md)

**Deploy to production**
→ [Docker Deployment](./DOCKER-DEPLOYMENT.md)

**Monitor costs and performance**
→ [Server Stats Guide](./SERVER-STATS-GUIDE.md)

**Understand the architecture**
→ [Architecture](./ARCHITECTURE.md)

**Configure models and routing**
→ [Configuration in README](../README.md#configuration)

**Write tests**
→ [Testing Guide](./TESTING.md)

**Troubleshoot issues**
→ [Quick Reference](./QUICK-REFERENCE.md)

## 📁 Documentation Structure

```
ai-mcp-gateway/
├── README.md                          # ⭐ Start here
├── docs/
│   ├── DOCUMENTATION-INDEX.md         # This file
│   ├── QUICK-REFERENCE.md             # Cheat sheet
│   │
│   ├── Getting Started/
│   │   ├── DOCKER-QUICKSTART.md      # 🐳 Fastest start
│   │   └── DOCKER-DEPLOYMENT.md      # Production deploy
│   │
│   ├── Architecture/
│   │   └── ARCHITECTURE.md            # System design
│   │
│   ├── Features/
│   │   ├── PROVIDER-FALLBACK-GUIDE.md # Provider fallback
│   │   └── SERVER-STATS-GUIDE.md      # Monitoring
│   │
│   ├── Development/
│   │   ├── TESTING.md                 # Testing guide
│   │   └── API-GUIDE.md               # API reference
│   │
└── cli/
    ├── README.md                      # CLI main docs
    ├── QUICKSTART.md                  # CLI quick start
    └── USAGE.md                       # Usage examples
```

## 📝 Documentation Standards

All documentation follows these principles:
- **Clear**: Plain language, minimal jargon
- **Complete**: All features documented with examples
- **Current**: Updated with each release
- **Concise**: Respect the reader's time

## 🤝 Contributing

Found a documentation issue? Please:
1. Check existing docs first
2. Open an issue describing the problem
3. Submit a PR with improvements

See contribution guidelines in main README.

---

**Last Updated**: November 30, 2025  
**Version**: 0.2.0
