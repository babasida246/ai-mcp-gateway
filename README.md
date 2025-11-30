# AI MCP Gateway

**Intelligent Multi-Model Orchestrator with Cost Optimization & Dynamic Routing**

A production-ready Model Context Protocol (MCP) server and HTTP API Gateway that orchestrates multiple AI models with intelligent N-layer routing, budget tracking, task-specific model selection, and automatic fallback to free models.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-0.5-orange)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ Key Features

### 🎯 Intelligent Routing
- **Dynamic N-Layer Routing**: Automatically routes requests to appropriate model tier (L0-L3) based on complexity
- **Task-Specific Models**: Dedicated model configurations for chat, code, analysis, and project creation
- **Escalation Control**: Manual confirmation required for paid model escalation (configurable)
- **OpenRouter Fallback**: Automatically fetches top-ranked free models when L0 is unconfigured

### 💰 Cost Optimization
- **Budget Tracking**: Set per-project budgets with automatic enforcement
- **Free-First Strategy**: Prioritizes free models (L0), escalates only when necessary
- **Cost Monitoring**: Real-time cost tracking and alerts via `/health` endpoint
- **Layer Limits**: Configure maximum escalation tier per project

### 🔧 Advanced Capabilities
- **Cross-Checking**: Multiple models validate each other's outputs for critical tasks
- **Provider Health Monitoring**: Automatic failover when providers are unavailable
- **Context Management**: Redis + PostgreSQL for efficient state management
- **Code Agent**: Specialized AI for coding with TODO-driven workflow
- **Test Integration**: Built-in Vitest and Playwright test runners

