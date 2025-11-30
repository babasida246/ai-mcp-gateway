import express, { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { metrics } from '../logging/metrics.js';
import { contextManager } from '../context/manager.js';
import { routeRequest, detectComplexity } from '../routing/router.js';
import { db } from '../db/postgres.js';
import { redisCache } from '../cache/redis.js';
import { providerHealth } from '../config/provider-health.js';
import type { TaskType } from '../mcp/types.js';

/**
 * HTTP API Server for stateless request handling
 */
import { Server } from 'http';

export class APIServer {
    private app: express.Application;
    private server: Server | null = null;
    private routesReady: Promise<void>;

    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.routesReady = this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware() {
        // CORS
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
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

        // Request logging and metrics
        this.app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
            // Skip OPTIONS requests for metrics
            if (req.method !== 'OPTIONS') {
                metrics.recordRequest();
            }

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
    private async setupRoutes() {
        // TODO: Import and mount admin routes when admin.ts is implemented
        // const { default: adminRoutes } = await import('./admin.js');
        // this.app.use('/admin', adminRoutes);

        // Health check
        this.app.get('/health', async (_req, res) => {
            // Get provider health status
            const providers = await providerHealth.getHealthyProviders();
            const providerStatus = providerHealth.getProviderStatusSummary();

            // Import models config
            const { getModelsByLayer, LAYERS_IN_ORDER } = await import('../config/models.js');

            // Build layers status
            const layersStatus: Record<string, {
                enabled: boolean;
                models: string[];
                providers: string[];
            }> = {};

            for (const layer of LAYERS_IN_ORDER) {
                const models = getModelsByLayer(layer);
                const layerProviders = new Set(models.map(m => m.provider));
                const healthyProviders = Array.from(layerProviders).filter(p => providers.includes(p));

                layersStatus[layer] = {
                    enabled: models.length > 0 && healthyProviders.length > 0,
                    models: models.map(m => m.id),
                    providers: healthyProviders,
                };
            }

            res.json({
                status: 'ok',
                redis: redisCache.isReady(),
                database: db.isReady(),
                timestamp: new Date().toISOString(),
                providers: providerStatus,
                layers: layersStatus,
                healthyProviders: providers,
                configuration: {
                    logLevel: env.LOG_LEVEL,
                    defaultLayer: env.DEFAULT_LAYER,
                    enableCrossCheck: env.ENABLE_CROSS_CHECK,
                    enableAutoEscalate: env.ENABLE_AUTO_ESCALATE,
                    maxEscalationLayer: env.MAX_ESCALATION_LAYER,
                    enableCostTracking: env.ENABLE_COST_TRACKING,
                    costAlertThreshold: env.COST_ALERT_THRESHOLD,
                    layerControl: {
                        L0: env.LAYER_L0_ENABLED,
                        L1: env.LAYER_L1_ENABLED,
                        L2: env.LAYER_L2_ENABLED,
                        L3: env.LAYER_L3_ENABLED,
                    },
                    taskSpecificModels: {
                        chat: env.CHAT_MODELS || 'default',
                        code: env.CODE_MODELS || 'default',
                        analyze: env.ANALYZE_MODELS || 'default',
                        createProject: env.CREATE_PROJECT_MODELS || 'default',
                    },
                },
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

        // Cache management
        this.app.post('/v1/cache/clear', async (req, res) => {
            await this.handleCacheClear(req, res);
        });

        // Stats endpoints
        this.app.get('/v1/stats', async (req, res) => {
            await this.handleGetStats(req, res);
        });

        this.app.get('/v1/stats/conversation/:conversationId', async (req, res) => {
            await this.handleGetConversationStats(req, res);
        });

        // Server stats (real-time metrics from memory)
        this.app.get('/v1/server-stats', (_req, res) => {
            this.handleGetServerStats(res);
        });

        // MCP CLI endpoint (for CLI tool)
        this.app.post('/v1/mcp-cli', async (req, res) => {
            await this.handleMCPCLI(req, res);
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
     * Handle POST /v1/cache/clear
     */
    private async handleCacheClear(req: Request, res: Response): Promise<void> {
        try {
            const { pattern, conversationId } = req.body;

            let clearedCount = 0;

            if (conversationId) {
                // Clear specific conversation cache
                await contextManager.clearCache(conversationId);
                clearedCount = 1;
                logger.info('Cleared conversation cache', { conversationId });
            } else if (pattern) {
                // Clear by pattern
                clearedCount = await redisCache.deleteByPattern(pattern);
                logger.info('Cleared cache by pattern', { pattern, count: clearedCount });
            } else {
                res.status(400).json({
                    error: 'Must provide either conversationId or pattern',
                });
                return;
            }

            res.json({
                success: true,
                clearedCount,
                pattern: pattern || `conversation:${conversationId}`,
            });
        } catch (error) {
            logger.error('Cache clear error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Handle GET /v1/stats
     */
    private async handleGetStats(req: Request, res: Response): Promise<void> {
        try {
            const { userId, startDate, endDate, groupBy } = req.query;

            // Build query based on filters
            let whereClause = 'WHERE 1=1';
            const params: unknown[] = [];

            if (userId) {
                params.push(userId);
                whereClause += ` AND c.user_id = $${params.length}`;
            }

            if (startDate) {
                params.push(startDate);
                whereClause += ` AND l.created_at >= $${params.length}`;
            }

            if (endDate) {
                params.push(endDate);
                whereClause += ` AND l.created_at <= $${params.length}`;
            }

            // Get overall stats
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_calls,
                    SUM(estimated_cost) as total_cost,
                    SUM(input_tokens) as total_input_tokens,
                    SUM(output_tokens) as total_output_tokens,
                    SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cache_hits
                FROM llm_calls l
                LEFT JOIN conversations c ON l.conversation_id = c.id
                ${whereClause}
            `;

            const statsResult = await db.query<{
                total_calls: string;
                total_cost: string;
                total_input_tokens: string;
                total_output_tokens: string;
                cache_hits: string;
            }>(statsQuery, params);

            const stats = statsResult?.rows[0] || {
                total_calls: '0',
                total_cost: '0',
                total_input_tokens: '0',
                total_output_tokens: '0',
                cache_hits: '0',
            };

            const response: {
                totalCalls: number;
                totalCost: number;
                totalTokens: { input: number; output: number };
                cacheHitRate: number;
                byModel?: unknown;
                byLayer?: unknown;
            } = {
                totalCalls: parseInt(stats.total_calls || '0'),
                totalCost: parseFloat(stats.total_cost || '0'),
                totalTokens: {
                    input: parseInt(stats.total_input_tokens || '0'),
                    output: parseInt(stats.total_output_tokens || '0'),
                },
                cacheHitRate: stats.total_calls
                    ? parseInt(stats.cache_hits || '0') / parseInt(stats.total_calls)
                    : 0,
            };

            // Group by if requested
            if (groupBy === 'model') {
                const modelStatsQuery = `
                    SELECT 
                        model_id,
                        COUNT(*) as calls,
                        SUM(estimated_cost) as cost,
                        SUM(input_tokens) as input_tokens,
                        SUM(output_tokens) as output_tokens
                    FROM llm_calls l
                    LEFT JOIN conversations c ON l.conversation_id = c.id
                    ${whereClause}
                    GROUP BY model_id
                `;

                const modelStatsResult = await db.query<{
                    model_id: string;
                    calls: string;
                    cost: string;
                    input_tokens: string;
                    output_tokens: string;
                }>(modelStatsQuery, params);

                response.byModel = {};
                modelStatsResult?.rows.forEach((row: {
                    model_id: string;
                    calls: string;
                    cost: string;
                    input_tokens: string;
                    output_tokens: string;
                }) => {
                    (response.byModel as Record<string, unknown>)[row.model_id] = {
                        calls: parseInt(row.calls),
                        cost: parseFloat(row.cost),
                        tokens: {
                            input: parseInt(row.input_tokens),
                            output: parseInt(row.output_tokens),
                        },
                    };
                });
            } else if (groupBy === 'layer') {
                const layerStatsQuery = `
                    SELECT 
                        layer,
                        COUNT(*) as calls,
                        SUM(estimated_cost) as cost
                    FROM llm_calls l
                    LEFT JOIN conversations c ON l.conversation_id = c.id
                    ${whereClause}
                    GROUP BY layer
                `;

                const layerStatsResult = await db.query<{
                    layer: string;
                    calls: string;
                    cost: string;
                }>(layerStatsQuery, params);

                response.byLayer = {};
                layerStatsResult?.rows.forEach((row: {
                    layer: string;
                    calls: string;
                    cost: string;
                }) => {
                    (response.byLayer as Record<string, unknown>)[row.layer] = {
                        calls: parseInt(row.calls),
                        cost: parseFloat(row.cost),
                    };
                });
            }

            res.json(response);
        } catch (error) {
            logger.error('Get stats error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Handle GET /v1/stats/conversation/:conversationId
     */
    private async handleGetConversationStats(req: Request, res: Response): Promise<void> {
        try {
            const { conversationId } = req.params;

            const statsQuery = `
                SELECT 
                    COUNT(DISTINCT m.id) as message_count,
                    COUNT(DISTINCT l.id) as llm_calls,
                    SUM(l.estimated_cost) as total_cost,
                    SUM(l.input_tokens) as input_tokens,
                    SUM(l.output_tokens) as output_tokens,
                    c.created_at,
                    c.updated_at
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                LEFT JOIN llm_calls l ON c.id = l.conversation_id
                WHERE c.id = $1
                GROUP BY c.id, c.created_at, c.updated_at
            `;

            const result = await db.query<{
                message_count: string;
                llm_calls: string;
                total_cost: string;
                input_tokens: string;
                output_tokens: string;
                created_at: Date;
                updated_at: Date;
            }>(statsQuery, [conversationId]);

            if (!result || result.rows.length === 0) {
                res.status(404).json({
                    error: 'Conversation not found',
                });
                return;
            }

            const stats = result.rows[0];

            res.json({
                conversationId,
                messageCount: parseInt(stats.message_count || '0'),
                llmCalls: parseInt(stats.llm_calls || '0'),
                totalCost: parseFloat(stats.total_cost || '0'),
                totalTokens: {
                    input: parseInt(stats.input_tokens || '0'),
                    output: parseInt(stats.output_tokens || '0'),
                },
                createdAt: stats.created_at,
                updatedAt: stats.updated_at,
            });
        } catch (error) {
            logger.error('Get conversation stats error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Handle GET /v1/server-stats - Real-time server metrics
     */
    private handleGetServerStats(res: Response): void {
        try {
            const metricsData = metrics.getMetrics();
            const uptime = process.uptime();
            const memoryUsage = process.memoryUsage();

            res.json({
                uptime: {
                    seconds: Math.floor(uptime),
                    formatted: this.formatUptime(uptime),
                },
                requests: {
                    total: metricsData.totalRequests,
                    averageDuration: metricsData.averageDuration,
                },
                llm: {
                    totalCalls: metricsData.totalLLMCalls,
                    tokens: {
                        input: metricsData.totalInputTokens,
                        output: metricsData.totalOutputTokens,
                        total: metricsData.totalTokens,
                    },
                    cost: {
                        total: metricsData.totalCost,
                        currency: 'USD',
                    },
                },
                memory: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024),
                    unit: 'MB',
                },
                providers: {
                    openai: providerHealth.isProviderHealthy('openai'),
                    anthropic: providerHealth.isProviderHealthy('anthropic'),
                    openrouter: providerHealth.isProviderHealthy('openrouter'),
                    ossLocal: providerHealth.isProviderHealthy('oss-local'),
                },
                cache: {
                    redis: redisCache.isReady(),
                },
                database: {
                    postgres: db.isReady(),
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Get server stats error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }

    /**
     * Format uptime in human readable format
     */
    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    /**
     * Handle POST /v1/mcp-cli - MCP CLI tool requests
     */
    private async handleMCPCLI(req: Request, res: Response): Promise<void> {
        try {
            const { mode, message, context } = req.body;

            if (!mode || !message) {
                res.status(400).json({
                    error: 'Missing required fields: mode, message',
                });
                return;
            }

            // Validate mode
            if (!['chat', 'code', 'diff'].includes(mode)) {
                res.status(400).json({
                    error: 'Invalid mode. Must be: chat, code, or diff',
                });
                return;
            }

            // Build system prompt based on mode
            let systemPrompt = '';
            let taskType: TaskType = 'general';
            let complexity: 'low' | 'medium' | 'high' = 'medium';
            let preferredLayer: 'L0' | 'L1' | 'L2' | 'L3' | undefined;

            // Check if user explicitly requested a layer (e.g., "use L0", "with layer L2")
            const layerMatch = message.match(/(?:use|with|on|at)\s+(?:layer\s+)?(L[0-3])/i);
            if (layerMatch) {
                preferredLayer = layerMatch[1].toUpperCase() as 'L0' | 'L1' | 'L2' | 'L3';
                logger.info('User requested specific layer', {
                    layer: preferredLayer,
                    originalMessage: message.substring(0, 50)
                });
            }

            switch (mode) {
                case 'chat':
                    systemPrompt = 'You are a helpful AI assistant. Provide clear, concise answers.';
                    taskType = 'general';
                    // Only detect complexity if no layer specified
                    if (!preferredLayer) {
                        complexity = await detectComplexity(message);
                    }
                    break;

                case 'code':
                    systemPrompt = `You are an expert code reviewer and analyzer. 
Analyze the provided code and give detailed feedback on:
- Code quality and best practices
- Potential bugs or issues
- Performance optimizations
- Security concerns
- Suggestions for improvement

${context?.language ? `Language: ${context.language}` : ''}
${context?.filename ? `File: ${context.filename}` : ''}`;
                    taskType = 'code';
                    complexity = 'high';
                    break;

                case 'diff':
                    systemPrompt = `You are an expert code editor. Generate a unified diff patch that applies the requested changes.

IMPORTANT: Your response must ONLY be a valid unified diff in this exact format:
\`\`\`diff
--- a/path/to/file
+++ b/path/to/file
@@ -start,count +start,count @@
 context line
-removed line
+added line
 context line
\`\`\`

Do not include any explanations, comments, or additional text outside the diff block.
Include at least 3 lines of context before and after changes.

${context?.filename ? `File: ${context.filename}` : ''}
${context?.language ? `Language: ${context.language}` : ''}`;
                    taskType = 'code';
                    complexity = 'high';
                    break;
            }

            // Construct full prompt with context
            let fullPrompt = message;
            if (context) {
                const contextParts: string[] = [];
                if (context.cwd) contextParts.push(`Current directory: ${context.cwd}`);
                if (context.files && context.files.length > 0) {
                    contextParts.push(`Files in directory:\n${context.files.slice(0, 20).join('\n')}`);
                }
                if (context.gitStatus) contextParts.push(`Git status:\n${context.gitStatus}`);

                if (contextParts.length > 0) {
                    fullPrompt = `${contextParts.join('\n\n')}\n\n${message}`;
                }
            }

            // Route request through the gateway with system prompt
            // Use 'normal' quality for chat mode to prefer L0 free models
            // Use 'high' quality for code/diff modes for better accuracy
            const quality = mode === 'chat' ? 'normal' : 'high';

            const result = await routeRequest(
                {
                    prompt: fullPrompt,
                    systemPrompt,
                },
                {
                    quality,
                    complexity,
                    taskType,
                    preferredLayer, // Pass preferred layer if user specified
                }
            );

            // Determine which layer was used (from routing summary or preferred layer)
            const routingLayerMatch = result.routingSummary?.match(/layer ([A-Z]\d)/);
            const usedLayer = preferredLayer || (routingLayerMatch ? routingLayerMatch[1] : env.DEFAULT_LAYER);

            // Format response based on mode
            let responseMessage = result.content;
            let patch: string | undefined;

            if (mode === 'diff') {
                // Extract diff from code blocks if present
                const diffMatch = result.content.match(/```diff\n([\s\S]+?)\n```/);
                if (diffMatch) {
                    patch = diffMatch[1];
                    responseMessage = 'Diff generated successfully';
                } else {
                    // If no code block, assume entire response is the diff
                    patch = result.content;
                    responseMessage = 'Diff generated successfully';
                }
            }

            res.json({
                message: responseMessage,
                patch,
                model: result.modelId,
                tokens: {
                    input: result.inputTokens || 0,
                    output: result.outputTokens || 0,
                    total: (result.inputTokens || 0) + (result.outputTokens || 0),
                },
                cost: result.cost || 0,
                metadata: {
                    complexity,
                    layer: usedLayer,
                    model: result.modelId,
                    tokens: {
                        input: result.inputTokens || 0,
                        output: result.outputTokens || 0,
                        total: (result.inputTokens || 0) + (result.outputTokens || 0),
                    },
                    cost: result.cost || 0,
                },
                escalation: result.requiresEscalationConfirm ? {
                    required: true,
                    currentLayer: usedLayer,
                    suggestedLayer: result.suggestedLayer,
                    reason: result.escalationReason,
                    message: '⚠️ The current layer detected conflicts. A higher tier (paid) layer is suggested for better results. Would you like to escalate?',
                    optimizedPrompt: result.optimizedPrompt,
                } : undefined,
            });

        } catch (error) {
            logger.error('MCP CLI error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            res.status(500).json({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Start the API server
     */
    async start(): Promise<void> {
        const port = parseInt(env.API_PORT);
        const host = env.API_HOST;

        // Wait for routes to be set up
        await this.routesReady;

        // Check LLM provider connectivity using provider health manager
        await providerHealth.refreshAllProviders();

        // Initialize database schema
        await db.initSchema();

        this.server = this.app.listen(port, host, () => {
            logger.info('API server started', {
                host,
                port,
                endpoints: [
                    'GET /health',
                    'GET /admin/*',
                    'POST /v1/route',
                    'POST /v1/code-agent',
                    'POST /v1/chat',
                    'GET /v1/context/:conversationId',
                    'POST /v1/context/:conversationId',
                    'POST /v1/cache/clear',
                    'GET /v1/stats',
                    'GET /v1/stats/conversation/:conversationId',
                    'GET /v1/server-stats',
                    'POST /v1/mcp-cli',
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
