# AI MCP Gateway - Roadmap & Architecture Analysis

**Last Updated**: December 1, 2025  
**Status**: Planning Phase

---

## 1. Tóm tắt Kiến trúc Hiện tại

### Core Architecture
```
AI MCP Gateway
├── MCP Server (stdio) - Desktop clients (Claude, VSCode)
├── HTTP API (REST) - Web/CLI/Integrations
├── N-Layer Routing (L0→L3) - Cost optimization
├── Context Management (Redis hot + PostgreSQL cold)
└── CLI Tool - chat/code/diff/analyze/create-project
```

### Tech Stack
- **Runtime**: Node.js 20+, TypeScript 5.3 (strict mode)
- **Build**: tsup (esbuild-based)
- **Storage**: PostgreSQL (conversations, messages, llm_calls, context_summaries, todo_lists)
- **Cache**: Redis (TTL 30-60min for hot context)
- **LLM Providers**: OpenRouter, Anthropic, OpenAI, OSS/Local (Ollama)

### Key Components
- **Router** (`src/routing/router.ts`): Layer selection, cross-check, auto-escalation
- **Context Manager** (`src/context/manager.ts`): 2-tier context (Redis/Postgres)
- **MCP Server** (`src/mcp/server.ts`): 14 registered tools
- **API Server** (`src/api/server.ts`): RESTful endpoints with stateless design
- **CLI** (`cli/`): Commander.js-based, 5 commands

### Current Features
- ✅ 4-layer routing (L0 free → L3 premium)
- ✅ Budget tracking & cost alerts
- ✅ Task-specific models (chat/code/analyze/createProject)
- ✅ Cross-checking & escalation with confirmation
- ✅ 14 MCP tools (fs, git, testing, cache, db, code_agent)
- ✅ Context compression & handoff
- ✅ Health check with full config display

### Coding Conventions Observed
- **Naming**: camelCase for functions/vars, PascalCase for types/interfaces
- **Error handling**: Try-catch with Winston logger, structured errors
- **API responses**: Consistent `{ result, routing, context, performance }` structure
- **DB**: Parameterized queries, transaction support
- **Types**: Strict TypeScript, explicit return types, Record<string, unknown> for dynamic data

---

## 2. Roadmap Kỹ thuật - Development Phases

### 🎯 **Phase 1: Foundation & Infrastructure** (Weeks 1-2)
**Priority**: HIGH - Enables other features  
**Status**: 📋 Planned

#### Nhóm 3 - Observability & Analytics

##### 7. Structured Tracing per Request
**Scope**: Complete request lifecycle tracking

- **Database Schema**:
  ```sql
  CREATE TABLE request_traces (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id),
      request_type TEXT NOT NULL, -- 'route', 'chat', 'code-agent', etc.
      request_payload JSONB,
      routing_decisions JSONB[], -- array of layer decisions
      llm_calls JSONB[], -- detailed call tree
      tool_calls JSONB[], -- MCP tool invocations
      total_cost DECIMAL(10, 6),
      total_duration_ms INTEGER,
      error_info JSONB,
      created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE INDEX idx_traces_conversation ON request_traces(conversation_id);
  CREATE INDEX idx_traces_created ON request_traces(created_at DESC);
  ```

- **Types** (`src/types/tracing.ts`):
  ```typescript
  interface RequestTrace {
      id: string;
      conversationId: string;
      requestType: 'route' | 'chat' | 'code-agent' | 'mcp-cli';
      requestPayload: Record<string, unknown>;
      routingDecisions: RoutingDecision[];
      llmCalls: LLMCallTrace[];
      toolCalls: ToolCallTrace[];
      totalCost: number;
      totalDurationMs: number;
      errorInfo?: ErrorInfo;
      createdAt: Date;
  }
  
  interface RoutingDecision {
      layer: string;
      reason: string;
      modelSelected: string;
      timestamp: number;
  }
  
  interface LLMCallTrace {
      model: string;
      provider: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      durationMs: number;
      startTime: number;
      endTime: number;
  }
  
  interface ToolCallTrace {
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
      error?: string;
      durationMs: number;
  }
  ```

- **Implementation**:
  - New module: `src/tracing/tracer.ts`
  - Middleware in router to capture decisions
  - Hook in LLM clients to record calls
  - API endpoint: `GET /v1/traces/:id`

- **Files to Modify**:
  - `src/routing/router.ts` - Add tracing hooks
  - `src/tools/llm/client.ts` - Instrument LLM calls
  - `src/api/server.ts` - Add `/v1/traces/:id` endpoint
  - `src/db/postgres.ts` - Add trace queries

##### 8. Cost & Usage Analytics
**Scope**: Aggregated metrics endpoints

- **API Endpoints**:
  ```typescript
  GET /v1/analytics/by-project?projectId=X&startDate=Y&endDate=Z
  GET /v1/analytics/by-user?userId=X&startDate=Y&endDate=Z
  GET /v1/analytics/by-model?startDate=Y&endDate=Z
  ```

- **Response Schema**:
  ```typescript
  interface AnalyticsResponse {
      timeRange: { start: string; end: string };
      totalRequests: number;
      totalTokens: { input: number; output: number; total: number };
      totalCost: number;
      breakdown: {
          byLayer: Record<string, LayerMetrics>;
          byModel: Record<string, ModelMetrics>;
          byDay: DailyMetrics[];
      };
  }
  
  interface LayerMetrics {
      requests: number;
      tokens: number;
      cost: number;
      avgDurationMs: number;
  }
  ```

- **Implementation**:
  - New module: `src/analytics/aggregator.ts`
  - SQL queries with GROUP BY on llm_calls table
  - Caching layer for frequently accessed ranges

##### 9. Cost Guardrail / Anomaly Detection
**Scope**: Background monitoring + alerts

- **Configuration** (`.env`):
  ```bash
  # Cost guardrails
  COST_ANOMALY_WINDOW_MINUTES=15
  COST_ANOMALY_THRESHOLD_MULTIPLIER=3.0
  COST_GUARDRAIL_WEBHOOK_URL=https://hooks.slack.com/...
  ```

- **Implementation**:
  - Background job: `src/monitoring/guardrail.ts`
  - Check cost/error rate every N minutes
  - Compare with historical baseline
  - Trigger webhook on anomaly

- **Alert Schema**:
  ```typescript
  interface CostAlert {
      type: 'anomaly' | 'threshold_exceeded';
      windowMinutes: number;
      currentCost: number;
      expectedCost: number;
      multiplier: number;
      affectedProjects: string[];
      timestamp: Date;
  }
  ```

#### Nhóm 4 - Multi-tenant & Security

##### 10. Multi-tenant/Quota Schema
**Scope**: Organizations, projects, quotas

