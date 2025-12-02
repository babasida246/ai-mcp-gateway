/**
 * Model Configuration Service
 * Manages model and layer configurations from database
 * Falls back to .env values if DB is not available
 */

import { db } from './postgres.js';
import { logger } from '../logging/logger.js';
import { env } from '../config/env.js';
import type { ModelConfig, ModelLayer, ModelProvider } from '../config/models.js';

interface DBModelConfig {
    id: string;
    provider: string;
    api_model_name: string;
    layer: string;
    relative_cost: number;
    price_per_1k_input_tokens: number;
    price_per_1k_output_tokens: number;
    context_window: number;
    enabled: boolean;
    capabilities: {
        code: boolean;
        general: boolean;
        reasoning: boolean;
        vision?: boolean;
    };
    metadata: Record<string, unknown>;
}

interface DBLayerConfig {
    layer: string;
    enabled: boolean;
    model_ids: string[];
    fallback_models: string[];
    metadata: Record<string, unknown>;
}

interface DBTaskPreference {
    task_type: string;
    model_ids: string[];
    enabled: boolean;
}

class ModelConfigService {
    private initialized = false;
    private modelCache: Map<string, ModelConfig> = new Map();
    private layerCache: Map<ModelLayer, DBLayerConfig> = new Map();
    private taskPreferenceCache: Map<string, string[]> = new Map();

    /**
     * Initialize model configurations from database
     * Falls back to .env if DB not available
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            if (!db.isReady()) {
                logger.warn('Database not ready, using .env configuration');
                await this.loadFromEnv();
                return;
            }

            logger.info('Loading model configurations from database...');
            await this.loadFromDatabase();
            this.initialized = true;
            logger.info(`Model configurations loaded from database: ${this.modelCache.size} models, ${this.layerCache.size} layers`);
        } catch (error) {
            logger.error('Failed to load model configurations from database', {
                error,
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            logger.warn('Falling back to .env configuration');
            await this.loadFromEnv();
        }
    }

    /**
     * Load configurations from database
     */
    private async loadFromDatabase(): Promise<void> {
        const client = await db.getClient();
        try {
            // Load model configs
            const modelResult = await client.query<DBModelConfig>(
                'SELECT * FROM model_configs WHERE enabled = true ORDER BY layer, relative_cost'
            );

            this.modelCache.clear();
            for (const row of modelResult.rows) {
                const config: ModelConfig = {
                    id: row.id,
                    provider: row.provider as ModelProvider,
                    apiModelName: row.api_model_name,
                    layer: row.layer as ModelLayer,
                    relativeCost: row.relative_cost,
                    pricePer1kInputTokens: Number(row.price_per_1k_input_tokens),
                    pricePer1kOutputTokens: Number(row.price_per_1k_output_tokens),
                    contextWindow: row.context_window,
                    enabled: row.enabled,
                    capabilities: row.capabilities,
                };
                this.modelCache.set(config.id, config);
            }

            // Load layer configs
            const layerResult = await client.query<DBLayerConfig>(
                'SELECT * FROM layer_configs'
            );

            this.layerCache.clear();
            for (const row of layerResult.rows) {
                this.layerCache.set(row.layer as ModelLayer, row);
            }

            // Load task preferences
            const taskResult = await client.query<DBTaskPreference>(
                'SELECT * FROM task_model_preferences WHERE enabled = true'
            );

            this.taskPreferenceCache.clear();
            for (const row of taskResult.rows) {
                this.taskPreferenceCache.set(row.task_type, row.model_ids);
            }

            logger.info(`Loaded ${this.modelCache.size} models, ${this.layerCache.size} layers, ${this.taskPreferenceCache.size} task preferences from DB`);
        } finally {
            client.release();
        }
    }

