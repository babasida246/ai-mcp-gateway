/**
 * @file Deployment API Routes
 * @description REST API endpoints for infrastructure deployment workflow
 * 
 * Endpoints:
 * POST   /v1/deployments/check         - Check if message is deployment request
 * POST   /v1/deployments/generate      - Generate commands
 * GET    /v1/deployments/:id           - Get deployment session
 * POST   /v1/deployments/:id/confirm   - Confirm/reject execution
 * POST   /v1/deployments/:id/result    - Record command result
 * GET    /v1/deployments/:id/results   - Get execution results
 * DELETE /v1/deployments/:id           - Cancel deployment
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logging/logger.js';
import ChatDeploymentHandler from './chatDeploymentHandler.js';
import {
    CommandGenerationContext,
    CommandExecutionResult,
    CommandConfirmation,
} from './commandGeneration.js';

const router = Router();
const deploymentHandler = new ChatDeploymentHandler();

/**
 * Request validation schemas
 */
const CheckRequestSchema = z.object({
    message: z.string().min(1),
    context: z.any().optional(),
});

const GenerateRequestSchema = z.object({
    message: z.string().min(1),
    taskType: z.string().optional(),
    targetDevice: z.string().optional(),
    connectionId: z.string().optional(),
});

const ConfirmRequestSchema = z.object({
    approved: z.boolean(),
    selectedCommandIds: z.array(z.string()).optional(),
});

const ResultRequestSchema = z.object({
    commandId: z.string(),
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number(),
    duration: z.number(),
});

/**
 * POST /v1/deployments/check
 * Check if message is a deployment request
 */
router.post('/check', async (req: Request, res: Response) => {
    try {
        const { message, context } = CheckRequestSchema.parse(req.body);

        logger.info('[DeploymentAPI] Checking message for deployment request', {
            messageLength: message.length,
        });

        const detection = await deploymentHandler.detectDeploymentRequest(message);

        res.json({
            isDeploymentRequest: detection.isDeploymentRequest,
            taskType: detection.taskType,
            confidence: detection.confidence,
            reasoning: detection.reasoning,
            targetDevice: detection.targetDevice,
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to check deployment request',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /v1/deployments/generate
 * Generate deployment commands
 */
router.post('/generate', async (req: Request, res: Response) => {
    try {
        const { message, taskType, targetDevice, connectionId } =
            GenerateRequestSchema.parse(req.body);

        logger.info('[DeploymentAPI] Generating deployment commands', {
            taskType,
            targetDevice,
        });

        // First detect the deployment request
        const detection = await deploymentHandler.detectDeploymentRequest(message);

        if (!detection.isDeploymentRequest && detection.confidence < 0.5) {
            return res.status(400).json({
                error: 'Message does not appear to be a deployment request',
                confidence: detection.confidence,
                reasoning: detection.reasoning,
            });
        }

        // Generate commands
        const { generationId, response } = await deploymentHandler.generateDeploymentCommands(
            message,
            {
                isDeploymentRequest: true,
                taskType: (taskType as any) || detection.taskType,
                targetDevice: targetDevice || detection.targetDevice,
                connectionId,
                confidence: detection.confidence,
            }
        );

        // Get display and session
        const displayInfo = deploymentHandler.getGenerationDisplay(generationId);

        if (!displayInfo) {
            return res.status(500).json({
                error: 'Failed to prepare deployment display',
            });
        }

        res.json({
            generationId,
            sessionId: displayInfo.sessionId,
            taskDescription: response.taskDescription,
            commandCount: response.commands.length,
            commands: response.commands.map(cmd => ({
                id: cmd.id,
                description: cmd.description,
                riskLevel: cmd.riskLevel,
            })),
            explanation: response.explanation,
            warnings: response.warnings,
            affectedServices: response.affectedServices,
            estimatedDuration: response.estimatedDuration,
            display: displayInfo.display,
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Generate failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to generate deployment commands',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * GET /v1/deployments/:id
 * Get deployment session details
 */
router.get('/:sessionId', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const session = deploymentHandler.getExecutionSession(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
            });
        }

        res.json(session);
    } catch (error) {
        logger.error('[DeploymentAPI] Get session failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            error: 'Failed to retrieve session',
        });
    }
});

/**
 * POST /v1/deployments/:id/confirm
 * Confirm or reject deployment execution
 */
router.post('/:sessionId/confirm', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { approved, selectedCommandIds } = ConfirmRequestSchema.parse(req.body);

        logger.info('[DeploymentAPI] Processing confirmation', {
            sessionId,
            approved,
            commandCount: selectedCommandIds?.length,
        });

        const result = await deploymentHandler.handleUserConfirmation(
            sessionId,
            approved,
            selectedCommandIds
        );

        res.json({
            approved: result.approved,
            sessionId: result.session.sessionId,
            status: result.session.status,
            message: result.message,
            commandIds: result.session.commandIds,
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Confirmation failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to process confirmation',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /v1/deployments/:id/result
 * Record command execution result
 */
router.post('/:sessionId/result', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const result = ResultRequestSchema.parse(req.body);

        logger.info('[DeploymentAPI] Recording execution result', {
            sessionId,
            commandId: result.commandId,
            success: result.success,
        });

        const recorded = deploymentHandler.recordExecutionResult(sessionId, result.commandId, {
            success: result.success,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: result.duration,
        });

        if (!recorded) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
            });
        }

        res.json({
            recorded: true,
            sessionId,
            commandId: result.commandId,
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Result recording failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to record result',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /v1/deployments/:id/finalize
 * Finalize execution session
 */
router.post('/:sessionId/finalize', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { success, error } = req.body;

        logger.info('[DeploymentAPI] Finalizing session', {
            sessionId,
            success,
        });

        const finalSession = deploymentHandler.finalizeExecution(sessionId, success, error);

        if (!finalSession) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
            });
        }

        const resultsDisplay = deploymentHandler.getResultsDisplay(sessionId);

        res.json({
            sessionId,
            status: finalSession.status,
            success,
            error: finalSession.errorMessage,
            resultCount: finalSession.results?.length || 0,
            resultsDisplay,
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Finalize failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            error: 'Failed to finalize session',
        });
    }
});

/**
 * GET /v1/deployments/:id/results
 * Get formatted execution results
 */
router.get('/:sessionId/results', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const session = deploymentHandler.getExecutionSession(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
            });
        }

        const display = deploymentHandler.getResultsDisplay(sessionId);

        res.json({
            sessionId,
            status: session.status,
            results: session.results,
            display,
            summary: {
                totalCommands: session.commandIds.length,
                executedCommands: session.results?.length || 0,
                successCount: session.results?.filter((r: any) => r.success).length || 0,
            },
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Results fetch failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            error: 'Failed to retrieve results',
        });
    }
});

/**
 * DELETE /v1/deployments/:id
 * Cancel deployment execution
 */
router.delete('/:sessionId', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { reason } = req.body || {};

        logger.info('[DeploymentAPI] Cancelling deployment', {
            sessionId,
            reason,
        });

        const cancelled = deploymentHandler.cancelExecution(sessionId, reason);

        if (!cancelled) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
            });
        }

        res.json({
            cancelled: true,
            sessionId,
            message: 'Deployment cancelled',
        });
    } catch (error) {
        logger.error('[DeploymentAPI] Cancel failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            error: 'Failed to cancel deployment',
        });
    }
});

export default router;