### 🌐 Multi-Client Architecture
- **HTTP API Gateway**: RESTful endpoints for any client (CLI, Web, Telegram, CI/CD)
- **MCP Server Mode**: Native support for MCP clients (Claude Desktop, VSCode)
- **CLI Tool**: Powerful command-line interface with project scaffolding
- **Docker Ready**: Full containerization with docker-compose

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [CLI Tool](#cli-tool)
- [Configuration](#configuration)
- [HTTP API](#http-api)
- [Model Layers](#model-layers)
- [Architecture](#architecture)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)

📚 **[Complete Documentation Index](docs/DOCUMENTATION-INDEX.md)** - Navigate all guides and references

---

## 🚀 Quick Start

### Option 1: Docker (Recommended) 🐳

**Fastest way to get started with full stack (Gateway + Redis + PostgreSQL):**

```bash
# 1. Clone repository
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway

# 2. Setup environment
cp .env.docker.example .env.docker
# Edit .env.docker and add your OPENROUTER_API_KEY

# 3. Start with Docker Compose
docker-compose --env-file .env.docker up -d

# 4. Check health
curl http://localhost:3000/health
```

**Or using Makefile:**
```bash
make setup  # Create .env.docker
make prod   # Start all services
make logs   # View logs
```

See **[DOCKER-QUICKSTART.md](docs/DOCKER-QUICKSTART.md)** for details.

### Option 2: Local Development

**Prerequisites:**
- Node.js >= 20.0.0
- npm or pnpm (recommended)
- API keys for desired providers (OpenRouter, Anthropic, OpenAI)
- **Optional**: Redis (for caching)
- **Optional**: PostgreSQL (for persistence)

**Installation:**

```bash
# Clone the repository
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys and database settings
nano .env
```

**Build:**

```bash
# Build the project
npm run build

# Or run in development mode
npm run dev
```

---

## 🏗️ Architecture

### Stateless Design

The AI MCP Gateway is designed as a **stateless application** with external state management:

```
┌─────────────────────────────────────────────────┐
│         AI MCP Gateway (Stateless)              │
│  ┌──────────────┐      ┌──────────────┐        │
│  │  MCP Server  │      │  HTTP API    │        │
│  │   (stdio)    │      │  (REST)      │        │
│  └──────┬───────┘      └──────┬───────┘        │
│         │                     │                 │
│         └─────────┬───────────┘                 │
│                   │                             │
│         ┌─────────▼──────────┐                  │
│         │  Routing Engine    │                  │
│         │  Context Manager   │                  │
│         └─────────┬──────────┘                  │
└───────────────────┼─────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
   │  Redis  │ │  DB    │ │  LLMs  │
   │  (Hot)  │ │(Cold)  │ │        │
   └─────────┘ └────────┘ └────────┘
```

### Two-Tier Context Management

1. **Hot Layer (Redis)**
   - Context summaries (`conv:summary:{conversationId}`)
   - Recent messages cache (`conv:messages:{conversationId}`)
   - LLM response cache (`llm:cache:{model}:{hash}`)
   - TODO lists (`todo:list:{conversationId}`)
   - TTL: 30-60 minutes

2. **Cold Layer (PostgreSQL)**
   - Full conversation history
   - All messages with metadata
   - Context summaries (versioned)
   - LLM call logs (tokens, cost, duration)
   - Routing rules and analytics
   - Persistent storage

---

## 🔄 Dual Mode Operation

The gateway supports two modes:

### 1. MCP Mode (stdio)
Standard Model Context Protocol server for desktop clients.

```bash
npm run start:mcp
# or
npm start
```

Configure in Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ai-mcp-gateway": {
      "command": "node",
      "args": ["/path/to/ai-mcp-gateway/dist/index.js"]
    }
  }
}
```

### 2. HTTP API Mode
Stateless REST API for web services and integrations.

```bash
npm run start:api
```

Access API at `http://localhost:3000`.

---

## 🖥️ CLI Tool

A powerful command-line interface for interacting with the MCP Gateway, inspired by Claude CLI.

### Installation

```bash
cd cli
npm install
npm run build
npm install -g .
```

### Quick Start

```bash
# Configure endpoint
export MCP_ENDPOINT=http://localhost:3000

# Interactive chat
mcp chat

# Single message
mcp chat "What is async/await?"

# Code review
mcp code src/app.ts "Review for bugs"

# Code from stdin
cat myfile.js | mcp code - "Optimize this"

# Generate diff patch
mcp diff src/handler.ts "Add error handling"
mcp diff app.js "Fix memory leak" | git apply
```

### Features

- 🤖 **Interactive Chat** - Real-time conversation with AI
- 📝 **Code Analysis** - Expert code reviews and suggestions
- 🔧 **Diff Generation** - Unified patches for code changes
- 🎨 **Syntax Highlighting** - Colored terminal output
- 🔌 **Pipe Support** - Works with Unix pipes
- 📊 **Context Aware** - Includes git status and workspace files

See **[cli/README.md](cli/README.md)** and **[cli/QUICKSTART.md](cli/QUICKSTART.md)** for complete documentation.

---

```bash
npm run start:api
# or
MODE=api npm start
```

API runs on `http://localhost:3000` (configurable via `API_PORT`).

---

## 🌐 HTTP API Usage

### Endpoints

#### POST /v1/route
Intelligent model selection and routing.

```bash
curl -X POST http://localhost:3000/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "message": "Explain async/await in JavaScript",
    "userId": "user-1",
    "qualityLevel": "normal"
  }'
```

Response:
```json
{
  "result": {
    "response": "Async/await is...",
    "model": "anthropic/claude-sonnet-4",
    "provider": "anthropic"
  },
  "routing": {
    "summary": "L0 -> primary model",
    "fromCache": false
  },
  "context": {
    "conversationId": "conv-123"
  },
  "performance": {
    "durationMs": 1234,
    "tokens": { "input": 50, "output": 200 },
    "cost": 0.002
  }
}
```

#### POST /v1/code-agent
Specialized coding assistant.

```bash
curl -X POST http://localhost:3000/v1/code-agent \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "task": "Create a React component for user profile",
    "files": ["src/components/UserProfile.tsx"]
  }'
```

#### POST /v1/chat
General chat endpoint with context.

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "message": "What did we discuss earlier?"
  }'
```

#### GET /v1/context/:conversationId
Retrieve conversation context.

```bash
curl http://localhost:3000/v1/context/conv-123
```

#### GET /health
Health check endpoint.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "redis": true,
  "database": true,
  "timestamp": "2025-11-22T06:42:00.000Z"
}
```

#### GET /v1/server-stats
Real-time server statistics.

```bash
curl http://localhost:3000/v1/server-stats
```

Response:
```json
{
  "uptime": { "seconds": 3600, "formatted": "1h 0m 0s" },
  "requests": { "total": 150, "averageDuration": 234.5 },
  "llm": {
    "totalCalls": 145,
    "tokens": { "input": 12500, "output": 45000, "total": 57500 },
    "cost": { "total": 0.125, "currency": "USD" }
  },
  "memory": { "heapUsed": 45, "heapTotal": 120, "unit": "MB" },
  "providers": { "openai": true, "anthropic": true, "openrouter": true },
  "timestamp": "2025-11-29T15:30:00.000Z"
}
```

See **[SERVER-STATS-GUIDE.md](docs/SERVER-STATS-GUIDE.md)** for detailed monitoring guide.

#### POST /v1/mcp-cli
Handle CLI tool requests (chat, code, diff modes).

```bash
curl -X POST http://localhost:3000/v1/mcp-cli \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "message": "What is async/await?",
    "context": {
      "cwd": "/path/to/project",
      "files": ["src/index.ts"],
      "gitStatus": "modified:   src/app.ts"
    }
  }'
```

Response:
```json
{
  "message": "async/await is syntactic sugar over Promises...",
  "patch": null,
  "model": "claude-3-5-sonnet-20241022",
  "tokens": { "input": 45, "output": 180, "total": 225 },
  "cost": 0.0018
}
```

Modes:
- `chat` - Interactive conversation
- `code` - Code analysis/review
- `diff` - Generate unified diff patches

See **[cli/README.md](cli/README.md)** for CLI tool documentation.

---

## 🐳 Docker Deployment

The project includes complete Docker support for easy deployment:

### Quick Deploy

```bash
# Production (with Redis + PostgreSQL)
docker-compose --env-file .env.docker up -d

# Development (gateway only)
docker-compose -f docker-compose.dev.yml --env-file .env.docker up -d

# Using Makefile
make prod  # Production stack
make dev   # Development mode
```

### Documentation

- **[DOCKER-QUICKSTART.md](docs/DOCKER-QUICKSTART.md)** - Quick reference guide
- **[DOCKER-DEPLOYMENT.md](docs/DOCKER-DEPLOYMENT.md)** - Comprehensive deployment guide with:
  - Multi-stage builds
  - Production best practices
  - Environment configuration
  - Scaling and monitoring
  - Backup/restore procedures
  - Troubleshooting tips

### Docker Files

- `Dockerfile` - Multi-stage build (optimized for production)
- `docker-compose.yml` - Full stack (Gateway + Redis + PostgreSQL + Ollama)
- `docker-compose.dev.yml` - Simplified development setup
- `.env.docker.example` - Environment variable template
- `Makefile` - Convenience commands for Docker operations
      "args": ["/path/to/ai-mcp-gateway/dist/index.js"]
    }
  }
}
```

### Start the Server

```bash
# Run the built server
pnpm start

