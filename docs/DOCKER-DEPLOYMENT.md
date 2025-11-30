# Docker Deployment Guide - AI MCP Gateway

Hướng dẫn deploy hệ thống AI MCP Gateway bằng Docker và Docker Compose.

## 📋 Yêu Cầu

- Docker Engine 20.10+
- Docker Compose 2.0+
- Ít nhất 2GB RAM khả dụng
- 5GB disk space

## 🚀 Quick Start

### 1. Cấu hình Environment Variables

```bash
# Copy file example và chỉnh sửa
cp .env.docker.example .env.docker

# Chỉnh sửa .env.docker với API keys của bạn
# Tối thiểu cần: OPENROUTER_API_KEY
```

### 2. Start All Services

```bash
# Start tất cả services (Gateway + Redis + PostgreSQL)
docker-compose --env-file .env.docker up -d

# Xem logs
docker-compose logs -f ai-mcp-gateway

# Check status
docker-compose ps
```

### 3. Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "redis": true,
#   "database": true,
#   "timestamp": "..."
# }
```

## 📦 Services

Docker Compose sẽ khởi động các services sau:

| Service | Port | Description |
|---------|------|-------------|
| `ai-mcp-gateway` | 3000 | Main API server |
| `redis` | 6379 | Cache layer |
| `postgres` | 5432 | Database |
| `ollama` (optional) | 11434 | Local LLM models |

## 🔧 Configuration Options

### Minimal Setup (Chỉ OpenRouter)

```bash
# .env.docker
OPENROUTER_API_KEY=sk-or-v1-...
POSTGRES_PASSWORD=secure_password
```

```bash
docker-compose --env-file .env.docker up -d
```

### With Ollama (Local Models)

```bash
# .env.docker
OPENROUTER_API_KEY=sk-or-v1-...
OSS_MODEL_ENABLED=true
OSS_MODEL_ENDPOINT=http://ollama:11434
OSS_MODEL_NAME=llama3:8b
POSTGRES_PASSWORD=secure_password
```

```bash
# Start với Ollama profile
docker-compose --env-file .env.docker --profile with-ollama up -d

# Pull model vào Ollama
docker exec ai-mcp-ollama ollama pull llama3:8b
```

### Full Stack (All Providers)

```bash
# .env.docker
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OSS_MODEL_ENABLED=true
POSTGRES_PASSWORD=secure_password
REDIS_PASSWORD=redis_password
```

## 🛠️ Management Commands

### Start/Stop

```bash
# Start services
docker-compose --env-file .env.docker up -d

# Stop services
docker-compose down

# Stop và xóa volumes (WARNING: mất data!)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ai-mcp-gateway
docker-compose logs -f redis
docker-compose logs -f postgres

# Last 100 lines
docker-compose logs --tail=100 ai-mcp-gateway
```

### Restart Services

```bash
# Restart gateway only
docker-compose restart ai-mcp-gateway

# Restart all
docker-compose restart
```

### Rebuild After Code Changes

```bash
# Rebuild image
docker-compose build ai-mcp-gateway

# Rebuild và restart
docker-compose up -d --build ai-mcp-gateway
```

## 🔍 Debugging

### Check Service Health

```bash
# Check container status
docker-compose ps

# Inspect specific service
docker-compose exec ai-mcp-gateway sh

# Check Redis connection
docker-compose exec redis redis-cli ping

# Check PostgreSQL
docker-compose exec postgres psql -U postgres -d ai_mcp_gateway -c '\dt'
```

### Common Issues

#### 1. Port Already in Use

```bash
# Change ports in docker-compose.yml
ports:
  - "3001:3000"  # Host:Container
```

#### 2. Gateway Can't Connect to Redis/PostgreSQL

```bash
# Check network
docker network ls
docker network inspect ai-mcp-gateway_ai-mcp-network

# Ensure depends_on is working
docker-compose logs redis
docker-compose logs postgres
```

#### 3. Out of Memory

```bash
# Add memory limits in docker-compose.yml
services:
  ai-mcp-gateway:
    deploy:
      resources:
        limits:
          memory: 1G
```

## 📊 Monitoring

### Resource Usage

```bash
# Real-time stats
docker stats

# Specific container
docker stats ai-mcp-gateway

