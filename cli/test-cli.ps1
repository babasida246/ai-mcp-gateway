# Test script for MCP CLI (PowerShell)

Write-Host "🧪 Testing MCP CLI Tool" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

# Set endpoint
$env:MCP_ENDPOINT = "http://localhost:3000"

Write-Host "1️⃣ Testing chat command (single message)..." -ForegroundColor Yellow
node dist/index.js chat "What is 2+2?"
Write-Host ""

Write-Host "2️⃣ Testing code command (stdin)..." -ForegroundColor Yellow
"function add(a, b) { return a + b }" | node dist/index.js code - "Review this code"
Write-Host ""

Write-Host "3️⃣ Testing code command (file)..." -ForegroundColor Yellow
# Create temp file
$tempFile = Join-Path $env:TEMP "test-sample.js"
@"
function greet(name) {
  console.log("Hello " + name);
}
"@ | Out-File -FilePath $tempFile -Encoding UTF8

node dist/index.js code $tempFile "Review this code"
Write-Host ""

Write-Host "4️⃣ Testing diff command..." -ForegroundColor Yellow
node dist/index.js diff $tempFile "Use template literals instead of concatenation"
Write-Host ""

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host "✅ All tests completed!" -ForegroundColor Green
