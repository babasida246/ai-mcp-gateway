#!/bin/bash

################################################################################
# AI MCP Gateway - Simple Deployment Script (Docker Only)
# For Ubuntu Server with Docker pre-installed
################################################################################

set -e

echo "=================================="
echo "AI MCP Gateway - Quick Deploy"
echo "=================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please run deploy.sh for full installation."
    exit 1
fi

# Clone or update repository
PROJECT_DIR="$HOME/ai-mcp-gateway"
if [ ! -d "$PROJECT_DIR" ]; then
    info "Cloning repository..."
    git clone https://github.com/babasida246/ai-mcp-gateway.git "$PROJECT_DIR"
else
    info "Updating repository..."
    cd "$PROJECT_DIR"
    git pull origin master
fi

cd "$PROJECT_DIR"

# Set up environment
if [ ! -f .env ]; then
    info "Creating .env file..."
    cp .env.docker .env
    warn "Please update .env file with your API keys before starting services."
    read -p "Press Enter to edit .env now..."
    ${EDITOR:-nano} .env
fi

# Start services
info "Starting Docker services..."
docker-compose down
docker-compose up -d

info "Waiting for services to start..."
sleep 10

# Show status
docker-compose ps

echo ""
echo "=================================="
info "Deployment completed!"
echo "=================================="
echo "API Server: http://localhost:3000"
echo "Admin Dashboard: http://localhost:5173"
echo ""
echo "View logs: docker-compose logs -f"
echo "=================================="