- **Database Schema**:
  ```sql
  CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
  );
  
  CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES organizations(id),
      name TEXT NOT NULL,
      config JSONB DEFAULT '{}'::jsonb, -- routing policy, layer limits, etc.
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE user_quotas (
      user_id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      max_tokens_daily INTEGER DEFAULT 1000000,
      max_cost_daily DECIMAL(10, 2) DEFAULT 10.00,
      current_tokens_today INTEGER DEFAULT 0,
      current_cost_today DECIMAL(10, 6) DEFAULT 0,
      reset_at TIMESTAMP DEFAULT NOW() + INTERVAL '1 day',
      created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE user_roles (
      user_id TEXT,
      project_id TEXT REFERENCES projects(id),
      role TEXT NOT NULL, -- 'viewer', 'developer', 'admin'
      PRIMARY KEY (user_id, project_id)
  );
  
  -- Add project_id to existing tables
  ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id);
  CREATE INDEX idx_conv_project ON conversations(project_id);
  ```

- **Migration Strategy**:
  - Additive only (nullable FK initially)
  - Backfill script for existing data
  - Default organization: "default-org"

- **Quota Enforcement** (`src/quota/enforcer.ts`):
  ```typescript
  interface QuotaCheck {
      allowed: boolean;
      remaining: {
          tokens: number;
          cost: number;
      };
      resetAt: Date;
  }
  
  async function checkQuota(userId: string, projectId: string): Promise<QuotaCheck>
  async function incrementUsage(userId: string, tokens: number, cost: number): Promise<void>
  ```

##### 11. Prompt & Output Policy Hooks
**Scope**: Security scanning + policy enforcement

- **Configuration** (per-project in `projects.config` JSONB):
  ```json
  {
    "security": {
      "scanPrompts": true,
      "scanOutputs": true,
      "secretPatterns": [
        "sk-[a-zA-Z0-9]{32,}",
        "ghp_[a-zA-Z0-9]{36,}",
        "AIza[a-zA-Z0-9_-]{35}"
      ],
      "blockedKeywords": ["DROP TABLE", "rm -rf /"],
      "redactSecrets": true
    },
    "allowList": {
      "domains": ["github.com", "gitlab.com"],
      "commands": ["npm", "git", "docker"]
    }
  }
  ```

- **Implementation** (`src/security/policy-enforcer.ts`):
  ```typescript
  interface PolicyResult {
      allowed: boolean;
      violations: PolicyViolation[];
      sanitizedContent?: string;
  }
  
  interface PolicyViolation {
      type: 'secret_detected' | 'blocked_keyword' | 'unsafe_command';
      pattern: string;
      position: { start: number; end: number };
      severity: 'low' | 'medium' | 'high';
  }
  
  async function checkPromptPolicy(prompt: string, projectId: string): Promise<PolicyResult>
  async function checkOutputPolicy(output: string, projectId: string): Promise<PolicyResult>
  ```

- **Hooks in Router**:
  - Pre-LLM: Scan prompt
  - Post-LLM: Scan output
  - Auto-redact or reject based on policy

**Phase 1 Deliverables**:
- ✅ Complete request tracing system
- ✅ Analytics APIs for cost/usage monitoring
- ✅ Cost anomaly detection background job
- ✅ Multi-tenant schema with quotas
- ✅ Security policy hooks

---

### 🔧 **Phase 2: Core Agent Enhancement** (Weeks 3-4)
**Priority**: HIGH - Direct user value  
**Status**: 📋 Planned

#### Nhóm 1 - Code Agent & MCP Tools

##### 1. Refactor Mode + Spec-first Mode
**Scope**: Two new operational modes for code_agent

**Architecture**:
```typescript
// src/tools/codeAgent/modes.ts
type CodeAgentMode = 'analyze' | 'refactor' | 'specFirst' | 'debug';

interface RefactorModeConfig {
    styleGuide?: {
        eslintConfig?: string;
        prettierConfig?: string;
        customRules?: string[];
    };
    preserveBehavior: boolean;
    targetMetrics?: {
        complexity?: number; // Max cyclomatic complexity
        duplicates?: number; // Max duplicate lines
        coverage?: number; // Min test coverage
    };
}

interface SpecFirstModeConfig {
    testFramework: 'vitest' | 'jest' | 'playwright';
    generateTests: boolean;
    runTests: boolean;
    iterateUntilPass: boolean;
    maxIterations?: number;
}
```

**Refactor Mode Implementation**:
- **Input**: File path + optional style guide
- **Process**:
  1. Parse code with ESLint/TS AST
  2. Detect code smells (complexity, duplication, etc.)
  3. Generate improvement suggestions
  4. Create unified diff patch
  5. Optionally run tests to verify behavior preserved
- **Output**: Patch + metrics comparison

**Files**:
- `src/tools/codeAgent/modes/refactor.ts` (new)
- `src/tools/codeAgent/analyzers/code-smells.ts` (new)
- `src/tools/codeAgent/index.ts` (modify to support modes)

**Example Usage**:
```bash
# CLI
mcp code refactor src/app.ts --style-guide .eslintrc.json

# API
POST /v1/code-agent
{
  "mode": "refactor",
  "files": ["src/app.ts"],
  "config": {
    "styleGuide": { "eslintConfig": ".eslintrc.json" },
    "preserveBehavior": true
  }
}
```

**Spec-First Mode Implementation**:
- **Input**: Feature requirements (natural language)
- **Process**:
  1. Generate test cases (BDD-style)
  2. Write test file (Vitest/Playwright)
  3. Run tests (expected to fail)
  4. Generate implementation code
  5. Iterate: run tests → fix code → repeat
  6. Stop when all tests pass or max iterations
- **Output**: Test file + implementation file + test results

**Files**:
- `src/tools/codeAgent/modes/spec-first.ts` (new)
- `src/tools/codeAgent/generators/test-generator.ts` (new)

**Example Usage**:
```bash
# CLI
mcp code spec-first "Add user authentication with JWT"

# API
POST /v1/code-agent
{
  "mode": "specFirst",
  "requirements": "Add user authentication with JWT",
  "config": {
    "testFramework": "vitest",
    "iterateUntilPass": true,
    "maxIterations": 5
  }
}
```

##### 2. Auto-Triage Test Failures
**Scope**: MCP tool for analyzing test failures

**Tool Definition**:
```typescript
// src/tools/testing/triage.ts
interface TestTriageTool {
    name: 'analyze_test_failure';
    description: 'Analyze test failure logs and suggest fixes';
    inputSchema: {
        testLog: string; // Raw test output
        testFramework: 'vitest' | 'jest' | 'playwright';
        files?: string[]; // Related source files
    };
}

interface TestTriageResult {
    summary: {
        totalFailed: number;
        failureTypes: Record<string, number>; // assertion, timeout, error, etc.
        affectedFiles: string[];
    };
    failures: TestFailureAnalysis[];
    suggestedFixes: CodeFix[];
}

interface TestFailureAnalysis {
    testName: string;
    file: string;
    line: number;
    failureType: 'assertion' | 'timeout' | 'error' | 'exception';
    message: string;
    stackTrace: string;
    rootCause?: string;
}

interface CodeFix {
    file: string;
    description: string;
    patch: string; // Unified diff format
    confidence: number; // 0-1
}
```

