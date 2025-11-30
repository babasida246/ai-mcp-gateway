# MCP CLI - Quick Start Guide

## Prerequisites

1. MCP Gateway must be running on `http://localhost:3000` (or custom endpoint)
2. Node.js 20+ installed

## Installation Steps

### 1. Build the Gateway with CLI Support

```bash
# Navigate to project root
cd e:\GitHub\ai-mcp-gateway

# Rebuild with new /v1/mcp-cli endpoint
npm run build

# Restart the gateway (if running in Docker)
docker-compose --env-file .env.docker down
docker-compose --env-file .env.docker up -d

# Or restart if running locally
npm start
```

### 2. Build and Install CLI

```bash
# Navigate to CLI directory
cd cli

# Install dependencies
npm install

# Build TypeScript
npm run build

# Install globally (optional)
npm install -g .
```

### 3. Configure Environment

```bash
# Set MCP Gateway endpoint
export MCP_ENDPOINT=http://localhost:3000

# Set API key (if using authentication)
export MCP_API_KEY=your-api-key-here
```

For PowerShell:
```powershell
$env:MCP_ENDPOINT = "http://localhost:3000"
$env:MCP_API_KEY = "your-api-key-here"
```

### 4. Verify Installation

```bash
# Check CLI version
mcp --version

# Or if not installed globally
node dist/index.js --version

# Check gateway health
curl http://localhost:3000/health
```

## Quick Test

### Test Chat
```bash
mcp chat "Hello, what is 2+2?"
```

### Test Code Review
```bash
echo "function add(a, b) { return a + b }" | mcp code - "Review this"
```

### Test Diff Generation
```bash
# Create test file
echo "console.log('hello')" > test.js

# Generate diff
mcp diff test.js "Add JSDoc comment"
```

## Run Test Suite

```bash
cd cli

# PowerShell
.\test-cli.ps1

# Bash
bash test-cli.sh
```

## Troubleshooting

### "Cannot find module 'axios'"

```bash
cd cli
rm -rf node_modules package-lock.json
npm install
npm run build
```

### "Connection refused" or 404

```bash
# Check gateway is running
curl http://localhost:3000/health

# Check endpoint has /v1/mcp-cli
curl -X POST http://localhost:3000/v1/mcp-cli \
  -H "Content-Type: application/json" \
  -d '{"mode":"chat","message":"test"}'
```

### Gateway needs restart

```bash
# For Docker
cd e:\GitHub\ai-mcp-gateway
docker-compose --env-file .env.docker restart

# For local
# Stop with Ctrl+C, then:
npm start
```

## Usage Examples

### Interactive Chat
```bash
mcp chat
# Type messages, use /exit to quit
```

### Single Message Chat
```bash
mcp chat "Explain async/await in JavaScript"
```

### Review File
```bash
mcp code src/index.ts "Check for security issues"
```

### Review from Pipe
```bash
cat myfile.js | mcp code - "Optimize this function"
```

### Generate Patch
```bash
mcp diff src/app.ts "Add error handling to fetchData()" > fix.patch
git apply fix.patch
```

### Chain Commands
```bash
# Get code from URL, review it
curl https://example.com/script.js | mcp code - "Security audit" > audit.txt
```

## Next Steps

- Read [CLI README](./README.md) for complete documentation
- See [design-cli-mcp.md](../design-cli-mcp.md) for architecture
- Check [examples](./README.md#examples) for more use cases

## Support

For issues or questions:
1. Check gateway logs: `docker-compose logs gateway`
2. Verify endpoint: `curl http://localhost:3000/health`
3. Test with curl first before using CLI
4. Check this guide's troubleshooting section
