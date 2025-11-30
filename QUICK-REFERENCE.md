# Quick Reference - AI MCP Gateway

## 🚀 Quick Start Commands

```bash
# Setup
npm install
cp .env.example .env
# Edit .env with your credentials

# Start infrastructure
docker run -d -p 6379:6379 redis:alpine
docker run -d -p 5432:5432 -e POSTGRES_DB=ai_mcp_gateway -e POSTGRES_PASSWORD=pass postgres:15-alpine

# Build & migrate
npm run build
npm run db:migrate

# Start server
npm run start:api     # API mode
npm run start:mcp     # MCP mode
```

## 📡 Common API Calls

### Health Check
```bash
curl http://localhost:3000/health
```

### Send Message (Auto Route)
```bash
curl -X POST http://localhost:3000/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "message": "Explain async/await in JavaScript"
  }'
```

### Code Agent
```bash
curl -X POST http://localhost:3000/v1/code-agent \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-456",
    "task": "Create a REST API with Express"
  }'
```

### Get Context
```bash
curl http://localhost:3000/v1/context/conv-123
```

### Clear Cache
```bash
curl -X POST http://localhost:3000/v1/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "conv-123"}'
```

### Get Stats
```bash
# Global stats
curl http://localhost:3000/v1/stats

# Stats by model
curl "http://localhost:3000/v1/stats?groupBy=model"

# Conversation stats
curl http://localhost:3000/v1/stats/conversation/conv-123
```

## 🔍 Debugging Commands

### Check Redis
```bash
redis-cli
> KEYS *
> GET conv:summary:conv-123
> TTL conv:summary:conv-123
> SCAN 0 MATCH llm:cache:*
```

### Check Database
```bash
psql -U postgres -d ai_mcp_gateway

-- List tables
\dt

-- Recent conversations
SELECT id, user_id, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;

-- Recent messages
SELECT conversation_id, role, LEFT(content, 50) as content, created_at 
FROM messages ORDER BY created_at DESC LIMIT 10;

-- LLM call stats
SELECT model_id, COUNT(*), SUM(estimated_cost) as total_cost
FROM llm_calls 
GROUP BY model_id 
ORDER BY total_cost DESC;

-- Cache hit rate
SELECT 
  SUM(CASE WHEN cached THEN 1 ELSE 0 END)::float / COUNT(*) as cache_hit_rate
FROM llm_calls;
```

### Check Logs
```bash
# Tail logs
tail -f logs/ai-mcp-gateway.log

# Search for errors
grep ERROR logs/ai-mcp-gateway.log

# Count requests by endpoint
grep "API request" logs/ai-mcp-gateway.log | cut -d'"' -f4 | sort | uniq -c
```

## 🛠️ Maintenance Commands

### Clear All Cache
```bash
redis-cli FLUSHDB
```

### Reset Database
```bash
psql -U postgres
DROP DATABASE ai_mcp_gateway;
CREATE DATABASE ai_mcp_gateway;
\q

npm run db:migrate
```

### Export Stats
```bash
# Export to JSON
curl http://localhost:3000/v1/stats | jq > stats-$(date +%Y%m%d).json

# Export conversation
psql -U postgres -d ai_mcp_gateway -c \
  "COPY (SELECT * FROM conversations WHERE id='conv-123') TO STDOUT CSV HEADER" \
  > conversation-123.csv
```

### Backup Database
```bash
# Backup
pg_dump -U postgres ai_mcp_gateway > backup-$(date +%Y%m%d).sql

# Restore
psql -U postgres ai_mcp_gateway < backup-20240101.sql
```

## 📊 Monitoring Queries

### Top Expensive Conversations
```sql
SELECT 
  c.id,
  c.user_id,
  SUM(l.estimated_cost) as total_cost,
  COUNT(l.id) as llm_calls
FROM conversations c
JOIN llm_calls l ON c.id = l.conversation_id
GROUP BY c.id, c.user_id
ORDER BY total_cost DESC
LIMIT 10;
```

### Model Performance
```sql
SELECT 
  model_id,
  COUNT(*) as calls,
  AVG(duration_ms) as avg_duration,
  SUM(estimated_cost) as total_cost,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
FROM llm_calls
GROUP BY model_id
ORDER BY calls DESC;
```

### Daily Usage
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as calls,
  SUM(estimated_cost) as cost,
  SUM(input_tokens + output_tokens) as tokens
FROM llm_calls
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🧪 Testing

### Unit Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Visual UI
```

### E2E Tests
```bash
npm run test:e2e
```

### Manual API Tests
```bash
# Use the examples from docs/API-GUIDE.md
# Or import the Postman collection (if created)
```

## 🔧 Development

### Watch Mode
```bash
npm run dev          # Auto-rebuild on changes
```

### Type Check
```bash
npm run type-check
```

### Lint & Format
```bash
npm run lint
npm run format
```

## 🐳 Docker Commands (Optional)

### Run Everything with Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ai_mcp_gateway
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
  
  gateway:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - redis
      - postgres
    environment:
      MODE: api
      REDIS_HOST: redis
      DB_HOST: postgres
```

```bash
docker-compose up -d
docker-compose logs -f gateway
docker-compose down
```

## 📝 Environment Variables Quick Reference

```bash
# API Keys
OPENROUTER_API_KEY=sk-or-v1-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Infrastructure
REDIS_HOST=localhost
DB_HOST=localhost
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_mcp_gateway

# API
API_PORT=3000
MODE=api

# Routing
DEFAULT_LAYER=L0
ENABLE_CROSS_CHECK=true
ENABLE_AUTO_ESCALATE=true
MAX_ESCALATION_LAYER=L2
```

## 🔗 Useful Links

- API Guide: `docs/API-GUIDE.md`
- Implementation Summary: `docs/IMPLEMENTATION-SUMMARY.md`
- Next Steps: `docs/NEXT-STEPS.md`
- Architecture: `ARCHITECTURE.md`
- Testing: `TESTING.md`

---

**💡 Tip**: Bookmark this file for quick reference!