**Implementation**:
- **Parser**: Extract test names, failures, stack traces
- **Analyzer**: Pattern match common issues (null checks, async/await, type errors)
- **Fix Generator**: Use LLM to generate targeted patches
- **Validator**: Optionally re-run tests with patch

**Files**:
- `src/tools/testing/triage.ts` (new)
- `src/tools/testing/parsers/vitest-parser.ts` (new)
- `src/tools/testing/parsers/playwright-parser.ts` (new)

**CLI Integration**:
```bash
# New command
mcp tests fix [test-file]

# Examples
mcp tests fix tests/api.test.ts
npm test 2>&1 | mcp tests fix --stdin
```

**Workflow**:
1. Run tests
2. Capture failure output
3. Send to gateway with `analyze_test_failure` tool
4. Display suggested patches
5. Apply with confirmation

##### 3. Repo Map / Project Graph
**Scope**: Static analysis for codebase structure

**Graph Schema**:
```typescript
// src/tools/repoMap/types.ts
interface ProjectGraph {
    nodes: CodeNode[];
    edges: DependencyEdge[];
    metadata: {
        totalFiles: number;
        totalLines: number;
        languages: Record<string, number>;
        frameworks: string[];
    };
}

interface CodeNode {
    id: string;
    type: 'file' | 'module' | 'class' | 'function';
    path: string;
    category: 'core' | 'infra' | 'feature' | 'test' | 'config';
    imports: string[];
    exports: string[];
    loc: number;
    complexity?: number;
}

interface DependencyEdge {
    from: string; // node id
    to: string;
    type: 'import' | 'calls' | 'extends' | 'implements';
    weight: number; // Usage frequency
}
```

**Implementation**:
- **Scanner**: Traverse project files
- **Parser**: Use TypeScript Compiler API for accurate parsing
- **Categorizer**: ML-based or rule-based classification
- **Graph Builder**: Build adjacency list

**Files**:
- `src/tools/repoMap/scanner.ts` (new)
- `src/tools/repoMap/parser.ts` (new)
- `src/tools/repoMap/graph-builder.ts` (new)

**MCP Tool**:
```typescript
{
    name: 'repo_map',
    description: 'Generate project structure graph',
    inputSchema: {
        rootPath: string;
        includeTests: boolean;
        maxDepth: number;
    }
}
```

**CLI Command**:
```bash
mcp repo map [path] --output graph.json --visualize
```

**Usage in Code Agent**:
- Pre-load graph as context for refactoring
- Identify affected files when making changes
- Suggest related files to update

**Phase 2 Deliverables**:
- ✅ Refactor mode with style guide support
- ✅ Spec-first TDD mode
- ✅ Test failure auto-triage tool
- ✅ Repo map generation
- ✅ CLI commands for all features

---

### 📊 **Phase 3: Intelligent Routing** (Weeks 5-6)
**Priority**: MEDIUM - Optimization  
**Status**: 📋 Planned

#### Nhóm 2 - Routing & Cost Optimization

##### 4. Policy-based Routing per Project
**Scope**: Project-specific routing configuration

**Config File Format** (`ai-mcp.config.json`):
```json
{
  "version": "1.0",
  "routing": {
    "defaultLayer": "L1",
    "maxLayer": "L2",
    "maxCostPerRequest": 0.10,
    "maxContextTokens": 8000,
    "filePatterns": {
      "**/*.svelte": {
        "preferredModels": ["qwen/qwen-2.5-coder-32b-instruct:free"],
        "maxLayer": "L1",
        "taskType": "code"
      },
      "**/*.sql": {
        "preferredModels": ["anthropic/claude-3-haiku"],
        "maxLayer": "L2",
        "taskType": "code"
      },
      "**/*.test.ts": {
        "preferredModels": ["openai/gpt-4o-mini"],
        "maxLayer": "L1",
        "taskType": "code"
      }
    },
    "taskOverrides": {
      "refactor": { "maxLayer": "L1" },
      "debug": { "maxLayer": "L2" },
      "production": { "maxLayer": "L3", "crossCheck": true }
    }
  },
  "features": {
    "enableCrossCheck": true,
    "enableAutoEscalate": false,
    "enableCache": true
  }
}
```

**YAML Support** (`.ai-mcp.yml`):
```yaml
version: "1.0"
routing:
  defaultLayer: L1
  maxLayer: L2
  maxCostPerRequest: 0.10
  filePatterns:
    "**/*.svelte":
      preferredModels: 
        - qwen/qwen-2.5-coder-32b-instruct:free
      maxLayer: L1
```

**Implementation**:
- **Config Loader** (`src/config/project-config.ts`):
  ```typescript
  interface ProjectConfig {
      version: string;
      routing: RoutingPolicy;
      features: FeatureFlags;
  }
  
  async function loadProjectConfig(projectId: string): Promise<ProjectConfig>
  async function validateConfig(config: unknown): Promise<ValidationResult>
  ```

- **Router Integration**:
  - Load config per request (cached in Redis)
  - Override global settings
  - Pattern matching for file-specific rules

**Files**:
- `src/config/project-config.ts` (new)
- `src/routing/router.ts` (modify to use project config)
- `src/api/server.ts` (add config upload endpoint)

**API Endpoints**:
```typescript
POST /v1/projects/:projectId/config   // Upload config
GET  /v1/projects/:projectId/config   // Get current config
PUT  /v1/projects/:projectId/config   // Update config
```

**CLI Integration**:
```bash
mcp config init        # Create ai-mcp.config.json template
mcp config validate    # Validate current config
mcp config upload      # Upload to gateway
```

##### 5. Dynamic Quality Level (Risk/Criticality)
**Scope**: Request-level quality control

**Request Schema Extension**:
```typescript
interface RoutingContext {
    // Existing fields...
    quality: 'draft' | 'normal' | 'high' | 'production';
    
    // NEW: Risk level
    riskLevel?: 'low' | 'normal' | 'high' | 'prod-critical';
    criticality?: {
        affectsProduction: boolean;
        securitySensitive: boolean;
        dataLoss: boolean;
        userFacing: boolean;
    };
}
```