# Or use the binary directly
node dist/index.js
```

---

## 🏗️ Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Client                             │
│            (Claude Desktop, VS Code, etc.)               │
└───────────────────────┬─────────────────────────────────┘
                        │ MCP Protocol
┌───────────────────────▼─────────────────────────────────┐
│                 AI MCP Gateway Server                    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Tools Registry                      │    │
│  │  • code_agent    • run_vitest                   │    │
│  │  • run_playwright • fs_read/write               │    │
│  │  • git_diff      • git_status                   │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │                                     │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │           Routing Engine                        │    │
│  │  • Task classification                          │    │
│  │  • Layer selection (L0→L1→L2→L3)               │    │
│  │  • Cross-check orchestration                    │    │
│  │  • Auto-escalation                              │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │                                     │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │           LLM Clients                           │    │
│  │  • OpenRouter  • Anthropic                      │    │
│  │  • OpenAI      • OSS Local                      │    │
│  └──────────────────┬──────────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│ Free Models  │ │ Paid Models│ │Local Models│
│ (Layer L0)   │ │(Layer L1-L3)│ │  (Layer L0)│
└──────────────┘ └────────────┘ └────────────┘
```

### Key Components

#### 1. **MCP Server** (`src/mcp/`)
- Handles MCP protocol communication
- Registers and dispatches tools
- Manages request/response lifecycle

