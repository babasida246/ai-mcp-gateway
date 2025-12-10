@echo off
echo Starting MCP CLI debug demo...
echo.

echo Running: mcp --version
node "%~dp0cli\dist\index.js" --version
echo.

echo Running: mcp --help
node "%~dp0cli\dist\index.js" --help
echo.

echo Running: mcp debug --help
node "%~dp0cli\dist\index.js" debug --help
echo.

echo Demo completed!