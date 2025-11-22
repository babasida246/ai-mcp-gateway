# Testing Guide

Comprehensive testing documentation for AI MCP Gateway.

## Test Structure

```
tests/
├── unit/                   # Unit tests for individual components
│   ├── cache.test.ts      # Redis cache operations
│   └── db.test.ts         # PostgreSQL database operations
└── integration/           # Integration tests
    ├── api.test.ts        # HTTP API endpoints
    └── context.test.ts    # Context management system
```

## Prerequisites

### Required Services

1. **Redis** (for cache tests)
   ```bash
   # Windows (using Chocolatey)
   choco install redis-64
   redis-server
   
   # Docker
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **PostgreSQL** (for database tests)
   ```bash
   # Windows (using Chocolatey)
   choco install postgresql
   
   # Docker
   docker run -d -p 5432:5432 \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=ai_mcp_gateway \
     postgres:16-alpine
   ```

### Environment Setup

Create `.env.test` file:

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_mcp_gateway_test
DB_USER=postgres
DB_PASSWORD=postgres

# API
PORT=3001
MODE=api
```

## Running Tests

### All Tests

```bash
npm test
```

### Unit Tests Only

```bash
npm run test:unit
```

### Integration Tests Only

```bash
npm run test:integration
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

## Test Suites

### 1. Redis Cache Tests (`cache.test.ts`)

Tests Redis cache operations and error handling.

**Coverage**:
- ✅ Basic operations (get, set, delete, exists)
- ✅ TTL support and expiration
- ✅ Multi-get operations
- ✅ CacheKeys helper functions
- ✅ Complex data types (objects, arrays, nested)
- ✅ Error handling and graceful degradation

**Example Test**:
```typescript
it('should set and get a string value', async () => {
    await redisCache.set('test:key', 'test-value');
    const retrieved = await redisCache.get<string>('test:key');
    expect(retrieved).toBe('test-value');
});
```

**Running**:
```bash
npm test -- cache.test.ts
```

### 2. PostgreSQL Database Tests (`db.test.ts`)

Tests database operations and schema management.

**Coverage**:
- ✅ Schema initialization
- ✅ CRUD operations (insert, query, update, delete)
- ✅ Complex queries with WHERE clauses
- ✅ JSONB metadata handling
- ✅ Constraint violation handling
- ✅ Bulk operations performance
- ✅ Connection error handling

**Example Test**:
```typescript
it('should insert and query a conversation', async () => {
    await db.insert('conversations', {
        conversation_id: 'test-conv-1',
        project_id: 'test-project',
        created_at: new Date(),
    });
    
    const result = await db.query(
        'SELECT * FROM conversations WHERE conversation_id = $1',
        ['test-conv-1']
    );
    
    expect(result?.rows).toHaveLength(1);
});
```

**Running**:
```bash
npm test -- db.test.ts
```

### 3. HTTP API Tests (`api.test.ts`)

Tests all API endpoints and error handling.

**Coverage**:
- ✅ Health check endpoint
- ✅ POST /route (routing requests)
- ✅ POST /code-agent (code generation)
- ✅ POST /chat (chat interactions)
- ✅ GET /context/:id (retrieve context)
- ✅ PUT /context/:id (update context)
- ✅ CORS headers
- ✅ Error responses (404, 405, 400)
- ✅ Concurrent requests
- ✅ Performance benchmarks

**Example Test**:
```typescript
it('should route a simple request', async () => {
    const response = await fetch('http://localhost:3000/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userInput: 'What is 2 + 2?',
            conversationId: 'test-conv',
        }),
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('response');
});
```

**Running**:
```bash
# Start API server first
MODE=api npm start &

