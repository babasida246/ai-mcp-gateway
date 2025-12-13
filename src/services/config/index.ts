import crypto from 'crypto';
import { bootstrapDB } from '../../db/bootstrap.js';
import type { Pool } from 'pg';

/**
 * Configuration Service
 * Replaces process.env with database-backed configuration
 * Supports caching, encryption for sensitive values, and fallback defaults
 */

interface SystemConfig {
    key: string;
    value: string | null;
    value_type: 'string' | 'number' | 'boolean' | 'json';
    category: string;
    default_value: string | null;
}

interface ProviderCredential {
    provider: string;
    api_key_encrypted: string | null;
    api_endpoint: string | null;
    enabled: boolean;
    configuration: Record<string, any>;
}

interface LayerConfig {
    layer_name: string;
    models: string[];
    priority: number;
    enabled: boolean;
    configuration: Record<string, any>;
}

interface TaskConfig {
    task_type: string;
    models: string[];
    fallback_models: string[];
    enabled: boolean;
    configuration: Record<string, any>;
}

interface FeatureFlag {
    flag_key: string;
    enabled: boolean;
    description: string | null;
    metadata: Record<string, any>;
}

class ConfigService {
    private pool: Pool | null = null;
    private configCache: Map<string, any> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private cacheTTL = 60000; // 60 seconds

    // Encryption key - should be set via environment or bootstrap
    // Falls back to a default for initial setup only
    private encryptionKey: string;
    private algorithm = 'aes-256-cbc';

    constructor() {
        // Encryption key will be loaded from bootstrap during initialize()
        this.encryptionKey = '';
    }

    async initialize(): Promise<void> {
        await bootstrapDB.initialize();
        this.pool = bootstrapDB.getPool();
        this.encryptionKey = bootstrapDB.getEncryptionKey();

        // Normalize encryption key to 32 bytes for AES-256
        this.encryptionKey = crypto.createHash('sha256')
            .update(this.encryptionKey)
            .digest('base64')
            .substring(0, 32);
    } private ensurePool(): Pool {
        if (!this.pool) {
            throw new Error('ConfigService not initialized. Call initialize() first.');
        }
        return this.pool;
    }

    private getCached<T>(key: string): T | null {
        const expiry = this.cacheExpiry.get(key);
        if (expiry && Date.now() < expiry) {
            return this.configCache.get(key) as T;
        }
        this.configCache.delete(key);
        this.cacheExpiry.delete(key);
        return null;
    }

    private setCache(key: string, value: any): void {
        this.configCache.set(key, value);
        this.cacheExpiry.set(key, Date.now() + this.cacheTTL);
    }

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    private decrypt(encrypted: string): string {
        const parts = encrypted.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Get system configuration value
     */
    async get(key: string, defaultValue?: any): Promise<any> {
        const cacheKey = `sys:${key}`;
        const cached = this.getCached<any>(cacheKey);
        if (cached !== null) return cached;

        const pool = this.ensurePool();
        const result = await pool.query<SystemConfig>(
            'SELECT key, value, value_type, default_value FROM system_config WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return defaultValue;
        }

        const config = result.rows[0];
        const rawValue = config.value ?? config.default_value;

        if (rawValue === null) {
            return defaultValue;
        }

        let parsedValue: any;
        switch (config.value_type) {
            case 'number':
                parsedValue = parseFloat(rawValue);
                break;
            case 'boolean':
                parsedValue = rawValue.toLowerCase() === 'true';
                break;
            case 'json':
                parsedValue = JSON.parse(rawValue);
                break;
            default:
                parsedValue = rawValue;
        }

        this.setCache(cacheKey, parsedValue);
        return parsedValue;
    }

    /**
     * Set system configuration value
     */
    async set(key: string, value: any): Promise<void> {
        const pool = this.ensurePool();

        // Convert value to string based on type
        let stringValue: string;
        let valueType: SystemConfig['value_type'] = 'string';

        if (typeof value === 'number') {
            stringValue = value.toString();
            valueType = 'number';
        } else if (typeof value === 'boolean') {
            stringValue = value.toString();
            valueType = 'boolean';
        } else if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
            valueType = 'json';
        } else {
            stringValue = String(value);
        }

        await pool.query(
            `INSERT INTO system_config (key, value, value_type, category) 
             VALUES ($1, $2, $3, 'custom')
             ON CONFLICT (key) DO UPDATE SET value = $2, value_type = $3`,
            [key, stringValue, valueType]
        );

        // Clear cache
        this.configCache.delete(`sys:${key}`);
        this.cacheExpiry.delete(`sys:${key}`);
    }

    /**
     * Get all system config by category
     */
    async getByCategory(category: string): Promise<Record<string, any>> {
        const pool = this.ensurePool();
        const result = await pool.query<SystemConfig>(
            'SELECT key, value, value_type, default_value FROM system_config WHERE category = $1',
            [category]
        );

        const config: Record<string, any> = {};
        for (const row of result.rows) {
            const rawValue = row.value ?? row.default_value;
            if (rawValue === null) continue;

            let parsedValue: any;
            switch (row.value_type) {
                case 'number':
                    parsedValue = parseFloat(rawValue);
                    break;
                case 'boolean':
                    parsedValue = rawValue.toLowerCase() === 'true';
                    break;
                case 'json':
                    parsedValue = JSON.parse(rawValue);
                    break;
                default:
                    parsedValue = rawValue;
            }

            config[row.key] = parsedValue;
        }

        return config;
    }