**Routing Logic** (`src/routing/risk-router.ts`):
```typescript
function selectLayerByRisk(riskLevel: RiskLevel): Layer {
    switch (riskLevel) {
        case 'low':
            return 'L0'; // Free models only
        case 'normal':
            return 'L1'; // Cheap, fast
        case 'high':
            return 'L2'; // Better quality
        case 'prod-critical':
            return 'L3'; // Best models, double-check
    }
}

async function routeWithRisk(
    request: Request,
    context: RoutingContext
): Promise<RoutingResult> {
    const layer = selectLayerByRisk(context.riskLevel || 'normal');
    
    // Prod-critical: Always cross-check
    if (context.riskLevel === 'prod-critical') {
        context.enableCrossCheck = true;
        context.enableAutoEscalate = false; // Require confirmation
    }
    
    // High risk: Use multiple models
    if (context.riskLevel === 'high') {
        return await crossCheckWithArbitrator(request, layer);
    }
    
    return await routeToLayer(request, layer);
}
```

**Implementation Details**:
- Low risk: Skip expensive checks, use cache aggressively
- Normal: Current behavior
- High: Enable cross-check, prefer better models
- Prod-critical: Force L3, double-check, require human confirmation

**Files**:
- `src/routing/risk-router.ts` (new)
- `src/routing/router.ts` (integrate risk logic)
- `src/types/routing.ts` (add risk types)

**API Usage**:
```bash
POST /v1/route
{
  "message": "Deploy to production",
  "riskLevel": "prod-critical",
  "criticality": {
    "affectsProduction": true,
    "userFacing": true
  }
}
```

**CLI Integration**:
```bash
mcp code --risk high refactor.ts
mcp chat --risk prod-critical "Review security patch"
```

##### 6. Route Replay / Simulator
**Scope**: Test routing strategies without re-executing

**Schema**:
```typescript
interface RouteSimulation {
    originalTraceId: string;
    simulationConfig: {
        layers: Layer[];
        models?: string[];
        enableCrossCheck?: boolean;
    };
    results: SimulationResult[];
}

interface SimulationResult {
    strategy: string; // "L0-only", "L1-L2", etc.
    estimatedCost: number;
    estimatedLatency: number;
    modelUsed: string;
    fromCache: boolean;
    confidence?: number; // If we have actual result to compare
}
```

**Implementation** (`src/routing/simulator.ts`):
```typescript
async function simulateRouting(
    traceId: string,
    strategies: RoutingStrategy[]
): Promise<RouteSimulation> {
    // 1. Load original trace
    const trace = await db.query('SELECT * FROM request_traces WHERE id = $1', [traceId]);
    
    // 2. For each strategy
    const results = await Promise.all(strategies.map(async (strategy) => {
        // Check if cached response exists
        const cached = await checkCache(trace.request_payload, strategy.models);
        
        return {
            strategy: strategy.name,
            estimatedCost: calculateCost(strategy, trace),
            estimatedLatency: estimateLatency(strategy, cached),
            modelUsed: strategy.models[0],
            fromCache: !!cached,
        };
    }));
    
    return { originalTraceId: traceId, simulationConfig: {}, results };
}
```

**API Endpoint**:
```typescript
POST /v1/routing/simulate
{
    "traceId": "trace-123",
    "strategies": [
        { "name": "L0-only", "layers": ["L0"] },
        { "name": "L1-L2", "layers": ["L1", "L2"] },
        { "name": "all-layers", "layers": ["L0", "L1", "L2", "L3"] }
    ]
}
```

**CLI Command**:
```bash
mcp route simulate <trace-id> --strategies L0,L1,L2

# Output:
# Strategy      | Cost    | Latency | Model              | Cached
# --------------|---------|---------|--------------------|---------
# L0-only       | $0.001  | 850ms   | llama-3.3-70b:free | No
# L1-L2         | $0.015  | 1200ms  | gpt-4o-mini        | Yes
# all-layers    | $0.045  | 2500ms  | claude-3.5-sonnet  | No
```

**Use Cases**:
- A/B test routing strategies before deploying
- Analyze cost/quality tradeoffs
- Optimize for budget or latency
- Validate policy changes

**Files**:
- `src/routing/simulator.ts` (new)
- `src/api/server.ts` (add simulate endpoint)
- `cli/src/commands/route-simulate.ts` (new)

**Phase 3 Deliverables**:
- ✅ Project-level config files (JSON/YAML)
- ✅ File pattern-based model selection
- ✅ Risk-based routing with criticality levels
- ✅ Route replay simulator
- ✅ CLI tools for config & simulation

---

### 🧠 **Phase 4: Knowledge & Context Management** (Weeks 7-8)
**Priority**: MEDIUM - Advanced features  
**Status**: 📋 Planned

#### Nhóm 5 - Knowledge Management

##### 12. Semantic Code Search / Embeddings
**Scope**: Vector search for code snippets

**Database Schema**:
```sql
-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE code_embeddings (
    id SERIAL PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    file_path TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_start_line INTEGER,
    chunk_end_line INTEGER,
    embedding vector(1536), -- OpenAI ada-002 or similar
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for faster search)
CREATE INDEX ON code_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_embeddings_project ON code_embeddings(project_id);
CREATE INDEX idx_embeddings_file ON code_embeddings(file_path);
```

**Types** (`src/embeddings/types.ts`):
```typescript
interface CodeEmbedding {
    id: number;
    projectId: string;
    filePath: string;
    chunkText: string;
    chunkStartLine: number;
    chunkEndLine: number;
    embedding: number[]; // 1536-dim vector
    metadata: {
        language?: string;
        type?: 'function' | 'class' | 'interface' | 'comment';
        symbols?: string[];
    };
}

interface SearchQuery {
    query: string; // Natural language or code snippet
    projectId?: string;
    filePattern?: string;
    topK?: number;
    threshold?: number; // Similarity threshold (0-1)
}

interface SearchResult {
    filePath: string;
    chunkText: string;
    lineRange: { start: number; end: number };
    similarity: number;
    metadata: Record<string, unknown>;
}
```

**Implementation** (`src/embeddings/`):

**Chunking Strategy**:
```typescript
// src/embeddings/chunker.ts
interface CodeChunk {
    text: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'block' | 'comment';
}

async function chunkFile(
    filePath: string,
    content: string
): Promise<CodeChunk[]> {
    // Strategy:
    // 1. Parse with TS/JS parser
    // 2. Extract functions, classes, interfaces
    // 3. Split large blocks into ~200 line chunks
    // 4. Preserve context (include docstrings)
}
```

**Embedding Generation**:
```typescript
// src/embeddings/generator.ts
import { callLLM } from '../tools/llm/client.js';

async function generateEmbedding(text: string): Promise<number[]> {
    // Use OpenAI text-embedding-ada-002 or similar
    const response = await callLLM({
        model: 'text-embedding-ada-002',
        input: text
    });
    return response.embedding;
}

async function indexProject(projectId: string, rootPath: string): Promise<void> {
    // 1. Scan all files
    // 2. Chunk each file
    // 3. Generate embeddings
    // 4. Store in DB
}
```

