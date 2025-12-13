# Development Guide - AI MCP Gateway

## Môi trường Development với Docker

Môi trường dev đã được tối ưu để **không cần rebuild** khi code thay đổi. Hot reload được bật tự động.

### Khởi động môi trường Dev

```powershell
# Khởi động tất cả services (gateway + admin-dashboard + postgres + redis)
docker-compose -f docker-compose.dev.yml up -d

# Hoặc chỉ khởi động một service cụ thể
docker-compose -f docker-compose.dev.yml up -d mcp-gateway
docker-compose -f docker-compose.dev.yml up -d admin-dashboard
```

### Xem logs real-time

```powershell
# Xem logs của tất cả services
docker-compose -f docker-compose.dev.yml logs -f

# Xem logs của service cụ thể
docker-compose -f docker-compose.dev.yml logs -f mcp-gateway
docker-compose -f docker-compose.dev.yml logs -f admin-dashboard
```

### Hot Reload - Không cần rebuild

#### Backend (MCP Gateway)
- **File mounted**: Toàn bộ source code được mount vào container
- **Watcher**: `tsup --watch` tự động compile khi code thay đổi
- **Không cần làm gì**: Chỉ cần sửa file `.ts` trong `src/`, server sẽ tự reload

#### Frontend (Admin Dashboard)
- **File mounted**: Toàn bộ source code được mount vào container
- **Vite dev server**: Hot Module Replacement (HMR) tự động
- **File watching**: Đã bật polling mode cho Windows/Mac
- **Không cần làm gì**: Sửa file `.tsx`, `.ts`, `.css` và trình duyệt tự reload

### Cấu trúc Volumes

```yaml
volumes:
  # Mount toàn bộ project để hot reload
  - ./:/app:delegated
  
  # Giữ node_modules của container (tránh conflict với host)
  - /app/node_modules
  - /app/admin-dashboard/node_modules
```

### Ports

- **Gateway API**: http://localhost:3000
- **Admin Dashboard**: http://localhost:5173
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Environment Variables

File `.env` sẽ tự động load. Các biến quan trọng:

```env
# LLM API Keys
OPENROUTER_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Database
DB_HOST=postgres
DB_NAME=ai_mcp_gateway_dev
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

### Debugging

#### Debug Backend trong Container

```powershell
# Exec vào container
docker exec -it mcp-gateway-dev sh

# Chạy lệnh debug
npm run dev
node --inspect=0.0.0.0:9229 dist/index.js
```

#### Debug Frontend

Vite dev server đã expose port 5173, bạn có thể:
- Dùng Chrome DevTools
- Dùng VS Code debugger với port forwarding

### Rebuild chỉ khi cần

Bạn **chỉ cần rebuild** khi:
1. Thay đổi `package.json` (thêm/xóa dependencies)
2. Thay đổi `Dockerfile`
3. Thay đổi file config như `tsconfig.json`, `vite.config.ts`

```powershell
# Rebuild một service cụ thể
docker-compose -f docker-compose.dev.yml up -d --build mcp-gateway

# Rebuild tất cả
docker-compose -f docker-compose.dev.yml up -d --build
```

### Dọn dẹp

```powershell
# Stop tất cả services
docker-compose -f docker-compose.dev.yml down

# Stop và xóa volumes (sẽ xóa database!)
docker-compose -f docker-compose.dev.yml down -v

# Stop và xóa images
docker-compose -f docker-compose.dev.yml down --rmi all
```

### Troubleshooting

#### Hot reload không hoạt động?

1. **Kiểm tra volumes đã mount đúng chưa**:
   ```powershell
   docker exec -it mcp-gateway-dev ls -la /app
   ```

2. **Xem logs để check watcher**:
   ```powershell
   docker-compose -f docker-compose.dev.yml logs -f mcp-gateway
   ```

3. **Restart service**:
   ```powershell
   docker-compose -f docker-compose.dev.yml restart mcp-gateway
   ```

#### Container exit ngay sau khi start?

```powershell
# Xem logs để tìm lỗi
docker-compose -f docker-compose.dev.yml logs mcp-gateway
```

#### Database connection failed?

```powershell
# Kiểm tra postgres đã ready chưa
docker-compose -f docker-compose.dev.yml ps postgres

# Xem logs postgres
docker-compose -f docker-compose.dev.yml logs postgres
```

## So sánh Dev vs Production

| Feature | Dev (`docker-compose.dev.yml`) | Production (`docker-compose.yml`) |
|---------|-------------------------------|-----------------------------------|
| Source mount | ✅ Mount toàn bộ | ❌ Copy vào image |
| Hot reload | ✅ Enabled | ❌ Disabled |
| Rebuild on change | ❌ Không cần | ✅ Cần rebuild |
| Build target | `dev` stage | `production` stage |
| Database | `ai_mcp_gateway_dev` | `ai_mcp_gateway` |
| Optimization | Development mode | Production optimized |
| File watching | ✅ Polling enabled | ❌ N/A |

## Tips

1. **Sử dụng VS Code Remote Containers**: Attach vào container để code trực tiếp
2. **Watch logs liên tục**: Mở terminal riêng cho logs
3. **Không commit node_modules**: Đã có `.dockerignore`
4. **Backup database dev**: Định kỳ export data nếu cần

## Next Steps

- Xem [DOCKER-QUICKSTART.md](docs/DOCKER-QUICKSTART.md) để setup lần đầu
- Xem [API-GUIDE.md](docs/API-GUIDE.md) để test API
- Xem [TESTING.md](docs/TESTING.md) để chạy tests