#### 2. **Routing Engine** (`src/routing/`)
- Classifies tasks by type, complexity, quality
- Selects optimal model layer
- Orchestrates cross-checking between models
- Auto-escalates when needed

#### 3. **LLM Clients** (`src/tools/llm/`)
- Unified interface for multiple providers
- Handles API calls, token counting, cost calculation
- Supports: OpenRouter, Anthropic, OpenAI, local models

#### 4. **Tools** (`src/tools/`)
- **Code Agent**: Main AI coding assistant
- **Testing**: Vitest and Playwright runners
- **File System**: Read/write/list operations
- **Git**: Diff and status operations

#### 5. **Logging & Metrics** (`src/logging/`)
- Winston-based structured logging
- Cost tracking and alerts
- Performance metrics

---

## 🛠️ Available MCP Tools

The gateway exposes 14 MCP tools for various operations:

### Code & Development Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `code_agent` | AI coding assistant with TODO tracking | `task`, `context`, `quality` |

### Testing Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `run_vitest` | Execute Vitest unit/integration tests | `testPath`, `watch` |
| `run_playwright` | Execute Playwright E2E tests | `testPath` |

### File System Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `fs_read` | Read file contents | `path`, `encoding` |
| `fs_write` | Write file contents | `path`, `content` |
| `fs_list` | List directory contents | `path`, `recursive` |

### Git Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `git_diff` | Show git diff | `staged` |
| `git_status` | Show git status | - |

### **NEW: Cache Tools (Redis)**

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `redis_get` | Get value from Redis cache | `key` |
| `redis_set` | Set value in Redis cache | `key`, `value`, `ttl` |
| `redis_del` | Delete key from Redis cache | `key` |

### **NEW: Database Tools (PostgreSQL)**

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `db_query` | Execute SQL query | `sql`, `params` |
| `db_insert` | Insert row into table | `table`, `data` |
| `db_update` | Update rows in table | `table`, `where`, `data` |

### Tool Usage Examples

**Using Redis cache:**
```json
{
  "tool": "redis_set",
  "arguments": {
    "key": "user:profile:123",
    "value": {"name": "John", "role": "admin"},
    "ttl": 3600
  }
}
```

**Querying database:**
```json
{
  "tool": "db_query",
  "arguments": {
    "sql": "SELECT * FROM conversations WHERE user_id = $1 LIMIT 10",
    "params": ["user-123"]
  }
}
```

---

## 📦 Context Management

### How Context Works

1. **Conversation Initialization**
   - Client sends `conversationId` with each request
   - Gateway checks Redis for existing context summary
   - Falls back to DB if Redis miss
   - Creates new conversation if not exists

2. **Context Storage**
   - **Summary**: Compressed project context (stack, architecture, decisions)
   - **Messages**: Recent messages (last 50 in Redis, all in DB)
   - **TODO Lists**: Persistent task tracking
   - **Metadata**: User, project, timestamps

3. **Context Compression**
   - When context grows large (>50 messages):
     - System generates new summary
     - Keeps only recent 5-10 messages in detail
     - Older messages summarized into context
   - Reduces token usage while maintaining relevance

4. **Context Handoff**
   - When escalating between layers:
     - Creates handoff package with:
       - Context summary
       - Current task
       - Previous attempts
       - Known issues
       - Request to higher layer
     - Optimized for minimal tokens