**Search**:
```typescript
// src/embeddings/search.ts
async function semanticSearch(
    query: SearchQuery
): Promise<SearchResult[]> {
    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(query.query);
    
    // 2. Vector similarity search
    const sql = `
        SELECT 
            file_path,
            chunk_text,
            chunk_start_line,
            chunk_end_line,
            metadata,
            1 - (embedding <=> $1::vector) as similarity
        FROM code_embeddings
        WHERE project_id = $2
            AND (1 - (embedding <=> $1::vector)) > $3
        ORDER BY embedding <=> $1::vector
        LIMIT $4
    `;
    
    const results = await db.query(sql, [
        `[${queryEmbedding.join(',')}]`,
        query.projectId,
        query.threshold || 0.7,
        query.topK || 10
    ]);
    
    return results.rows;
}
```

**MCP Tool**:
```typescript
// src/tools/search/code-search.ts
export const codeSearchTool = {
    name: 'code_search',
    description: 'Search codebase using natural language or code snippets',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string' },
            projectId: { type: 'string' },
            topK: { type: 'number', default: 10 }
        },
        required: ['query']
    },
    handler: async (args: Record<string, unknown>) => {
        const results = await semanticSearch(args as SearchQuery);
        return { results };
    }
};
```

**CLI Command**:
```bash
# Index project
mcp search index [path]

# Search
mcp search "function that handles authentication"
mcp search "WHERE user_id =" --type sql

# Output:
# 📂 src/auth/handler.ts (lines 45-67) - similarity: 0.92
# export async function handleAuth(req: Request) {
#   const token = req.headers.authorization;
#   ...
# }
```

**Files**:
- `src/embeddings/types.ts` (new)
- `src/embeddings/chunker.ts` (new)
- `src/embeddings/generator.ts` (new)
- `src/embeddings/search.ts` (new)
- `src/tools/search/code-search.ts` (new)
- `cli/src/commands/search.ts` (new)

##### 13. Knowledge Packs per Project
**Scope**: Build searchable knowledge base from docs

**Schema**:
```sql
CREATE TABLE knowledge_packs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    documents JSONB NOT NULL, -- Array of document objects
    summary TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE knowledge_documents (
    id SERIAL PRIMARY KEY,
    pack_id TEXT REFERENCES knowledge_packs(id),
    doc_type TEXT NOT NULL, -- 'readme', 'adr', 'architecture', 'api'
    title TEXT,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Types**:
```typescript
interface KnowledgePack {
    id: string;
    projectId: string;
    name: string;
    description: string;
    documents: KnowledgeDocument[];
    summary: string;
}

interface KnowledgeDocument {
    id: number;
    packId: string;
    docType: 'readme' | 'adr' | 'architecture' | 'api' | 'guide';
    title: string;
    content: string;
    metadata: {
        filePath?: string;
        lastModified?: string;
        tags?: string[];
    };
}
```

**Pack Builder**:
```typescript
// src/knowledge/pack-builder.ts
async function buildKnowledgePack(
    projectId: string,
    config: {
        includeDocs: string[]; // Glob patterns
        includeADRs: boolean;
        includeArchitecture: boolean;
    }
): Promise<KnowledgePack> {
    // 1. Scan for relevant files
    const files = await findDocFiles(config);
    
    // 2. Parse and categorize
    const docs = await Promise.all(files.map(parseDocument));
    
    // 3. Generate summary
    const summary = await generatePackSummary(docs);
    
    // 4. Store in DB
    return await saveKnowledgePack({ projectId, documents: docs, summary });
}
```

**Context Injection**:
```typescript
// src/context/knowledge-injector.ts
async function injectKnowledgeContext(
    conversationId: string,
    task: string
): Promise<string> {
    // 1. Get project from conversation
    const conv = await db.queryOne('SELECT project_id FROM conversations WHERE id = $1', [conversationId]);
    
    // 2. Search relevant knowledge
    const relevantDocs = await searchKnowledgePacks(conv.project_id, task);
    
    // 3. Build context string
    return `
Project Knowledge:
${relevantDocs.map(doc => `- ${doc.title}: ${doc.content.substring(0, 500)}...`).join('\n')}
`;
}
```

**CLI**:
```bash
mcp knowledge build --include "docs/**/*.md" --include "ADRs/*.md"
mcp knowledge list
mcp knowledge search "authentication flow"
```

##### 14. Long-running Profile Sessions
**Scope**: Persistent work sessions with memory

**Schema**:
```sql
CREATE TABLE session_profiles (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL, -- 'refactor-auth', 'debug-performance'
    type TEXT NOT NULL, -- 'refactor', 'debug', 'feature', 'review'
    summary TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP DEFAULT NOW()
);

-- Link conversations to profiles
ALTER TABLE conversations ADD COLUMN profile_id TEXT REFERENCES session_profiles(id);
CREATE INDEX idx_conv_profile ON conversations(profile_id);
```

**Types**:
```typescript
interface SessionProfile {
    id: string;
    projectId: string;
    name: string;
    type: 'refactor' | 'debug' | 'feature' | 'review' | 'planning';
    summary: string;
    context: {
        goals?: string[];
        completedTasks?: string[];
        currentFocus?: string;
        filesInScope?: string[];
        decisions?: Array<{ date: string; decision: string; rationale: string }>;
    };
}
```

**Profile Manager**:
```typescript
// src/profiles/manager.ts
async function createProfile(
    projectId: string,
    name: string,
    type: string,
    initialGoals: string[]
): Promise<SessionProfile> {
    const profile = {
        id: `profile-${Date.now()}`,
        projectId,
        name,
        type,
        summary: '',
        context: { goals: initialGoals, completedTasks: [], filesInScope: [] }
    };
    
    await db.insert('session_profiles', profile);
    return profile;
}

async function updateProfileContext(
    profileId: string,
    updates: Partial<SessionProfile['context']>
): Promise<void> {
    await db.update('session_profiles', 
        { id: profileId },
        { context: updates, last_active: new Date() }
    );
}
```

**CLI**:
```bash
# Create profile
mcp profile create "refactor-auth" --type refactor --goals "Improve auth security,Add 2FA,Refactor token handling"

# Switch to profile
mcp profile use refactor-auth

# Work within profile (all commands now use this context)
mcp code src/auth/handler.ts "Add 2FA support"

# Check progress
mcp profile status
# Refactor Auth Session
# Goals: 3/3 completed
# Files modified: 8
# Last active: 2 hours ago

