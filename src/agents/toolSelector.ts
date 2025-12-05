/**
 * Adaptive Tool Selection
 * Learn which tools work best for different task types
 *
 * Tracks tool performance and uses pattern matching to prefer
 * tools that have historically worked well for similar tasks
 */

import { db } from '../db/postgres.js';
import { logger } from '../logging/logger.js';
import type { ToolPerformance } from './types.js';

/**
 * Tool execution result for learning
 */
export interface ToolExecutionResult {
    toolName: string;
    success: boolean;
    duration: number;
    taskContext: string;
    errorType?: string;
}

/**
 * Tool recommendation
 */
export interface ToolRecommendation {
    toolName: string;
    score: number;
    reason: string;
    historicalSuccess: number;
}

/**
 * Adaptive Tool Selector
 * Learns and recommends tools based on historical performance
 */
export class AdaptiveToolSelector {
    private performanceCache: Map<string, ToolPerformance> = new Map();
    private contextPatterns: Map<string, Map<string, number>> = new Map();

    /**
     * Initialize tool learning tables
     */
    static async initializeTables(): Promise<void> {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS tool_performance (
                    id SERIAL PRIMARY KEY,
                    tool_name TEXT NOT NULL,
                    total_calls INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    failure_count INTEGER DEFAULT 0,
                    avg_duration DECIMAL(10, 2) DEFAULT 0,
                    last_used TIMESTAMP DEFAULT NOW(),
                    context_patterns JSONB DEFAULT '{}'::jsonb,
                    error_patterns JSONB DEFAULT '{}'::jsonb,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(tool_name)
                )
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS tool_executions (
                    id SERIAL PRIMARY KEY,
                    tool_name TEXT NOT NULL,
                    success BOOLEAN NOT NULL,
                    duration INTEGER NOT NULL,
                    task_context TEXT,
                    error_type TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_tool_exec_name ON tool_executions(tool_name);
                CREATE INDEX IF NOT EXISTS idx_tool_exec_success ON tool_executions(success);
            `);

            logger.info('Tool learning tables initialized');
        } catch (error) {
            logger.error('Failed to initialize tool learning tables', { error });
        }
    }

    /**
     * Record a tool execution for learning
     */
    async recordExecution(result: ToolExecutionResult): Promise<void> {
        const { toolName, success, duration, taskContext, errorType } = result;

        // Update in-memory cache
        let perf = this.performanceCache.get(toolName);
        if (!perf) {
            perf = {
                toolName,
                totalCalls: 0,
                successCount: 0,
                failureCount: 0,
                avgDuration: 0,
                lastUsed: Date.now(),
                successRate: 0,
                contextPatterns: new Map(),
            };
            this.performanceCache.set(toolName, perf);
        }

        perf.totalCalls++;
        if (success) {
            perf.successCount++;
        } else {
            perf.failureCount++;
        }
        perf.avgDuration =
            (perf.avgDuration * (perf.totalCalls - 1) + duration) / perf.totalCalls;
        perf.successRate = perf.successCount / perf.totalCalls;
        perf.lastUsed = Date.now();

        // Track context patterns
        const contextKey = this.extractContextKey(taskContext);
        if (contextKey) {
            const count = perf.contextPatterns.get(contextKey) || 0;
            perf.contextPatterns.set(contextKey, count + (success ? 1 : -0.5));
        }

        // Persist to database
        try {
            // Record individual execution
            await db.query(
                `INSERT INTO tool_executions (tool_name, success, duration, task_context, error_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [toolName, success, duration, taskContext, errorType]
            );

            // Update aggregated performance
            await db.query(
                `INSERT INTO tool_performance (tool_name, total_calls, success_count, failure_count, avg_duration)
                 VALUES ($1, 1, $2, $3, $4)
                 ON CONFLICT (tool_name) DO UPDATE SET
                 total_calls = tool_performance.total_calls + 1,
                 success_count = tool_performance.success_count + $2,
                 failure_count = tool_performance.failure_count + $3,
                 avg_duration = (tool_performance.avg_duration * tool_performance.total_calls + $4) / (tool_performance.total_calls + 1),
                 last_used = NOW(),
                 updated_at = NOW()`,
                [toolName, success ? 1 : 0, success ? 0 : 1, duration]
            );
        } catch (error) {
            logger.error('Failed to record tool execution', { toolName, error });
        }
    }

