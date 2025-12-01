/**
 * Quota Enforcer - Daily quota checking and enforcement
 */

import { Pool } from 'pg';
import type { QuotaCheck } from '../types/tracing.js';

export class QuotaEnforcer {
    constructor(private db: Pool) { }

    /**
     * Check if user has quota available for a request
     */
    async checkQuota(
        userId: string,
        projectId: string,
        estimatedTokens: number,
        estimatedCost: number,
    ): Promise<QuotaCheck> {
        // Get or create user quota
        const quota = await this.getUserQuota(userId, projectId);

        if (!quota) {
            return {
                allowed: false,
                remaining: { tokens: 0, cost: 0 },
                resetAt: new Date(),
                reason: 'Quota not configured for user',
            };
        }

        // Check if quota needs reset (daily reset)
        if (new Date() >= quota.resetAt) {
            await this.resetQuota(userId, projectId);
            // Refresh quota data
            const refreshed = await this.getUserQuota(userId, projectId);
            if (!refreshed) {
                return {
                    allowed: false,
                    remaining: { tokens: 0, cost: 0 },
                    resetAt: new Date(),
                    reason: 'Failed to refresh quota',
                };
            }
            quota.currentTokensToday = refreshed.currentTokensToday;
            quota.currentCostToday = refreshed.currentCostToday;
        }

        // Check token quota
        const tokenRemaining = quota.maxTokensDaily - quota.currentTokensToday;
        if (estimatedTokens > tokenRemaining) {
            return {
                allowed: false,
                remaining: {
                    tokens: tokenRemaining,
                    cost: quota.maxCostDaily - quota.currentCostToday,
                },
                resetAt: quota.resetAt,
                reason: `Token quota exceeded. Remaining: ${tokenRemaining}, Requested: ${estimatedTokens}`,
            };
        }

        // Check cost quota
        const costRemaining = quota.maxCostDaily - quota.currentCostToday;
        if (estimatedCost > costRemaining) {
            return {
                allowed: false,
                remaining: {
                    tokens: tokenRemaining,
                    cost: costRemaining,
                },
                resetAt: quota.resetAt,
                reason: `Cost quota exceeded. Remaining: $${costRemaining.toFixed(4)}, Requested: $${estimatedCost.toFixed(4)}`,
            };
        }

        // Quota check passed
        return {
            allowed: true,
            remaining: {
                tokens: tokenRemaining - estimatedTokens,
                cost: costRemaining - estimatedCost,
            },
            resetAt: quota.resetAt,
        };
    }

    /**
     * Increment user quota usage
     */
    async incrementQuota(
        userId: string,
        projectId: string,
        tokens: number,
        cost: number,
    ): Promise<void> {
        await this.db.query(
            `UPDATE user_quotas
             SET current_tokens_today = current_tokens_today + $1,
                 current_cost_today = current_cost_today + $2,
                 updated_at = NOW()
             WHERE user_id = $3 AND project_id = $4`,
            [tokens, cost, userId, projectId],
        );
    }

    /**
     * Get user quota or create default if missing
     */
    private async getUserQuota(
        userId: string,
        projectId: string,
    ): Promise<{
        maxTokensDaily: number;
        maxCostDaily: number;
        currentTokensToday: number;
        currentCostToday: number;
        resetAt: Date;
    } | null> {
        const result = await this.db.query(
            `SELECT
                max_tokens_daily,
                max_cost_daily,
                current_tokens_today,
                current_cost_today,
                reset_at
             FROM user_quotas
             WHERE user_id = $1 AND project_id = $2`,
            [userId, projectId],
        );

        if (result.rows.length === 0) {
            // Create default quota (1M tokens, $10 per day)
            await this.createDefaultQuota(userId, projectId);
            return this.getUserQuota(userId, projectId);
        }

        const row = result.rows[0];
        return {
            maxTokensDaily: row.max_tokens_daily,
            maxCostDaily: parseFloat(row.max_cost_daily),
            currentTokensToday: row.current_tokens_today,
            currentCostToday: parseFloat(row.current_cost_today),
            resetAt: row.reset_at,
        };
    }

    /**
     * Create default quota for new user
     */
    private async createDefaultQuota(
        userId: string,
        projectId: string,
    ): Promise<void> {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        await this.db.query(
            `INSERT INTO user_quotas (
                user_id,
                project_id,
                max_tokens_daily,
                max_cost_daily,
                current_tokens_today,
                current_cost_today,
                reset_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, project_id) DO NOTHING`,
            [
                userId,
                projectId,
                1_000_000, // 1M tokens
                10.0, // $10
                0,
                0,
                tomorrow,
            ],
        );
    }

    /**
     * Reset quota to 0 and set next reset time
     */
    private async resetQuota(
        userId: string,
        projectId: string,
    ): Promise<void> {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        await this.db.query(
            `UPDATE user_quotas
             SET current_tokens_today = 0,
                 current_cost_today = 0,
                 reset_at = $1,
                 updated_at = NOW()
             WHERE user_id = $2 AND project_id = $3`,
            [tomorrow, userId, projectId],
        );
    }

    /**
     * Update quota limits for a user
     */
    async updateQuotaLimits(
        userId: string,
        projectId: string,
        maxTokensDaily: number,
        maxCostDaily: number,
    ): Promise<void> {
        await this.db.query(
            `UPDATE user_quotas
             SET max_tokens_daily = $1,
                 max_cost_daily = $2,
                 updated_at = NOW()
             WHERE user_id = $3 AND project_id = $4`,
            [maxTokensDaily, maxCostDaily, userId, projectId],
        );
    }

    /**
     * Get quota status for a user
     */
    async getQuotaStatus(
        userId: string,
        projectId: string,
    ): Promise<{
        maxTokensDaily: number;
        maxCostDaily: number;
        currentTokensToday: number;
        currentCostToday: number;
        remainingTokens: number;
        remainingCost: number;
        usagePercentage: {
            tokens: number;
            cost: number;
        };
        resetAt: Date;
    } | null> {
        const quota = await this.getUserQuota(userId, projectId);
        if (!quota) {
            return null;
        }

        const remainingTokens = quota.maxTokensDaily - quota.currentTokensToday;
        const remainingCost = quota.maxCostDaily - quota.currentCostToday;

        return {
            maxTokensDaily: quota.maxTokensDaily,
            maxCostDaily: quota.maxCostDaily,
            currentTokensToday: quota.currentTokensToday,
            currentCostToday: quota.currentCostToday,
            remainingTokens,
            remainingCost,
            usagePercentage: {
                tokens: (quota.currentTokensToday / quota.maxTokensDaily) * 100,
                cost: (quota.currentCostToday / quota.maxCostDaily) * 100,
            },
            resetAt: quota.resetAt,
        };
    }
}
