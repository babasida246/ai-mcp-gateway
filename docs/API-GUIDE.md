# API Gateway - Hướng Dẫn Sử Dụng

## Tổng Quan

AI MCP Gateway hiện đã hỗ trợ đầy đủ các tính năng:

- ✅ **Stateless HTTP API** - Nhiều client có thể gọi vào gateway qua HTTP
- ✅ **Redis Cache Layer** - Cache LLM responses và context để tối ưu chi phí
- ✅ **PostgreSQL Database** - Lưu trữ dài hạn conversations, messages, logs
- ✅ **Context Management** - Ghi nhớ conversation qua Redis + Database
- ✅ **N-layer Dynamic Routing** - Tự động chọn model phù hợp theo chi phí/chất lượng
- ✅ **Cross-check & Escalation** - Xác minh kết quả và escalate khi cần
- ✅ **Handoff Builder** - Tối ưu prompt khi chuyển giữa các layers

## Cài Đặt

### 1. Cài đặt Dependencies

```bash
npm install
```

### 2. Cấu hình Environment Variables

Tạo file `.env`:

```env
# API Keys
OPENROUTER_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/ai_mcp_gateway
# Hoặc
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=your_password

# API Server
API_PORT=3000
API_HOST=0.0.0.0
API_CORS_ORIGIN=*

# Routing
DEFAULT_LAYER=L0
ENABLE_CROSS_CHECK=true
ENABLE_AUTO_ESCALATE=true
MAX_ESCALATION_LAYER=L2
```

### 3. Khởi động Redis

```bash
# Docker
docker run -d -p 6379:6379 redis:alpine

# Hoặc cài đặt local
redis-server
```

### 4. Khởi động PostgreSQL

```bash
# Docker
docker run -d \
  -e POSTGRES_DB=ai_mcp_gateway \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:15-alpine
```

### 5. Chạy Database Migration

```bash
npm run db:migrate
# Hoặc
node dist/db/migrate.js
```

### 6. Build và Start

```bash
# Build
npm run build

# Start API server
npm run start:api
# Hoặc
MODE=api node dist/index.js
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "redis": true,
  "database": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### POST /v1/route - Intelligent Routing

Gửi request và để gateway tự động chọn model phù hợp.

```bash
curl -X POST http://localhost:3000/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "message": "Explain recursion in simple terms",
    "userId": "user-1",
    "metadata": {
      "quality": "normal"
    }
  }'
```

Response:
```json
{
  "result": {
    "response": "Recursion is when a function calls itself...",
    "model": "oss-llama-3-8b",
    "provider": "oss-local"
  },
  "routing": {
    "summary": "Single model: oss-llama-3-8b (layer L0)",
    "fromCache": false
  },
  "context": {
    "conversationId": "conv-123"
  },
  "performance": {
    "durationMs": 1234,
    "tokens": {
      "input": 50,
      "output": 200
    },
    "cost": 0.0001
  }
}
```

### POST /v1/code-agent - Code Agent

Sử dụng code agent với quality cao.

```bash
curl -X POST http://localhost:3000/v1/code-agent \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-456",
    "task": "Write a TypeScript function to validate email addresses",
    "userId": "user-1",
    "projectId": "my-project"
  }'
```

### POST /v1/chat - General Chat

Chat đơn giản với context.

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-789",
    "message": "Hello, how are you?",
    "userId": "user-1"
  }'
```

### GET /v1/context/:conversationId - Get Context

Lấy context của một conversation.

```bash
curl http://localhost:3000/v1/context/conv-123
```

Response:
```json
{
  "conversationId": "conv-123",
  "summary": {
    "conversationId": "conv-123",
    "stack": ["TypeScript", "Node.js"],
    "architecture": "MCP Gateway",
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  },
  "recentMessages": [
    {
      "role": "user",
      "content": "Explain recursion",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /v1/context/:conversationId - Update Context

Cập nhật context summary.

```bash
curl -X POST http://localhost:3000/v1/context/conv-123 \
  -H "Content-Type: application/json" \
  -d '{
    "summary": {
      "stack": ["TypeScript", "React"],
      "architecture": "Microservices"
    }
  }'
```

### POST /v1/cache/clear - Clear Cache

Xóa cache.

```bash
# Clear specific conversation
curl -X POST http://localhost:3000/v1/cache/clear \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123"
  }'

# Clear by pattern
curl -X POST http://localhost:3000/v1/cache/clear \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "llm:cache:*"
  }'
```

### GET /v1/stats - Global Statistics

Lấy thống kê toàn cục.

```bash
# Basic stats
curl "http://localhost:3000/v1/stats"

# Stats by model
curl "http://localhost:3000/v1/stats?groupBy=model"

# Stats by layer
curl "http://localhost:3000/v1/stats?groupBy=layer"

