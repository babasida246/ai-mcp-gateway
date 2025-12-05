# Architecture Guide

## Overview

AI MCP Gateway is a multi-model orchestrator that routes AI requests through an N-layer architecture, optimizing for cost while maintaining quality. It supports multiple interfaces (HTTP API, MCP, CLI) and provides a comprehensive admin dashboard.

## System Components

### 1. Entry Points

```
┌─────────────────────────────────────────────────────────────────┐
│                         Entry Points                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   HTTP API  │  │  MCP Server │  │         CLI             │  │
│  │    :3000    │  │   (stdio)   │  │   (no server needed)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

- **HTTP API** (`src/api/server.ts`): Express server for RESTful endpoints
- **MCP Server** (`src/mcp/server.ts`): Model Context Protocol for Claude Desktop
- **CLI** (`src/cli/index.ts`): Command-line interface for management tasks

### 2. Router (N-Layer)

```
┌─────────────────────────────────────────────────────────────────┐
│                      N-Layer Router                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Request → Complexity Detection → Layer Selection → Model Pick  │
│                                                                  │
│  L0 (Free)     → Priority 0, 1, 2... (sorted ASC)               │
│  L1 (Cheap)    → Priority 0, 1, 2... (sorted ASC)               │
│  L2 (Standard) → Priority 0, 1, 2... (sorted ASC)               │
│  L3 (Premium)  → Priority 0, 1, 2... (sorted ASC)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/routing/router.ts`: Main routing logic
- `src/routing/cost.ts`: Cost tracking and budget enforcement
- `src/db/model-config.ts`: Model configuration service (DB-backed)

**How it works:**
1. Request arrives with optional layer/model hints
2. Router detects complexity (simple → L0, complex → higher)
3. Selects appropriate layer based on complexity and config
4. Picks first available model by priority (lowest number first)
5. Falls back to next layer if all models fail

### 3. LLM Providers

```
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Providers                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  OpenRouter  │  │    OpenAI    │  │  Anthropic   │          │
│  │   (free +)   │  │   (GPT-4)    │  │   (Claude)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  OSS Local   │  (Ollama, LM Studio, etc.)                   │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/tools/llm/client.ts`: Unified LLM client
- `src/tools/llm/openrouter.ts`: OpenRouter provider
- `src/tools/llm/openai.ts`: OpenAI provider
- `src/tools/llm/anthropic.ts`: Anthropic provider
- `src/tools/llm/oss-local.ts`: Local model provider

### 4. Data Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │        Redis         │  │        PostgreSQL            │    │
│  │  - Session cache     │  │  - Model configurations      │    │
│  │  - Rate limiting     │  │  - Analytics & metrics       │    │
│  │  - Temp storage      │  │  - Provider configs          │    │
│  └──────────────────────┘  │  - Alert rules               │    │
│                            │  - Terminal connections      │    │
│                            └──────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/db/postgres.ts`: PostgreSQL connection pool
- `src/db/model-config.ts`: Model CRUD operations
- `src/cache/redis.ts`: Redis caching layer

### 5. Admin Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    Admin Dashboard (React)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pages:                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Overview   │  │    Models    │  │  Providers   │          │
│  │  (metrics)   │  │  (CRUD)      │  │  (config)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Alerts    │  │   Tokens     │  │ Web Terminal │          │
│  │  (rules)     │  │  (API keys)  │  │  (SSH/shell) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Location:** `admin-dashboard/src/`

## Request Flow

```
1. Client Request
       │
       ▼
2. HTTP API / MCP Server
       │
       ▼
3. Router.route(request, context)
       │
       ├─── Detect complexity
       │
       ├─── Select layer (L0-L3)
       │
       ├─── Pick model (by priority)
       │
       └─── Call LLM provider
              │
              ▼
4. LLM Response
       │
       ▼
5. Track cost & metrics
       │
       ▼
6. Return to client
```

## Model Priority System

Models within each layer are sorted by `priority` (ascending):

```sql
SELECT * FROM model_configs 
WHERE layer = 'L0' AND enabled = true
ORDER BY priority ASC, relative_cost ASC;
```

- **Priority 0**: First choice (selected before Priority 1)
- **Priority 1**: Second choice
- **Priority 2**: Third choice
- etc.

This allows fine-grained control over which model is used first within a layer.

## Configuration Flow

```
1. Environment Variables (.env)
       │
       ▼
2. Provider Manager (src/config/provider-manager.ts)
       │
       ▼
3. Model Config Service (src/db/model-config.ts)
       │
       ▼
4. Router uses DB-backed config
```

## Docker Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  ai-mcp-gateway  │ ◄─── Port 3000 (API)                      │
│  │    (Node.js)     │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│  ┌────────┼──────────────────────────────────────┐              │
│  │        │                                       │              │
│  │  ┌─────▼─────┐      ┌───────────────────┐    │              │
│  │  │  postgres │      │       redis       │    │              │
│  │  │   :5432   │      │       :6379       │    │              │
│  │  └───────────┘      └───────────────────┘    │              │
│  │                                               │              │
│  └───────────────────────────────────────────────┘              │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ ai-mcp-dashboard │ ◄─── Port 5173 (Dashboard)                │
│  │     (Nginx)      │                                           │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Considerations

1. **API Keys**: Stored in environment variables, never in code
2. **Database**: Credentials via DATABASE_URL
3. **Admin Auth**: JWT-based authentication for dashboard
4. **Terminal**: Session-based with proper cleanup

## Performance Optimizations

1. **Redis Caching**: Model configs cached to reduce DB queries
2. **Connection Pooling**: PostgreSQL uses connection pool
3. **Lazy Loading**: CLI commands don't load server modules
4. **Dynamic Imports**: Server modules loaded only when needed
