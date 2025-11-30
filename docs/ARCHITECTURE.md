# AI MCP Gateway - Architecture Documentation

## Overview

The AI MCP Gateway is a **stateless application** designed for intelligent AI model orchestration with cost optimization, context management, and multi-tier caching.

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Layer                               │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ MCP Clients   │  │  HTTP/REST   │  │  Web Applications  │    │
│  │ (Claude, VSC) │  │   Clients    │  │   (curl, apps)     │    │
│  └───────┬───────┘  └──────┬───────┘  └─────────┬──────────┘    │
└──────────┼──────────────────┼────────────────────┼───────────────┘
           │                  │                    │
           │ MCP Protocol     │ HTTP/JSON          │
           │ (stdio)          │ (REST API)         │
           │                  │                    │
┌──────────▼──────────────────▼────────────────────▼───────────────┐
│                   AI MCP Gateway (Stateless)                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Entry Layer (index.ts)                     │ │
│  │  MODE=mcp → MCP Server    MODE=api → HTTP API Server        │ │
│  └──────────────────┬──────────────────────┬───────────────────┘ │
│                     │                      │                      │
│  ┌─────────────────▼──────────┐  ┌────────▼──────────────────┐  │
│  │    MCP Server               │  │    HTTP API Server        │  │
│  │  - Tool Registry            │  │  - Express Server         │  │
│  │  - Stdio Transport          │  │  - REST Endpoints         │  │
│  │  - Request Handling         │  │  - CORS & Middleware      │  │
│  └─────────────────┬───────────┘  └────────┬──────────────────┘  │
│                    │                       │                      │
│  ┌─────────────────▼───────────────────────▼───────────────────┐ │
│  │                   Core Processing Layer                      │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
│  │  │  Routing   │  │   Context    │  │    Handoff       │   │ │
│  │  │  Engine    │  │   Manager    │  │    Builder       │   │ │
│  │  └────────────┘  └──────────────┘  └──────────────────┘   │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
│  │  │   TODO     │  │   Metrics    │  │    Logger        │   │ │
│  │  │  Manager   │  │   Tracker    │  │                  │   │ │
│  │  └────────────┘  └──────────────┘  └──────────────────┘   │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐ │
│  │                      Tool Layer (MCP Tools)                  │ │
│  │  Code Agent │ Testing │ FS │ Git │ Redis │ DB │ LLM Clients│ │
│  └──────────────────────────┬──────────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
         ┌──────▼──────┐ ┌───▼────┐ ┌─────▼─────────┐
         │   Redis     │ │  DB    │ │  LLM Providers│
         │   (Hot)     │ │(Cold)  │ │ (Anthropic,   │
         │   Cache     │ │Storage │ │  OpenAI, etc) │
         └─────────────┘ └────────┘ └───────────────┘
```

## Core Components

### 1. Stateless Application Layer

The gateway is designed to be completely stateless in the application layer:

- **No in-memory sessions**: All state is externalized
- **Horizontal scalability**: Can run multiple instances behind load balancer
- **Graceful restarts**: No session loss on restart
- **12-Factor compliant**: Follows modern cloud-native principles

### 2. Two-Tier State Management

#### Hot Layer (Redis)
- **Purpose**: Fast access to frequently used data
- **TTL**: 30 minutes to 1 hour
- **Data**:
  - Context summaries
  - Recent messages cache
  - LLM response cache
  - TODO lists
  - Routing hints

**Key Patterns**:
```typescript
// Cache key structure
llm:cache:{modelId}:{promptHash}
conv:summary:{conversationId}
conv:messages:{conversationId}
todo:list:{conversationId}
routing:hints:{projectId}
```

#### Cold Layer (PostgreSQL)
- **Purpose**: Persistent storage and analytics
- **Retention**: Indefinite (with archival strategy)
- **Data**:
  - All conversations
  - Full message history
  - Context summaries (versioned)
  - LLM call logs
  - Routing rules
  - TODO lists

**Schema Design**:
- Normalized for efficiency
- JSONB for flexible metadata
- Indexed for fast queries
- Foreign keys for referential integrity

### 3. Context Management System

```typescript
interface ContextFlow {
  // 1. Request arrives with conversationId
  conversationId: string;
  
