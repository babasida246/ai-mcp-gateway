.PHONY: help build up down logs restart clean dev prod test

# Default target
help:
	@echo "AI MCP Gateway - Docker Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev              - Start in development mode (no DB/Redis)"
	@echo "  make dev-down         - Stop development containers"
	@echo ""
	@echo "Production:"
	@echo "  make prod             - Start all services (Gateway + DB + Redis)"
	@echo "  make prod-down        - Stop all services"
	@echo "  make prod-with-ollama - Start with Ollama for local models"
	@echo ""
	@echo "Management:"
	@echo "  make logs             - View logs (all services)"
	@echo "  make logs-gateway     - View gateway logs only"
	@echo "  make restart          - Restart all services"
	@echo "  make rebuild          - Rebuild and restart"
	@echo "  make ps               - Show running containers"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            - Stop and remove all containers"
	@echo "  make clean-all        - Remove containers + volumes (DANGEROUS!)"
	@echo ""
	@echo "Database:"
	@echo "  make db-backup        - Backup PostgreSQL database"
	@echo "  make db-shell         - Open PostgreSQL shell"
	@echo "  make redis-shell      - Open Redis shell"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run tests in Docker"
	@echo "  make health           - Check service health"

# Development mode (simple, no DB/Redis)
dev:
	@echo "🚀 Starting in development mode..."
	docker-compose -f docker-compose.dev.yml --env-file .env.docker up -d
	@echo "✅ Services started! Gateway at http://localhost:3000"

dev-down:
	docker-compose -f docker-compose.dev.yml down

# Production mode (full stack)
prod:
	@echo "🚀 Starting production stack..."
	docker-compose --env-file .env.docker up -d
	@echo "✅ All services started!"

prod-down:
	docker-compose down

prod-with-ollama:
	@echo "🚀 Starting with Ollama..."
	docker-compose --env-file .env.docker --profile with-ollama up -d
	@echo "✅ Services started! Pull models with: make ollama-pull"

# Logs
logs:
	docker-compose logs -f

logs-gateway:
	docker-compose logs -f ai-mcp-gateway

logs-redis:
	docker-compose logs -f redis

logs-postgres:
	docker-compose logs -f postgres

# Management
ps:
	docker-compose ps

restart:
	docker-compose restart

rebuild:
	@echo "🔨 Rebuilding..."
	docker-compose build ai-mcp-gateway
	docker-compose up -d --build ai-mcp-gateway
	@echo "✅ Rebuild complete!"

# Cleanup
clean:
	@echo "🧹 Cleaning up containers..."
	docker-compose down
	@echo "✅ Containers removed!"

clean-all:
	@echo "⚠️  WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		echo "✅ Containers and volumes removed!"; \
	fi

# Database operations
db-backup:
	@echo "💾 Backing up database..."
	docker-compose exec postgres pg_dump -U postgres ai_mcp_gateway > backup-$$(date +%Y%m%d-%H%M%S).sql
	@echo "✅ Backup created!"

db-shell:
	docker-compose exec postgres psql -U postgres -d ai_mcp_gateway

redis-shell:
	docker-compose exec redis redis-cli

# Ollama operations
ollama-pull:
	@echo "📥 Pulling llama3:8b model..."
	docker exec ai-mcp-ollama ollama pull llama3:8b
	@echo "✅ Model pulled!"

ollama-list:
	docker exec ai-mcp-ollama ollama list

# Testing & Health
test:
	docker build -t ai-mcp-gateway:test --target builder .
	docker run --rm ai-mcp-gateway:test npm test

health:
	@echo "🏥 Checking health..."
	@curl -s http://localhost:3000/health | jq . || echo "❌ Gateway not responding"

# Build
build:
	docker-compose build ai-mcp-gateway

# Initial setup
setup:
	@echo "🔧 Initial setup..."
	@if [ ! -f .env.docker ]; then \
		cp .env.docker.example .env.docker; \
		echo "✅ Created .env.docker - PLEASE EDIT IT WITH YOUR API KEYS!"; \
		echo "⚠️  Minimum required: OPENROUTER_API_KEY"; \
	else \
		echo "✅ .env.docker already exists"; \
	fi

# Stats
stats:
	docker stats --no-stream
