# Self-Improvement Infrastructure

The AI MCP Gateway includes a comprehensive self-improvement loop that learns from usage patterns, records bugs, optimizes routing, and generates regression tests automatically.

## Overview

The self-improvement system consists of:

1. **Regression Test Generator**: Automatically creates tests from discovered bugs and patterns
2. **Routing Heuristics Optimizer**: Learns from performance data to improve routing decisions
3. **Bug Pattern Recorder**: Tracks common issues and their solutions
4. **Performance Analytics**: Monitors model performance and costs
5. **Metrics Tracking**: Records system-wide performance metrics

## Components

### 1. Regression Tests

Store test cases that prevent previously fixed bugs from recurring.

**Database Table**: `regression_tests`
- `test_name`: Unique test identifier
- `category`: Test category (routing, context, api, etc.)
- `description`: What the test validates
- `test_code`: Actual TypeScript/Vitest code
- `expected_behavior`: Expected outcome
- `discovered_from`: Source (bug, pattern, user-feedback)
- `metadata`: Additional context (JSONB)

**MCP Tool**: `generate_regression_test`

```typescript
// Example usage
await tools.generate_regression_test({
    testName: "routing_timeout_recovery",
    category: "routing",
    description: "Verify that router handles model timeouts gracefully",
    testCode: `
        it('should retry on timeout', async () => {
            const result = await router.route({ 
                input: 'test', 
                maxRetries: 3 
            });
            expect(result).toBeDefined();
        });
    `,
    expectedBehavior: "Router should retry up to 3 times on timeout",
    discoveredFrom: "bug",
    metadata: { bugTicket: "ISSUE-123" }
});
```

### 2. Routing Heuristics

Learn and store routing patterns that improve decision-making.

**Database Table**: `routing_rules`
- `pattern`: Regex pattern to match requests
- `preferred_layer`: Preferred layer (fast/balanced/deep)
- `preferred_model`: Optional specific model
- `priority`: Rule priority (higher = checked first)
- `active`: Whether rule is currently active
- `metadata`: Success rate, usage count, reasoning

**MCP Tool**: `update_routing_heuristic`

```typescript
// Example usage
await tools.update_routing_heuristic({
    pattern: ".*implement.*algorithm.*",
    preferredLayer: "deep",
    preferredModel: "claude-sonnet-4",
    reasoning: "Algorithm implementation requires deep reasoning",
    successRate: 92.5,
    usageCount: 45,
    active: true
});
```

### 3. Bug Patterns

Track recurring bugs and their solutions.

**Database Table**: `bug_patterns`
- `category`: Bug category (timeout, parsing, api, etc.)
- `pattern`: Pattern description
- `description`: Detailed bug description
- `solution`: How to fix
- `occurrences`: Number of times seen
- `severity`: low, medium, high, critical

**MCP Tool**: `record_bug_pattern`

```typescript
// Example usage
await tools.record_bug_pattern({
    category: "timeout",
    pattern: "LLM timeout on large context",
    description: "Model times out when context > 100K tokens",
    solution: "Split context into chunks, use compression",
    severity: "high"
});
```

### 4. Performance Metrics

Track and analyze system performance.

**Database Table**: `performance_metrics`
- `metric_name`: Name of metric
- `metric_value`: Numeric value
- `metric_unit`: Unit (ms, tokens, USD, etc.)
- `context`: Additional context (JSONB)
- `recorded_at`: Timestamp

**MCP Tool**: `record_metric`

```typescript
// Example usage
await tools.record_metric({
    name: "routing_latency",
    value: 156.7,
    unit: "ms",
    context: { layer: "balanced", model: "gpt-4o" }
});
```

### 5. Model Performance Analytics

Track model-specific performance and costs.

**Database Table**: `model_performance`
- `model_id`: Model identifier
- `task_type`: Type of task (coding, chat, analysis, etc.)
- `success_rate`: Success percentage (0-100)
- `avg_latency_ms`: Average response time
- `avg_cost`: Average cost per request (USD)
- `total_calls`: Number of calls made

**MCP Tool**: `update_model_performance`

```typescript
// Example usage
await tools.update_model_performance({
    modelId: "claude-sonnet-4",
    taskType: "coding",
    success: true,
    latencyMs: 2340,
    cost: 0.0125
});
```

## MCP Tools Reference

### Analysis Tools

#### `analyze_metrics`

Analyze performance metrics and generate improvement recommendations.

**Parameters**:
- `taskType` (optional): Filter by task type
- `includeReport` (optional): Include full improvement report (default: true)

**Returns**: Performance analysis with model rankings, success rates, costs, and improvement report.

**Example**:
```typescript
const analysis = await tools.analyze_metrics({
    taskType: "coding",
    includeReport: true
});

// Output:
// Model Performance Analysis:
// 
// claude-sonnet-4 (coding):
//   Success Rate: 95.67%
//   Avg Latency: 1850ms
//   Avg Cost: $0.012000
//   Total Calls: 234
//
// gpt-4o (coding):
//   Success Rate: 92.34%
//   Avg Latency: 1420ms
//   Avg Cost: $0.008500
//   Total Calls: 189
//
// Self-Improvement Summary:
//   Regression Tests: 45
//   Bug Patterns: 12
//   Routing Heuristics: 23
```