  // 2. Load from Redis (hot) or DB (cold)
  summary: ContextSummary | null;
  messages: Message[];
  
  // 3. Process request
  response: LLMResponse;
  
  // 4. Update context
  updatedSummary: ContextSummary;
  
  // 5. Save to Redis + DB
  persisted: boolean;
}
```

**Context Compression**:
- When conversation grows large (>50 messages):
  - Summarize older messages
  - Keep only recent 5-10 in detail
  - Update context summary
- Reduces token usage by 60-80%
- Maintains conversation coherence

### 4. N-Layer Dynamic Routing

```
┌──────────────────────────────────────────────────┐
│              Routing Decision Tree               │
└──────────────────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │  Analyze Request        │
        │  - Complexity           │
        │  - Quality Requirement  │
        │  - Cost Constraints     │
        └─────────┬───────────────┘
                  │
         ┌────────▼────────┐
         │ Select Layer    │
         │ L0 / L1 / L2    │
         └────────┬────────┘
                  │
      ┌───────────▼──────────────┐
      │ Cross-Check Enabled?     │
      └───────┬──────────┬───────┘
              │ Yes      │ No
              │          │
       ┌──────▼──┐    ┌──▼──────┐
       │ Primary │    │ Single  │
       │ + Review│    │ Model   │
       └──────┬──┘    └──┬──────┘
              │          │
       ┌──────▼──────────▼───────┐
       │ Conflicts Found?        │
       └───────┬──────────┬──────┘
               │ Yes      │ No
               │          │
        ┌──────▼───┐   ┌──▼──────┐
        │ Escalate │   │ Return  │
        │ to L(n+1)│   │ Result  │
        └──────────┘   └─────────┘
```

**Layer Definitions**:
- **L0 (Free/OSS)**: Default for simple tasks
  - Local models, free APIs
  - Cost: ~$0
- **L1 (Mid-Tier)**: Medium complexity
  - Claude Haiku, GPT-3.5
  - Cost: $0.001-0.01 per request
- **L2 (Premium)**: High complexity/quality
  - Claude Sonnet 4, GPT-4
  - Cost: $0.01-0.10 per request

### 5. Handoff Package System

When escalating between layers, a handoff package is created:

```typescript
interface HandoffPackage {
  contextSummary: string;      // Compressed project context
  currentTask: string;         // What needs to be done
  attemptsSoFar: AttemptInfo[]; // Previous layer results
  knownIssues: string[];       // Identified problems
  openQuestions: string[];     // Unresolved questions
  requestToHigherLayer: string; // Specific ask
  relevantFiles?: string[];    // Code references
  testResults?: TestResult[];  // Test outcomes
}
```

**Optimization**:
- Removes noise from context
- Highlights key information
- Reduces token usage by 40-60%
- Improves higher-layer focus

### 6. HTTP API Design

**Stateless Principles**:
- Every request must include `conversationId`
- No server-side sessions
- Context loaded on-demand from Redis/DB
- Response includes full context state

**Endpoints**:

```typescript
// Route intelligent model selection
POST /v1/route
{
  conversationId: string;
  message: string;
  userId?: string;
  projectId?: string;
  qualityLevel?: 'normal' | 'high' | 'critical';
}

// Code agent with TODO tracking
POST /v1/code-agent
{
  conversationId: string;
  task: string;
  files?: string[];
}

// General chat with context
POST /v1/chat
{
  conversationId: string;
  message: string;
}

// Get conversation context
GET /v1/context/:conversationId

// Update context summary
POST /v1/context/:conversationId
{
  summary: ContextSummary;
}

// Health check
GET /health
```

## Data Flow Examples

### Example 1: New Conversation

```
1. Client → POST /v1/chat
   {
     conversationId: "conv-new-001",
     message: "Hello!"
   }

2. Gateway:
   - Check Redis: MISS (new conversation)
   - Check DB: NOT FOUND
   - Create conversation in DB
   - Process message with L0 model
   - Save message + response to DB
   - Cache in Redis (TTL: 30min)

