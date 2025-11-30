# Start MCP Gateway API Server
Write-Host "🚀 Starting MCP Gateway API Server..." -ForegroundColor Cyan

$env:MODE = "api"
$env:NODE_ENV = "development"

# Optional: Disable Redis/DB if not available
$env:REDIS_ENABLED = "false"
$env:DB_ENABLED = "false"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  MODE: $env:MODE"
Write-Host "  Port: 3000"
Write-Host "  Redis: Disabled (optional)"
Write-Host "  Database: Disabled (optional)"
Write-Host ""
Write-Host "Available endpoints:" -ForegroundColor Green
Write-Host "  GET  /health"
Write-Host "  POST /v1/chat"
Write-Host "  POST /v1/mcp-cli  (for CLI tool)"
Write-Host "  GET  /v1/server-stats"
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

node dist/index.js
