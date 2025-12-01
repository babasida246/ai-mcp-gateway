# 🐳 AI MCP Gateway - Docker Deployment Guide

## Quick Start

### Prerequisites
- Docker (v20.10+)
- Docker Compose (v2.0+)

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/ai-mcp-gateway.git
cd ai-mcp-gateway
```

### 2. Configure Environment

**Windows:**
```batch
docker-start.bat
```

**Linux/Mac:**
```bash
chmod +x docker-start.sh
./docker-start.sh
```

This will:
- Create `.env` file with default configuration
- Build Docker images
- Start all services
- Run database migrations

### 3. Set API Keys

Edit `.env` file and add your API keys:
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...
```

Then restart:
```bash
docker-compose restart ai-mcp-gateway
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 3000 | Main API server |
| Admin Dashboard | 5173 | Web UI |
| PostgreSQL | 5432 | Database (pgvector) |
| Redis | 6379 | Cache |
| Ollama (optional) | 11434 | Local LLM |

## Access Points

- **Admin Dashboard**: http://localhost:5173
- **API Health Check**: http://localhost:3000/health
- **API Stats**: http://localhost:3000/v1/server-stats
- **Swagger Docs**: http://localhost:3000/docs (coming soon)

## Docker Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ai-mcp-gateway
docker-compose logs -f admin-dashboard
```

### Restart Service
```bash
docker-compose restart ai-mcp-gateway
```

### Run Migrations
```bash
docker-compose exec ai-mcp-gateway npm run db:migrate
```

### Access Database
```bash
docker-compose exec postgres psql -U postgres -d ai_mcp_gateway
```

### Access Redis
```bash
docker-compose exec redis redis-cli
```

### Rebuild Images
```bash
docker-compose build --no-cache
docker-compose up -d
```

## Using Local LLM (Ollama)

### Start with Ollama
```bash
docker-compose --profile with-ollama up -d
```

### Download Models
```bash
docker-compose exec ollama ollama pull llama3:8b
docker-compose exec ollama ollama pull codellama:7b
```

### Configure in .env
```env
OSS_MODEL_ENABLED=true
OSS_MODEL_ENDPOINT=http://ollama:11434
OSS_MODEL_NAME=llama3:8b
```

## Production Deployment

### 1. Update Environment
```env
NODE_ENV=production
LOG_LEVEL=warn
API_CORS_ORIGIN=https://yourdomain.com
```

### 2. Enable HTTPS (Nginx Reverse Proxy)

Create `nginx.conf`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://admin-dashboard;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://ai-mcp-gateway:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Use Docker Secrets

Create secrets:
```bash
echo "sk-your-openai-key" | docker secret create openai_api_key -
echo "sk-ant-your-key" | docker secret create anthropic_api_key -
```

Update `docker-compose.yml`:
```yaml
secrets:
  openai_api_key:
    external: true
  anthropic_api_key:
    external: true

services:
  ai-mcp-gateway:
    secrets:
      - openai_api_key
      - anthropic_api_key
```

## Monitoring

### View Container Stats
```bash
docker stats
```

### Check Service Health
```bash
docker-compose ps
```

### Export Logs
```bash
docker-compose logs --since 1h > logs.txt
```

## Backup & Restore

### Backup Database
```bash
docker-compose exec postgres pg_dump -U postgres ai_mcp_gateway > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker-compose exec -T postgres psql -U postgres ai_mcp_gateway
```

### Backup Volumes
```bash
docker run --rm -v ai-mcp-gateway_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
```

## Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection
docker-compose exec ai-mcp-gateway node -e "require('pg').Client({connectionString:process.env.DATABASE_URL}).connect().then(()=>console.log('OK')).catch(console.error)"
```

### Admin Dashboard Shows "Connection Error"
1. Make sure API gateway is running: `docker-compose ps ai-mcp-gateway`
2. Check API is accessible: `curl http://localhost:3000/health`
3. Check dashboard nginx config: `docker-compose exec admin-dashboard cat /etc/nginx/conf.d/default.conf`

### Out of Memory
```bash
# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory

# Or add to docker-compose.yml
services:
  ai-mcp-gateway:
    deploy:
      resources:
        limits:
          memory: 2G
```

## Scaling

### Multiple Gateway Instances
```bash
docker-compose up -d --scale ai-mcp-gateway=3
```

Add load balancer (nginx):
```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
```

## Update & Maintenance

### Update Images
```bash
git pull
docker-compose build
docker-compose up -d
```

### Prune Unused Resources
```bash
docker system prune -a --volumes
```

## Support

- **Documentation**: [README.md](../README.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/ai-mcp-gateway/issues)
- **Discord**: [Join our community](https://discord.gg/...)

## License

MIT License - see [LICENSE](../LICENSE)
