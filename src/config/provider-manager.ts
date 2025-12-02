import { db } from '../db/postgres.js';
import { env } from './env.js';
import { logger } from '../logging/logger.js';

export type ProviderName = 'openai' | 'anthropic' | 'openrouter' | 'oss-local';

export interface ProviderConfig {
    id: string;
    provider_name: ProviderName;
    display_name: string;
    enabled: boolean;
    api_key: string | null;
    api_endpoint: string | null;
    config: Record<string, unknown>;
    health_status: boolean;
    last_health_check: Date | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Provider configuration manager
 * Manages API keys and provider settings from database
 */
export class ProviderManager {
    private providerCache: Map<ProviderName, ProviderConfig> = new Map();
    private lastCacheUpdate: number = 0;
    private readonly CACHE_TTL = 60000; // 1 minute

    /**
     * Initialize providers from environment variables on first run
     */
    async initializeFromEnv(): Promise<void> {
        try {
            logger.info('Initializing providers from environment...');

            // Load API keys from env and update database
            if (env.OPENROUTER_API_KEY) {
                await this.setProviderApiKey('openrouter', env.OPENROUTER_API_KEY, 'env-init');
                logger.info('✅ OpenRouter API key loaded from environment');
            }

            if (env.OPENAI_API_KEY) {
                await this.setProviderApiKey('openai', env.OPENAI_API_KEY, 'env-init');
                logger.info('✅ OpenAI API key loaded from environment');
            }

            if (env.ANTHROPIC_API_KEY) {
                await this.setProviderApiKey('anthropic', env.ANTHROPIC_API_KEY, 'env-init');
                logger.info('✅ Anthropic API key loaded from environment');
            }

            if (env.OSS_MODEL_ENABLED) {
                await this.updateProviderConfig('oss-local', {
                    enabled: true,
                    api_endpoint: env.OSS_MODEL_ENDPOINT,
                    config: {
                        model_name: env.OSS_MODEL_NAME,
                        supports_streaming: true
                    }
                });
                logger.info('✅ OSS/Local model configured');
            }

            logger.info('Provider initialization complete');
        } catch (error) {
            logger.error('Failed to initialize providers from env:', error);
        }
    }

    /**
     * Get provider configuration
     */
    async getProvider(providerName: ProviderName): Promise<ProviderConfig | null> {
        try {
            // Check cache first
            const now = Date.now();
            if (this.providerCache.has(providerName) && (now - this.lastCacheUpdate < this.CACHE_TTL)) {
                return this.providerCache.get(providerName) || null;
            }

            // Query database
            const client = await db.getClient();
            const result = await client.query<ProviderConfig>(
                'SELECT * FROM provider_configs WHERE provider_name = $1',
                [providerName]
            );
            client.release();

            if (result.rows.length === 0) {
                return null;
            }

            const provider = result.rows[0];
            this.providerCache.set(providerName, provider);
            this.lastCacheUpdate = now;

            return provider;
        } catch (error) {
            logger.error(`Failed to get provider ${providerName}:`, error);
            return null;
        }
    }

    /**
     * Get API key for a provider
     */
    async getApiKey(providerName: ProviderName): Promise<string | null> {
        try {
            const client = await db.getClient();
            const result = await client.query<{ get_provider_api_key: string }>(
                'SELECT get_provider_api_key($1) as get_provider_api_key',
                [providerName]
            );
            client.release();

            return result.rows[0]?.get_provider_api_key || null;
        } catch (error) {
            logger.error(`Failed to get API key for ${providerName}:`, error);
            return null;
        }
    }

    /**
     * Set API key for a provider
     */
    async setProviderApiKey(
        providerName: ProviderName,
        apiKey: string,
        performedBy: string = 'system'
    ): Promise<void> {
        try {
            const client = await db.getClient();
            await client.query(
                'SELECT set_provider_api_key($1, $2, $3)',
                [providerName, apiKey, performedBy]
            );
            client.release();

            // Clear cache
            this.providerCache.delete(providerName);

            logger.info(`API key set for provider: ${providerName}`);
        } catch (error) {
            logger.error(`Failed to set API key for ${providerName}:`, error);
            throw error;
        }
    }

    /**
     * Update provider configuration
     */
    async updateProviderConfig(
        providerName: ProviderName,
        updates: {
            enabled?: boolean;
            api_endpoint?: string;
            config?: Record<string, unknown>;
        }
    ): Promise<void> {
        try {
            const client = await db.getClient();
            const setClauses: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;

            if (updates.enabled !== undefined) {
                setClauses.push(`enabled = $${paramIndex++}`);
                values.push(updates.enabled);
            }

            if (updates.api_endpoint !== undefined) {
                setClauses.push(`api_endpoint = $${paramIndex++}`);
                values.push(updates.api_endpoint);
            }

            if (updates.config !== undefined) {
                setClauses.push(`config = $${paramIndex++}`);
                values.push(JSON.stringify(updates.config));
            }

            if (setClauses.length === 0) {
                return;
            }

            setClauses.push(`updated_at = NOW()`);
            values.push(providerName);

            const query = `
                UPDATE provider_configs
                SET ${setClauses.join(', ')}
                WHERE provider_name = $${paramIndex}
            `;

            await client.query(query, values);
            client.release();

            // Clear cache
            this.providerCache.delete(providerName);

            logger.info(`Provider config updated: ${providerName}`);
        } catch (error) {
            logger.error(`Failed to update provider config for ${providerName}:`, error);
            throw error;
        }
    }

    /**
     * Update provider health status
     */
    async updateHealthStatus(providerName: ProviderName, isHealthy: boolean): Promise<void> {
        try {
            const client = await db.getClient();
            await client.query(
                'SELECT update_provider_health($1, $2)',
                [providerName, isHealthy]
            );
            client.release();

            // Clear cache
            this.providerCache.delete(providerName);
        } catch (error) {
            logger.error(`Failed to update health status for ${providerName}:`, error);
        }
    }

    /**
     * Get all providers
     */
    async getAllProviders(): Promise<ProviderConfig[]> {
        try {
            const client = await db.getClient();
            const result = await client.query<ProviderConfig>(
                'SELECT * FROM provider_configs ORDER BY provider_name'
            );
            client.release();

            return result.rows;
        } catch (error) {
            logger.error('Failed to get all providers:', error);
            return [];
        }
    }

    /**
     * Get all enabled providers
     */
    async getEnabledProviders(): Promise<ProviderConfig[]> {
        try {
            const client = await db.getClient();
            const result = await client.query<ProviderConfig>(
                'SELECT * FROM provider_configs WHERE enabled = true ORDER BY provider_name'
            );
            client.release();

            return result.rows;
        } catch (error) {
            logger.error('Failed to get enabled providers:', error);
            return [];
        }
    }

    /**
     * Clear cache (force refresh)
     */
    clearCache(): void {
        this.providerCache.clear();
        this.lastCacheUpdate = 0;
    }
}

// Singleton instance
export const providerManager = new ProviderManager();
