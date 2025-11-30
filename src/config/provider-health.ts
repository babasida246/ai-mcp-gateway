import { env } from './env.js';
import { logger } from '../logging/logger.js';
import { ModelProvider } from './models.js';

/**
 * Provider health status tracker
 */
export class ProviderHealthManager {
    private healthStatus: Map<ModelProvider, boolean> = new Map();
    private lastCheckTime: Map<ModelProvider, number> = new Map();
    private readonly CHECK_INTERVAL = 60000; // 1 minute

    /**
     * Check if a provider is healthy/available
     */
    async isProviderHealthy(provider: ModelProvider): Promise<boolean> {
        const lastCheck = this.lastCheckTime.get(provider) || 0;
        const now = Date.now();

        // Use cached result if checked recently
        if (now - lastCheck < this.CHECK_INTERVAL && this.healthStatus.has(provider)) {
            return this.healthStatus.get(provider)!;
        }

        // Perform actual health check
        const isHealthy = await this.checkProviderHealth(provider);
        this.healthStatus.set(provider, isHealthy);
        this.lastCheckTime.set(provider, now);

        return isHealthy;
    }

    /**
     * Perform actual health check for a provider
     */
    private async checkProviderHealth(provider: ModelProvider): Promise<boolean> {
        try {
            switch (provider) {
                case 'openai':
                    if (!env.OPENAI_API_KEY) return false;
                    // Could add actual API ping here
                    return true;

                case 'anthropic':
                    if (!env.ANTHROPIC_API_KEY) return false;
                    // Could add actual API ping here
                    return true;

                case 'openrouter':
                    if (!env.OPENROUTER_API_KEY) return false;
                    // Could add actual API ping here
                    return true;

                case 'oss-local':
                    if (!env.OSS_MODEL_ENABLED) return false;
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);

                        const response = await fetch(env.OSS_MODEL_ENDPOINT + '/api/tags', {
                            signal: controller.signal,
                        });

                        clearTimeout(timeoutId);
                        return response.ok;
                    } catch {
                        return false;
                    }

                default:
                    return false;
            }
        } catch (error) {
            logger.warn(`Health check failed for ${provider}: ${error}`);
            return false;
        }
    }

    /**
     * Mark a provider as unhealthy (e.g., after a failed request)
     */
    markProviderUnhealthy(provider: ModelProvider): void {
        this.healthStatus.set(provider, false);
        this.lastCheckTime.set(provider, Date.now());
        logger.warn(`Provider ${provider} marked as unhealthy`);
    }

    /**
     * Get all healthy providers
     */
    async getHealthyProviders(): Promise<ModelProvider[]> {
        const providers: ModelProvider[] = ['openai', 'anthropic', 'openrouter', 'oss-local'];
        const healthy: ModelProvider[] = [];

        for (const provider of providers) {
            if (await this.isProviderHealthy(provider)) {
                healthy.push(provider);
            }
        }

        return healthy;
    }

    /**
     * Force refresh health status for all providers
     */
    async refreshAllProviders(): Promise<void> {
        const providers: ModelProvider[] = ['openai', 'anthropic', 'openrouter', 'oss-local'];

        logger.info('Checking LLM provider connectivity...');

        for (const provider of providers) {
            this.lastCheckTime.delete(provider); // Force recheck
            const isHealthy = await this.isProviderHealthy(provider);

            const status = isHealthy ? '✅ Available' : '❌ Unavailable';
            logger.info(`${provider}: ${status}`);
        }
    }

    /**
     * Get provider status summary
     */
    getProviderStatusSummary(): Record<string, boolean> {
        const summary: Record<string, boolean> = {};
        this.healthStatus.forEach((healthy, provider) => {
            summary[provider] = healthy;
        });
        return summary;
    }
}

// Singleton instance
export const providerHealth = new ProviderHealthManager();