3. Gateway → Client
   {
     result: { response: "Hi! How can I help?" },
     context: { conversationId: "conv-new-001" }
   }
```

### Example 2: Continuing Conversation

```
1. Client → POST /v1/chat
   {
     conversationId: "conv-001",
     message: "What did we discuss?"
   }

2. Gateway:
   - Check Redis: HIT (summary + recent messages)
   - Load from cache
   - Build context-aware prompt
   - Route to appropriate model
   - Update context
   - Save to Redis + DB

3. Gateway → Client
   {
     result: { response: "We discussed..." },
     context: { conversationId: "conv-001" }
   }
```

### Example 3: Escalation Flow

```
1. L0 Model attempts task → produces solution
2. Review model finds issues
3. Create handoff package:
   - Summarize context
   - Document L0 attempt
   - List issues found
   - Request help from L1
4. L1 Model receives compressed context
5. L1 produces improved solution
6. Update context with L1 result
7. Save metrics (cost, tokens, success)
```

## Performance Considerations

### Caching Strategy

- **Redis TTL**: Balance between freshness and cache hit rate
- **LLM Response Cache**: Hash prompt + model for deduplication
- **Context Compression**: Triggered when messages > 50
- **Cache Warming**: Pre-cache common patterns

### Database Optimization

- **Indexes**: conversation_id, created_at, user_id
- **Partitioning**: Consider for large-scale (>1M conversations)
- **Archival**: Move old data to cold storage
- **Connection Pooling**: Max 20 concurrent connections

### Cost Optimization

```typescript
// Cost tracking per request
{
  layer: 'L0',
  model: 'claude-haiku',
  inputTokens: 150,
  outputTokens: 300,
  estimatedCost: 0.002,
  durationMs: 1200
}
```

**Savings Strategies**:
- Start with L0 (free/cheap) → 70% of requests
- Cross-check only when needed → 20% overhead
- Escalate selectively → 10% to higher tiers
- **Result**: 60-80% cost reduction vs always-premium

## Scaling Considerations

### Horizontal Scaling

```
Load Balancer
     │
     ├─► Gateway Instance 1
     ├─► Gateway Instance 2
     ├─► Gateway Instance 3
     └─► Gateway Instance N
            │
     ┌──────┴──────┐
     │             │
   Redis         PostgreSQL
  (Shared)      (Shared)
```

- **Stateless design** enables easy scaling
- **Redis** handles cache synchronization
- **DB** handles persistent state
- **No sticky sessions** required

### Monitoring & Observability

**Key Metrics**:
- Request latency (p50, p95, p99)
- Cache hit rate (target: >80%)
- DB query time (target: <100ms)
- Model costs per request
- Error rates by endpoint

**Logging**:
- Structured JSON logs (Winston)
- Request tracing with unique IDs
- Error context for debugging

## Security Considerations

- **API Keys**: Stored in environment variables
- **Database**: Credentials managed securely
- **CORS**: Configurable origin restrictions
- **Input Validation**: Zod schemas for all inputs
- **SQL Injection**: Parameterized queries only
- **Rate Limiting**: TODO (future enhancement)

## Future Enhancements

1. **Self-Improvement Loop**
   - Automatic regression test generation
   - Routing heuristic refinement
   - Pattern recognition from logs

2. **Advanced Caching**
   - Semantic similarity cache
   - Preemptive cache warming
   - Distributed cache (Redis Cluster)

3. **Enhanced Analytics**
   - Cost attribution by project/user
   - Model performance comparison
   - A/B testing for routing strategies

4. **Multi-Tenancy**
   - User authentication
   - Per-tenant quotas
   - Billing integration

## Conclusion

The AI MCP Gateway implements a modern, cloud-native architecture that balances:
- **Performance**: Fast response times via caching
- **Cost**: Intelligent routing to optimize spending
- **Scalability**: Stateless design for horizontal scaling
- **Reliability**: Dual-tier state management for fault tolerance
- **Observability**: Comprehensive logging and metrics

This architecture supports both MCP (stdio) and HTTP API modes while maintaining consistent behavior and state management.