    /**
     * Load configurations from .env (fallback)
     */
    private async loadFromEnv(): Promise<void> {
        // Import the MODEL_CATALOG from models.ts as fallback
        const { MODEL_CATALOG } = await import('../config/models.js');

        this.modelCache.clear();
        for (const model of MODEL_CATALOG) {
            if (model.enabled) {
                this.modelCache.set(model.id, model);
            }
        }

        // Initialize layer configs from env
        this.layerCache.set('L0', {
            layer: 'L0',
            enabled: env.LAYER_L0_ENABLED,
            model_ids: [],
            fallback_models: env.OPENROUTER_FALLBACK_MODELS?.split(',') || [],
            metadata: {},
        });
        this.layerCache.set('L1', {
            layer: 'L1',
            enabled: env.LAYER_L1_ENABLED,
            model_ids: [],
            fallback_models: [],
            metadata: {},
        });
        this.layerCache.set('L2', {
            layer: 'L2',
            enabled: env.LAYER_L2_ENABLED,
            model_ids: [],
            fallback_models: [],
            metadata: {},
        });
        this.layerCache.set('L3', {
            layer: 'L3',
            enabled: env.LAYER_L3_ENABLED,
            model_ids: [],
            fallback_models: [],
            metadata: {},
        });

        logger.info(`Loaded ${this.modelCache.size} models from .env`);
        this.initialized = true;
    }

    /**
     * Get all enabled models
     */
    async getModels(): Promise<ModelConfig[]> {
        await this.initialize();
        return Array.from(this.modelCache.values());
    }

    /**
     * Get models by layer
     */
    async getModelsByLayer(layer: ModelLayer): Promise<ModelConfig[]> {
        await this.initialize();

        const layerConfig = this.layerCache.get(layer);
        if (!layerConfig || !layerConfig.enabled) {
            return [];
        }

        const models = Array.from(this.modelCache.values()).filter(
            m => m.layer === layer && m.enabled
        );

        return models;
    }

    /**
     * Get model by ID
     */
    async getModelById(id: string): Promise<ModelConfig | undefined> {
        await this.initialize();
        return this.modelCache.get(id);
    }

    /**
     * Check if layer is enabled
     */
    async isLayerEnabled(layer: ModelLayer): Promise<boolean> {
        await this.initialize();
        const layerConfig = this.layerCache.get(layer);
        return layerConfig?.enabled ?? true;
    }

    /**
     * Update layer enabled status
     */
    async setLayerEnabled(layer: ModelLayer, enabled: boolean): Promise<void> {
        if (!db.isReady()) {
            logger.warn('Database not ready, cannot persist layer config');
            // Update cache only
            const layerConfig = this.layerCache.get(layer);
            if (layerConfig) {
                layerConfig.enabled = enabled;
            }
            return;
        }

        const client = await db.getClient();
        try {
            await client.query(
                'UPDATE layer_configs SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE layer = $2',
                [enabled, layer]
            );

            // Update cache
            const layerConfig = this.layerCache.get(layer);
            if (layerConfig) {
                layerConfig.enabled = enabled;
            }

            logger.info(`Layer ${layer} ${enabled ? 'enabled' : 'disabled'}`);
        } finally {
            client.release();
        }
    }

    /**
     * Update model enabled status
     */
    async setModelEnabled(modelId: string, enabled: boolean): Promise<void> {
        if (!db.isReady()) {
            logger.warn('Database not ready, cannot persist model config');
            // Update cache only
            const model = this.modelCache.get(modelId);
            if (model) {
                model.enabled = enabled;
            }
            return;
        }

        const client = await db.getClient();
        try {
            await client.query(
                'UPDATE model_configs SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [enabled, modelId]
            );

            // Update cache
            const model = this.modelCache.get(modelId);
            if (model) {
                model.enabled = enabled;
            }

            logger.info(`Model ${modelId} ${enabled ? 'enabled' : 'disabled'}`);
        } finally {
            client.release();
        }
    }