### Database Schema

```sql
-- Conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    project_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Context summaries
CREATE TABLE context_summaries (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    summary TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- LLM call logs
CREATE TABLE llm_calls (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    model_id TEXT NOT NULL,
    layer TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- TODO lists
CREATE TABLE todo_lists (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    todo_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env.docker` file (use `.env.docker.example` as template):

```bash
# ============================================
# LLM Provider API Keys
# ============================================
# REQUIRED: At least one provider API key
OPENROUTER_API_KEY=your_openrouter_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here

# ============================================
# OpenRouter Configuration
# ============================================
OPENROUTER_FALLBACK_MODELS=qwen/qwen3-coder:free,x-ai/grok-4.1-fast:free
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet

# ============================================
# Task-Specific Models (NEW!)
# ============================================
# Comma-separated list of preferred models for each task type
CHAT_MODELS=meta-llama/llama-3.3-70b-instruct:free,google/gemini-flash-1.5
CODE_MODELS=qwen/qwen-2.5-coder-32b-instruct:free,deepseek/deepseek-coder-33b-instruct:free
ANALYZE_MODELS=qwen/qwen-2.5-72b-instruct:free,google/gemini-flash-1.5
CREATE_PROJECT_MODELS=qwen/qwen-2.5-coder-32b-instruct:free,deepseek/deepseek-coder-33b-instruct:free

# ============================================
# OSS/Local Model (Ollama)
# ============================================
OSS_MODEL_ENABLED=false
OSS_MODEL_ENDPOINT=http://ollama:11434
OSS_MODEL_NAME=llama3:8b

# ============================================
# Database (PostgreSQL)
# ============================================
POSTGRES_DB=ai_mcp_gateway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_postgres_password_here

# ============================================
# Redis Cache
# ============================================
REDIS_PASSWORD=

# ============================================
# Application Configuration
# ============================================
LOG_LEVEL=info
DEFAULT_LAYER=L0
ENABLE_CROSS_CHECK=true
ENABLE_AUTO_ESCALATE=false  # Set to false to require manual confirmation
MAX_ESCALATION_LAYER=L2
ENABLE_COST_TRACKING=true
COST_ALERT_THRESHOLD=1.00
```

### Model Layers

The gateway organizes models into 4 tiers:

| Layer | Cost | Use Case | Examples |
|-------|------|----------|----------|
| **L0** | Free | Simple tasks, drafts, complexity detection | Llama 3.3 70B, Qwen 2.5 Coder, DeepSeek Coder (all free) |
| **L1** | Cheap | Standard coding, chat, reviews | GPT-4o-mini, Claude Haiku |
| **L2** | Mid | Complex logic, architecture, debugging | GPT-4o, Claude Sonnet |
| **L3** | Premium | Critical systems, production code | o1-preview, Claude Opus |

### Key Features

#### 1. **Task-Specific Models** (NEW!)
Define preferred models for different task types:
- `CHAT_MODELS`: General conversation and questions
- `CODE_MODELS`: Code generation and refactoring
- `ANALYZE_MODELS`: Code analysis and debugging
- `CREATE_PROJECT_MODELS`: Project scaffolding

The router automatically selects the best model from your preferred list based on the task type.

#### 2. **OpenRouter Fallback** (NEW!)
When L0 has no configured models, the system automatically:
- Fetches available free models from OpenRouter API
- Ranks them by context window size and capabilities
- Uses top 5 for routing
- Logs the fallback operation

#### 3. **Escalation Control** (NEW!)
When `ENABLE_AUTO_ESCALATE=false`:
- System detects when a higher tier is needed
- Prompts user for confirmation before using paid models
- Shows reason for escalation
- Allows manual approval/rejection

#### 4. **Budget Tracking** (CLI Feature)
When creating projects via CLI:
```bash
mcp create-project "Todo app with React"
# Prompts for:
# - Budget (USD): 0.50
# - Max layer: L1
# - Enable tests: yes
# - Debug mode: no
```