# List all profiles
mcp profile list
```

**Integration with Code Agent**:
- Profile context automatically injected into prompts
- Agent remembers previous decisions
- Tracks files modified in this session
- Can resume work after days/weeks

**Phase 4 Deliverables**:
- ✅ Semantic code search with pgvector
- ✅ Knowledge packs from docs/ADRs
- ✅ Long-running profile sessions
- ✅ Context injection for code agent

---

### 💻 **Phase 5: CLI & UX Improvements** (Weeks 9-10)
**Priority**: MEDIUM - Developer experience  
**Status**: 📋 Planned

#### Nhóm 6 - CLI Enhancement

##### 15. `mcp apply` + Interactive Patch Review
**Scope**: Safe patch application with user control

**Implementation** (`cli/src/commands/apply.ts`):
```typescript
interface PatchHunk {
    file: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
    context: string; // Surrounding lines for preview
}

async function interactivePatchApply(patch: string): Promise<void> {
    // 1. Parse unified diff
    const hunks = parsePatch(patch);
    
    // 2. For each hunk, show diff and prompt
    for (const hunk of hunks) {
        console.log(chalk.cyan(`\n📝 ${hunk.file} (lines ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines})`));
        displayHunk(hunk);
        
        const action = await prompt('Apply this change? [y/n/e/q/a] ');
        
        switch (action) {
            case 'y': // Yes, apply this hunk
                await applyHunk(hunk);
                console.log(chalk.green('✓ Applied'));
                break;
            case 'n': // No, skip
                console.log(chalk.yellow('⊘ Skipped'));
                break;
            case 'e': // Edit before applying
                const edited = await editHunk(hunk);
                await applyHunk(edited);
                console.log(chalk.green('✓ Applied (edited)'));
                break;
            case 'q': // Quit
                return;
            case 'a': // Apply all remaining
                await applyAllHunks(hunks.slice(hunks.indexOf(hunk)));
                return;
        }
    }
}
```

**Display Format**:
```bash
📝 src/auth/handler.ts (lines 45-52)

  43 |   const token = req.headers.authorization;
  44 |   if (!token) {
- 45 |     throw new Error('No token');
+ 45 |     throw new AuthError('Missing authorization token');
+ 46 |     logger.warn('Authentication attempt without token');
  46 |   }
  47 |   return validateToken(token);

Apply this change? [y/n/e/q/a] 
  y - yes, apply
  n - no, skip
  e - edit before applying
  q - quit
  a - apply all remaining
```

**CLI Integration**:
```bash
# From diff command
mcp diff src/app.ts "Add error handling" | mcp apply --interactive

# From file
mcp apply patch.diff --interactive

# Auto-apply (dangerous)
mcp apply patch.diff --yes
```

##### 16. `mcp history` & `mcp replay`
**Scope**: Command history and replay functionality

**History Storage**:
```typescript
// Store in ~/.mcp/history.json
interface CommandHistory {
    commands: HistoryEntry[];
}

interface HistoryEntry {
    id: string;
    timestamp: Date;
    command: string;
    args: string[];
    mode: 'chat' | 'code' | 'diff' | 'analyze';
    files?: string[];
    conversationId?: string;
    cost?: number;
    models?: string[];
    success: boolean;
    error?: string;
}
```

**History Command**:
```bash
mcp history [--last n] [--mode MODE]

# Output:
# ID       | Time     | Command                        | Cost    | Status
# ---------|----------|--------------------------------|---------|--------
# abc123   | 10:30 AM | code refactor src/app.ts       | $0.015  | ✓
# def456   | 10:25 AM | chat "explain async/await"     | $0.002  | ✓
# ghi789   | 10:20 AM | diff src/handler.ts "add logs" | $0.008  | ✗
```

**Replay Command**:
```typescript
// cli/src/commands/replay.ts
async function replayCommand(historyId: string, options: {
    dryRun?: boolean;
    updateFiles?: boolean;
}): Promise<void> {
    // 1. Load history entry
    const entry = await loadHistoryEntry(historyId);
    
    // 2. Check if files changed
    if (entry.files) {
        const changes = await detectFileChanges(entry.files);
        if (changes.length > 0) {
            console.log(chalk.yellow(`⚠️  ${changes.length} files changed since original run`));
            changes.forEach(c => console.log(`  - ${c.file}`));
        }
    }
    
    // 3. Reconstruct command
    const command = reconstructCommand(entry);
    
    // 4. Execute
    if (options.dryRun) {
        console.log(chalk.dim('Would run:'), command);
    } else {
        await executeCommand(command);
    }
}
```

**Usage**:
```bash
# Show what would be replayed
mcp replay abc123 --dry-run

# Replay command
mcp replay abc123

# Replay with fresh file state
mcp replay abc123 --update-files
```

##### 17. `mcp doctor`
**Scope**: Health check and troubleshooting

**Checks** (`cli/src/commands/doctor.ts`):
```typescript
interface DiagnosticCheck {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    fix?: string; // Suggested fix command
}

async function runDiagnostics(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    
    // 1. Check endpoint connectivity
    try {
        const response = await fetch(`${endpoint}/health`);
        if (response.ok) {
            checks.push({ name: 'Gateway connectivity', status: 'pass', message: 'Connected' });
        } else {
            checks.push({ 
                name: 'Gateway connectivity', 
                status: 'fail', 
                message: `HTTP ${response.status}`,
                fix: 'Check if gateway is running: docker-compose ps'
            });
        }
    } catch (error) {
        checks.push({ 
            name: 'Gateway connectivity', 
            status: 'fail', 
            message: 'Cannot reach gateway',
            fix: `Start gateway: docker-compose up -d`
        });
    }
    
    // 2. Check API key
    if (!process.env.MCP_API_KEY) {
        checks.push({ 
            name: 'API Key', 
            status: 'warn', 
            message: 'No API key configured',
            fix: 'Set MCP_API_KEY environment variable'
        });
    } else {
        checks.push({ name: 'API Key', status: 'pass', message: 'Configured' });
    }
    
    // 3. Check CLI version vs server version
    const serverVersion = await getServerVersion();
    const cliVersion = require('../../package.json').version;
    
    if (serverVersion !== cliVersion) {
        checks.push({ 
            name: 'Version compatibility', 
            status: 'warn', 
            message: `CLI ${cliVersion}, Server ${serverVersion}`,
            fix: 'Update CLI: npm install -g @ai-mcp-gateway/cli@latest'
        });
    } else {
        checks.push({ name: 'Version compatibility', status: 'pass', message: `v${cliVersion}` });
    }
    
    // 4. Check Redis connectivity
    const health = await fetch(`${endpoint}/health`).then(r => r.json());
    if (health.redis) {
        checks.push({ name: 'Redis cache', status: 'pass', message: 'Connected' });
    } else {
        checks.push({ name: 'Redis cache', status: 'warn', message: 'Not connected' });
    }
    
    // 5. Check available models
    if (health.providers && Object.keys(health.providers).length > 0) {
        checks.push({ 
            name: 'LLM Providers', 
            status: 'pass', 
            message: `${Object.keys(health.providers).length} providers available`
        });
    } else {
        checks.push({ 
            name: 'LLM Providers', 
            status: 'fail', 
            message: 'No providers configured',
            fix: 'Add API keys to .env.docker'
        });
    }
    
    return checks;
}
```

**Output**:
```bash
mcp doctor

