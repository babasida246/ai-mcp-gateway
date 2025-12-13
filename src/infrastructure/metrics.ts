/**
 * Metrics collection for monitoring and observability
 * Uses Prometheus client for metrics export
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a new registry for metrics
const register = new Registry();

// HTTP request metrics
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// LLM call metrics
export const llmCallCounter = new Counter({
  name: 'llm_calls_total',
  help: 'Total number of LLM API calls',
  labelNames: ['provider', 'model', 'status'],
  registers: [register],
});

export const llmCallDuration = new Histogram({
  name: 'llm_call_duration_seconds',
  help: 'Duration of LLM API calls in seconds',
  labelNames: ['provider', 'model', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const llmTokensUsed = new Counter({
  name: 'llm_tokens_total',
  help: 'Total number of tokens used in LLM calls',
  labelNames: ['provider', 'model', 'type'], // type: 'prompt' or 'completion'
  registers: [register],
});

export const llmCostAccumulated = new Counter({
  name: 'llm_cost_usd_total',
  help: 'Total cost of LLM calls in USD',
  labelNames: ['provider', 'model'],
  registers: [register],
});

// Cache metrics
export const cacheHitCounter = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'operation'], // cache_type: 'redis', 'memory'
  registers: [register],
});

export const cacheMissCounter = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'operation'],
  registers: [register],
});

export const cacheOperationDuration = new Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['cache_type', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// Database metrics
export const dbQueryCounter = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

export const dbConnectionsIdle = new Gauge({
  name: 'db_connections_idle',
  help: 'Number of idle database connections',
  registers: [register],
});

// Orchestrator metrics
export const orchestratorExecutions = new Counter({
  name: 'orchestrator_executions_total',
  help: 'Total number of orchestrator executions',
  labelNames: ['graph_id', 'status'],
  registers: [register],
});

export const orchestratorNodeExecutions = new Counter({
  name: 'orchestrator_node_executions_total',
  help: 'Total number of node executions in orchestrator',
  labelNames: ['node_type', 'status'],
  registers: [register],
});

export const orchestratorExecutionDuration = new Histogram({
  name: 'orchestrator_execution_duration_seconds',
  help: 'Duration of orchestrator executions in seconds',
  labelNames: ['graph_id', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

// Error metrics
export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'component'],
  registers: [register],
});

// Helper function to record chat completion metrics
export function recordChatCompletion(
  provider: string,
  model: string,
  durationSeconds: number,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  status: 'success' | 'error'
): void {
  llmCallCounter.inc({ provider, model, status });
  llmCallDuration.observe({ provider, model, status }, durationSeconds);
  llmTokensUsed.inc({ provider, model, type: 'prompt' }, inputTokens);
  llmTokensUsed.inc({ provider, model, type: 'completion' }, outputTokens);
  llmCostAccumulated.inc({ provider, model }, costUsd);
}

// Helper function to record cache operation
export function recordCacheOperation(
  cacheType: 'redis' | 'memory',
  operation: 'get' | 'set' | 'del' | 'exists',
  durationSeconds: number,
  hit: boolean
): void {
  if (hit) {
    cacheHitCounter.inc({ cache_type: cacheType, operation });
  } else {
    cacheMissCounter.inc({ cache_type: cacheType, operation });
  }
  cacheOperationDuration.observe({ cache_type: cacheType, operation }, durationSeconds);
}

// Helper function to record DB operation
export function recordDbOperation(
  operation: 'select' | 'insert' | 'update' | 'delete',
  table: string,
  durationSeconds: number,
  status: 'success' | 'error'
): void {
  dbQueryCounter.inc({ operation, table, status });
  dbQueryDuration.observe({ operation, table }, durationSeconds);
}

// Helper function to record orchestrator execution
export function recordOrchestratorExecution(
  graphId: string,
  durationSeconds: number,
  status: 'success' | 'error'
): void {
  orchestratorExecutions.inc({ graph_id: graphId, status });
  orchestratorExecutionDuration.observe({ graph_id: graphId, status }, durationSeconds);
}

// Helper function to record node execution
export function recordNodeExecution(
  nodeType: 'router' | 'llm' | 'tool' | 'conditional' | 'loop',
  status: 'success' | 'error'
): void {
  orchestratorNodeExecutions.inc({ node_type: nodeType, status });
}

// Helper function to record errors
export function recordError(errorType: string, component: string): void {
  errorCounter.inc({ error_type: errorType, component });
}

// Export the registry for /metrics endpoint
export { register };

// Export function to get all metrics as text
export function getMetricsText(): Promise<string> {
  return register.metrics();
}

// Export function to get metrics as JSON
export function getMetricsJSON(): Promise<object> {
  return register.getMetricsAsJSON();
}

// Default metrics (process-level metrics)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });
