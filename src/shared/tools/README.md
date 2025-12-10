# Unified Tool System

## Tổng quan

Unified Tool System là một hệ thống công cụ thống nhất có thể được sử dụng cho cả **MCP** (Model Context Protocol) và **API** (REST API), giúp tránh trùng lặp code và dễ dàng bảo trì.

## Tính năng

- ✅ **Single Source of Truth**: Định nghĩa tool một lần, sử dụng cho cả MCP và API
- ✅ **Type Safety**: Sử dụng Zod schema cho validation đầu vào/đầu ra
- ✅ **Middleware Support**: Pre/post processing hooks
- ✅ **Auto Metrics**: Tự động tracking stats (call count, duration, errors)
- ✅ **Category Organization**: Tổ chức tools theo category (ai, database, chat, v.v.)
- ✅ **Flexible Adapters**: Dễ dàng tạo adapter cho các protocol khác

## Cấu trúc

```
src/shared/tools/
├── base.ts              # Core types & interfaces
├── registry.ts          # Tool registry implementation
├── adapters/
│   ├── mcp.ts          # MCP adapter
│   └── api.ts          # API adapter
├── examples/
│   └── index.ts        # Example tools
└── index.ts            # Main exports
```

## Cách sử dụng

### 1. Tạo một tool mới

```typescript
import { z } from 'zod';
import { UnifiedToolDefinition } from '@/shared/tools';

export const myTool: UnifiedToolDefinition<
    { input: string },
    { output: string }
> = {
    name: 'my.tool',
    description: 'My custom tool',
    category: 'ai',
    
    inputSchema: z.object({
        input: z.string().min(1),
    }),
    
    handler: async (input, context) => {
        // Tool logic here
        return {
            success: true,
            data: { output: `Processed: ${input.input}` },
        };
    },
    
    metadata: {
        requiresAuth: false,
        rateLimit: 60,
        tags: ['example'],
    },
};
```

### 2. Đăng ký tool cho MCP

```typescript
import { registerAsMcpTool } from '@/shared/tools';
import { myTool } from './my-tool';

// Đăng ký tool
registerAsMcpTool(myTool);
```

### 3. Đăng ký tool cho API

```typescript
import express from 'express';
import { registerAsApiEndpoint, createToolRoutes } from '@/shared/tools';
import { myTool } from './my-tool';

const router = express.Router();

// Đăng ký tool như API endpoint
registerAsApiEndpoint(myTool, router, {
    path: '/my-tool',
    method: 'post',
});

// Hoặc tạo routes tự động cho tất cả tools
createToolRoutes(router);

app.use('/v1', router);
```

### 4. Sử dụng tool

**MCP:**
```typescript
import { executeMcpTool } from '@/shared/tools';

const result = await executeMcpTool('my.tool', {
    input: 'Hello World',
});
```

**API:**
```bash
curl -X POST http://localhost:3000/v1/my-tool \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello World"}'
```

**Direct:**
```typescript
import { unifiedRegistry } from '@/shared/tools';

const result = await unifiedRegistry.execute('my.tool', 
    { input: 'Hello' },
    {
        executionId: 'test-123',
        userId: 'user-456',
    }
);
```

## Example Tools

### AI Chat Tool
```typescript
import { aiChatTool, unifiedRegistry } from '@/shared/tools';

unifiedRegistry.register(aiChatTool);

const result = await unifiedRegistry.execute('ai.chat', {
    message: 'Explain quantum computing',
    conversationId: 'conv-123',
});
```

### Database Query Tool
```typescript
import { dbQueryTool, unifiedRegistry } from '@/shared/tools';

unifiedRegistry.register(dbQueryTool);

const result = await unifiedRegistry.execute('db.query', {
    query: 'SELECT * FROM users WHERE id = $1',
    params: [123],
});
```

