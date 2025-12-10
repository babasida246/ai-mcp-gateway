# Feature Summary — AI MCP Gateway

This document provides a concise, high-level summary of the project's main features and components.

## 1) Core Gateway

- N-layer routing (L0 → L3): attempt low-cost/free models first, escalate when needed.
- Priority-based selection within each layer; deterministic fallback and retries.
- Provider abstraction: supports OpenRouter, OpenAI, Anthropic, and on-prem OSS models.
- Per-project budgets and cost tracking with enforcement to prevent overspend.
- HTTP API compatible with OpenAI-style endpoints for easy client integration.

## 2) MCP Server

- Runs as a standalone Model Context Protocol (MCP) server for clients like Claude Desktop and VS Code.
- Exposes MCP tools for task-specific operations (chat routing, code analysis, network ops, cost reports).
- Configurable transport and logging options.

## 3) Admin Dashboard (React)

- Real-time metrics: requests, tokens, costs, latency, and provider health.
- Model and provider management: enable/disable, priority, layer, API keys.
- Alerts & notifications: set thresholds and delivery channels.
- Web Terminal: execute commands (local/SSH/Telnet) with command history and autocompletion.

## 4) CLI (`mcp`)

- Developer-focused utilities: `mcp code`, `mcp create-project`, `mcp mcp-serve`, and admin helpers.
- `mcp code` supports preview mode, safe apply (`--apply`) with backups, and auto file selection from prompts.
- Non-destructive defaults: preview only, explicit `--apply` to write; interactive confirm and `--yes` for CI.

## 5) Data & Persistence

- PostgreSQL: primary storage for models, configuration, and analytics.
- Redis: optional caching layer for rate-limiting, session cache, and short-lived state.
- Migrations included under `migrations/`.

## 6) Integrations & Extensibility

- Provider adapters: implement new providers with a clear adapter interface.
- MCP tool extensions: add task-specific MCP tools that map to router/adapter flows.
- Plugin points: middleware hooks for request enrichment, auditing, and custom routing policies.

## 7) Testing & Deployment

- Unit tests with Vitest, E2E with Playwright.
- Docker & docker-compose for local full-stack development and staging deployment.
- CI-friendly CLI usage: non-interactive flags for automated workflows.

## 8) Security & Governance

- Secrets management via environment variables; recommend vault or KMS for production.
- Role-based access controls in the Admin Dashboard (planned/extension point).
- Audit logs for request tracing and cost attribution.

---

If you want, I can:

- Expand each section into a full `docs/` page (architecture, operations, developer guide).
- Update `docs/ARCHITECTURE.md` and `docs/API-GUIDE.md` to link and reference these summaries.
- Generate a short `RELEASE_NOTES.md` style changelog for contributors.

Which of the above should I do next?