🔍 Running diagnostics...

✓ Gateway connectivity        Connected
✓ API Key                     Configured
⚠ Version compatibility       CLI v0.2.0, Server v0.1.9
  Fix: npm install -g @ai-mcp-gateway/cli@latest
✓ Redis cache                 Connected
✓ LLM Providers              3 providers available

2 warnings, 0 errors
```

##### 18. Git Hooks Templates
**Scope**: Pre-commit/pre-push hooks for code quality

**Hook Templates** (`cli/templates/git-hooks/`):

**pre-commit**:
```bash
#!/bin/bash
# .git/hooks/pre-commit
# Auto-generated by: mcp hooks install

echo "🔍 Running MCP pre-commit checks..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|tsx|jsx)$')

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

# Check each file
for FILE in $STAGED_FILES; do
    echo "  Checking $FILE..."
    
    # Run code analysis
    mcp code "$FILE" --check-only --quiet
    if [ $? -ne 0 ]; then
        echo "❌ Issues found in $FILE"
        echo "   Run: mcp code $FILE --fix"
        exit 1
    fi
done

echo "✓ All checks passed"
exit 0
```

**pre-push**:
```bash
#!/bin/bash
# .git/hooks/pre-push

echo "🔍 Running MCP pre-push checks..."

# Get changed files in current branch
CHANGED_FILES=$(git diff --name-only origin/main..HEAD | grep -E '\.(ts|js)$')

if [ -z "$CHANGED_FILES" ]; then
    exit 0
fi

# Check for potential refactoring opportunities
echo "  Analyzing code quality..."
mcp analyze "$CHANGED_FILES" --suggestions-only > /tmp/mcp-suggestions.txt

if [ -s /tmp/mcp-suggestions.txt ]; then
    echo "⚠️  Code quality suggestions:"
    cat /tmp/mcp-suggestions.txt
    echo ""
    read -p "Continue push? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

exit 0
```

**CLI Commands**:
```bash
# Install hooks
mcp hooks install [--pre-commit] [--pre-push]

# Uninstall
mcp hooks uninstall

# List available hooks
mcp hooks list