### Data Retrieval Tools

#### `get_regression_tests`

Get all regression tests, optionally filtered by category.

**Parameters**:
- `category` (optional): Filter by category

**Returns**: Array of regression test objects.

#### `get_routing_heuristics`

Get routing heuristics for optimized routing decisions.

**Parameters**:
- `activeOnly` (optional): Return only active heuristics (default: true)

**Returns**: Array of routing heuristic objects.

#### `get_bug_patterns`

Get known bug patterns, optionally filtered by category.

**Parameters**:
- `category` (optional): Filter by category

**Returns**: Array of bug pattern objects.

## Integration with Router

The self-improvement system is integrated with the routing layer:

```typescript
// In src/routing/router.ts
import { selfImprovement } from '../improvement/manager.js';

async function routeRequest(request: RoutingRequest) {
    const startTime = Date.now();
    
    // 1. Check routing heuristics for optimization
    const heuristics = await selfImprovement.getRoutingHeuristics();
    for (const rule of heuristics) {
        if (new RegExp(rule.pattern).test(request.input)) {
            // Apply learned routing rule
            return routeToLayer(rule.preferredLayer);
        }
    }
    
    // 2. Route normally
    const result = await routeNormally(request);
    
    // 3. Record performance
    await selfImprovement.updateModelPerformance(
        result.modelId,
        result.taskType,
        result.success,
        Date.now() - startTime,
        result.cost
    );
    
    // 4. Record bugs if failed
    if (!result.success && result.error) {
        await selfImprovement.recordBugPattern({
            category: "routing",
            pattern: result.error.type,
            description: result.error.message,
            solution: "See logs for details",
            severity: "medium"
        });
    }
    
    return result;
}
```

## Automatic Test Generation

The system can analyze failed requests and automatically generate regression tests:

```typescript
// In error handler
catch (error) {
    // Record bug
    await selfImprovement.recordBugPattern({
        category: "api",
        pattern: error.name,
        description: error.message,
        solution: error.fix || "Unknown",
        severity: "high"
    });
    
    // Generate regression test
    await selfImprovement.addRegressionTest({
        testName: `api_${error.name}_${Date.now()}`,
        category: "api",
        description: `Prevent ${error.name} from recurring`,
        testCode: `
            it('should handle ${error.name}', async () => {
                const request = ${JSON.stringify(request)};
                await expect(handleRequest(request)).resolves.not.toThrow();
            });
        `,
        expectedBehavior: "Request should succeed without throwing",
        discoveredFrom: "bug"
    });
}
```

## Reports and Insights

Generate self-improvement reports:

```typescript
const report = await selfImprovement.generateReport();

console.log(`
Self-Improvement Report:
- Regression Tests: ${report.regressionTests}
- Bug Patterns: ${report.bugPatterns}
- Routing Heuristics: ${report.routingHeuristics}

Top Performing Models:
${report.topModels.map(m => 
    `  ${m.model}: ${m.successRate.toFixed(2)}%`
).join('\n')}

Recent Bugs:
${report.recentBugs.map(b => 
    `  [${b.severity}] ${b.pattern} (${b.occurrences}x)`
).join('\n')}
`);
```

## Database Schema

Initialize self-improvement tables:

```typescript
import { selfImprovement } from './improvement/manager.js';

await selfImprovement.initializeTables();
```

This creates:
- `regression_tests`: Test cases
- `bug_patterns`: Known issues
- `performance_metrics`: System metrics
- `model_performance`: Model-specific analytics
- Plus indexes for efficient querying

## Best Practices

1. **Record Metrics Consistently**: Track every LLM call
2. **Update Heuristics Regularly**: Review and adjust routing rules based on performance
3. **Generate Tests From Bugs**: Turn every bug fix into a regression test
4. **Monitor Performance**: Use `analyze_metrics` to identify underperforming models
5. **Review Bug Patterns**: Periodically check for recurring issues

## Future Enhancements

- [ ] Automatic A/B testing of routing strategies
- [ ] ML-based routing optimization
- [ ] Automated test execution in CI/CD
- [ ] Predictive cost modeling
- [ ] Real-time alerting on performance degradation
- [ ] Integration with monitoring dashboards (Grafana, etc.)

## API Example

Using the self-improvement tools via HTTP API:

```bash
# Analyze metrics
curl -X POST http://localhost:3000/tools/analyze_metrics \
  -H "Content-Type: application/json" \
  -d '{"taskType": "coding", "includeReport": true}'

# Get routing heuristics
curl http://localhost:3000/tools/get_routing_heuristics?activeOnly=true

# Record a metric
curl -X POST http://localhost:3000/tools/record_metric \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api_latency",
    "value": 234.5,
    "unit": "ms",
    "context": {"endpoint": "/route"}
  }'
```

## Summary

The self-improvement infrastructure provides:
- ✅ Automated learning from usage patterns
- ✅ Regression test generation from bugs
- ✅ Performance-based routing optimization
- ✅ Comprehensive metrics and analytics
- ✅ Bug pattern tracking and prevention
- ✅ Model performance comparison

This creates a feedback loop where the system continuously improves its routing decisions, prevents recurring bugs, and optimizes for both cost and quality.
