# 🐳 Quick Docker Deployment

## Cách Nhanh Nhất (3 Bước)

### 1. Chuẩn bị
```bash
# Copy và chỉnh sửa file env
cp .env.docker.example .env.docker

# Thêm API key của bạn vào .env.docker
# Tối thiểu cần: OPENROUTER_API_KEY=sk-or-v1-...
```

### 2. Chạy

**Development (chỉ Gateway, không cần DB/Redis):**
```bash
docker-compose -f docker-compose.dev.yml --env-file .env.docker up -d
```

**Production (full stack với DB + Redis):**
```bash
docker-compose --env-file .env.docker up -d
```

**Với Ollama (local models):**
```bash
docker-compose --env-file .env.docker --profile with-ollama up -d
docker exec ai-mcp-ollama ollama pull llama3:8b
```

### 3. Test
```bash
# Health check
curl http://localhost:3000/health

# Xem logs
docker-compose logs -f ai-mcp-gateway
```

---

## 📋 Sử Dụng Makefile (Recommended)

Nếu có `make`:

```bash
# Setup lần đầu
make setup

# Chạy development
make dev

# Chạy production
make prod

# Xem logs
make logs

# Xem tất cả commands
make help
```

---

## 🛑 Dừng Services

```bash
# Development
docker-compose -f docker-compose.dev.yml down

# Production
docker-compose down

# Hoặc với Makefile
make dev-down
make prod-down
```

---

## 📊 Kiểm Tra Services

```bash
# Xem containers đang chạy
docker-compose ps

# Xem logs
docker-compose logs -f

# Check health
curl http://localhost:3000/health
```

---

## 🔧 Troubleshooting

### Gateway không start
```bash
# Check logs
docker-compose logs ai-mcp-gateway

# Thường do thiếu API key trong .env.docker
```

### Port đã được dùng
```bash
# Đổi port trong docker-compose.yml
ports:
  - "3001:3000"  # Dùng port 3001 thay vì 3000
```

### Rebuild sau khi sửa code
```bash
docker-compose build ai-mcp-gateway
docker-compose up -d ai-mcp-gateway

# Hoặc
make rebuild
```

---

## 📖 Chi Tiết

Xem **DOCKER-DEPLOYMENT.md** để biết thêm:
- Production deployment
- Security best practices  
- Backup & restore
- Scaling strategies
- Monitoring & debugging

---

**Chúc deploy thành công! 🚀**