The CLI tracks cumulative costs and stops generation if budget is exceeded.
  },
  contextWindow: 100000,
  enabled: true,
}
```

---

## 📖 Usage

### Using the Code Agent

The Code Agent is the primary tool for coding tasks:

```typescript
// Example MCP client call
{
  "tool": "code_agent",
  "arguments": {
    "task": "Create a TypeScript function to validate email addresses",
    "context": {
      "language": "typescript",
      "requirements": [
        "Use regex pattern",
        "Handle edge cases",
        "Include unit tests"
      ]
    },
    "quality": "high"
  }
}
```

**Response includes:**
- Generated code
- Routing summary (which models were used)
- Token usage and cost
- Quality assessment

### Running Tests

```typescript
// Run Vitest tests
{
  "tool": "run_vitest",
  "arguments": {
    "testPath": "tests/unit/mytest.test.ts"
  }
}

// Run Playwright E2E tests
{
  "tool": "run_playwright",
  "arguments": {
    "testPath": "tests/e2e/login.spec.ts"
  }
}
```

### File Operations

```typescript
// Read file
{
  "tool": "fs_read",
  "arguments": {
    "path": "/path/to/file.ts"
  }
}

// Write file
{
  "tool": "fs_write",
  "arguments": {
    "path": "/path/to/output.ts",
    "content": "console.log('Hello');"
  }
}

// List directory
{
  "tool": "fs_list",
  "arguments": {
    "path": "/path/to/directory"
  }
}
```

### Git Operations

```typescript
// Get diff
{
  "tool": "git_diff",
  "arguments": {
    "staged": false
  }
}

// Get status
{
  "tool": "git_status",
  "arguments": {}
}
```

---

## 🛠️ Available Tools

| Tool Name         | Description                                  | Input                          |
| ----------------- | -------------------------------------------- | ------------------------------ |
| `code_agent`      | AI coding assistant with multi-model routing | task, context, quality         |
| `run_vitest`      | Run Vitest unit/integration tests            | testPath (optional)            |
| `run_playwright`  | Run Playwright E2E tests                     | testPath (optional)            |
| `fs_read`         | Read file contents                           | path                           |
| `fs_write`        | Write file contents                          | path, content                  |
| `fs_list`         | List directory contents                      | path                           |
| `git_diff`        | Get git diff                                 | path (optional), staged (bool) |
| `git_status`      | Get git status                               | none                           |

---

## 🎚️ Model Layers

### Layer L0 - Free/Cheapest
- **Models**: Mistral 7B Free, Qwen 2 7B Free, OSS Local
- **Cost**: $0
- **Use for**: Simple tasks, drafts, code review
- **Capabilities**: Basic code, general knowledge

### Layer L1 - Low Cost
- **Models**: Gemini Flash 1.5, GPT-4o Mini
- **Cost**: ~$0.08-0.75 per 1M tokens
- **Use for**: Standard coding tasks, refactoring
- **Capabilities**: Code, reasoning, vision

### Layer L2 - Mid-tier
- **Models**: Claude 3 Haiku, GPT-4o
- **Cost**: ~$1.38-12.5 per 1M tokens
- **Use for**: Complex tasks, high-quality requirements
- **Capabilities**: Advanced code, reasoning, vision

### Layer L3 - Premium
- **Models**: Claude 3.5 Sonnet, OpenAI o1
- **Cost**: ~$18-60 per 1M tokens
- **Use for**: Critical tasks, architecture design
- **Capabilities**: SOTA performance, deep reasoning

---

## 💻 Development

### Project Structure

```
ai-mcp-gateway/
├── src/
│   ├── index.ts              # Entry point
│   ├── config/               # Configuration
│   │   ├── env.ts
│   │   └── models.ts
│   ├── mcp/                  # MCP server
│   │   ├── server.ts
│   │   └── types.ts
│   ├── routing/              # Routing engine
│   │   ├── router.ts
│   │   └── cost.ts
│   ├── tools/                # MCP tools
│   │   ├── codeAgent/
│   │   ├── llm/
│   │   ├── testing/
│   │   ├── fs/
│   │   └── git/
│   └── logging/              # Logging & metrics
│       ├── logger.ts
│       └── metrics.ts
├── tests/                    # Tests
│   ├── unit/
│   ├── integration/
│   └── regression/
├── docs/                     # Documentation
│   ├── ai-orchestrator-notes.md
│   ├── ai-routing-heuristics.md
│   └── ai-common-bugs-and-fixes.md
├── playwright/               # E2E tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

