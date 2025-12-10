# AI MCP Gateway

Model Context Protocol (MCP) server and AI gateway that orchestrates multiple models with layered routing, budget controls, and an admin dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

This repository provides:

- An HTTP API gateway (Express) that routes requests to LLM providers using an N-layer, priority-based router.
- A standalone MCP server implementation so MCP-aware clients (Claude Desktop, VS Code) can connect directly.
- A developer CLI (`mcp`) for code generation, analysis, and gateway management.
- A React-based Admin Dashboard for real-time monitoring and provider/model management.

See `docs/FEATURE_SUMMARY.md` for a concise feature overview.

---

## Quick Start

Docker (recommended):

```powershell
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway
copy .env.docker.example .env.docker
# Edit .env.docker with provider API keys (OPENROUTER_API_KEY, OPENAI_API_KEY, ...)
docker-compose --env-file .env.docker up -d

# Gateway API:     http://localhost:3000
# Admin Dashboard: http://localhost:5173
```

Local development:

```powershell
npm install
copy .env.example .env
# Edit .env with API keys and DB settings
npm run build
npm run start:api     # start API server
# or
npm run start:mcp     # start MCP server
```

---

## Core Concepts

- N-layer routing: requests try cheaper/free models first (L0 → L3) and escalate only when necessary.
- Priority selection: models within a layer are ordered by priority and chosen deterministically.
- Budget enforcement: per-project budgets limit model escalation and track costs.
- MCP tools: the gateway exposes MCP tools for chat, code, network ops, and more.

For a short feature summary, open `docs/FEATURE_SUMMARY.md`.
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

## 🔗 MCP Server Mode

The gateway can run as a standalone MCP server that Claude Desktop, VS Code, and other MCP clients can connect to directly.

### Starting the MCP Server

```bash
# Start with default stdio transport
mcp mcp-serve

# Start with debug logging
mcp mcp-serve --log-level debug

# With custom gateway endpoint (for AI routing)
mcp mcp-serve --endpoint http://localhost:3000 --api-key your-key
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `ai.chat_router` | Route chat messages through N-layer architecture (L0→L3) for cost optimization |
| `ai.code_agent` | Generate or analyze code with full context awareness |
| `net.fw_log_search` | Search and analyze firewall logs |
| `net.topology_scan` | Scan and visualize network topology |
| `net.mikrotik_api` | Execute MikroTik RouterOS API commands |
| `ops.cost_report` | Generate cost reports for AI usage |
| `ops.trace_session` | Trace and debug AI request sessions |

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ai-mcp-gateway": {
      "command": "npx",
      "args": ["-y", "@ai-mcp-gateway/cli", "mcp-serve"],
      "env": {
        "MCP_ENDPOINT": "http://localhost:3000",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "ai-mcp-gateway": {
      "command": "mcp",
      "args": ["mcp-serve"]
    }
  }
}
```

### VS Code MCP Configuration

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "ai-mcp-gateway": {
      "command": "npx",
      "args": ["-y", "@ai-mcp-gateway/cli", "mcp-serve"]
    }
  }
}
```

### Tool Usage Examples

Once connected, you can use the tools in Claude:

```
# Route a chat message through the gateway
Use ai.chat_router to ask: "Explain the difference between REST and GraphQL"

# Analyze code
Use ai.code_agent to review my index.ts file and suggest improvements

# Search firewall logs
Use net.fw_log_search to find blocked connections in the last hour

# Get cost report
Use ops.cost_report to show my AI usage costs for this month
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
