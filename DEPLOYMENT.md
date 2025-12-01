# Deployment Guide - Ubuntu Server

## Quick Start

### Option 1: Full Automated Deployment (Recommended for new servers)

This script installs everything needed on a fresh Ubuntu server:

```bash
# Download and run deployment script
curl -fsSL https://raw.githubusercontent.com/babasida246/ai-mcp-gateway/master/deploy.sh | bash
```

Or clone and run:

```bash
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Simple Deployment (Docker already installed)

If you already have Docker installed:

```bash
chmod +x deploy-simple.sh
./deploy-simple.sh
```

## What the Deployment Script Does

### 1. System Updates
- Updates all system packages
- Installs essential build tools

### 2. Docker Installation
- Installs Docker Engine
- Installs Docker Compose
- Adds current user to docker group

### 3. Node.js Installation
- Installs Node.js 20 LTS
- Installs pnpm package manager

### 4. Firewall Configuration
- Enables UFW firewall
- Opens required ports:
  - 22 (SSH)
  - 3000 (API Server)
  - 5173 (Admin Dashboard)
  - 80/443 (HTTP/HTTPS if using Nginx)

### 5. Project Setup
- Clones repository
- Installs dependencies
- Builds the project
- Sets up environment variables

### 6. Service Configuration
- Creates systemd service for auto-start
- Configures Docker containers
- Runs database migrations

### 7. Optional Nginx Setup
- Reverse proxy configuration
- SSL/TLS with Let's Encrypt
- Production-ready web server

## Manual Deployment Steps

If you prefer manual deployment:

### 1. Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh
```

### 2. Clone Repository

```bash
git clone https://github.com/babasida246/ai-mcp-gateway.git
cd ai-mcp-gateway
```

### 3. Configure Environment

```bash
# Copy environment file
cp .env.docker .env

# Edit with your API keys
nano .env
```

Required variables:
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `POSTGRES_PASSWORD` - Database password
- `REDIS_PASSWORD` - Redis password (optional)

### 4. Build and Start Services

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Build admin dashboard
cd admin-dashboard
npm install
npm run build
cd ..

# Start Docker services
docker-compose up -d
```

### 5. Verify Deployment

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Test API
curl http://localhost:3000/health
```

## Production Configuration

### Using Nginx Reverse Proxy

1. **Install Nginx**

```bash
sudo apt install nginx
```

2. **Create configuration**

```bash
sudo nano /etc/nginx/sites-available/ai-mcp-gateway
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Enable site**

```bash
sudo ln -s /etc/nginx/sites-available/ai-mcp-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **Set up SSL with Let's Encrypt**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Systemd Service

Create `/etc/systemd/system/ai-mcp-gateway.service`:

```ini
[Unit]
Description=AI MCP Gateway API Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/ai-mcp-gateway
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-mcp-gateway
sudo systemctl start ai-mcp-gateway
```

## Server Requirements

### Minimum Requirements
- **OS**: Ubuntu Server 20.04/22.04/24.04
- **RAM**: 2GB
- **CPU**: 2 cores
- **Storage**: 20GB
- **Network**: Public IP with open ports

### Recommended Requirements
- **OS**: Ubuntu Server 22.04 LTS or 24.04 LTS
- **RAM**: 4GB+
- **CPU**: 4 cores
- **Storage**: 50GB SSD
- **Network**: Public IP with domain name

## Port Configuration

| Port | Service | Description |
|------|---------|-------------|
| 22   | SSH     | Server access |
| 80   | HTTP    | Web traffic (Nginx) |
| 443  | HTTPS   | Secure web traffic (Nginx) |
| 3000 | API     | Backend API server |
| 5173 | Dashboard | Admin dashboard |
| 5432 | PostgreSQL | Database (internal only) |
| 6379 | Redis   | Cache (internal only) |

## Security Best Practices

### 1. Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow required ports
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp

# Check status
sudo ufw status
```

### 2. Secure Environment Variables

```bash
# Set proper permissions
chmod 600 .env

# Never commit .env to git
echo ".env" >> .gitignore
```

### 3. Use Strong Passwords

Generate secure passwords for:
- PostgreSQL
- Redis
- Admin users

```bash
# Generate random password
openssl rand -base64 32
```

### 4. Keep System Updated

```bash
# Regular updates
sudo apt update && sudo apt upgrade -y

# Auto-updates for security
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 5. Monitor Services

```bash
# Check Docker containers
docker-compose ps

# View logs
docker-compose logs -f

# System resources
htop
df -h
```

## Troubleshooting

### Services won't start

```bash
# Check Docker service
sudo systemctl status docker

# Check container logs
docker-compose logs

# Restart services
docker-compose restart
```

### Port already in use

```bash
# Find process using port
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Database connection issues

```bash
# Check PostgreSQL container
docker-compose ps postgres

# Connect to database
docker-compose exec postgres psql -U postgres -d ai_mcp_gateway

# Reset database
docker-compose down -v
docker-compose up -d
```

### Nginx issues

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

## Maintenance

### Backup Database

```bash
# Backup
docker-compose exec postgres pg_dump -U postgres ai_mcp_gateway > backup.sql

# Restore
cat backup.sql | docker-compose exec -T postgres psql -U postgres ai_mcp_gateway
```

### Update Application

```bash
cd ~/ai-mcp-gateway
git pull origin master
npm install
npm run build
docker-compose restart
```

### Monitor Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres

# System logs
sudo journalctl -u ai-mcp-gateway -f
```

## Performance Optimization

### 1. Enable Redis Caching

Ensure Redis is configured in `.env`:

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

### 2. Database Optimization

```sql
-- Connect to PostgreSQL
docker-compose exec postgres psql -U postgres ai_mcp_gateway

-- Create indexes
CREATE INDEX idx_llm_calls_conversation ON llm_calls(conversation_id);
CREATE INDEX idx_llm_calls_created ON llm_calls(created_at);
```

### 3. Docker Resource Limits

Edit `docker-compose.yml`:

```yaml
services:
  postgres:
    mem_limit: 1g
    cpus: 2
  redis:
    mem_limit: 512m
    cpus: 1
```

## Support

- **Documentation**: [README.md](README.md)
- **Issues**: https://github.com/babasida246/ai-mcp-gateway/issues
- **Discussions**: https://github.com/babasida246/ai-mcp-gateway/discussions
