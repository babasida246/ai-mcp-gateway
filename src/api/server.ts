import express, { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { contextManager } from '../context/manager.js';
import { routeRequest } from '../routing/router.js';
import { db } from '../db/postgres.js';
import { redisCache } from '../cache/redis.js';

/**
 * HTTP API Server for stateless request handling
 */
import { Server } from 'http';

export class APIServer {
    private app: express.Application;
    private server: Server | null = null;

    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware() {
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', env.API_CORS_ORIGIN);
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header(
                'Access-Control-Allow-Headers',
                'Content-Type, Authorization'
            );
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        // JSON parsing
        this.app.use(express.json({ limit: '10mb' }));

        // Request logging
        this.app.use((req, _res, next) => {
            logger.info('API request', {
                method: req.method,
                path: req.path,
                conversationId: req.body?.conversationId,
            });
            next();
        });
    }

    /**
     * Setup API routes
     */
    private setupRoutes() {
        // Health check
        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'ok',
                redis: redisCache.isReady(),
                database: db.isReady(),
                timestamp: new Date().toISOString(),
            });
        });

        // Route request (intelligent model selection)
        this.app.post('/v1/route', async (req, res) => {
            await this.handleRoute(req, res);
        });

        // Code agent endpoint
        this.app.post('/v1/code-agent', async (req, res) => {
            await this.handleCodeAgent(req, res);
        });

        // Chat endpoint (general purpose)
        this.app.post('/v1/chat', async (req, res) => {
            await this.handleChat(req, res);
        });

        // Context endpoints
        this.app.get('/v1/context/:conversationId', async (req, res) => {
            await this.handleGetContext(req, res);
        });

        this.app.post('/v1/context/:conversationId', async (req, res) => {
            await this.handleUpdateContext(req, res);
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not found',
                path: req.path,
            });
        });
    }

    /**
     * Handle /v1/route endpoint
     */
    private async handleRoute(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const {
                conversationId,
                message,
                userId,
                projectId,
                qualityLevel,
            } = req.body;

            if (!conversationId || !message) {
                res.status(400).json({
                    error: 'Missing required fields: conversationId, message',
                });
                return;
            }

            // Ensure conversation exists
            await contextManager.ensureConversation(
                conversationId,
                userId,
                projectId
            );

            // Ensure conversation context is loaded
            await contextManager.getSummary(conversationId);

            // Route request
            const result = await routeRequest(
                { prompt: message },
                {
                    quality: qualityLevel || 'normal',
                    complexity: 'medium',
                    taskType: 'general',
                }
            );

            // Save message to context
            await contextManager.addMessage(conversationId, {
                role: 'user',
                content: message,
            });

            await contextManager.addMessage(conversationId, {
                role: 'assistant',
                content: result.content,
                metadata: {
                    modelUsed: result.modelId,
                    provider: result.provider,
                },
            });

            // Log to DB
            await db.insert('llm_calls', {
                conversation_id: conversationId,
                model_id: result.modelId,
                layer: 'L0',
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                estimated_cost: result.cost,
                duration_ms: Date.now() - startTime,
                success: true,
            });

            res.json({
                result: {
                    response: result.content,
                    model: result.modelId,
                    provider: result.provider,
                },
                routing: {
                    summary: result.routingSummary,
                    fromCache: false,
                },
                context: {
                    conversationId,
                },
                performance: {
                    durationMs: Date.now() - startTime,
                    tokens: {
                        input: result.inputTokens,
                        output: result.outputTokens,
                    },
                    cost: result.cost,
                },
            });
        } catch (error) {
            logger.error('Route request error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Handle /v1/code-agent endpoint
     */
    private async handleCodeAgent(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const { conversationId, task, files, userId, projectId } = req.body;

            if (!conversationId || !task) {
                res.status(400).json({
                    error: 'Missing required fields: conversationId, task',
                });
                return;
            }

            // Ensure conversation exists
            await contextManager.ensureConversation(
                conversationId,
                userId,
                projectId
            );

            // Get context
            const summary = await contextManager.getSummary(conversationId);

            // Build prompt for code agent
            const prompt = `Task: ${task}\n\nFiles: ${files ? JSON.stringify(files) : 'N/A'}\n\nContext: ${summary ? JSON.stringify(summary) : 'New conversation'}`;

            // Route request
            const result = await routeRequest(
                { prompt },
                {
                    quality: 'high',
                    complexity: 'high',
                    taskType: 'code',
                }
            );

            // Save to context
            await contextManager.addMessage(conversationId, {
                role: 'user',
                content: task,
                metadata: { type: 'code-agent', files },
            });

            await contextManager.addMessage(conversationId, {
                role: 'assistant',
                content: result.content,
                metadata: {
                    type: 'code-agent',
                    modelUsed: result.modelId,
                },
            });

            res.json({
                result: {
                    response: result.content,
                    model: result.modelId,
                    provider: result.provider,
                },
                performance: {
                    durationMs: Date.now() - startTime,
                    cost: result.cost,
                },
            });
        } catch (error) {
            logger.error('Code agent error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Handle /v1/chat endpoint
     */
    private async handleChat(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const { conversationId, message, userId, projectId } = req.body;

            if (!conversationId || !message) {
                res.status(400).json({
                    error: 'Missing required fields: conversationId, message',
                });
                return;
            }

            // Ensure conversation exists
            await contextManager.ensureConversation(
                conversationId,
                userId,
                projectId
            );

            // Get context
            const summary = await contextManager.getSummary(conversationId);
            const recentMessages =
                await contextManager.getRecentMessages(conversationId);

            // Build context-aware prompt
            const contextStr = summary
                ? `Context: ${JSON.stringify(summary)}\n\nRecent messages: ${JSON.stringify(recentMessages)}`
                : '';
            const fullPrompt = contextStr
                ? `${contextStr}\n\nUser: ${message}`
                : message;

            // Route request
            const result = await routeRequest(
                { prompt: fullPrompt },
                {
                    quality: 'normal',
                    complexity: 'medium',
                    taskType: 'general',
                }
            );

            // Save messages
            await contextManager.addMessage(conversationId, {
                role: 'user',
                content: message,
            });

            await contextManager.addMessage(conversationId, {
                role: 'assistant',
                content: result.content,
            });

            res.json({
                result: {
                    response: result.content,
                    model: result.modelId,
                },
                performance: {
                    durationMs: Date.now() - startTime,
                    cost: result.cost,
                },
            });
        } catch (error) {
            logger.error('Chat error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Handle GET /v1/context/:conversationId
     */
    private async handleGetContext(req: Request, res: Response) {
        try {
            const { conversationId } = req.params;

            const summary = await contextManager.getSummary(conversationId);
            const messages =
                await contextManager.getRecentMessages(conversationId);

            res.json({
                conversationId,
                summary,
                recentMessages: messages,
            });
        } catch (error) {
            logger.error('Get context error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Handle POST /v1/context/:conversationId
     */
    private async handleUpdateContext(req: Request, res: Response): Promise<void> {
        try {
            const { conversationId } = req.params;
            const { summary } = req.body;

            if (!summary) {
                res.status(400).json({
                    error: 'Missing required field: summary',
                });
                return;
            }

            await contextManager.updateSummary(conversationId, {
                ...summary,
                conversationId,
            });

            res.json({
                success: true,
                conversationId,
            });
        } catch (error) {
            logger.error('Update context error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Start the API server
     */
    async start(): Promise<void> {
        const port = parseInt(env.API_PORT);
        const host = env.API_HOST;

        // Initialize database schema
        await db.initSchema();

        this.server = this.app.listen(port, host, () => {
            logger.info('API server started', {
                host,
                port,
                endpoints: [
                    'GET /health',
                    'POST /v1/route',
                    'POST /v1/code-agent',
                    'POST /v1/chat',
                    'GET /v1/context/:conversationId',
                    'POST /v1/context/:conversationId',
                ],
            });
        });
    }

    /**
     * Stop the API server
     */
    async stop(): Promise<void> {
        if (this.server) {
            this.server.close();
            logger.info('API server stopped');
        }
    }
}

// Singleton instance
export const apiServer = new APIServer();