### Scripts

```bash
# Development
pnpm dev          # Watch mode with auto-rebuild
pnpm build        # Build for production
pnpm start        # Run built server

# Testing
pnpm test         # Run all Vitest tests
pnpm test:watch   # Run tests in watch mode
pnpm test:ui      # Run tests with UI
pnpm test:e2e     # Run Playwright E2E tests

# Code Quality
pnpm type-check   # TypeScript type checking
pnpm lint         # ESLint
pnpm format       # Prettier
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run specific test file
pnpm vitest tests/unit/routing.test.ts

# Watch mode
pnpm test:watch
```

### Integration Tests

Integration tests verify interactions between components:

```bash
pnpm vitest tests/integration/
```

### Regression Tests

Regression tests prevent previously fixed bugs from reoccurring:

```bash
pnpm vitest tests/regression/
```

### E2E Tests

End-to-end tests using Playwright:

```bash
pnpm test:e2e
```

---

## 🔄 Self-Improvement

The gateway includes a self-improvement system:

### 1. **Bug Tracking** (`docs/ai-common-bugs-and-fixes.md`)
- Documents encountered bugs
- Includes root causes and fixes
- Links to regression tests

### 2. **Pattern Learning** (`docs/ai-orchestrator-notes.md`)
- Tracks successful patterns
- Records optimization opportunities
- Documents lessons learned

### 3. **Routing Refinement** (`docs/ai-routing-heuristics.md`)
- Defines routing rules
- Documents when to escalate
- Model capability matrix

### Adding to Self-Improvement Docs

When you discover a bug or pattern:

1. **Document it** in the appropriate file
2. **Create a regression test** in `tests/regression/`
3. **Update routing heuristics** if needed
4. **Run tests** to verify the fix

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a pull request

### Adding a New Model

1. Update `src/config/models.ts`:
   ```typescript
   {
     id: 'new-model-id',
     provider: 'provider-name',
     // ... config
   }
   ```

2. Add provider client if needed in `src/tools/llm/`

3. Update `docs/ai-routing-heuristics.md`

### Adding a New Tool

1. Create tool in `src/tools/yourtool/index.ts`:
   ```typescript
   export const yourTool = {
     name: 'your_tool',
     description: '...',
     inputSchema: { ... },
     handler: async (args) => { ... }
   };
   ```

2. Register in `src/mcp/server.ts`

3. Add tests in `tests/unit/`

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [OpenRouter](https://openrouter.ai/) for unified LLM access
- All the amazing open-source LLM providers

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/babasida246/ai-mcp-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/babasida246/ai-mcp-gateway/discussions)
- **Documentation**: See comprehensive guides in this repository

---

## 🗺️ Roadmap

- [x] ✅ Redis caching layer (implemented)
- [x] ✅ PostgreSQL persistence (implemented)
- [x] ✅ HTTP API mode (implemented)
- [x] ✅ CLI tool (implemented)
- [x] ✅ Docker deployment (implemented)
- [ ] Token usage analytics dashboard
- [ ] More LLM providers (Google AI, Cohere, etc.)
- [ ] Streaming response support
- [ ] Web UI for configuration and monitoring
- [ ] Advanced prompt templates
- [ ] A/B testing framework for routing strategies

---

**Made with ❤️ for efficient AI orchestration**