# Filter by date
curl "http://localhost:3000/v1/stats?startDate=2024-01-01&endDate=2024-01-31"
```

Response:
```json
{
  "totalCalls": 100,
  "totalCost": 0.52,
  "totalTokens": {
    "input": 5000,
    "output": 10000
  },
  "cacheHitRate": 0.25,
  "byModel": {
    "oss-llama-3-8b": {
      "calls": 60,
      "cost": 0.0,
      "tokens": {
        "input": 3000,
        "output": 6000
      }
    },
    "claude-sonnet-4": {
      "calls": 40,
      "cost": 0.52,
      "tokens": {
        "input": 2000,
        "output": 4000
      }
    }
  }
}
```

### GET /v1/stats/conversation/:conversationId - Conversation Stats

Thống kê cho một conversation cụ thể.

```bash
curl http://localhost:3000/v1/stats/conversation/conv-123
```

Response:
```json
{
  "conversationId": "conv-123",
  "messageCount": 10,
  "llmCalls": 5,
  "totalCost": 0.05,
  "totalTokens": {
    "input": 500,
    "output": 1000
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

## Workflow Ví Dụ

### 1. CLI Client

```bash
# Tạo conversation mới
CONV_ID="cli-$(uuidgen)"

# Gửi request
curl -X POST http://localhost:3000/v1/route \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"message\": \"Create a simple web server in Node.js\",
    \"mode\": \"cli\",
    \"metadata\": {
      \"client\": \"cli\",
      \"quality\": \"high\"
    }
  }"

# Tiếp tục conversation
curl -X POST http://localhost:3000/v1/route \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"message\": \"Add error handling to it\"
  }"
```

### 2. Telegram Bot Integration

```javascript
// bot.js
const GATEWAY_URL = 'http://localhost:3000';

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const conversationId = `tg:${chatId}`;

  const response = await fetch(`${GATEWAY_URL}/v1/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      message: msg.text,
      mode: 'telegram',
      metadata: {
        client: 'telegram',
        telegramChatId: chatId,
      },
    }),
  });

  const data = await response.json();
  bot.sendMessage(chatId, data.result.response);
});
```

### 3. Web UI Integration

```javascript
// frontend.js
async function sendMessage(message) {
  const conversationId = localStorage.getItem('conversationId') 
    || `web-${Date.now()}`;
  
  const response = await fetch('http://localhost:3000/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      message,
      mode: 'web',
      userId: getCurrentUserId(),
    }),
  });

  const data = await response.json();
  localStorage.setItem('conversationId', conversationId);
  
  return data.result.response;
}
```

## N-Layer Routing

Gateway tự động chọn layer phù hợp:

- **L0** (Free/OSS): Llama 3, Mistral, Qwen - Chi phí thấp nhất
- **L1** (Mid-tier): GPT-4o-mini, Claude Haiku - Cân bằng chi phí/chất lượng
- **L2** (Premium): Claude Sonnet 4, GPT-4o - Chất lượng cao nhất

### Cross-check

Khi `ENABLE_CROSS_CHECK=true`:
- Gọi 2 model trong cùng layer
- Model A tạo solution
- Model B review solution
- Nếu có conflict → gọi model C làm arbitrator

### Auto-escalation

Khi `ENABLE_AUTO_ESCALATE=true`:
- Nếu cross-check phát hiện conflicts
- Tự động escalate lên layer cao hơn
- Tối đa đến `MAX_ESCALATION_LAYER`

## Scripts Hữu Ích

Thêm vào `package.json`:

```json
{
  "scripts": {
    "db:migrate": "node dist/db/migrate.js",
    "start:api": "MODE=api node dist/index.js",
    "start:mcp": "node dist/index.js",
    "dev:api": "MODE=api npm run dev",
    "stats": "curl http://localhost:3000/v1/stats | jq"
  }
}
```

## Monitoring

### View logs

```bash
tail -f logs/ai-mcp-gateway.log
```

### Check Redis

```bash
redis-cli
> KEYS *
> GET conv:summary:conv-123
```

### Check Database

```bash
psql -U postgres -d ai_mcp_gateway

SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10;
SELECT model_id, COUNT(*), SUM(estimated_cost) FROM llm_calls GROUP BY model_id;
```

## Troubleshooting

### Redis không connect

```bash
# Kiểm tra Redis đang chạy
redis-cli ping
# Hoặc
docker ps | grep redis
```

### Database migration lỗi

```bash
# Drop và recreate database
psql -U postgres
DROP DATABASE ai_mcp_gateway;
CREATE DATABASE ai_mcp_gateway;
\q

# Run migration lại
npm run db:migrate
```

### API không start

```bash
# Kiểm tra port đã được sử dụng
netstat -ano | findstr :3000

# Thay đổi port trong .env
API_PORT=3001
```

## Performance Tips

1. **Enable caching**: Đặt `REDIS_HOST` đúng để cache hoạt động
2. **Start with L0**: Dùng `DEFAULT_LAYER=L0` để tiết kiệm chi phí
3. **Use cross-check selectively**: Chỉ bật cho tasks quan trọng
4. **Monitor costs**: Thường xuyên check `/v1/stats` để theo dõi chi phí

## Tích Hợp Client

Xem thêm ví dụ client tại:
- `examples/cli-client/` - CLI client
- `examples/telegram-bot/` - Telegram bot
- `examples/web-ui/` - Web interface

(Sẽ được tạo trong tương lai)
