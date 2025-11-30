# Hướng Dẫn Cấu Hình Provider Fallback

## 📋 Tổng Quan

Hệ thống `ai-mcp-gateway` giờ đã được nâng cấp với khả năng tự động chuyển đổi giữa các LLM providers dựa trên tình trạng kết nối thực tế. Khi một provider fail, hệ thống sẽ tự động fallback sang provider khác còn hoạt động.

## 🔄 Cơ Chế Fallback

### Thứ Tự Ưu Tiên:
1. **Provider gốc** (OpenAI hoặc Claude nếu được cấu hình)
2. **OpenRouter** (với models được cấu hình thay thế)
3. **OSS Local** (Ollama - nếu được bật)

### Khi Nào Fallback Xảy Ra:
- Provider không có API key
- Provider không phản hồi (timeout)
- Provider trả về lỗi (rate limit, outage, etc.)
- Health check đánh dấu provider không khả dụng

## ⚙️ Cấu Hình File .env

### 1. **Chỉ Dùng OpenRouter** (Recommended cho bắt đầu)

```bash
# Chỉ cần OpenRouter API key
OPENROUTER_API_KEY=your_key_here

# Không cần OpenAI/Claude
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# Models fallback (free models)
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free

# Models thay thế (nếu có request cần OpenAI/Claude format)
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet
```

### 2. **OpenAI + OpenRouter Fallback**

```bash
# Primary provider
OPENAI_API_KEY=your_openai_key

# Fallback provider
OPENROUTER_API_KEY=your_openrouter_key

# Model thay thế khi OpenAI fail
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini

# Free models cho fallback
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct
```

### 3. **OpenRouter + Local Model**

```bash
# Primary
OPENROUTER_API_KEY=your_key

# Secondary: Local Ollama
OSS_MODEL_ENABLED=true
OSS_MODEL_ENDPOINT=http://localhost:11434
OSS_MODEL_NAME=llama3:8b

OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct
```

### 4. **Full Stack** (Tất cả providers)

```bash
# Tất cả providers
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_claude_key
OPENROUTER_API_KEY=your_openrouter_key

# Local backup
OSS_MODEL_ENABLED=true
OSS_MODEL_ENDPOINT=http://localhost:11434
OSS_MODEL_NAME=llama3:8b

# Cấu hình thay thế
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free
```

## 🚀 Chạy Server

```bash
# Build
npm run build

# Start API server
npm run start:api

# Hoặc với PowerShell
$env:MODE="api"; node dist/index.js
```

## 📊 Log Khi Khởi Động

Server sẽ log trạng thái các providers:

```
Checking LLM provider connectivity...
openai: ✅ Available
anthropic: ❌ Unavailable
openrouter: ✅ Available
oss-local: ❌ Unavailable
```

## 🔍 Ví Dụ Fallback Flow

### Scenario 1: OpenAI Fail → OpenRouter
```
1. Request đến với model OpenAI GPT-4
2. OpenAI không phản hồi (rate limit)
3. System log: "Provider openai is not healthy, attempting fallback"
4. Fallback sang OpenRouter với model: openai/gpt-4o-mini
5. Response thành công từ OpenRouter
```

### Scenario 2: Tất Cả Fail Except Local
```
1. Request đến
2. OpenAI: ❌ No API key
3. Claude: ❌ No API key  
4. OpenRouter: ❌ Rate limited
5. System log: "Falling back to OSS Local model"
6. Sử dụng Ollama local: llama3:8b
7. Response từ local model
```

## 🎯 Best Practices

### 1. **Cho Production**
- Cấu hình ít nhất 2 providers (ví dụ: OpenAI + OpenRouter)
- Bật cost tracking
- Set log level = "info"

### 2. **Cho Development**
- Dùng OpenRouter với free models
- Bật OSS Local nếu muốn offline development
- Set log level = "debug" để xem chi tiết

### 3. **Cho Cost Optimization**
- Dùng OpenRouter free models làm primary
- OpenAI/Claude chỉ cho critical tasks
- Bật auto-escalate để chỉ dùng models đắt khi cần

## 🛠️ Tùy Chỉnh Models

### OpenRouter Free Models (Recommended)

```bash
# Tốt cho code
OPENROUTER_FALLBACK_MODELS=qwen/qwen-2.5-coder-32b-instruct,deepseek/deepseek-coder:free

# Tốt cho general chat
OPENROUTER_FALLBACK_MODELS=meta-llama/llama-3.1-8b-instruct:free,mistralai/mistral-7b-instruct:free

# Balanced
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free
```

### OpenRouter Paid Models (Better Quality)

```bash
# Thay thế OpenAI với paid model tốt hơn
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o

# Thay thế Claude với paid model
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet
```

## 📝 Kiểm Tra Health Status

Server expose endpoint để check provider status:

```bash
# Health check
curl http://localhost:3000/health

# Response:
{
  "status": "ok",
  "providers": {
    "openai": true,
    "anthropic": false,
    "openrouter": true,
    "oss-local": false
  }
}
```

## ⚠️ Troubleshooting

### Provider Không Được Detect
- Kiểm tra API key đúng format
- Verify network connection
- Check log xem có error gì

### Fallback Không Hoạt Động
- Đảm bảo có ít nhất 1 backup provider configured
- Check OPENROUTER_API_KEY có hợp lệ
- Xem log để biết provider nào đang fail

### OSS Local Không Connect
- Đảm bảo Ollama đã chạy: `ollama serve`
- Pull model trước: `ollama pull llama3:8b`
- Check endpoint: `curl http://localhost:11434/api/tags`

## 📞 Support

Nếu gặp vấn đề, check:
1. Log file: `logs/ai-mcp-gateway.log`
2. Console output khi start server
3. Provider health status trong log

---

**Lưu ý:** Health check cache kết quả trong 1 phút. Provider bị đánh dấu unhealthy sẽ được retry sau 60 giây.
