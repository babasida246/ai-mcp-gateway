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
            const client = await getOpenRouterClient();
            const response = await client.models.list();

            res.json({
                success: true,
                models: response.data || response
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
     * Get API key usage limits
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

            res.json({
                success: true,
                limits: response.data.data || response.data
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

            res.json({
                success: true,
                credits: response.data.data || response.data
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

            res.json({
                success: true,
                activity: response.data.data || response.data
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
