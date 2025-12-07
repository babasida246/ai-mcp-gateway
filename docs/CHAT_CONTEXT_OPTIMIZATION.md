# Chat Context Optimization

## Tổng quan

Chat Context Optimization là hệ thống quản lý context thông minh cho các cuộc hội thoại dài, giúp:
- **Giảm token usage** mà vẫn giữ được context quan trọng
- **Tăng relevance** bằng cách retrieve các đoạn hội thoại liên quan
- **Tự động summarize** các phần cũ của conversation

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chat Context Optimization                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ TokenEstimator  │  │ EmbeddingService │  │  SpanRetriever  │ │
│  │                 │  │                  │  │                 │ │
│  │ - Ước tính      │  │ - Tạo embedding  │  │ - Similarity    │ │
│  │   token count   │  │ - Hỗ trợ nhiều   │  │   search        │ │
│  │ - Character-    │  │   providers      │  │ - Span          │ │
│  │   based         │  │ - Retry logic    │  │   expansion     │ │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘ │
│           │                    │                      │          │
│           └──────────┬─────────┴──────────────────────┘          │
│                      ▼                                           │
│           ┌─────────────────────┐                                │
│           │ ChatContextBuilder  │                                │
│           │                     │                                │
│           │ - Strategy pattern  │                                │
│           │ - Budget management │                                │
│           │ - Summarization     │                                │
│           └─────────┬───────────┘                                │
│                     │                                            │
│                     ▼                                            │
│           ┌─────────────────────┐                                │
│           │    Integration      │                                │
│           │                     │                                │
│           │ - API adapter       │                                │
│           │ - DB persistence    │                                │
│           │ - Embedding queue   │                                │
│           └─────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## Strategies

### 1. `full` - Không tối ưu
- Include tất cả messages trong conversation
- Dùng khi conversation ngắn hoặc cần full context
- Không có token savings

### 2. `last-n` - N messages gần nhất
- Chỉ include N messages cuối cùng
- Simple và nhanh
- Mất context từ đầu conversation

### 3. `summary+recent` - Summary + Recent (Mặc định)
- Combine:
  - Summary của các messages cũ (auto-generated)
  - N messages gần nhất
- Cân bằng giữa context và token usage
- Tự động trigger summarization khi cần

### 4. `span-retrieval` - Semantic Search
- Dùng embedding để tìm các đoạn hội thoại liên quan
- Algorithm:
  1. Generate embedding cho user message hiện tại
  2. Similarity search trong messages cũ (pgvector)
  3. Expand các hit thành spans (±radius)
  4. Combine spans + recent messages
- Tốt nhất cho long conversations với nhiều topics

## Configuration

```typescript
interface ChatContextConfig {
  // Strategy selection
  strategy: 'full' | 'last-n' | 'summary+recent' | 'span-retrieval';
  
  // Token budget
  maxPromptTokens: number;      // Default: 4096
  
  // Recent messages
  recentMinMessages: number;    // Default: 4 (always include)
  recentMaxMessages: number;    // Default: 20
  
  // Span retrieval settings
  spanTopK: number;             // Default: 5 (top hits)
  spanRadius: number;           // Default: 2 (expand ±2 messages)
  spanBudgetRatio: number;      // Default: 0.4 (40% budget for spans)
  spanMinSimilarity: number;    // Default: 0.7
  
  // Summarization
  summarizationThreshold: number; // Default: 2000 tokens
  
  // System prompt
  systemPrompt?: string;
}
```

### Per-Model Token Limits

```typescript
// Auto-adjusted based on model
'gpt-4'      -> maxPromptTokens: 8192
'claude-3'   -> maxPromptTokens: 100000
'gpt-3.5'    -> maxPromptTokens: 4096
```

## Database Schema

### Migration: `007_chat_context_optimization.sql`

```sql
-- Thêm vào bảng messages
ALTER TABLE messages ADD COLUMN turn_index INT NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN token_estimate INT;
ALTER TABLE messages ADD COLUMN is_summarized BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN embedding vector(1536);

-- Thêm vào bảng conversations
ALTER TABLE conversations ADD COLUMN summary TEXT;
ALTER TABLE conversations ADD COLUMN summary_token_estimate INT;
ALTER TABLE conversations ADD COLUMN summary_updated_at TIMESTAMP;

-- Indexes
CREATE INDEX idx_messages_embedding_vector 
  ON messages USING ivfflat (embedding vector_cosine_ops);
```