# Run tests
npm test -- api.test.ts
```

### 4. Context Management Tests (`context.test.ts`)

Tests two-tier context management system.

**Coverage**:
- ✅ Context summary CRUD operations
- ✅ Message management
- ✅ Two-tier caching (Redis + DB)
- ✅ Context compression
- ✅ Concurrent access handling
- ✅ Error recovery and fallback

**Example Test**:
```typescript
it('should fall back to database when Redis is empty', async () => {
    // Insert directly into database
    await db.insert('context_summaries', {
        conversation_id: 'test-conv',
        summary: 'DB fallback test',
        message_count: 3,
    });
    
    // Ensure Redis is empty
    await redisCache.del('conv:summary:test-conv');
    
    // Retrieve should fall back to DB
    const retrieved = await contextManager.getSummary('test-conv');
    
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe('DB fallback test');
});
```

**Running**:
```bash
npm test -- context.test.ts
```

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { yourModule } from '../../src/your-module.js';

describe('Your Module', () => {
    beforeAll(async () => {
        // Setup
    });
    
    afterAll(async () => {
        // Cleanup
    });
    
    describe('Feature Name', () => {
        it('should do something', async () => {
            // Arrange
            const input = 'test';
            
            // Act
            const result = await yourModule.method(input);
            
            // Assert
            expect(result).toBe('expected');
        });
    });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Integration Test', () => {
    beforeAll(async () => {
        // Start services, create test data
    });
    
    afterAll(async () => {
        // Stop services, cleanup test data
    });
    
    it('should integrate components correctly', async () => {
        // Test interaction between multiple components
    });
});
```

## Best Practices

### 1. Test Isolation

Each test should be independent:

```typescript
beforeEach(async () => {
    // Clean up before each test
    await db.delete('test_table', { test_id: 'test-123' });
});

afterEach(async () => {
    // Clean up after each test
    await db.delete('test_table', { test_id: 'test-123' });
});
```

### 2. Use Test-Specific Data

Use unique identifiers for test data:

```typescript
const testId = `test-${Date.now()}-${Math.random()}`;
```

### 3. Mock External Services

For unit tests, mock external dependencies:

```typescript
import { vi } from 'vitest';

vi.mock('../../src/external-service.js', () => ({
    externalCall: vi.fn(() => Promise.resolve('mocked result'))
}));
```

### 4. Test Error Cases

Always test both success and error paths:

```typescript
it('should handle errors gracefully', async () => {
    await expect(
        module.methodWithError()
    ).rejects.toThrow('Expected error message');
});
```

### 5. Performance Tests

Include performance assertions for critical paths:

```typescript
it('should complete in reasonable time', async () => {
    const startTime = Date.now();
    await performOperation();
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000); // < 1 second
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
      
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ai_mcp_gateway_test
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: ai_mcp_gateway_test
          DB_USER: postgres
          DB_PASSWORD: postgres
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Troubleshooting

### Tests Fail with "Redis connection error"

**Solution**: Ensure Redis is running
```bash
redis-cli ping
# Should return: PONG
```

### Tests Fail with "PostgreSQL connection error"

**Solution**: Check PostgreSQL status
```bash
psql -U postgres -c "SELECT 1"
```

### Tests Hang or Timeout

**Solution**: Check for unclosed connections
```typescript
afterAll(async () => {
    await redisCache.close();
    await db.close();
});
```

### Flaky Tests

**Causes**:
- Race conditions
- Shared state between tests
- External service dependencies

**Solutions**:
- Add proper cleanup in `beforeEach`/`afterEach`
- Use unique test data identifiers
- Mock external services
- Add retry logic for integration tests

## Coverage Goals

- **Unit Tests**: >80% coverage
- **Integration Tests**: >60% coverage
- **Critical Paths**: 100% coverage
  - Router logic
  - Context management
  - API endpoints
  - Database operations

## Test Metrics

View current test metrics:

```bash
npm run test:coverage

# Output:
# File                  | % Stmts | % Branch | % Funcs | % Lines |
# ----------------------|---------|----------|---------|---------|
# src/cache/redis.ts    |   95.23 |    88.88 |  100.00 |   94.44 |
# src/db/postgres.ts    |   92.30 |    85.71 |  100.00 |   91.66 |
# src/context/manager.ts|   87.50 |    75.00 |   90.00 |   86.95 |
# src/api/server.ts     |   84.61 |    70.00 |   85.71 |   83.33 |
# ----------------------|---------|----------|---------|---------|
# All files             |   89.41 |    79.89 |   93.85 |   89.10 |
```

## Adding New Test Suites

1. Create test file in `tests/unit/` or `tests/integration/`
2. Follow naming convention: `*.test.ts`
3. Import from `vitest`
4. Add to appropriate npm script in `package.json`
5. Update this guide with new test documentation

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Node.js Testing Guide](https://nodejs.org/en/docs/guides/testing/)

---

**Happy Testing! 🧪**
