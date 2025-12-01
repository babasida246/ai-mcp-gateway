@echo off
REM AI MCP Gateway - Docker Startup Script (Windows)

echo 🚀 Starting AI MCP Gateway with Docker...
echo.

REM Check if .env exists
if not exist .env (
    echo 📝 Creating .env file from template...
    (
        echo # PostgreSQL
        echo POSTGRES_DB=ai_mcp_gateway
        echo POSTGRES_USER=postgres
        echo POSTGRES_PASSWORD=postgres
        echo.
        echo # Redis
        echo REDIS_PASSWORD=
        echo.
        echo # API Keys ^(set your own^)
        echo OPENAI_API_KEY=
        echo ANTHROPIC_API_KEY=
        echo OPENROUTER_API_KEY=
        echo.
        echo # OSS/Local Model ^(optional^)
        echo OSS_MODEL_ENABLED=false
        echo OSS_MODEL_ENDPOINT=http://ollama:11434
        echo OSS_MODEL_NAME=llama3:8b
        echo.
        echo # OpenRouter Fallback Models
        echo OPENROUTER_FALLBACK_MODELS=x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free
        echo OPENROUTER_REPLACE_OPENAI=openai/gpt-4o-mini
        echo OPENROUTER_REPLACE_CLAUDE=anthropic/claude-3.5-sonnet
    ) > .env
    echo ✅ Created .env file. Please edit it with your API keys.
    echo.
)

REM Build and start services
echo 🔨 Building Docker images...
docker-compose build

echo.
echo 🚀 Starting services...
docker-compose up -d

REM Wait for services
echo.
echo ⏳ Waiting for services to be healthy...
timeout /t 10 /nobreak > nul

REM Check service status
echo.
echo 📊 Service Status:
docker-compose ps

echo.
echo ✅ AI MCP Gateway is running!
echo.
echo 🌐 Services:
echo    - API Gateway:     http://localhost:3000
echo    - Admin Dashboard: http://localhost:5173
echo    - PostgreSQL:      localhost:5432
echo    - Redis:           localhost:6379
echo.
echo 📝 Useful commands:
echo    - View logs:       docker-compose logs -f
echo    - Stop services:   docker-compose down
echo    - Restart:         docker-compose restart
echo    - Run migrations:  docker-compose exec ai-mcp-gateway npm run db:migrate
echo.
echo 🔗 Quick Links:
echo    - Dashboard:       http://localhost:5173
echo    - API Health:      http://localhost:3000/health
echo    - API Stats:       http://localhost:3000/v1/server-stats
echo.
pause