# Test hook
mcp hooks test pre-commit
```

**Phase 5 Deliverables**:
- ✅ Interactive patch application
- ✅ Command history with replay
- ✅ Health diagnostics command
- ✅ Git hooks templates

---

### 🌐 **Phase 6: Web Interface** (Weeks 11-12)
**Priority**: LOW - Nice to have  
**Status**: 📋 Planned

#### Nhóm 7 - Web UI

##### 19. Minimal Web Console
**Scope**: Simple web UI for monitoring and configuration

**Tech Stack**:
- **Frontend**: React + TypeScript + Vite
- **UI Library**: Tailwind CSS + shadcn/ui
- **State**: Zustand or React Query
- **Charts**: Recharts or Chart.js

**Project Structure**:
```
web/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx      # Overview, stats
│   │   ├── Analytics.tsx      # Cost/usage charts
│   │   ├── Traces.tsx         # Request traces
│   │   ├── Projects.tsx       # Project config
│   │   └── Settings.tsx       # Global settings
│   ├── components/
│   │   ├── StatCard.tsx
│   │   ├── CostChart.tsx
│   │   ├── TraceViewer.tsx
│   │   ├── ModelSelector.tsx
│   │   └── ConfigEditor.tsx
│   ├── hooks/
│   │   ├── useHealth.ts
│   │   ├── useAnalytics.ts
│   │   └── useTraces.ts
│   └── api/
│       └── client.ts          # API wrapper
├── package.json
└── vite.config.ts
```

**Dashboard Page**:
```typescript
// web/src/pages/Dashboard.tsx
export function Dashboard() {
    const { data: health } = useHealth();
    const { data: stats } = useServerStats();
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Cards */}
            <StatCard 
                title="Total Requests" 
                value={stats?.requests.total}
                trend="+12%" 
            />
            <StatCard 
                title="Total Cost" 
                value={`$${stats?.llm.cost.total.toFixed(2)}`}
                trend="-5%" 
            />
            <StatCard 
                title="Avg Latency" 
                value={`${stats?.requests.averageDuration}ms`} 
            />
            
            {/* Provider Status */}
            <div className="col-span-3">
                <h2>Providers</h2>
                <ProviderGrid providers={health?.providers} />
            </div>
            
            {/* Cost Chart */}
            <div className="col-span-3">
                <CostChart data={stats?.costHistory} />
            </div>
            
            {/* Recent Traces */}
            <div className="col-span-3">
                <RecentTraces limit={10} />
            </div>
        </div>
    );
}
```

**Analytics Page**:
```typescript
// web/src/pages/Analytics.tsx
export function Analytics() {
    const [dateRange, setDateRange] = useState({ start: '2025-11-01', end: '2025-12-01' });
    const { data } = useAnalytics(dateRange);
    
    return (
        <div className="space-y-6">
            {/* Date Range Picker */}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            
            {/* Cost Breakdown */}
            <div className="grid grid-cols-2 gap-4">
                <PieChart 
                    title="Cost by Layer"
                    data={data?.breakdown.byLayer} 
                />
                <PieChart 
                    title="Cost by Model"
                    data={data?.breakdown.byModel} 
                />
            </div>
            
            {/* Timeline */}
            <LineChart 
                title="Daily Usage"
                data={data?.breakdown.byDay}
                xKey="date"
                yKeys={['cost', 'tokens']}
            />
            
            {/* Table */}
            <DataTable 
                columns={['Model', 'Requests', 'Tokens', 'Cost']}
                data={data?.models}
            />
        </div>
    );
}
```

**Trace Viewer**:
```typescript
// web/src/components/TraceViewer.tsx
export function TraceViewer({ traceId }: { traceId: string }) {
    const { data: trace } = useTrace(traceId);
    
    return (
        <div className="space-y-4">
            {/* Overview */}
            <div className="grid grid-cols-4 gap-2">
                <InfoItem label="Request Type" value={trace?.requestType} />
                <InfoItem label="Total Cost" value={`$${trace?.totalCost}`} />
                <InfoItem label="Duration" value={`${trace?.totalDurationMs}ms`} />
                <InfoItem label="Conversation" value={trace?.conversationId} />
            </div>
            
            {/* Routing Decisions */}
            <Card title="Routing Decisions">
                <Timeline>
                    {trace?.routingDecisions.map((decision, i) => (
                        <TimelineItem key={i}>
                            <strong>{decision.layer}</strong>: {decision.reason}
                            <br/>
                            <small>Model: {decision.modelSelected}</small>
                        </TimelineItem>
                    ))}
                </Timeline>
            </Card>
            
            {/* LLM Calls */}
            <Card title="LLM Calls">
                <Table>
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Provider</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                            <th>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trace?.llmCalls.map((call, i) => (
                            <tr key={i}>
                                <td>{call.model}</td>
                                <td>{call.provider}</td>
                                <td>{call.inputTokens + call.outputTokens}</td>
                                <td>${call.cost.toFixed(4)}</td>
                                <td>{call.durationMs}ms</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Card>
            
            {/* Tool Calls */}
            {trace?.toolCalls && trace.toolCalls.length > 0 && (
                <Card title="Tool Calls">
                    <Accordion>
                        {trace.toolCalls.map((tool, i) => (
                            <AccordionItem key={i} title={tool.toolName}>
                                <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </Card>
            )}
        </div>
    );
}
```

**Project Config Editor**:
```typescript
// web/src/pages/Projects.tsx
export function ProjectConfig({ projectId }: { projectId: string }) {
    const { data: config, mutate } = useProjectConfig(projectId);
    const [editing, setEditing] = useState(false);
    
    const handleSave = async (newConfig: ProjectConfig) => {
        await mutate(newConfig);
        setEditing(false);
    };
    
    if (editing) {
        return (
            <ConfigEditor 
                config={config}
                onSave={handleSave}
                onCancel={() => setEditing(false)}
            />
        );
    }
    
    return (
        <div>
            <Button onClick={() => setEditing(true)}>Edit Config</Button>
            
            <CodeBlock language="json">
                {JSON.stringify(config, null, 2)}
            </CodeBlock>
        </div>
    );
}
```

**API Integration**:
```typescript
// web/src/api/client.ts
export class GatewayAPIClient {
    constructor(private baseUrl: string) {}
    
    async getHealth() {
        return fetch(`${this.baseUrl}/health`).then(r => r.json());
    }
    
    async getServerStats() {
        return fetch(`${this.baseUrl}/v1/server-stats`).then(r => r.json());
    }
    
    async getAnalytics(params: AnalyticsQuery) {
        const query = new URLSearchParams(params);
        return fetch(`${this.baseUrl}/v1/analytics/by-project?${query}`)
            .then(r => r.json());
    }
    
    async getTrace(traceId: string) {
        return fetch(`${this.baseUrl}/v1/traces/${traceId}`)
            .then(r => r.json());
    }
    
    async updateProjectConfig(projectId: string, config: ProjectConfig) {
        return fetch(`${this.baseUrl}/v1/projects/${projectId}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).then(r => r.json());
    }
}
```

##### 20. Multi-model Playground
**Scope**: Compare models side-by-side

**Playground Page**:
```typescript
// web/src/pages/Playground.tsx
export function Playground() {
    const [prompt, setPrompt] = useState('');
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [results, setResults] = useState<ModelResult[]>([]);
    const [loading, setLoading] = useState(false);
    
    const handleRun = async () => {
        setLoading(true);
        
        // Run all models in parallel
        const responses = await Promise.all(
            selectedModels.map(model => 
                runModel(model, prompt)
            )
        );
        
        setResults(responses);
        setLoading(false);
    };
    
    return (
        <div className="grid grid-cols-1 gap-4">
            {/* Input */}
            <Card>
                <Textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your prompt..."
                    rows={4}
                />
                
                <ModelSelector 
                    selected={selectedModels}
                    onChange={setSelectedModels}
                    maxModels={4}
                />
                
                <Button onClick={handleRun} disabled={!prompt || selectedModels.length === 0}>
                    Run Comparison
                </Button>
            </Card>
            
            {/* Results Grid */}
            {loading ? (
                <LoadingSpinner />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((result, i) => (
                        <Card key={i}>
                            <CardHeader>
                                <h3>{result.model}</h3>
                                <div className="flex gap-2 text-sm text-gray-500">
                                    <span>💰 ${result.cost.toFixed(4)}</span>
                                    <span>⏱️ {result.durationMs}ms</span>
                                    <span>📊 {result.tokens} tokens</span>
                                </div>
                            </CardHeader>
                            <CardBody>
                                <Markdown>{result.response}</Markdown>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}
            
            {/* Comparison Table */}
            {results.length > 0 && (
                <Card>
                    <h3>Comparison</h3>
                    <Table>
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th>Response Length</th>
                                <th>Cost</th>
                                <th>Latency</th>
                                <th>Tokens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((result, i) => (
                                <tr key={i}>
                                    <td>{result.model}</td>
                                    <td>{result.response.length} chars</td>
                                    <td>${result.cost.toFixed(4)}</td>
                                    <td>{result.durationMs}ms</td>
                                    <td>{result.tokens}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Card>
            )}
        </div>
    );
}
```

**Deployment**:
- Serve as static files from gateway API server
- Or separate Vite dev server in development
- Nginx in production with `/web` route

**Phase 6 Deliverables**:
- ✅ Web dashboard with real-time stats
- ✅ Analytics visualizations
- ✅ Trace viewer with detailed breakdown
- ✅ Project configuration editor
- ✅ Multi-model playground

---

## Next Steps

### Immediate Actions
1. **Create feature branches**:
   - `feature/phase1-tracing`
   - `feature/phase1-multi-tenant`
   - `feature/phase2-code-agent-modes`

2. **Database migrations**:
   - Write migration scripts for Phase 1 schema
   - Test on development database
   - Prepare rollback procedures

3. **Documentation**:
   - API specification for new endpoints
   - CLI usage examples
   - Configuration file schemas

### Development Workflow
Each feature follows:
1. **Design review** (this document)
2. **Schema/API design** (types, interfaces)
3. **Implementation** (code + tests)
4. **Integration** (update existing components)
5. **Documentation** (README, API docs)
6. **Deployment** (migration scripts, env vars)

### Testing Strategy
- **Unit tests**: All new modules
- **Integration tests**: API endpoints, database queries
- **E2E tests**: CLI commands, full workflows
- **Performance tests**: Routing latency, query performance

---

## Questions & Decisions

### Phase 1
- [ ] Which vector database for embeddings? (pgvector vs dedicated service)
- [ ] Webhook format for anomaly alerts? (Slack, Discord, generic)
- [ ] Migration schedule for adding project_id to existing tables?

### Phase 2
- [ ] AST parser choice? (TypeScript Compiler API vs Babel)
- [ ] Maximum iterations for spec-first mode?
- [ ] Graph visualization format? (D3.js, Mermaid, Graphviz)

### Phase 3
- [ ] Config file validation: strict or permissive?
- [ ] Simulation cache duration?
- [ ] Risk level auto-detection heuristics?

---

**Ready to start implementation!** 🚀

Choose a phase or specific feature to begin detailed implementation.
