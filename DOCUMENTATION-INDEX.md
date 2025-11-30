# Documentation Index

This document provides an overview of all documentation files in the AI MCP Gateway project.

## 📚 Core Documentation

### [README.md](./README.md)
**Main project documentation** - Start here!
- Quick start guides (Docker & Local)
- Architecture overview
- Feature highlights
- API usage examples
- Installation and configuration

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**System architecture and design**
- Stateless design principles
- Two-tier caching architecture
- Database schema
- Component interactions
- Design decisions

## 🚀 Getting Started

### [DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md)
**Quick Docker deployment** (Recommended for beginners)
- One-command setup
- Docker Compose configuration
- Environment setup
- Health checks

### [DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)
**Advanced Docker deployment**
- Production deployment strategies
- Multi-container orchestration
- Scaling considerations
- Networking and volumes

### [QUICK-REFERENCE.md](./QUICK-REFERENCE.md)
**Command cheat sheet**
- Common commands
- API endpoints quick reference
- Environment variables
- Troubleshooting quick tips

## 🔧 Features & Guides

### [PROVIDER-FALLBACK-GUIDE.md](./PROVIDER-FALLBACK-GUIDE.md)
**Provider health & fallback system**
- Automatic provider fallback
- Health monitoring
- Fallback configuration
- Troubleshooting provider issues

### [SERVER-STATS-GUIDE.md](./SERVER-STATS-GUIDE.md)
**Server monitoring & statistics**
- `/v1/server-stats` endpoint
- Real-time metrics
- Cost tracking
- Performance monitoring

### [SELF-IMPROVEMENT.md](./SELF-IMPROVEMENT.md)
**Self-improvement infrastructure**
- Regression test generation
- Routing heuristics optimization
- Bug pattern tracking
- Performance analytics

## 🧪 Testing & Development

### [TESTING.md](./TESTING.md)
**Comprehensive testing guide**
- Unit tests
- Integration tests
- E2E tests with Playwright
- Writing new tests
- CI/CD integration

## 📊 Implementation Notes

### [IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md)
**Provider fallback system implementation**
- Health check manager
- Fallback logic
- Configuration details
- Test results

### [IMPROVEMENTS-SUMMARY.md](./IMPROVEMENTS-SUMMARY.md)
**Complete improvements log**
- All 12 major features
- Code statistics
- Architecture changes
- Deployment guide

### [IMPROVEMENTS.md](./IMPROVEMENTS.md)
**Detailed improvement notes**
- Feature-by-feature breakdown
- Technical decisions
- Migration guides

### [CLI-DEVELOPMENT-COMPLETE.md](./CLI-DEVELOPMENT-COMPLETE.md)
**CLI tool implementation**
- CLI development summary
- Features implemented
- Usage examples
- Integration with gateway

## 🛠️ CLI Tool

### [cli/README.md](./cli/README.md)
**CLI tool main documentation**
- Installation
- Commands (chat, code, diff)
- Configuration
- Examples

### [cli/QUICKSTART.md](./cli/QUICKSTART.md)
**CLI quick start**
- 5-minute setup
- Basic usage
- Common workflows

### [cli/IMPLEMENTATION.md](./cli/IMPLEMENTATION.md)
**CLI technical details**
- Architecture
- HTTP client
- Command implementations

## 📖 Reference Documents

### [docs/API-GUIDE.md](./docs/API-GUIDE.md)
**Complete HTTP API reference**
- All endpoints documented
- Request/response schemas
- Authentication
- Error codes

### [docs/ai-common-bugs-and-fixes.md](./docs/ai-common-bugs-and-fixes.md)
**Bug tracking**
- Known issues
- Root causes
- Fixes and workarounds

### [docs/ai-orchestrator-notes.md](./docs/ai-orchestrator-notes.md)
**Orchestration patterns**
- Successful patterns
- Best practices
- Lessons learned

### [docs/ai-routing-heuristics.md](./docs/ai-routing-heuristics.md)
**Routing rules**
- When to escalate
- Model capabilities
- Routing decision tree

## 📁 Documentation Structure

```
ai-mcp-gateway/
├── README.md                          # Start here
├── QUICK-REFERENCE.md                 # Cheat sheet
├── ARCHITECTURE.md                    # System design
│
├── Getting Started/
│   ├── DOCKER-QUICKSTART.md          # Fastest start
│   └── DOCKER-DEPLOYMENT.md          # Production deploy
│
├── Features/
│   ├── PROVIDER-FALLBACK-GUIDE.md    # Provider fallback
│   ├── SERVER-STATS-GUIDE.md         # Monitoring
│   └── SELF-IMPROVEMENT.md           # Self-learning
│
├── Development/
│   ├── TESTING.md                    # Testing guide
│   ├── IMPLEMENTATION-SUMMARY.md     # Recent changes
│   ├── IMPROVEMENTS-SUMMARY.md       # All improvements
│   └── IMPROVEMENTS.md               # Detailed notes
│
├── CLI/
│   ├── CLI-DEVELOPMENT-COMPLETE.md   # CLI summary
│   └── cli/
│       ├── README.md                 # CLI docs
│       ├── QUICKSTART.md             # CLI quick start
│       └── IMPLEMENTATION.md         # CLI internals
│
└── Reference/
    └── docs/
        ├── API-GUIDE.md              # API reference
        ├── ai-common-bugs-and-fixes.md
        ├── ai-orchestrator-notes.md
        └── ai-routing-heuristics.md
```

## 🎯 Quick Navigation by Task

### I want to...

**Get started quickly**
→ [DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md)

**Understand the architecture**
→ [ARCHITECTURE.md](./ARCHITECTURE.md)

**Use the HTTP API**
→ [README.md](./README.md#http-api-usage) + [docs/API-GUIDE.md](./docs/API-GUIDE.md)

**Use the CLI tool**
→ [cli/QUICKSTART.md](./cli/QUICKSTART.md)

**Monitor the server**
→ [SERVER-STATS-GUIDE.md](./SERVER-STATS-GUIDE.md)

**Configure provider fallback**
→ [PROVIDER-FALLBACK-GUIDE.md](./PROVIDER-FALLBACK-GUIDE.md)

**Write tests**
→ [TESTING.md](./TESTING.md)

**Deploy to production**
→ [DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)

**Understand recent changes**
→ [IMPROVEMENTS-SUMMARY.md](./IMPROVEMENTS-SUMMARY.md)

**Contribute to the project**
→ [README.md](./README.md#contributing)

## 📝 Document Maintenance

### Active Documents
These are actively maintained and should be kept up-to-date:
- README.md
- ARCHITECTURE.md
- QUICK-REFERENCE.md
- All guides in root (DOCKER-*, SERVER-*, PROVIDER-*, TESTING.md)
- cli/ documentation

### Reference Documents
These capture historical context and implementation details:
- IMPLEMENTATION-SUMMARY.md
- IMPROVEMENTS-SUMMARY.md
- IMPROVEMENTS.md
- CLI-DEVELOPMENT-COMPLETE.md

### Auto-Generated
These should not be edited manually:
- (None currently)

---

**Last Updated**: November 30, 2025