    /**
     * Get provider credentials (decrypts API key)
     */
    async getProvider(provider: string): Promise<ProviderCredential | null> {
        const cacheKey = `provider:${provider}`;
        const cached = this.getCached<ProviderCredential>(cacheKey);
        if (cached) return cached;

        const pool = this.ensurePool();
        const result = await pool.query<ProviderCredential>(
            'SELECT provider, api_key_encrypted, api_endpoint, enabled, configuration FROM provider_credentials WHERE provider = $1',
            [provider]
        );

        if (result.rows.length === 0) return null;

        const cred = result.rows[0];

        // Decrypt API key if present
        if (cred.api_key_encrypted) {
            try {
                (cred as any).api_key = this.decrypt(cred.api_key_encrypted);
            } catch (err) {
                console.error(`Failed to decrypt API key for ${provider}:`, err);
                (cred as any).api_key = null;
            }
        }

        this.setCache(cacheKey, cred);
        return cred;
    }

    /**
     * Set provider credentials (encrypts API key)
     */
    async setProvider(provider: string, apiKey: string, endpoint?: string, config?: Record<string, any>): Promise<void> {
        const pool = this.ensurePool();
        const encryptedKey = this.encrypt(apiKey);

        await pool.query(
            `INSERT INTO provider_credentials (provider, api_key_encrypted, api_endpoint, enabled, configuration)
             VALUES ($1, $2, $3, true, $4)
             ON CONFLICT (provider) DO UPDATE 
             SET api_key_encrypted = $2, api_endpoint = $3, configuration = $4, enabled = true`,
            [provider, encryptedKey, endpoint, JSON.stringify(config || {})]
        );

        // Clear cache
        this.configCache.delete(`provider:${provider}`);
        this.cacheExpiry.delete(`provider:${provider}`);
    }

    /**
     * Get all enabled providers
     */
    async getEnabledProviders(): Promise<ProviderCredential[]> {
        const pool = this.ensurePool();
        const result = await pool.query<ProviderCredential>(
            'SELECT provider, api_key_encrypted, api_endpoint, enabled, configuration FROM provider_credentials WHERE enabled = true'
        );

        return result.rows.map(cred => {
            if (cred.api_key_encrypted) {
                try {
                    (cred as any).api_key = this.decrypt(cred.api_key_encrypted);
                } catch (err) {
                    console.error(`Failed to decrypt API key for ${cred.provider}`);
                    (cred as any).api_key = null;
                }
            }
            return cred;
        });
    }

    /**
     * Get layer configuration
     */
    async getLayer(layerName: string): Promise<LayerConfig | null> {
        const pool = this.ensurePool();
        const result = await pool.query<LayerConfig>(
            'SELECT layer_name, models, priority, enabled, configuration FROM layer_config WHERE layer_name = $1',
            [layerName]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Get all layers
     */
    async getAllLayers(): Promise<LayerConfig[]> {
        const pool = this.ensurePool();
        const result = await pool.query<LayerConfig>(
            'SELECT layer_name, models, priority, enabled, configuration FROM layer_config ORDER BY priority ASC'
        );

        return result.rows;
    }

    /**
     * Get task configuration
     */
    async getTask(taskType: string): Promise<TaskConfig | null> {
        const pool = this.ensurePool();
        const result = await pool.query<TaskConfig>(
            'SELECT task_type, models, fallback_models, enabled, configuration FROM task_config WHERE task_type = $1',
            [taskType]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Get feature flag
     */
    async getFeatureFlag(flagKey: string): Promise<boolean> {
        const cacheKey = `flag:${flagKey}`;
        const cached = this.getCached<boolean>(cacheKey);
        if (cached !== null) return cached;

        const pool = this.ensurePool();
        const result = await pool.query<FeatureFlag>(
            'SELECT enabled FROM feature_flags WHERE flag_key = $1',
            [flagKey]
        );

        const enabled = result.rows.length > 0 ? result.rows[0].enabled : false;
        this.setCache(cacheKey, enabled);
        return enabled;
    }

    /**
     * Set feature flag
     */
    async setFeatureFlag(flagKey: string, enabled: boolean): Promise<void> {
        const pool = this.ensurePool();

        await pool.query(
            `INSERT INTO feature_flags (flag_key, enabled)
             VALUES ($1, $2)
             ON CONFLICT (flag_key) DO UPDATE SET enabled = $2`,
            [flagKey, enabled]
        );

        this.configCache.delete(`flag:${flagKey}`);
        this.cacheExpiry.delete(`flag:${flagKey}`);
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.configCache.clear();
        this.cacheExpiry.clear();
    }
}

// Singleton instance
export const configService = new ConfigService();