## Usage

### Basic Usage

```typescript
import { buildContextForRequest } from './services/chat';

const result = await buildContextForRequest({
  conversationId: 'conv-123',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'What did we discuss earlier?' }
  ],
  model: 'gpt-4',
  contextStrategy: 'span-retrieval',
});

// result.messages - Optimized messages for LLM
// result.tokenStats.saved - Tokens saved
// result.strategy - Strategy used
```

### Direct ChatContextBuilder

```typescript
import { chatContextBuilder } from './services/chat';

const result = await chatContextBuilder.buildContext({
  conversationId: 'conv-123',
  currentUserMessage: 'What did we discuss about the database design?',
  modelId: 'gpt-4',
  configOverrides: {
    strategy: 'span-retrieval',
    spanTopK: 10,
  },
});
```

### Generate Embeddings

```typescript
import { queueMessageEmbedding, backfillConversationEmbeddings } from './services/chat';

// Queue single message embedding (async, non-blocking)
await queueMessageEmbedding('conv-123', 'New message content');

// Backfill embeddings for conversation
const { processed } = await backfillConversationEmbeddings('conv-123', 20);
```

## Environment Variables

```bash
# Embedding provider configuration
EMBEDDING_PROVIDER=openai          # openai | openrouter | local
EMBEDDING_MODEL_ID=text-embedding-3-small
EMBEDDING_DIMENSION=1536
EMBEDDING_API_KEY=sk-...

# OpenRouter (alternative)
OPENROUTER_API_KEY=sk-or-...
```

## Services

### TokenEstimator

Ước tính số tokens mà không cần API call:
- Character-based estimation (~4 chars/token cho English)
- CJK support (~2 chars/token)
- Code detection (~3.5 chars/token)

```typescript
import { tokenEstimator } from './services/chat';

const tokens = tokenEstimator.estimateTokens('Hello world', 'gpt-4');
// ~2 tokens
```

### EmbeddingService

Generate embeddings với retry logic:

```typescript
import { embeddingService } from './services/chat';

const embedding = await embeddingService.getEmbedding('Some text');
// number[] with dimension 1536

const embeddings = await embeddingService.getBatchEmbeddings(['text1', 'text2']);
// number[][] 
```

### SpanRetriever

Semantic search + span expansion:

```typescript
import { SpanRetriever } from './services/chat';

const spans = await spanRetriever.retrieveRelevantSpans(
  'conv-123',
  'What about the database?',
  { topK: 5, spanRadius: 2 },
  2000  // token budget
);
```

## Integration với Chat API

### Tích hợp vào `/v1/chat/completions`

```typescript
// Trong handleChatCompletions
const contextResult = await buildContextForRequest({
  conversationId: req.body.conversation_id,
  messages: req.body.messages,
  model: req.body.model,
  contextStrategy: req.body.context_strategy,
});

// Sử dụng optimized prompt
const result = await routeRequest({
  prompt: contextResult.prompt,  // hoặc messages: contextResult.messages
  maxTokens: max_tokens,
}, routingOptions);
```

## Performance

### Token Savings Estimate

| Conversation Length | Strategy | Avg Savings |
|---------------------|----------|-------------|
| <20 messages | full | 0% |
| 20-50 messages | last-n | 40-60% |
| 50-100 messages | summary+recent | 60-80% |
| >100 messages | span-retrieval | 70-90% |

### Latency Impact

| Strategy | Additional Latency |
|----------|-------------------|
| full | ~0ms |
| last-n | ~5ms |
| summary+recent | ~20ms (first time: +500ms for summarization) |
| span-retrieval | ~50-100ms (embedding generation) |

## Testing

```bash
# Run tests
npm test -- --grep "ChatContextBuilder"

# Specific test files
npm test -- src/services/chat/__tests__/
```

## Roadmap

- [ ] Cấu hình per-project/per-tool
- [ ] LLM-based summarization (thay vì extractive)
- [ ] Streaming support cho summarization
- [ ] Caching embeddings
- [ ] Multi-language token estimation
