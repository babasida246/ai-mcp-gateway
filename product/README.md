# MCP Gateway - Production Release

## Quick Start

### Using Standalone Binary (Recommended)

#### Windows
```powershell
cd product/bin
.\mcp-gateway-win.exe
```

#### Linux
```bash
cd product/bin
chmod +x mcp-gateway-linux
./mcp-gateway-linux
```

#### macOS
```bash
cd product/bin
chmod +x mcp-gateway-macos
./mcp-gateway-macos
```

### Using Node.js (Fallback)

If binaries don't work on your system:

```bash
cd product/dist-obfuscated
node index.js
```

**Requirements**: Node.js >= 20.0.0

## Configuration

1. Copy `config/.env.example` to `.env` in your working directory
2. Edit `.env` with your API keys and database credentials
3. Run migrations: `node dist-obfuscated/index.js db:migrate`

See `docs/` for detailed deployment guides.

## Structure

- `bin/` - Standalone executables (no Node.js needed)
- `dist-obfuscated/` - Obfuscated Node.js code (fallback)
- `config/` - Configuration templates
- `docs/` - Documentation
- `migrations/` - Database migration scripts

## Security Notes

- This release contains minified and obfuscated code
- Source maps are not included
- Binaries are compressed with Brotli

## License

See `docs/LICENSE` for license information.
