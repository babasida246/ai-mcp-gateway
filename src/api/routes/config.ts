import { Router, Request, Response } from 'express';
import { configService } from '../../services/config/index.js';

const router = Router();

/**
 * GET /api/v1/config/system
 * Get all system configuration as flat key-value pairs
 */
router.get('/system', async (req: Request, res: Response) => {
    try {
        const pool = (configService as any).pool;
        const result = await pool.query(
            'SELECT key, value FROM system_config WHERE enabled = true ORDER BY key'
        );

        // Convert to flat object
        const config: Record<string, any> = {};
        for (const row of result.rows) {
            config[row.key] = row.value;
        }

        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/config/system/:key
 * Update a system configuration value
 */
router.put('/system/:key', async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({ error: 'value is required' });
        }

        await configService.set(key, value);
        res.json({ success: true, key, value });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/providers
 * Get all provider credentials (with partial API keys)
 */
router.get('/providers', async (req: Request, res: Response) => {
    try {
        const pool = (configService as any).pool;
        const result = await pool.query(
            `SELECT provider, api_key_encrypted, api_endpoint, enabled, configuration 
             FROM provider_credentials 
             ORDER BY provider`
        );

        // Return with encrypted keys visible (but encrypted, so safe to show)
        const providers = result.rows.map(row => ({
            provider: row.provider,
            apiKey: row.api_key_encrypted || '',
            endpoint: row.api_endpoint || '',
            enabled: row.enabled,
            configuration: row.configuration || {}
        }));

        res.json(providers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/providers/:provider
 * Get specific provider configuration
 */
router.get('/providers/:provider', async (req: Request, res: Response) => {
    try {
        const { provider } = req.params;
        const cred = await configService.getProvider(provider);

        if (!cred) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        // Sanitize response
        res.json({
            provider: cred.provider,
            enabled: cred.enabled,
            api_endpoint: cred.api_endpoint,
            configuration: cred.configuration,
            has_key: !!cred.api_key_encrypted
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/config/providers/:provider
 * Create or update provider credentials
 */
router.post('/providers/:provider', async (req: Request, res: Response) => {
    try {
        const { provider } = req.params;
        const { apiKey, endpoint, configuration } = req.body;

        if (!apiKey) {
            return res.status(400).json({ error: 'apiKey is required' });
        }

        await configService.setProvider(
            provider,
            apiKey,
            endpoint,
            configuration
        );

        res.json({ success: true, provider });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/v1/config/providers/:provider
 * Disable a provider
 */
router.delete('/providers/:provider', async (req: Request, res: Response) => {
    try {
        const { provider } = req.params;
        const pool = (configService as any).pool;

        await pool.query(
            'UPDATE provider_credentials SET enabled = false WHERE provider = $1',
            [provider]
        );

        // Clear cache
        (configService as any).configCache.delete(`provider:${provider}`);

        res.json({ success: true, provider });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/layers
 * Get all layer configurations
 */
router.get('/layers', async (req: Request, res: Response) => {
    try {
        const pool = (configService as any).pool;
        const result = await pool.query(
            'SELECT layer_name, models, priority, enabled, configuration FROM layer_config ORDER BY layer_name'
        );

        const layers = result.rows.map(row => ({
            layer: row.layer_name,
            models: row.models || [],
            priority: row.priority,
            enabled: row.enabled,
            description: row.configuration?.description || ''
        }));

        res.json(layers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/layers/:layer
 * Get specific layer configuration
 */
router.get('/layers/:layer', async (req: Request, res: Response) => {
    try {
        const { layer } = req.params;
        const config = await configService.getLayer(layer);

        if (!config) {
            return res.status(404).json({ error: 'Layer not found' });
        }

        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/config/layers/:layer
 * Update layer configuration
 */
router.put('/layers/:layer', async (req: Request, res: Response) => {
    try {
        const { layer } = req.params;
        const { models, priority, enabled, description } = req.body;
        const pool = (configService as any).pool;

        const configuration = description ? { description } : {};

        await pool.query(
            `UPDATE layer_config 
             SET models = $1, priority = $2, enabled = $3, configuration = $4
             WHERE layer_name = $5`,
            [models, priority, enabled, JSON.stringify(configuration), layer]
        );

        res.json({ success: true, layer });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/tasks
 * Get all task configurations
 */
router.get('/tasks', async (req: Request, res: Response) => {
    try {
        const pool = (configService as any).pool;
        const result = await pool.query(
            'SELECT task_type, models, fallback_models, enabled FROM task_config ORDER BY task_type'
        );

        const tasks = result.rows.map(row => ({
            task: row.task_type,
            preferredModel: row.models?.[0] || '',
            fallbackModels: row.fallback_models || [],
            enabled: row.enabled
        }));

        res.json(tasks);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/tasks/:task
 * Get specific task configuration
 */
router.get('/tasks/:task', async (req: Request, res: Response) => {
    try {
        const { task } = req.params;
        const config = await configService.getTask(task);

        if (!config) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/config/tasks/:task
 * Update task configuration
 */
router.put('/tasks/:task', async (req: Request, res: Response) => {
    try {
        const { task } = req.params;
        const { preferredModel, fallbackModels, enabled } = req.body;
        const pool = (configService as any).pool;

        const models = [preferredModel];

        await pool.query(
            `UPDATE task_config 
             SET models = $1, fallback_models = $2, enabled = $3
             WHERE task_type = $4`,
            [models, fallbackModels || [], enabled, task]
        );

        res.json({ success: true, task });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/config/features
 * Get all feature flags
 */
router.get('/features', async (req: Request, res: Response) => {
    try {
        const pool = (configService as any).pool;
        const result = await pool.query(
            'SELECT flag_key, enabled, description, metadata FROM feature_flags ORDER BY flag_key'
        );

        const features = result.rows.map(row => ({
            flag: row.flag_key,
            enabled: row.enabled,
            description: row.description || '',
            metadata: row.metadata || {}
        }));

        res.json(features);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/config/features/:flag
 * Update feature flag
 */
router.put('/features/:flag', async (req: Request, res: Response) => {
    try {
        const { flag } = req.params;
        const { enabled, description, metadata } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be boolean' });
        }

        const pool = (configService as any).pool;
        await pool.query(
            `UPDATE feature_flags 
             SET enabled = $1, description = $2, metadata = $3
             WHERE flag_key = $4`,
            [enabled, description || null, JSON.stringify(metadata || {}), flag]
        );

        res.json({ success: true, flag, enabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/config/cache/clear
 * Clear configuration cache
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
    try {
        configService.clearCache();
        res.json({ success: true, message: 'Cache cleared' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
