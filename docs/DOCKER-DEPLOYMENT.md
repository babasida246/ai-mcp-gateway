# Docker Deployment Guide

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway

# 2. Setup environment
cp .env.docker.example .env.docker

# 3. Edit .env.docker and add your API keys
# Required: OPENROUTER_API_KEY

# 4. Start all services
docker-compose --env-file .env.docker up -d

# 5. Check status
docker-compose ps
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| ai-mcp-gateway | 3000 | Main API gateway |
| ai-mcp-dashboard | 5173 | Admin dashboard |
| ai-mcp-postgres | 5432 | PostgreSQL database |
| ai-mcp-redis | 6379 | Redis cache |

## Environment Variables

### Required

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### Optional

```env
# Other providers (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Database (defaults provided)
POSTGRES_USER=mcpuser
POSTGRES_PASSWORD=mcppassword
POSTGRES_DB=mcpgateway

# Configuration
LOG_LEVEL=info
DEFAULT_LAYER=L0
```

## Commands

### Start services

```bash
# Start all
docker-compose --env-file .env.docker up -d

# Start specific service
docker-compose up -d ai-mcp-gateway

# Rebuild and start
docker-compose up -d --build
```

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ai-mcp-gateway

# Last 100 lines
docker-compose logs --tail=100 ai-mcp-gateway
```

### Stop services

```bash
# Stop all
docker-compose down

# Stop and remove volumes (data loss!)
docker-compose down -v
```

### Restart

```bash
# Restart single service
docker-compose restart ai-mcp-gateway

# Restart all
docker-compose restart
```

## Accessing Services

### Gateway API
```bash
curl http://localhost:3000/health
```

### Admin Dashboard
Open http://localhost:5173 in browser

Default login:
- Username: `admin`
- Password: `admin123`

### Database
```bash
# Connect to PostgreSQL
docker exec -it ai-mcp-postgres psql -U mcpuser -d mcpgateway

# List tables
\dt

# Query models
SELECT * FROM model_configs;
```

### Redis
```bash
# Connect to Redis CLI
docker exec -it ai-mcp-redis redis-cli

# Check keys
KEYS *
```

## Troubleshooting

### Container not starting

```bash
# Check logs
docker-compose logs ai-mcp-gateway

# Check container status
docker-compose ps

# Verify network
docker network ls
```

### Database connection issues

```bash
# Check if postgres is healthy
docker-compose ps ai-mcp-postgres

# Wait for postgres to be ready
docker-compose up -d ai-mcp-postgres
sleep 10
docker-compose up -d ai-mcp-gateway
```

### Port already in use

```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Or on Linux/Mac
lsof -i :3000

# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead
```

### Reset everything

```bash
# Stop all containers
docker-compose down

# Remove all data
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Clean rebuild
docker-compose build --no-cache
docker-compose up -d
```

## Production Deployment

### SSL/TLS

Use a reverse proxy (nginx, traefik) for SSL termination:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Environment Security

1. Use Docker secrets for sensitive data
2. Set `LOG_LEVEL=warn` in production
3. Change default admin password
4. Use strong database passwords
5. Restrict network access

### Scaling

```yaml
# docker-compose.override.yml
services:
  ai-mcp-gateway:
    deploy:
      replicas: 3
```

## Health Checks

Docker Compose includes health checks:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

Check health status:
```bash
docker-compose ps
# STATUS should show "healthy"
```
