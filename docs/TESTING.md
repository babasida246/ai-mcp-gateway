# Testing Guide

## Overview

AI MCP Gateway uses a comprehensive testing strategy:

- **Unit Tests**: Vitest for isolated component testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Playwright for full-stack testing
- **Regression Tests**: Bug reproduction and prevention

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# With UI
npm run test:ui

# Specific file
npm test -- tests/unit/routing.test.ts

# With coverage
npm test -- --coverage
```

### Integration Tests

```bash
# Run integration tests
npm test -- tests/integration/

# Specific test
npm test -- tests/integration/api.test.ts
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# With UI (interactive)
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# Headed mode (see browser)
npm run test:e2e:headed
```

## Test Structure

```
tests/
├── unit/
│   ├── cache.test.ts      # Redis cache tests
│   ├── config.test.ts     # Configuration tests
│   ├── db.test.ts         # Database tests
│   └── routing.test.ts    # Router tests
├── integration/
│   ├── api.test.ts        # API endpoint tests
│   └── context.test.ts    # Context manager tests
└── regression/
    └── bugs.test.ts       # Bug regression tests
```

## Writing Tests

### Unit Test Example

```typescript
// tests/unit/routing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { router } from '../../src/routing/router.js';

describe('Router', () => {
    beforeEach(() => {
        // Setup before each test
    });

    it('should select model by priority', async () => {
        const result = await router.route({
            messages: [{ role: 'user', content: 'Hello' }],
        });
        
        expect(result).toBeDefined();
        expect(result.model).toBeDefined();
    });

    it('should respect layer limits', async () => {
        const result = await router.route({
            messages: [{ role: 'user', content: 'Hello' }],
            layer: 'L0',
        });
        
        expect(result.model.layer).toBe('L0');
    });
});
```

### Integration Test Example

```typescript
// tests/integration/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

describe('API Endpoints', () => {
    it('GET /health should return status', async () => {
        const response = await axios.get(`${API_BASE}/health`);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');
        expect(response.data.status).toBe('ok');
    });

    it('GET /v1/models/layers should return layers', async () => {
        const response = await axios.get(`${API_BASE}/v1/models/layers`);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('layers');
        expect(response.data.layers).toHaveProperty('L0');
    });
});
```

### E2E Test Example

```typescript
// playwright/example.spec.ts
import { test, expect } from '@playwright/test';

test('dashboard loads correctly', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Check title
    await expect(page).toHaveTitle(/AI MCP Gateway/);
    
    // Check main elements
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Dashboard');
});

test('can view models', async ({ page }) => {
    await page.goto('http://localhost:5173/models');
    
    // Wait for models to load
    await page.waitForSelector('[data-testid="model-list"]');
    
    // Check model cards exist
    const models = page.locator('[data-testid="model-card"]');
    await expect(models).toHaveCount.above(0);
});
```

## Configuration

### Vitest Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});
```

### Playwright Config

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './playwright',
    use: {
        baseURL: 'http://localhost:5173',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run start:api',
        port: 3000,
        reuseExistingServer: true,
    },
});
```

## Test Database

For tests, use a separate database:

```bash
# Create test database
createdb mcpgateway_test

# Set test environment
export DATABASE_URL=postgresql://user:pass@localhost:5432/mcpgateway_test
```

## Mocking

### Mock Redis

```typescript
import { vi } from 'vitest';

vi.mock('../../src/cache/redis.js', () => ({
    redisCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
        del: vi.fn().mockResolvedValue(true),
    },
}));
```

### Mock LLM Provider

```typescript
vi.mock('../../src/tools/llm/client.js', () => ({
    callLLM: vi.fn().mockResolvedValue({
        content: 'Mock response',
        tokens: { input: 10, output: 20 },
        cost: 0,
    }),
}));
```

## Coverage

Generate coverage report:

```bash
npm test -- --coverage
```

Coverage targets:
- Statements: 80%
- Branches: 70%
- Functions: 80%
- Lines: 80%

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: mcpgateway_test
        ports:
          - 5432:5432
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/mcpgateway_test
          REDIS_URL: redis://localhost:6379
```

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Clean up**: Reset state after each test
3. **Use fixtures**: Reusable test data
4. **Mock external services**: Don't call real APIs in tests
5. **Test edge cases**: Error handling, empty inputs, etc.
6. **Keep tests fast**: Mock slow operations
7. **Write regression tests**: For every bug fixed