### Context Stats Tool
```typescript
import { contextStatsTool, unifiedRegistry } from '@/shared/tools';

unifiedRegistry.register(contextStatsTool);

const result = await unifiedRegistry.execute('chat.context_stats', {
    conversationId: 'conv-123',
});
```

## Middleware

Thêm middleware để xử lý pre/post hooks:

```typescript
import { unifiedRegistry } from '@/shared/tools';

unifiedRegistry.use({
    before: async (tool, input, context) => {
        console.log(`Executing ${tool.name}`);
        // Auth check, rate limiting, etc.
    },
    
    after: async (tool, input, result, context) => {
        console.log(`Completed ${tool.name}:`, result.success);
        // Logging, metrics, etc.
    },
    
    onError: async (tool, input, error, context) => {
        console.error(`Error in ${tool.name}:`, error);
        // Error tracking, alerting, etc.
    },
});
```

## Tool Statistics

Xem thống kê sử dụng tool:

```typescript
import { unifiedRegistry } from '@/shared/tools';

// Single tool stats
const stats = unifiedRegistry.getStats('ai.chat');
console.log(stats);
// {
//   callCount: 150,
//   errorCount: 2,
//   avgDuration: 1250,
//   lastCalled: Date,
// }

// All tools stats
const allStats = unifiedRegistry.getAllStats();
console.log(allStats);
```

## Migration từ tool cũ

### Từ MCP tool cũ:

```typescript
// Cũ (MCP-only)
export const oldMcpTool: McpToolDefinition = {
    name: 'old.tool',
    description: 'Old tool',
    inputSchema: { ... },
    handler: async (input) => { ... },
};

// Mới (Unified)
export const newTool: UnifiedToolDefinition = {
    name: 'old.tool',
    description: 'Old tool',
    category: 'ai',
    inputSchema: z.object({ ... }),
    handler: async (input, context) => {
        // Logic giống nhau
        return { success: true, data: result };
    },
};

// Đăng ký cho MCP
registerAsMcpTool(newTool);
```

### Từ API endpoint cũ:

```typescript
// Cũ (API-only)
router.post('/old-endpoint', async (req, res) => {
    try {
        const result = await doSomething(req.body);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mới (Unified)
const oldEndpointTool: UnifiedToolDefinition = {
    name: 'old.endpoint',
    description: 'Old endpoint as tool',
    category: 'system',
    inputSchema: z.object({ ... }),
    handler: async (input, context) => {
        try {
            const result = await doSomething(input);
            return { success: true, data: result };
        } catch (error) {
            return {
                success: false,
                error: {
                    code: 'ERROR',
                    message: error.message,
                },
            };
        }
    },
};

registerAsApiEndpoint(oldEndpointTool, router);
```

## Best Practices

1. **Tên tool**: Sử dụng format `category.action` (e.g., `ai.chat`, `db.query`)
2. **Input validation**: Luôn dùng Zod schema chi tiết
3. **Error handling**: Return structured errors với code và message
4. **Metadata**: Thêm tags, examples để dễ tìm kiếm
5. **Rate limiting**: Set rate limit phù hợp cho từng tool
6. **Documentation**: Mô tả rõ ràng input/output trong schema

## Lợi ích

- 🎯 **DRY**: Không lặp lại code cho MCP và API
- 🛡️ **Type Safe**: Zod validation tự động
- 📊 **Metrics**: Auto tracking performance
- 🔌 **Pluggable**: Dễ thêm adapter mới (WebSocket, gRPC, v.v.)
- 🧪 **Testable**: Test logic một lần, dùng được cho cả MCP và API
- 📈 **Scalable**: Dễ thêm tools mới, tổ chức theo category

## API Endpoints (tự động)

Khi dùng `createToolRoutes(router)`, các endpoints sau được tạo tự động:

- `GET /tools` - List all tools (with optional category/tags filter)
- `GET /tools/stats` - Get all tools statistics
- `GET /tools/:name` - Get specific tool info
- `POST /tools/:name` - Execute a tool (khi dùng `registerAsApiEndpoint`)
