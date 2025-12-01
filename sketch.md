# AI MCP Gateway - Project Sketch

## Overview
AI MCP Gateway is a comprehensive platform for managing AI model providers, routing requests, caching, and providing an admin dashboard for monitoring and configuration. It integrates multiple AI providers (OpenAI, Anthropic, etc.), supports database persistence, caching with Redis, and offers a modern web-based admin interface.

## Architecture
The project follows a modular architecture with:
- **API Server**: Express.js-based REST API for handling requests
- **MCP Server**: Model Context Protocol server for AI interactions
- **Admin Dashboard**: React-based web interface for management
- **Database Layer**: PostgreSQL for data persistence
- **Cache Layer**: Redis for performance optimization
- **Routing Engine**: Intelligent request routing based on cost, availability, and performance

## Folder Structure

### Root Level
- `ARCHITECTURE.md` - System architecture documentation
- `eslint.config.js` - ESLint configuration
- `IMPROVEMENTS-SUMMARY.md` - Summary of improvements
- `IMPROVEMENTS.md` - Improvement plans
- `LICENSE` - Project license
- `new-feature.md` - New feature documentation
- `package.json` - Node.js dependencies and scripts
- `playwright.config.ts` - Playwright testing configuration
- `quick-start.js` - Quick start script
- `README.md` - Main project documentation
- `SELF-IMPROVEMENT.md` - Self-improvement notes
- `TESTING.md` - Testing guidelines
- `tsconfig.json` - TypeScript configuration
- `tsup.config.ts` - Build configuration
- `vitest.config.ts` - Vitest testing configuration

### docs/
Documentation folder containing detailed guides:
- `ai-common-bugs-and-fixes.md` - Common issues and solutions
- `ai-orchestrator-notes.md` - Orchestrator implementation notes
- `ai-routing-heuristics.md` - Routing logic documentation

### playwright/
End-to-end testing:
- `example.spec.ts` - Example test specifications

### src/
Main source code:
- `index.ts` - Main entry point
- `api/server.ts` - API server implementation
- `cache/redis.ts` - Redis caching logic
- `config/env.ts` - Environment configuration
- `config/models.ts` - Model configurations
- `context/manager.ts` - Context management
- `db/postgres.ts` - PostgreSQL database operations
- `handoff/builder.ts` - Handoff builder logic
- `improvement/manager.ts` - Improvement management
- `improvement/tools/index.ts` - Improvement tools
- `logging/logger.ts` - Logging utilities
- `logging/metrics.ts` - Metrics collection
- `mcp/server.ts` - MCP server implementation
- `mcp/types.ts` - MCP type definitions
- `routing/cost.ts` - Cost calculation for routing
- `routing/router.ts` - Request routing logic
- `tools/` - Tool integrations:
  - `cache/index.ts` - Cache tools
  - `codeAgent/index.ts` - Code agent tools
  - `codeAgent/instructions.md` - Code agent instructions
  - `db/index.ts` - Database tools
  - `fs/index.ts` - File system tools
  - `git/index.ts` - Git tools
  - `llm/` - LLM integrations:
    - `anthropic.ts` - Anthropic API client
    - `client.ts` - Generic LLM client
    - `index.ts` - LLM tools index
    - `openai.ts` - OpenAI API client
    - `openrouter.ts` - OpenRouter API client
    - `oss-local.ts` - Local OSS model client
  - `testing/index.ts` - Testing tools
  - `todo/manager.ts` - Todo management

### tests/
Testing suite:
- `integration/` - Integration tests:
  - `api.test.ts` - API integration tests
  - `context.test.ts` - Context integration tests
- `regression/` - Regression tests:
  - `bugs.test.ts` - Bug regression tests
- `unit/` - Unit tests:
  - `cache.test.ts` - Cache unit tests
  - `config.test.ts` - Configuration unit tests
  - `db.test.ts` - Database unit tests
  - `routing.test.ts` - Routing unit tests

## Key Functionality

### Core Features
1. **Multi-Provider AI Integration**
   - Support for OpenAI, Anthropic, OpenRouter, and local OSS models
   - Dynamic provider switching and load balancing
   - API key management and rotation

2. **Intelligent Routing**
   - Cost-based routing optimization
   - Performance monitoring and failover
   - Model availability checking

3. **Caching System**
   - Redis-based response caching
   - Configurable TTL and cache invalidation
   - Performance metrics tracking

4. **Database Persistence**
   - PostgreSQL for storing configurations, logs, and metrics
   - Migration support and connection pooling
   - Query optimization and indexing

5. **Admin Dashboard**
   - React/TypeScript frontend with Tailwind CSS
   - Provider management (enable/disable, API key config)
   - Model management (add/remove, layer toggles)
   - Analytics and monitoring
   - Alert system and notifications
   - Docker logs viewing
   - Gateway token management

### API Endpoints
- `/api/providers` - Provider management
- `/api/models` - Model configuration
- `/api/routing` - Request routing
- `/api/cache` - Cache operations
- `/api/metrics` - Performance metrics
- `/api/logs` - Logging endpoints

### MCP Server
- Model Context Protocol implementation
- Tool execution and management
- Context-aware AI interactions

### Tools Integration
- Code analysis and generation
- Database operations
- File system management
- Git operations
- Testing automation
- Todo management

## Technology Stack
- **Backend**: Node.js, TypeScript, Express.js
- **Database**: PostgreSQL, Redis
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Testing**: Vitest, Playwright
- **Deployment**: Docker, Nginx
- **Build Tools**: tsup, ESLint

## Development Workflow
1. Development with hot reload (Vite)
2. TypeScript compilation and linting
3. Unit and integration testing
4. Docker containerization
5. Production deployment with Nginx

## Configuration
- Environment-based configuration (`config/env.ts`)
- Model definitions (`config/models.ts`)
- Build and test configurations

## Monitoring and Logging
- Structured logging with metrics
- Performance monitoring
- Error tracking and alerting
- Docker container logs integration

## Security
- API key management and rotation
- Input validation and sanitization
- Secure database connections
- Container security best practices

## Future Improvements
- Real-time WebSocket updates
- Multi-user authentication and RBAC
- Advanced analytics and reporting
- Plugin architecture for extensibility
- Cloud-native deployment options