    /**
     * Update model configuration
     */
    async updateModel(modelId: string, updates: Partial<ModelConfig>): Promise<void> {
        if (!db.isReady()) {
            logger.warn('Database not ready, cannot persist model updates');
            // Update cache only
            const model = this.modelCache.get(modelId);
            if (model) {
                Object.assign(model, updates);
            }
            return;
        }

        const client = await db.getClient();
        try {
            const updateFields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (updates.apiModelName !== undefined) {
                updateFields.push(`api_model_name = $${paramIndex++}`);
                values.push(updates.apiModelName);
            }
            if (updates.provider !== undefined) {
                updateFields.push(`provider = $${paramIndex++}`);
                values.push(updates.provider);
            }
            if (updates.layer !== undefined) {
                updateFields.push(`layer = $${paramIndex++}`);
                values.push(updates.layer);
            }
            if (updates.relativeCost !== undefined) {
                updateFields.push(`relative_cost = $${paramIndex++}`);
                values.push(updates.relativeCost);
            }
            if (updates.pricePer1kInputTokens !== undefined) {
                updateFields.push(`price_per_1k_input_tokens = $${paramIndex++}`);
                values.push(updates.pricePer1kInputTokens);
            }
            if (updates.pricePer1kOutputTokens !== undefined) {
                updateFields.push(`price_per_1k_output_tokens = $${paramIndex++}`);
                values.push(updates.pricePer1kOutputTokens);
            }
            if (updates.contextWindow !== undefined) {
                updateFields.push(`context_window = $${paramIndex++}`);
                values.push(updates.contextWindow);
            }
            if (updates.enabled !== undefined) {
                updateFields.push(`enabled = $${paramIndex++}`);
                values.push(updates.enabled);
            }
            if (updates.capabilities !== undefined) {
                updateFields.push(`capabilities = $${paramIndex++}`);
                values.push(JSON.stringify(updates.capabilities));
            }

            if (updateFields.length === 0) {
                return; // Nothing to update
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(modelId);

            const query = `UPDATE model_configs SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;
            await client.query(query, values);

            // Update cache
            const model = this.modelCache.get(modelId);
            if (model) {
                Object.assign(model, updates);
            }

            logger.info(`Model ${modelId} updated`);
        } finally {
            client.release();
        }
    }

    /**
     * Add new model
     */
    async addModel(config: ModelConfig): Promise<void> {
        if (!db.isReady()) {
            logger.warn('Database not ready, cannot persist new model');
            // Add to cache only
            this.modelCache.set(config.id, config);
            return;
        }

        const client = await db.getClient();
        try {
            await client.query(
                `INSERT INTO model_configs 
                (id, provider, api_model_name, layer, relative_cost, price_per_1k_input_tokens, 
                 price_per_1k_output_tokens, context_window, enabled, capabilities)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    config.id,
                    config.provider,
                    config.apiModelName,
                    config.layer,
                    config.relativeCost,
                    config.pricePer1kInputTokens || 0,
                    config.pricePer1kOutputTokens || 0,
                    config.contextWindow,
                    config.enabled,
                    JSON.stringify(config.capabilities),
                ]
            );

            // Add to cache
            this.modelCache.set(config.id, config);

            logger.info(`Model ${config.id} added`);
        } finally {
            client.release();
        }
    }

    /**
     * Delete model
     */
    async deleteModel(modelId: string): Promise<void> {
        if (!db.isReady()) {
            logger.warn('Database not ready, cannot delete model');
            // Remove from cache only
            this.modelCache.delete(modelId);
            return;
        }

        const client = await db.getClient();
        try {
            await client.query('DELETE FROM model_configs WHERE id = $1', [modelId]);

            // Remove from cache
            this.modelCache.delete(modelId);

            logger.info(`Model ${modelId} deleted`);
        } finally {
            client.release();
        }
    }

    /**
     * Reload configurations from database
     */
    async reload(): Promise<void> {
        this.initialized = false;
        await this.initialize();
    }
}

export const modelConfigService = new ModelConfigService();