# Server metrics (requests, tokens, cost)
curl http://localhost:3000/v1/server-stats | jq
```

### Continuous Monitoring

```bash
# Watch server stats every 5 seconds
watch -n 5 'curl -s http://localhost:3000/v1/server-stats | jq ".requests, .llm, .memory"'

# Windows PowerShell
while ($true) {
    Clear-Host
    (Invoke-WebRequest http://localhost:3000/v1/server-stats).Content | ConvertFrom-Json | ConvertTo-Json -Depth 3
    Start-Sleep -Seconds 5
}
```

See **[SERVER-STATS-GUIDE.md](SERVER-STATS-GUIDE.md)** for comprehensive monitoring guide.

### Database Queries

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d ai_mcp_gateway

# Useful queries:
# SELECT * FROM llm_calls ORDER BY created_at DESC LIMIT 10;
# SELECT COUNT(*) FROM llm_calls;
```

### Redis Cache

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Commands:
# KEYS *
# GET context:conversation_id:123
# DBSIZE
```

## 🔐 Security Best Practices

### Production Deployment

1. **Change Default Passwords**
```bash
# .env.docker
POSTGRES_PASSWORD=very_secure_random_password
REDIS_PASSWORD=another_secure_password
```

2. **Restrict CORS**
```bash
# docker-compose.yml
environment:
  API_CORS_ORIGIN: "https://yourdomain.com"
```

3. **Use Secrets (Docker Swarm/Kubernetes)**
```yaml
secrets:
  openrouter_key:
    external: true
services:
  ai-mcp-gateway:
    secrets:
      - openrouter_key
```

4. **Enable SSL for PostgreSQL**
```bash
DB_SSL=true
```

## 🌐 Production Deployment

### With Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/ai-mcp-gateway
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### With Docker Swarm

```bash
# Deploy as stack
docker stack deploy -c docker-compose.yml ai-mcp-gateway

# Scale gateway
docker service scale ai-mcp-gateway_ai-mcp-gateway=3
```

### With Kubernetes

```bash
# Convert docker-compose to k8s manifests (using kompose)
kompose convert -f docker-compose.yml

# Deploy
kubectl apply -f .
```

## 📦 Backup & Restore

### PostgreSQL Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U postgres ai_mcp_gateway > backup.sql

# Restore
docker-compose exec -T postgres psql -U postgres ai_mcp_gateway < backup.sql
```

### Redis Backup

```bash
# Trigger save
docker-compose exec redis redis-cli BGSAVE

# Copy RDB file
docker cp ai-mcp-redis:/data/dump.rdb ./redis-backup.rdb
```

### Volume Backup

```bash
# Backup all volumes
docker run --rm \
  -v ai-mcp-gateway_postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-data.tar.gz /data
```

## 🧪 Testing

### Run Tests in Docker

```bash
# Build test image
docker build -t ai-mcp-gateway:test --target builder .

# Run tests
docker run --rm ai-mcp-gateway:test npm test
```

## 📈 Scaling

### Horizontal Scaling

```bash
# Scale gateway instances
docker-compose up -d --scale ai-mcp-gateway=3

# Use load balancer (Nginx, HAProxy, Traefik)
```

### Resource Limits

```yaml
# docker-compose.yml
services:
  ai-mcp-gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 512M
```

## 🔄 Updates

### Update to Latest Version

```bash
# Pull latest code
git pull origin master

# Rebuild and restart
docker-compose down
docker-compose --env-file .env.docker up -d --build
```

### Rolling Update (Zero Downtime)

```bash
# Build new image with tag
docker build -t ai-mcp-gateway:v0.2.0 .

# Update one by one
docker-compose up -d --no-deps --scale ai-mcp-gateway=2 ai-mcp-gateway
```

## 📝 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | - | OpenRouter API key (required) |
| `OPENAI_API_KEY` | - | OpenAI API key (optional) |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (optional) |
| `POSTGRES_PASSWORD` | postgres | PostgreSQL password |
| `REDIS_PASSWORD` | - | Redis password (empty = no auth) |
| `LOG_LEVEL` | info | Logging level |
| `DEFAULT_LAYER` | L0 | Default routing layer |
| `OSS_MODEL_ENABLED` | false | Enable Ollama |

## 🆘 Support

- **Logs**: `docker-compose logs -f`
- **Health**: `curl http://localhost:3000/health`
- **Issues**: Check GitHub Issues
- **Docs**: See PROVIDER-FALLBACK-GUIDE.md

---

**Happy Deploying! 🚀**
