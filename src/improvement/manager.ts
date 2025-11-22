import { db } from '../db/postgres.js';
import { logger } from '../logging/logger.js';

/**
 * Regression test entry
 */
export interface RegressionTest {
    id?: number;
    testName: string;
    category: string;
    description: string;
    testCode: string;
    expectedBehavior: string;
    discoveredFrom: string; // bug, pattern, user-feedback
    createdAt?: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Routing heuristic rule
 */
export interface RoutingHeuristic {
    id?: number;
    pattern: string;
    preferredLayer: string;
    preferredModel?: string;
    reasoning: string;
    successRate?: number;
    usageCount?: number;
    active: boolean;
    createdAt?: Date;
}

/**
 * Bug pattern entry
 */
export interface BugPattern {
    id?: number;
    category: string;
    pattern: string;
    description: string;
    solution: string;
    occurrences: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    createdAt?: Date;
}

/**
 * Self-Improvement Manager
 * Handles regression tests, routing heuristics, and bug pattern learning
 */
export class SelfImprovementManager {
    /**
     * Initialize database tables for self-improvement
     */
    async initializeTables(): Promise<void> {
        try {
            // Regression tests table
            await db.query(`
                CREATE TABLE IF NOT EXISTS regression_tests (
                    id SERIAL PRIMARY KEY,
                    test_name TEXT NOT NULL UNIQUE,
                    category TEXT NOT NULL,
                    description TEXT NOT NULL,
                    test_code TEXT NOT NULL,
                    expected_behavior TEXT NOT NULL,
                    discovered_from TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // Bug patterns table
            await db.query(`
                CREATE TABLE IF NOT EXISTS bug_patterns (
                    id SERIAL PRIMARY KEY,
                    category TEXT NOT NULL,
                    pattern TEXT NOT NULL,
                    description TEXT NOT NULL,
                    solution TEXT NOT NULL,
                    occurrences INTEGER DEFAULT 1,
                    severity TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Performance metrics table
            await db.query(`
                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id SERIAL PRIMARY KEY,
                    metric_name TEXT NOT NULL,
                    metric_value DECIMAL(10, 4),
                    metric_unit TEXT,
                    context JSONB DEFAULT '{}'::jsonb,
                    recorded_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Model performance comparison
            await db.query(`
                CREATE TABLE IF NOT EXISTS model_performance (
                    id SERIAL PRIMARY KEY,
                    model_id TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    success_rate DECIMAL(5, 2),
                    avg_latency_ms INTEGER,
                    avg_cost DECIMAL(10, 6),
                    total_calls INTEGER DEFAULT 1,
                    last_updated TIMESTAMP DEFAULT NOW()
                )
            `);

            // Create indexes
            await db.query(
                `CREATE INDEX IF NOT EXISTS idx_regression_tests_category ON regression_tests(category)`
            );
            await db.query(
                `CREATE INDEX IF NOT EXISTS idx_bug_patterns_category ON bug_patterns(category)`
            );
            await db.query(
                `CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name)`
            );
            await db.query(
                `CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance(model_id, task_type)`
            );

            logger.info('Self-improvement tables initialized');
        } catch (error) {
            logger.error('Failed to initialize self-improvement tables', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Add a regression test
     */
    async addRegressionTest(test: RegressionTest): Promise<void> {
        try {
            await db.insert('regression_tests', {
                test_name: test.testName,
                category: test.category,
                description: test.description,
                test_code: test.testCode,
                expected_behavior: test.expectedBehavior,
                discovered_from: test.discoveredFrom,
                metadata: test.metadata
                    ? JSON.stringify(test.metadata)
                    : '{}',
            });

            logger.info('Regression test added', { testName: test.testName });
        } catch (error) {
            logger.error('Failed to add regression test', {
                testName: test.testName,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Get all regression tests
     */
    async getRegressionTests(
        category?: string
    ): Promise<RegressionTest[]> {
        try {
            const query = category
                ? `SELECT * FROM regression_tests WHERE category = $1 ORDER BY created_at DESC`
                : `SELECT * FROM regression_tests ORDER BY created_at DESC`;

            const params = category ? [category] : [];
            const result = await db.query<{
                id: number;
                test_name: string;
                category: string;
                description: string;
                test_code: string;
                expected_behavior: string;
                discovered_from: string;
                created_at: Date;
                metadata: Record<string, unknown>;
            }>(query, params);

            if (!result || result.rows.length === 0) return [];

            return result.rows.map((row) => ({
                id: row.id,
                testName: row.test_name,
                category: row.category,
                description: row.description,
                testCode: row.test_code,
                expectedBehavior: row.expected_behavior,
                discoveredFrom: row.discovered_from,
                createdAt: row.created_at,
                metadata: row.metadata,
            }));
        } catch (error) {
            logger.error('Failed to get regression tests', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [];
        }
    }

    /**
     * Update routing heuristic based on performance
     */
    async updateRoutingHeuristic(
        heuristic: RoutingHeuristic
    ): Promise<void> {
        try {
            // Check if exists
            const exists = await db.query(
                `SELECT id FROM routing_rules WHERE pattern = $1`,
                [heuristic.pattern]
            );

            if (exists && exists.rows.length > 0) {
                // Update existing
                await db.update(
                    'routing_rules',
                    { pattern: heuristic.pattern },
                    {
                        preferred_layer: heuristic.preferredLayer,
                        preferred_model: heuristic.preferredModel || null,
                        metadata: JSON.stringify({
                            reasoning: heuristic.reasoning,
                            successRate: heuristic.successRate,
                            usageCount: heuristic.usageCount,
                        }),
                        active: heuristic.active,
                    }
                );
            } else {
                // Insert new
                await db.insert('routing_rules', {
                    pattern: heuristic.pattern,
                    preferred_layer: heuristic.preferredLayer,
                    preferred_model: heuristic.preferredModel || null,
                    active: heuristic.active,
                    metadata: JSON.stringify({
                        reasoning: heuristic.reasoning,
                        successRate: heuristic.successRate,
                        usageCount: heuristic.usageCount,
                    }),
                });
            }

            logger.info('Routing heuristic updated', {
                pattern: heuristic.pattern,
            });
        } catch (error) {
            logger.error('Failed to update routing heuristic', {
                pattern: heuristic.pattern,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Get routing heuristics
     */
    async getRoutingHeuristics(
        activeOnly = true
    ): Promise<RoutingHeuristic[]> {
        try {
            const query = activeOnly
                ? `SELECT * FROM routing_rules WHERE active = true ORDER BY priority DESC`
                : `SELECT * FROM routing_rules ORDER BY priority DESC`;

            const result = await db.query<{
                id: number;
                pattern: string;
                preferred_layer: string;
                preferred_model: string | null;
                active: boolean;
                created_at: Date;
                metadata: {
                    reasoning?: string;
                    successRate?: number;
                    usageCount?: number;
                };
            }>(query);

            if (!result || result.rows.length === 0) return [];

            return result.rows.map((row) => ({
                id: row.id,
                pattern: row.pattern,
                preferredLayer: row.preferred_layer,
                preferredModel: row.preferred_model || undefined,
                reasoning: row.metadata.reasoning || '',
                successRate: row.metadata.successRate,
                usageCount: row.metadata.usageCount,
                active: row.active,
                createdAt: row.created_at,
            }));
        } catch (error) {
            logger.error('Failed to get routing heuristics', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [];
        }
    }

    /**
     * Record bug pattern
     */
    async recordBugPattern(pattern: BugPattern): Promise<void> {
        try {
            // Check if pattern already exists
            const exists = await db.query(
                `SELECT id, occurrences FROM bug_patterns WHERE pattern = $1`,
                [pattern.pattern]
            );

            if (exists && exists.rows.length > 0) {
                // Update occurrence count
                const currentOccurrences = exists.rows[0].occurrences;
                await db.update(
                    'bug_patterns',
                    { pattern: pattern.pattern },
                    {
                        occurrences: currentOccurrences + 1,
                        updated_at: new Date(),
                    }
                );
            } else {
                // Insert new pattern
                await db.insert('bug_patterns', {
                    category: pattern.category,
                    pattern: pattern.pattern,
                    description: pattern.description,
                    solution: pattern.solution,
                    occurrences: 1,
                    severity: pattern.severity,
                });
            }

            logger.info('Bug pattern recorded', { pattern: pattern.pattern });
        } catch (error) {
            logger.error('Failed to record bug pattern', {
                pattern: pattern.pattern,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Get bug patterns
     */
    async getBugPatterns(category?: string): Promise<BugPattern[]> {
        try {
            const query = category
                ? `SELECT * FROM bug_patterns WHERE category = $1 ORDER BY occurrences DESC, severity DESC`
                : `SELECT * FROM bug_patterns ORDER BY occurrences DESC, severity DESC`;

            const params = category ? [category] : [];
            const result = await db.query<{
                id: number;
                category: string;
                pattern: string;
                description: string;
                solution: string;
                occurrences: number;
                severity: string;
                created_at: Date;
            }>(query, params);

            if (!result || result.rows.length === 0) return [];

            return result.rows.map((row) => ({
                id: row.id,
                category: row.category,
                pattern: row.pattern,
                description: row.description,
                solution: row.solution,
                occurrences: row.occurrences,
                severity: row.severity as BugPattern['severity'],
                createdAt: row.created_at,
            }));
        } catch (error) {
            logger.error('Failed to get bug patterns', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [];
        }
    }

    /**
     * Record performance metric
     */
    async recordMetric(
        name: string,
        value: number,
        unit: string,
        context?: Record<string, unknown>
    ): Promise<void> {
        try {
            await db.insert('performance_metrics', {
                metric_name: name,
                metric_value: value,
                metric_unit: unit,
                context: context ? JSON.stringify(context) : '{}',
            });
        } catch (error) {
            logger.error('Failed to record metric', {
                name,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Update model performance stats
     */
    async updateModelPerformance(
        modelId: string,
        taskType: string,
        success: boolean,
        latencyMs: number,
        cost: number
    ): Promise<void> {
        try {
            const existing = await db.query<{
                success_rate: number;
                avg_latency_ms: number;
                avg_cost: number;
                total_calls: number;
            }>(
                `SELECT success_rate, avg_latency_ms, avg_cost, total_calls 
                 FROM model_performance 
                 WHERE model_id = $1 AND task_type = $2`,
                [modelId, taskType]
            );

            if (existing && existing.rows.length > 0) {
                const current = existing.rows[0];
                const totalCalls = current.total_calls + 1;
                const successCount =
                    (current.success_rate / 100) * current.total_calls +
                    (success ? 1 : 0);
                const newSuccessRate = (successCount / totalCalls) * 100;
                const newAvgLatency =
                    (current.avg_latency_ms * current.total_calls +
                        latencyMs) /
                    totalCalls;
                const newAvgCost =
                    (current.avg_cost * current.total_calls + cost) /
                    totalCalls;

                await db.update(
                    'model_performance',
                    { model_id: modelId, task_type: taskType },
                    {
                        success_rate: newSuccessRate,
                        avg_latency_ms: Math.round(newAvgLatency),
                        avg_cost: newAvgCost,
                        total_calls: totalCalls,
                        last_updated: new Date(),
                    }
                );
            } else {
                await db.insert('model_performance', {
                    model_id: modelId,
                    task_type: taskType,
                    success_rate: success ? 100 : 0,
                    avg_latency_ms: latencyMs,
                    avg_cost: cost,
                    total_calls: 1,
                });
            }
        } catch (error) {
            logger.error('Failed to update model performance', {
                modelId,
                taskType,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Get model performance analytics
     */
    async getModelAnalytics(
        taskType?: string
    ): Promise<
        Array<{
            modelId: string;
            taskType: string;
            successRate: number;
            avgLatencyMs: number;
            avgCost: number;
            totalCalls: number;
        }>
    > {
        try {
            const query = taskType
                ? `SELECT * FROM model_performance WHERE task_type = $1 ORDER BY success_rate DESC, avg_cost ASC`
                : `SELECT * FROM model_performance ORDER BY success_rate DESC, avg_cost ASC`;

            const params = taskType ? [taskType] : [];
            const result = await db.query<{
                model_id: string;
                task_type: string;
                success_rate: number;
                avg_latency_ms: number;
                avg_cost: number;
                total_calls: number;
            }>(query, params);

            if (!result || result.rows.length === 0) return [];

            return result.rows.map((row) => ({
                modelId: row.model_id,
                taskType: row.task_type,
                successRate: row.success_rate,
                avgLatencyMs: row.avg_latency_ms,
                avgCost: row.avg_cost,
                totalCalls: row.total_calls,
            }));
        } catch (error) {
            logger.error('Failed to get model analytics', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [];
        }
    }

    /**
     * Generate self-improvement report
     */
    async generateReport(): Promise<{
        regressionTests: number;
        bugPatterns: number;
        routingHeuristics: number;
        topModels: Array<{ model: string; successRate: number }>;
        recentBugs: BugPattern[];
    }> {
        try {
            const [tests, bugs, heuristics, analytics] = await Promise.all([
                this.getRegressionTests(),
                this.getBugPatterns(),
                this.getRoutingHeuristics(),
                this.getModelAnalytics(),
            ]);

            return {
                regressionTests: tests.length,
                bugPatterns: bugs.length,
                routingHeuristics: heuristics.length,
                topModels: analytics.slice(0, 5).map((a) => ({
                    model: a.modelId,
                    successRate: a.successRate,
                })),
                recentBugs: bugs.slice(0, 10),
            };
        } catch (error) {
            logger.error('Failed to generate report', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return {
                regressionTests: 0,
                bugPatterns: 0,
                routingHeuristics: 0,
                topModels: [],
                recentBugs: [],
            };
        }
    }
}

// Singleton instance
export const selfImprovement = new SelfImprovementManager();
