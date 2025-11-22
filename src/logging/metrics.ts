import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Metrics collector for cost tracking and performance monitoring
 */
class MetricsCollector {
    private totalRequests = 0;
    private totalLLMCalls = 0;
    private totalInputTokens = 0;
    private totalOutputTokens = 0;
    private totalCost = 0;
    private requestDurations: number[] = [];

    /**
     * Record a new request
     */
    recordRequest(): void {
        this.totalRequests++;
    }

    /**
     * Record an LLM call
     */
    recordLLMCall(
        inputTokens: number,
        outputTokens: number,
        cost: number,
    ): void {
        this.totalLLMCalls++;
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        this.totalCost += cost;

        // Check cost alert threshold
        if (
            env.ENABLE_COST_TRACKING &&
            this.totalCost >= env.COST_ALERT_THRESHOLD
        ) {
            logger.warn('Cost Alert', {
                totalCost: this.totalCost.toFixed(4),
                threshold: env.COST_ALERT_THRESHOLD,
                message: 'Total cost has exceeded the alert threshold',
            });
        }
    }

    /**
     * Record request duration
     */
    recordDuration(duration: number): void {
        this.requestDurations.push(duration);
        // Keep only last 1000 durations
        if (this.requestDurations.length > 1000) {
            this.requestDurations.shift();
        }
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        const avgDuration =
            this.requestDurations.length > 0
                ? this.requestDurations.reduce((a, b) => a + b, 0) /
                this.requestDurations.length
                : 0;

        return {
            totalRequests: this.totalRequests,
            totalLLMCalls: this.totalLLMCalls,
            totalInputTokens: this.totalInputTokens,
            totalOutputTokens: this.totalOutputTokens,
            totalTokens: this.totalInputTokens + this.totalOutputTokens,
            totalCost: parseFloat(this.totalCost.toFixed(6)),
            averageDuration: parseFloat(avgDuration.toFixed(2)),
        };
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        this.totalRequests = 0;
        this.totalLLMCalls = 0;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.totalCost = 0;
        this.requestDurations = [];
    }

    /**
     * Print metrics summary
     */
    printSummary(): void {
        const metrics = this.getMetrics();
        logger.info('Metrics Summary', metrics);
    }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsCollector();
