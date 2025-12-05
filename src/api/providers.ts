/**
 * Provider Management Routes
 * Manage LLM provider configurations and API keys
 */

import { Router, Request, Response } from 'express';
import { providerManager, ProviderName } from '../config/provider-manager.js';
import { providerHealth } from '../config/provider-health.js';
import { logger } from '../logging/logger.js';
import type { ModelProvider } from '../config/models.js';

export function createProviderRoutes(): Router {
    const router = Router();

    /**
     * GET /v1/providers
     * Get all provider configurations
     */
    router.get('/', async (req: Request, res: Response) => {
        try {
            const providers = await providerManager.getAllProviders();

            // Mask API keys for security
            const maskedProviders = providers.map(p => ({
                ...p,
                api_key: p.api_key ? `${p.api_key.substring(0, 8)}...${p.api_key.substring(p.api_key.length - 4)}` : null
            }));

            res.json({
                success: true,
                providers: maskedProviders
            });
        } catch (error) {
            logger.error('Failed to get providers', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/providers/:providerName
     * Get specific provider configuration
     */
    router.get('/:providerName', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;
            const provider = await providerManager.getProvider(providerName as ProviderName);

            if (!provider) {
                return res.status(404).json({
                    success: false,
                    error: 'Provider not found'
                });
            }

            // Mask API key
            const maskedProvider = {
                ...provider,
                api_key: provider.api_key ? `${provider.api_key.substring(0, 8)}...${provider.api_key.substring(provider.api_key.length - 4)}` : null
            };

            res.json({
                success: true,
                provider: maskedProvider
            });
        } catch (error) {
            logger.error('Failed to get provider', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * PUT /v1/providers/:providerName/api-key
     * Update provider API key
     */
    router.put('/:providerName/api-key', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;
            const { apiKey } = req.body;

            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'API key is required'
                });
            }

            await providerManager.setProviderApiKey(
                providerName as ProviderName,
                apiKey,
                'admin-api'
            );

            res.json({
                success: true,
                message: `API key updated for ${providerName}`
            });
        } catch (error) {
            logger.error('Failed to update API key', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * PATCH /v1/providers/:providerName
     * Update provider configuration
     */
    router.patch('/:providerName', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;
            const updates = req.body;

            await providerManager.updateProviderConfig(
                providerName as ProviderName,
                updates
            );

            res.json({
                success: true,
                message: `Provider ${providerName} updated`
            });
        } catch (error) {
            logger.error('Failed to update provider', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /v1/providers/:providerName/enable
     * Enable a provider
     */
    router.post('/:providerName/enable', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;

            await providerManager.updateProviderConfig(
                providerName as ProviderName,
                { enabled: true }
            );

            res.json({
                success: true,
                message: `Provider ${providerName} enabled`
            });
        } catch (error) {
            logger.error('Failed to enable provider', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /v1/providers/:providerName/disable
     * Disable a provider
     */
    router.post('/:providerName/disable', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;

            await providerManager.updateProviderConfig(
                providerName as ProviderName,
                { enabled: false }
            );

            res.json({
                success: true,
                message: `Provider ${providerName} disabled`
            });
        } catch (error) {
            logger.error('Failed to disable provider', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /v1/providers/:providerName/reset
     * Reset provider health status
     */
    router.post('/:providerName/reset', async (req: Request, res: Response) => {
        try {
            const { providerName } = req.params;

            providerHealth.resetProvider(providerName as ModelProvider);

            // Force recheck
            const isHealthy = await providerHealth.isProviderHealthy(providerName as ModelProvider);

            res.json({
                success: true,
                message: `Provider ${providerName} health status reset`,
                isHealthy
            });
        } catch (error) {
            logger.error('Failed to reset provider', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /v1/providers/refresh-all
     * Refresh health status for all providers
     */
    router.post('/refresh-all', async (_req: Request, res: Response) => {
        try {
            await providerHealth.refreshAllProviders();
            const summary = providerHealth.getProviderStatusSummary();

            res.json({
                success: true,
                message: 'All providers refreshed',
                status: summary
            });
        } catch (error) {
            logger.error('Failed to refresh providers', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    return router;
}

export default createProviderRoutes();
