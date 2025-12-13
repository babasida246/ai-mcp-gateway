# AI MCP Gateway - Quick Start Deployment Guide

Complete guide to deploy AI MCP Gateway using Docker in under 5 minutes.

---

## 📋 Prerequisites

- **Docker** 20.10+ & **Docker Compose** 2.0+
- **At least one LLM provider API key**:
  - [OpenRouter](https://openrouter.ai) (recommended - supports all providers)
  - [OpenAI](https://platform.openai.com/)
  - [Anthropic](https://console.anthropic.com/)

### Generate Encryption Key

```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Or use any 32-character string
```

---

## 🚀 Quick Deploy (5 Minutes)

### Step 1: Clone Repository

```powershell
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway
```

### Step 2: Configure Environment

```powershell
copy .env.docker.example .env.docker
```

Edit `.env.docker` with your API keys:

```env
# ============================================
# REQUIRED: Provider API Keys
# ============================================
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional - if you have direct API keys
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

# ============================================
# REQUIRED: Encryption Key (32 characters)
# ============================================
CONFIG_ENCRYPTION_KEY=your-32-character-encryption-key

# ============================================
# Optional: Customize Models
# ============================================
OPENROUTER_FALLBACK_MODELS=meta-llama/llama-3.3-70b-instruct:free,x-ai/grok-4.1-fast:free

# ============================================
# Database (defaults work for Docker)
# ============================================
POSTGRES_DB=ai_mcp_gateway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

### Step 3: Start Services

```powershell
docker-compose up -d
```

Output:
```
✅ Container ai-mcp-postgres   Healthy
✅ Container ai-mcp-redis      Healthy  
✅ Container mcp-gateway       Healthy
✅ Container ai-mcp-dashboard  Healthy
```

### Step 4: Verify Deployment

```powershell
# Check health
curl http://localhost:3000/health

# Check container status
docker-compose ps
```

Expected output:
```
NAME               STATUS
mcp-gateway        Up (healthy)
ai-mcp-dashboard   Up (healthy)
ai-mcp-postgres    Up (healthy)
ai-mcp-redis       Up (healthy)
```

### Step 5: Access Services

- **Admin Dashboard**: http://localhost:5173
- **Settings UI**: http://localhost:5173/settings
- **API Gateway**: http://localhost:3000
- **API Docs**: http://localhost:3000/v1/status

---

## ⚙️ Initial Configuration

### 1. Open Settings UI

Navigate to: http://localhost:5173/settings

### 2. Configure System Settings

**Tab: System Config**
- Set default layer (L0, L1, L2, L3)
- Enable auto-escalation
- Set cost tracking threshold
- Configure CORS and logging

### 3. Add Provider Credentials

**Tab: Provider Credentials**

Click "Add Provider" and enter:
- **Provider**: OpenRouter / OpenAI / Anthropic
- **API Key**: Your provider API key
- **Endpoint**: API endpoint URL
- **Enabled**: ✅ Checked

**Example:**
```
Provider: OpenRouter
API Key: sk-or-v1-8fb01e8bb...
Endpoint: https://openrouter.ai/api/v1
Enabled: ✅
```

Credentials are **AES-256 encrypted** in PostgreSQL.

### 4. Configure Layers

**Tab: Layer Configuration**

Assign models to layers:

**L0 (Free):**
- meta-llama/llama-3.3-70b-instruct:free
- x-ai/grok-4.1-fast:free

**L1 (Cheap):**
- google/gemini-flash-1.5
- openai/gpt-4o-mini

**L2 (Balanced):**
- anthropic/claude-3-haiku
- openai/gpt-4o

**L3 (Premium):**
- anthropic/claude-3.5-sonnet
- openai/o1-preview

### 5. Configure Task Routing

**Tab: Task Configuration**

Set preferred models for tasks:

**Chat Task:**
- Preferred: meta-llama/llama-3.3-70b-instruct:free
- Fallback: google/gemini-flash-1.5, openai/gpt-4o-mini

**Code Task:**
- Preferred: qwen/qwen-2.5-coder-32b-instruct:free
- Fallback: deepseek/deepseek-coder-33b-instruct:free

**Analyze Task:**
- Preferred: qwen/qwq-32b-preview:free
- Fallback: x-ai/grok-4.1-fast:free

### 6. Enable Features

**Tab: Feature Flags**

Enable desired features:
- ✅ **Auto-escalate** - Automatically try next layer on failure
- ✅ **Cross-check** - Validate responses with multiple models
- ✅ **Cost tracking** - Track and alert on costs

---

## 🧪 Test Your Deployment

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 2. Chat Completion (OpenAI Compatible)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 3. Task-Specific Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Write a Python function"}],
    "metadata": {"task": "code"}
  }'
```

This automatically uses **Code Task** routing with code-specialized models.

### 4. Check Request in Dashboard

Open: http://localhost:5173

You'll see:
- Request count
- Token usage
- Costs
- Model used
- Response time

---

## 📊 Container Services

### Service Overview

| Service | Container Name | Port | Purpose |
|---------|---------------|------|---------|
| API Gateway | mcp-gateway | 3000 | Main API server |
| Admin Dashboard | ai-mcp-dashboard | 5173 | Web UI |
| PostgreSQL | ai-mcp-postgres | 5432 | Database |
| Redis | ai-mcp-redis | 6379 | Cache |

### Container Management

```powershell
# View logs
docker-compose logs mcp-gateway
docker-compose logs ai-mcp-dashboard

# Restart service
docker-compose restart mcp-gateway

# Stop all services
docker-compose down

# Start services
docker-compose up -d

# View container status
docker-compose ps
```

---

## 🔧 Environment Variables Reference

### Required Variables

```env
# Database Bootstrap (required for Docker)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=ai_mcp_gateway
DB_USER=postgres
DB_PASSWORD=postgres
CONFIG_ENCRYPTION_KEY=your-32-char-key-here

# At least one provider API key
OPENROUTER_API_KEY=sk-or-v1-...
# OR
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
```

### Optional Variables

```env
# API Server
API_PORT=3000
API_HOST=0.0.0.0
API_CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
LOG_FILE=logs/mcp-gateway.log

# Routing
DEFAULT_LAYER=L0
ENABLE_AUTO_ESCALATE=true
MAX_ESCALATION_LAYER=L2

# Cost Control
ENABLE_COST_TRACKING=true
COST_ALERT_THRESHOLD=1.00

# Layer Control
LAYER_L0_ENABLED=true
LAYER_L1_ENABLED=true
LAYER_L2_ENABLED=true
LAYER_L3_ENABLED=true

# Task Models
CHAT_MODELS=meta-llama/llama-3.3-70b-instruct:free
CODE_MODELS=qwen/qwen-2.5-coder-32b-instruct:free
ANALYZE_MODELS=qwen/qwq-32b-preview:free
```

---

## 🐛 Troubleshooting

### Container Won't Start

**Check logs:**
```powershell
docker-compose logs mcp-gateway
```

**Common issues:**

1. **Missing CONFIG_ENCRYPTION_KEY**
   ```
   Error: Bootstrap configuration not found
   Environment status: { CONFIG_ENCRYPTION_KEY: false }
   ```
   **Fix:** Add CONFIG_ENCRYPTION_KEY to docker-compose.yml environment section

2. **Database not ready**
   ```
   Error: Database connection failed
   ```
   **Fix:** Wait for postgres container to be healthy:
   ```powershell
   docker-compose ps | Select-String postgres
   ```

3. **Port already in use**
   ```
   Error: bind: address already in use
   ```
   **Fix:** Change ports in docker-compose.yml or stop conflicting services

### Configuration Not Saving

**Verify ConfigService:**
```powershell
docker-compose logs mcp-gateway | Select-String "Configuration service"
```

**Expected:**
```
Configuration service initialized from database
```

**If not initialized:**
1. Check database connection
2. Verify CONFIG_ENCRYPTION_KEY is set
3. Check database migrations ran

### Dashboard Can't Connect to API

**Check CORS settings:**

Edit docker-compose.yml:
```yaml
environment:
  API_CORS_ORIGIN: "*"  # Allow all origins
  # Or specific origin:
  # API_CORS_ORIGIN: "http://localhost:5173"
```

**Restart services:**
```powershell
docker-compose restart mcp-gateway
```

### Provider API Key Not Working

**Test provider directly:**
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer sk-or-v1-YOUR-KEY"
```

**Check key in Settings UI:**
1. Go to http://localhost:5173/settings
2. Tab: Provider Credentials
3. Verify API key is correct and provider is enabled

---

## 🔐 Security Best Practices

### Production Deployment

1. **Use Strong Encryption Key**
   ```powershell
   # Generate secure 32-char key
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
   ```

2. **Set Strong Database Password**
   ```env
   POSTGRES_PASSWORD=your-strong-password-here
   ```

3. **Restrict CORS**
   ```env
   API_CORS_ORIGIN=https://your-domain.com
   ```

4. **Use HTTPS**
   - Deploy behind reverse proxy (nginx, Traefik)
   - Enable SSL/TLS
   - Use Let's Encrypt for certificates

5. **Never Commit Secrets**
   ```bash
   # Add to .gitignore
   .env
   .env.docker
   .env.local
   ```

---

## ✅ Deployment Checklist

- [ ] Docker & Docker Compose installed
- [ ] Generated 32-character encryption key
- [ ] Obtained at least one provider API key (OpenRouter recommended)
- [ ] Configured `.env.docker` with API keys and encryption key
- [ ] Started services with `docker-compose up -d`
- [ ] Verified all containers healthy
- [ ] Accessed Settings UI at http://localhost:5173/settings
- [ ] Configured provider credentials
- [ ] Set up layer assignments
- [ ] Configured task routing
- [ ] Enabled feature flags
- [ ] Tested API with sample request
- [ ] Verified request appears in dashboard
- [ ] Reviewed logs for any errors
- [ ] Set up backups (database & environment)
- [ ] Documented custom configuration

---

**Deployment complete! 🎉**

Your AI MCP Gateway is now running and ready to route requests across multiple LLM providers with intelligent layer-based routing.