    /**
     * Extract key patterns from task context
     */
    private extractContextKey(context: string): string {
        // Extract meaningful keywords from context
        const keywords = context
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 5);
        return keywords.sort().join('_');
    }

    /**
     * Get tool recommendations for a task
     */
    async recommend(
        taskContext: string,
        availableTools: string[]
    ): Promise<ToolRecommendation[]> {
        const contextKey = this.extractContextKey(taskContext);
        const recommendations: ToolRecommendation[] = [];

        // Load performance data for available tools
        await this.loadPerformanceData(availableTools);

        for (const toolName of availableTools) {
            const perf = this.performanceCache.get(toolName);

            let score = 0.5; // Default score
            let reason = 'No historical data';
            let historicalSuccess = 0;

            if (perf && perf.totalCalls > 0) {
                // Base score on success rate
                score = perf.successRate;
                historicalSuccess = perf.successRate;

                // Boost if tool has good performance for similar contexts
                const contextScore = perf.contextPatterns.get(contextKey) || 0;
                if (contextScore > 0) {
                    score = Math.min(1, score + 0.1);
                    reason = `High success rate (${(perf.successRate * 100).toFixed(0)}%) with similar tasks`;
                } else if (contextScore < 0) {
                    score = Math.max(0, score - 0.1);
                    reason = `Lower success with similar tasks`;
                } else {
                    reason = `${(perf.successRate * 100).toFixed(0)}% overall success rate`;
                }

                // Penalize if average duration is very high
                if (perf.avgDuration > 5000) {
                    score = Math.max(0, score - 0.05);
                }

                // Boost recently successful tools
                const recency = (Date.now() - perf.lastUsed) / (1000 * 60 * 60); // hours
                if (recency < 1 && perf.successRate > 0.8) {
                    score = Math.min(1, score + 0.05);
                }
            }

            recommendations.push({
                toolName,
                score,
                reason,
                historicalSuccess,
            });
        }

        // Sort by score descending
        return recommendations.sort((a, b) => b.score - a.score);
    }

    /**
     * Load performance data from database
     */
    private async loadPerformanceData(toolNames: string[]): Promise<void> {
        try {
            const result = await db.query<{
                tool_name: string;
                total_calls: number;
                success_count: number;
                failure_count: number;
                avg_duration: number;
                last_used: Date;
                context_patterns: Record<string, number>;
            }>(
                `SELECT * FROM tool_performance WHERE tool_name = ANY($1)`,
                [toolNames]
            );

            for (const row of result?.rows || []) {
                this.performanceCache.set(row.tool_name, {
                    toolName: row.tool_name,
                    totalCalls: row.total_calls,
                    successCount: row.success_count,
                    failureCount: row.failure_count,
                    avgDuration: Number(row.avg_duration),
                    lastUsed: row.last_used.getTime(),
                    successRate:
                        row.total_calls > 0 ? row.success_count / row.total_calls : 0,
                    contextPatterns: new Map(Object.entries(row.context_patterns || {})),
                });
            }
        } catch (error) {
            logger.error('Failed to load tool performance data', { error });
        }
    }

    /**
     * Get overall tool statistics
     */
    async getStatistics(): Promise<{
        totalExecutions: number;
        avgSuccessRate: number;
        topTools: Array<{ name: string; successRate: number; calls: number }>;
        problematicTools: Array<{ name: string; failureRate: number; calls: number }>;
    }> {
        try {
            const result = await db.query<{
                tool_name: string;
                total_calls: number;
                success_count: number;
                failure_count: number;
            }>(`SELECT * FROM tool_performance ORDER BY total_calls DESC`);

            const rows = result?.rows || [];
            const totalExecutions = rows.reduce((sum, r) => sum + r.total_calls, 0);
            const avgSuccessRate =
                totalExecutions > 0
                    ? rows.reduce((sum, r) => sum + r.success_count, 0) / totalExecutions
                    : 0;

            const topTools = rows
                .filter((r) => r.total_calls >= 5)
                .map((r) => ({
                    name: r.tool_name,
                    successRate: r.success_count / r.total_calls,
                    calls: r.total_calls,
                }))
                .sort((a, b) => b.successRate - a.successRate)
                .slice(0, 5);

            const problematicTools = rows
                .filter((r) => r.total_calls >= 5 && r.failure_count / r.total_calls > 0.3)
                .map((r) => ({
                    name: r.tool_name,
                    failureRate: r.failure_count / r.total_calls,
                    calls: r.total_calls,
                }))
                .sort((a, b) => b.failureRate - a.failureRate);

            return {
                totalExecutions,
                avgSuccessRate,
                topTools,
                problematicTools,
            };
        } catch (error) {
            logger.error('Failed to get tool statistics', { error });
            return {
                totalExecutions: 0,
                avgSuccessRate: 0,
                topTools: [],
                problematicTools: [],
            };
        }
    }

    /**
     * Clear performance data for a tool
     */
    async resetTool(toolName: string): Promise<void> {
        this.performanceCache.delete(toolName);

        try {
            await db.query(`DELETE FROM tool_performance WHERE tool_name = $1`, [toolName]);
            await db.query(`DELETE FROM tool_executions WHERE tool_name = $1`, [toolName]);
            logger.info('Tool performance data reset', { toolName });
        } catch (error) {
            logger.error('Failed to reset tool data', { toolName, error });
        }
    }

    /**
     * Get performance for a specific tool
     */
    getToolPerformance(toolName: string): ToolPerformance | undefined {
        return this.performanceCache.get(toolName);
    }
}

/**
 * Global tool selector instance
 */
export const toolSelector = new AdaptiveToolSelector();
