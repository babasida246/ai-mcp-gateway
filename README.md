# AI MCP Gateway

**Intelligent Multi-Model Orchestrator with Cost Optimization & Admin Dashboard**

A production-ready Model Context Protocol (MCP) server and HTTP API Gateway that orchestrates multiple AI models with intelligent N-layer routing, budget tracking, priority-based model selection, and a comprehensive admin dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ Features

### 🎯 Intelligent Model Routing
- **N-Layer Architecture**: Route requests to L0 (free) → L3 (premium) based on task complexity
- **Priority-Based Selection**: Models sorted by priority within each layer
- **Task-Specific Routing**: Different models for chat, code, analysis tasks
- **Automatic Fallback**: Seamless failover when providers are unavailable

### 💰 Cost Optimization
- **Free-First Strategy**: Prioritize free models (L0), escalate only when necessary
- **Budget Tracking**: Per-project budgets with automatic enforcement
- **Real-time Monitoring**: Live cost tracking via dashboard and API
- **Layer Limits**: Configure maximum escalation tier per project

### 📊 Admin Dashboard
- **Real-time Metrics**: Requests, costs, tokens, latency monitoring
- **Model Management**: Configure models, layers, priorities via UI
- **Provider Management**: Enable/disable providers, manage API keys
- **Web Terminal**: SSH/Telnet/Local shell with smart autocomplete
- **Alert System**: Custom alerts with multi-channel notifications

### 🖥️ CLI Tool
- **Gateway Management**: Check status, list models, view config
- **Quick Actions**: Pre-built commands accessible from Web Terminal
- **Tab Completion**: Smart autocomplete for CLI commands
- **History Navigation**: Up/Down arrows to browse command history

### 🔧 Developer Features
- **HTTP API**: RESTful endpoints for any client
- **MCP Support**: Native support for Claude Desktop, VS Code
- **Docker Ready**: Full containerization with docker-compose
- **Test Integration**: Vitest unit tests + Playwright E2E

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway

# Setup environment
cp .env.docker.example .env.docker
# Edit .env.docker - add your OPENROUTER_API_KEY

# Start all services
docker-compose --env-file .env.docker up -d

# Access services
# Gateway API:     http://localhost:3000
# Admin Dashboard: http://localhost:5173
# Health Check:    http://localhost:3000/health
```

### Local Development

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env - add your API keys

# Build project
npm run build

# Start in API mode
npm run start:api

# Or start in MCP mode (for Claude Desktop)
npm run start:mcp
```

---

## 📖 CLI Usage

The gateway includes a powerful CLI tool:

```bash
# Show help
ai-mcp-gateway --help

# Check gateway status
ai-mcp-gateway status

# List all models by layer
ai-mcp-gateway models list

# View model details
ai-mcp-gateway models info <model-id>

# List providers
ai-mcp-gateway providers

# Check database status
ai-mcp-gateway db status

# View/modify configuration
ai-mcp-gateway config show
ai-mcp-gateway config set <key> <value>
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI MCP Gateway                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   HTTP API  │  │  MCP Server │  │         CLI             │  │
│  │  (Express)  │  │   (stdio)   │  │   (status/models/...)   │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Router (N-Layer)                        │  │
│  │  L0 (Free) → L1 (Cheap) → L2 (Standard) → L3 (Premium)    │  │
│  │  Priority-based selection within each layer                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │                  LLM Providers                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │OpenRouter│ │ OpenAI   │ │Anthropic │ │ OSS Local    │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │                   Data Layer                               │  │
│  │  ┌──────────────┐  ┌─────────────────────────────────┐    │  │
│  │  │    Redis     │  │          PostgreSQL             │    │  │
│  │  │   (Cache)    │  │  (Models, Config, Analytics)    │    │  │
│  │  └──────────────┘  └─────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Admin Dashboard (React)                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐   │
│  │Overview│ │Models  │ │Providers│ │Alerts │ │ Web Terminal │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 API Endpoints

### Health & Status
```
GET  /health              # Gateway health check
GET  /v1/models/layers    # List models by layer
```

### Chat Completion
```
POST /v1/chat/completions # OpenAI-compatible chat endpoint
```

### Model Management
```
GET  /v1/models           # List all models
POST /v1/models           # Add new model
PUT  /v1/models/:id       # Update model
```

### Terminal (Web Terminal)
```
POST /v1/terminal/sessions        # Create terminal session
GET  /v1/terminal/sessions        # List sessions
POST /v1/terminal/:id/execute     # Execute command (local)
POST /v1/terminal/:id/send        # Send data (SSH/Telnet)
```

---

## ⚙️ Configuration

### Environment Variables

```env
# Mode (api or mcp)
MODE=api

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mcpgateway

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# LLM Providers (add keys for providers you want to use)
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Routing
DEFAULT_LAYER=L0
ENABLE_CROSS_CHECK=true
MAX_ESCALATION_LAYER=L3

# Server
PORT=3000
LOG_LEVEL=info
```

### Model Configuration

Models are configured in the database with the following properties:
- **id**: Unique identifier
- **provider**: openrouter, openai, anthropic, oss-local
- **layer**: L0, L1, L2, L3
- **priority**: Lower number = higher priority (selected first)
- **enabled**: true/false
- **relative_cost**: Cost factor for budget tracking

---

## 📁 Project Structure

```
ai-mcp-gateway/
├── src/
│   ├── index.ts           # Main entry point (CLI/MCP/API)
│   ├── api/               # Express HTTP API server
│   ├── cli/               # CLI commands (status, models, etc.)
│   ├── mcp/               # MCP server for Claude Desktop
│   ├── routing/           # N-layer router with priority selection
│   ├── config/            # Model catalog & provider config
│   ├── db/                # PostgreSQL connection & queries
│   ├── cache/             # Redis caching layer
│   ├── tools/             # LLM provider clients
│   └── logging/           # Winston logger & metrics
├── admin-dashboard/       # React admin UI
│   ├── src/
│   │   ├── pages/         # Dashboard pages
│   │   └── components/    # Reusable components
│   └── package.json
├── tests/
│   ├── unit/              # Vitest unit tests
│   ├── integration/       # API integration tests
│   └── regression/        # Bug regression tests
├── migrations/            # PostgreSQL migrations
├── docker-compose.yml     # Full stack deployment
└── Dockerfile             # Gateway container
```

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run E2E with UI
npm run test:e2e:ui
```

---

## 📚 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - System design and components
- [API Reference](docs/API-GUIDE.md) - Complete API documentation
- [Docker Deployment](docs/DOCKER-DEPLOYMENT.md) - Container setup guide
- [Testing Guide](docs/TESTING.md) - Test coverage and strategy

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [OpenRouter](https://openrouter.ai/) - Multi-model API gateway
- [Anthropic](https://anthropic.com/) - Claude AI models
- [OpenAI](https://openai.com/) - GPT models
