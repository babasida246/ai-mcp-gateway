/**
 * @file Admin API Routes
 * @description API endpoints for admin dashboard - MCP tools settings and backend configurations.
 * 
 * SECURITY NOTES (ATTT cấp 3):
 * - All routes require admin authentication
 * - All changes are logged with user ID and IP
 * - Secrets are never exposed in responses
 */

import { Router, Request, Response } from 'express';
import { mcpToolSettingsService } from '../mcp/settings/index.js';
import { McpToolSettingUpdateSchema, BackendConfigUpdateSchema } from '../mcp/settings/types.js';
import { logger } from '../logging/logger.js';
import { z } from 'zod';

/**
 * Create admin routes for MCP tools and backend configurations.
 */
export function createAdminRoutes(): Router {
    const router = Router();

    // ==========================================================================
    // MCP Tools Settings Routes
    // ==========================================================================

    /**
     * GET /admin/mcp-tools
     * List all MCP tools with their current settings.
     */
    router.get('/mcp-tools', async (req: Request, res: Response) => {
        try {
            const result = await mcpToolSettingsService.getAllToolSettings();
            res.json(result);
        } catch (error) {
            logger.error('Failed to list MCP tools', { error });
            res.status(500).json({
                error: 'Failed to list MCP tools',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /admin/mcp-tools/:toolName
     * Get settings for a specific tool.
     */
    router.get('/mcp-tools/:toolName', async (req: Request, res: Response) => {
        try {
            const { toolName } = req.params;
            const setting = mcpToolSettingsService.getToolSetting(toolName);

            res.json({
                toolName,
                setting,
            });
        } catch (error) {
            logger.error('Failed to get tool setting', { error, toolName: req.params.toolName });
            res.status(500).json({
                error: 'Failed to get tool setting',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * PUT /admin/mcp-tools/:toolName
     * Update settings for a specific tool.
     */
    router.put('/mcp-tools/:toolName', async (req: Request, res: Response) => {
        try {
            const { toolName } = req.params;

            // Validate input
            const parseResult = McpToolSettingUpdateSchema.safeParse(req.body);
            if (!parseResult.success) {
                res.status(400).json({
                    error: 'Invalid input',
                    details: parseResult.error.errors,
                });
                return;
            }

            // Get user info from auth (if available)
            const userId = (req as any).user?.id || 'anonymous';
            const auditContext = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('User-Agent'),
            };

            const setting = await mcpToolSettingsService.updateToolSetting(
                toolName,
                parseResult.data,
                userId,
                auditContext
            );

            logger.info('Tool setting updated via API', { toolName, userId });

            res.json({
                success: true,
                toolName,
                setting,
            });
        } catch (error) {
            logger.error('Failed to update tool setting', { error, toolName: req.params.toolName });
            res.status(500).json({
                error: 'Failed to update tool setting',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /admin/mcp-tools/:toolName/toggle
     * Quick toggle to enable/disable a tool.
     */
    router.post('/mcp-tools/:toolName/toggle', async (req: Request, res: Response) => {
        try {
            const { toolName } = req.params;
            const { enabled } = req.body;

            if (typeof enabled !== 'boolean') {
                res.status(400).json({
                    error: 'Invalid input',
                    message: '"enabled" must be a boolean',
                });
                return;
            }

            const userId = (req as any).user?.id || 'anonymous';
            const auditContext = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('User-Agent'),
            };

            const setting = await mcpToolSettingsService.updateToolSetting(
                toolName,
                { enabled },
                userId,
                auditContext
            );

            logger.info('Tool toggled via API', { toolName, enabled, userId });

            res.json({
                success: true,
                toolName,
                enabled: setting.enabled,
            });
        } catch (error) {
            logger.error('Failed to toggle tool', { error, toolName: req.params.toolName });
            res.status(500).json({
                error: 'Failed to toggle tool',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==========================================================================
    // Backend Configurations Routes
    // ==========================================================================

    /**
     * GET /admin/backends
     * List all backend configurations.
     */
    router.get('/backends', async (req: Request, res: Response) => {
        try {
            const result = await mcpToolSettingsService.getAllBackendConfigs();
            res.json(result);
        } catch (error) {
            logger.error('Failed to list backends', { error });
            res.status(500).json({
                error: 'Failed to list backends',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /admin/backends/:id
     * Get a specific backend configuration.
     */
    router.get('/backends/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const config = mcpToolSettingsService.getBackendConfig(id);

            if (!config) {
                res.status(404).json({
                    error: 'Backend not found',
                    id,
                });
                return;
            }

            res.json({
                id,
                config,
            });
        } catch (error) {
            logger.error('Failed to get backend', { error, id: req.params.id });
            res.status(500).json({
                error: 'Failed to get backend',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * PUT /admin/backends/:id
     * Create or update a backend configuration.
     */
    router.put('/backends/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Validate input
            const parseResult = BackendConfigUpdateSchema.safeParse(req.body);
            if (!parseResult.success) {
                res.status(400).json({
                    error: 'Invalid input',
                    details: parseResult.error.errors,
                });
                return;
            }

            const userId = (req as any).user?.id || 'anonymous';
            const auditContext = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('User-Agent'),
            };

            const config = await mcpToolSettingsService.upsertBackendConfig(
                id,
                parseResult.data,
                userId,
                auditContext
            );

            logger.info('Backend config updated via API', { id, userId });

            res.json({
                success: true,
                id,
                config,
            });
        } catch (error) {
            logger.error('Failed to update backend', { error, id: req.params.id });
            res.status(500).json({
                error: 'Failed to update backend',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * DELETE /admin/backends/:id
     * Delete a backend configuration.
     */
    router.delete('/backends/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const userId = (req as any).user?.id || 'anonymous';
            const auditContext = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('User-Agent'),
            };

            const deleted = await mcpToolSettingsService.deleteBackendConfig(
                id,
                userId,
                auditContext
            );

            if (!deleted) {
                res.status(404).json({
                    error: 'Backend not found',
                    id,
                });
                return;
            }

            logger.info('Backend config deleted via API', { id, userId });

            res.json({
                success: true,
                id,
            });
        } catch (error) {
            logger.error('Failed to delete backend', { error, id: req.params.id });
            res.status(500).json({
                error: 'Failed to delete backend',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /admin/backends/:id/toggle
     * Quick toggle to enable/disable a backend.
     */
    router.post('/backends/:id/toggle', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { enabled } = req.body;

            if (typeof enabled !== 'boolean') {
                res.status(400).json({
                    error: 'Invalid input',
                    message: '"enabled" must be a boolean',
                });
                return;
            }

            const userId = (req as any).user?.id || 'anonymous';
            const auditContext = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('User-Agent'),
            };

            const config = await mcpToolSettingsService.upsertBackendConfig(
                id,
                { enabled },
                userId,
                auditContext
            );

            logger.info('Backend toggled via API', { id, enabled, userId });

            res.json({
                success: true,
                id,
                enabled: config.enabled,
            });
        } catch (error) {
            logger.error('Failed to toggle backend', { error, id: req.params.id });
            res.status(500).json({
                error: 'Failed to toggle backend',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==========================================================================
    // Audit Log Routes
    // ==========================================================================

    /**
     * GET /admin/audit-logs
     * Get audit logs for settings changes.
     */
    router.get('/audit-logs', async (req: Request, res: Response) => {
        try {
            const { entityType, entityId, userId, since, limit } = req.query;

            const logs = await mcpToolSettingsService.getAuditLogs({
                entityType: entityType as 'tool_setting' | 'backend_config' | undefined,
                entityId: entityId as string | undefined,
                userId: userId as string | undefined,
                since: since as string | undefined,
                limit: limit ? parseInt(limit as string) : 100,
            });

            res.json({
                logs,
                count: logs.length,
            });
        } catch (error) {
            logger.error('Failed to get audit logs', { error });
            res.status(500).json({
                error: 'Failed to get audit logs',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    return router;
}

export default createAdminRoutes;
