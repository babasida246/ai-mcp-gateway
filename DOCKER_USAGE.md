# Docker Compose Quick Reference

## Development Mode (No Rebuild on Code Changes)

Run with hot reload - code changes are immediately visible:

```powershell
# First time: Build dev images (caches dependencies)
docker compose -f docker-compose.dev.yml build

# Start dev services (mounts source code)
docker compose -f docker-compose.dev.yml up

# Or run in background
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down
```

### Dev Services
- **mcp-gateway** (port 3000) - API with `npm run dev` (tsup watch mode)
- **admin-dashboard** (port 5173) - Vite dev server with hot reload
- **postgres** (port 5432) - Development database
- **redis** (port 6379) - Cache

### When to Rebuild Dev Images
Only rebuild when you change:
- `package.json` or `package-lock.json`
- Native dependencies
- Dockerfile itself

For code changes, just save the file - the container picks it up automatically.

---

## Production Mode (All Bundled in Images)

Build everything into self-contained images for deployment:

```powershell
# Build production images
docker compose -f docker-compose.prod.yml build

# Start production services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop services
docker compose -f docker-compose.prod.yml down
```

### Production Services
- **mcp-gateway** - Built API bundle in production image
- **admin-dashboard** - Built static files served by Nginx
- **postgres** - Production database with persistent volume
- **redis** - Cache with persistent volume

### Production Rebuild
Rebuild production images whenever you:
- Change any code (src/, admin-dashboard/src/)
- Update dependencies
- Modify configuration

---

## Default (Main docker-compose.yml)

The main `docker-compose.yml` uses production builds by default:

```powershell
# Use main compose file (same as prod)
docker compose up -d
docker compose down
```

---

## Environment Variables

Both dev and prod need API keys. Create `.env` file:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENAI_API_KEY=sk-your-key
ANTHROPIC_API_KEY=sk-ant-your-key
CONFIG_ENCRYPTION_KEY=your-32-char-key-here
```

---

## Quick Commands

```powershell
# Dev: Start and watch logs
docker compose -f docker-compose.dev.yml up

# Dev: Rebuild only if package.json changed
docker compose -f docker-compose.dev.yml build

# Prod: Deploy
docker compose -f docker-compose.prod.yml up -d --build

# Check running containers
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.prod.yml ps

# Clean up volumes (careful!)
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.prod.yml down -v
```

---

## Tips

### Dev Mode Benefits
- ✅ Edit code locally, see changes instantly
- ✅ No image rebuild for code changes
- ✅ Fast iteration
- ✅ Full stack (API + UI + DB + Redis)

### Prod Mode Benefits
- ✅ Self-contained images ready for deployment
- ✅ Optimized production builds
- ✅ Can be deployed anywhere
- ✅ No source code in containers
