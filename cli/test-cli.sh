#!/bin/bash
# Test script for MCP CLI

echo "🧪 Testing MCP CLI Tool"
echo "========================"
echo ""

# Set endpoint
export MCP_ENDPOINT="http://localhost:3000"

echo "1️⃣ Testing chat command (single message)..."
node dist/index.js chat "What is 2+2?"
echo ""

echo "2️⃣ Testing code command (stdin)..."
echo "function add(a, b) { return a + b }" | node dist/index.js code - "Review this code"
echo ""

echo "3️⃣ Testing diff command..."
cat > /tmp/test-sample.js << 'EOF'
function greet(name) {
  console.log("Hello " + name);
}
EOF

node dist/index.js diff /tmp/test-sample.js "Use template literals instead of concatenation"
echo ""

echo "✅ All tests completed!"
