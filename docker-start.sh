#!/bin/bash

# AI MCP Gateway - Docker Startup Script

echo "🚀 Starting AI MCP Gateway with Docker..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cat > .env << EOF
# PostgreSQL
POSTGRES_DB=ai_mcp_gateway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_PASSWORD=

# API Keys (set your own)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=

# OSS/Local Model (optional)
OSS_MODEL_ENABLED=false
OSS_MODEL_ENDPOINT=http://ollama:11434
OSS_MODEL_NAME=llama3:8b

# OpenRouter Fallback Models
OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free
OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet
EOF
    echo "✅ Created .env file. Please edit it with your API keys."
    echo ""
fi

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ AI MCP Gateway is running!"
echo ""
echo "🌐 Services:"
echo "   - API Gateway:     http://localhost:3000"
echo "   - Admin Dashboard: http://localhost:5173"
echo "   - PostgreSQL:      localhost:5432"
echo "   - Redis:           localhost:6379"
echo ""
echo "📝 Useful commands:"
echo "   - View logs:       docker-compose logs -f"
echo "   - Stop services:   docker-compose down"
echo "   - Restart:         docker-compose restart"
echo "   - Run migrations:  docker-compose exec ai-mcp-gateway npm run db:migrate"
echo ""
echo "🔗 Quick Links:"
echo "   - Dashboard:       http://localhost:5173"
echo "   - API Health:      http://localhost:3000/health"
echo "   - API Stats:       http://localhost:3000/v1/server-stats"
echo ""
