import { Router } from 'express';
import { OpenRouter } from '@openrouter/sdk';
import axios from 'axios';
import { logger } from '../logging/logger.js';
import { providerManager } from '../config/provider-manager.js';

/**
 * Get OpenRouter client instance
 */
async function getOpenRouterClient(): Promise<OpenRouter> {
    const apiKey = await providerManager.getApiKey('openrouter');
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured');
    }
    return new OpenRouter({ apiKey });
}

/**
 * Get OpenRouter API key for direct axios calls
 */
async function getOpenRouterApiKey(): Promise<string> {
    const apiKey = await providerManager.getApiKey('openrouter');
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured');
    }
    return apiKey;
}

/**
 * Create and configure OpenRouter routes
 */
export function createOpenRouterRoutes(): Router {
    const router = Router();

    /**
     * GET /v1/openrouter/models
     * Fetch available models from OpenRouter
     */
    router.get('/models', async (req, res) => {
        try {
            let modelsData;

            try {
                // Try OpenRouter SDK first
                const client = await getOpenRouterClient();
                const response = await client.models.list();
                modelsData = response.data || response;
            } catch (sdkError) {
                // Fallback to direct API call if SDK fails
                logger.warn('OpenRouter SDK failed, using fallback API', { error: sdkError });
                const apiKey = await getOpenRouterApiKey();

                const response = await axios.get('https://openrouter.ai/api/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': req.get('origin') || 'https://github.com/babasida246/ai-mcp-gateway',
                        'X-Title': 'ai-mcp-gateway'
                    }
                });
                modelsData = response.data.data || response.data;
            }

            // Ensure proper data structure for models
            const processedModels = Array.isArray(modelsData)
                ? modelsData.map(model => ({
                    ...model,
                    context_length: typeof model.context_length === 'number' ? model.context_length : 0,
                    pricing: model.pricing || { prompt: 0, completion: 0 }
                }))
                : [];

            res.json({
                success: true,
                models: processedModels
            });
        } catch (error: any) {
            logger.error('Failed to fetch OpenRouter models', { error: error.message });
            res.status(error.status || 500).json({
                success: false,
                error: error.message || 'Failed to fetch models'
            });
        }
    });

    /**
     * GET /v1/openrouter/limits
     * Get rate limits and usage
     */
    router.get('/limits', async (req, res) => {
        try {
            const apiKey = await getOpenRouterApiKey();

            const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': req.get('origin') || 'https://github.com/babasida246/ai-mcp-gateway',
                    'X-Title': 'ai-mcp-gateway'
                }
            });

            // Extract rate limit info from auth/key response
            const keyData = response.data.data || response.data;
            const limitsData = {
                usage: typeof keyData.usage === 'number' ? keyData.usage : 0,
                limit: typeof keyData.limit === 'number' ? keyData.limit : 100000,
                is_free_tier: keyData.is_free_tier || false,
                rate_limit: keyData.rate_limit || null,
                label: keyData.label || null
            };

            res.json({
                success: true,
                limits: limitsData
            });
        } catch (error: any) {
            logger.error('Failed to fetch OpenRouter limits', { error: error.message });
            res.status(error.response?.status || 500).json({
                success: false,
                error: error.response?.data || error.message
            });
        }
    });

    /**
     * GET /v1/openrouter/credits
     * Get remaining credits
     */
    router.get('/credits', async (req, res) => {
        try {
            const apiKey = await getOpenRouterApiKey();

            const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': req.get('origin') || 'https://github.com/babasida246/ai-mcp-gateway',
                    'X-Title': 'ai-mcp-gateway'
                }
            });

            // Extract credit info from auth/key response
            const keyData = response.data.data || response.data;
            const creditsData = {
                balance: typeof keyData.credit === 'number' ? keyData.credit : 0,
                usage: typeof keyData.usage === 'number' ? keyData.usage : 0,
                limit: typeof keyData.credit_limit === 'number' ? keyData.credit_limit : 10
            };

            res.json({
                success: true,
                credits: creditsData
            });
        } catch (error: any) {
            logger.error('Failed to fetch OpenRouter credits', { error: error.message });
            res.status(error.response?.status || 500).json({
                success: false,
                error: error.response?.data || error.message
            });
        }
    });

    /**
     * GET /v1/openrouter/activity
     * Get user activity grouped by endpoint
     */
    router.get('/activity', async (req, res) => {
        try {
            const apiKey = await getOpenRouterApiKey();

            const response = await axios.get('https://openrouter.ai/api/v1/activity', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': req.get('origin') || 'https://github.com/babasida246/ai-mcp-gateway',
                    'X-Title': 'ai-mcp-gateway'
                }
            });

            // Ensure proper data structure for activity items
            const activityData = response.data.data || response.data || [];
            const processedActivity = Array.isArray(activityData)
                ? activityData.map(item => ({
                    ...item,
                    total_cost: typeof item.total_cost === 'number' ? item.total_cost : 0,
                    generations: typeof item.generations === 'number' ? item.generations : 0,
                    created_at: item.created_at || new Date().toISOString()
                }))
                : [];

            res.json({
                success: true,
                activity: processedActivity
            });
        } catch (error: any) {
            logger.error('Failed to fetch OpenRouter activity', { error: error.message });
            res.status(error.response?.status || 500).json({
                success: false,
                error: error.response?.data || error.message
            });
        }
    });

    return router;
}

export default createOpenRouterRoutes();
