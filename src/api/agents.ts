/**
 * AI Agent API Routes
 * Provides REST endpoints for agent operations
 */

import { Router, Request, Response } from 'express';
import { logger } from '../logging/logger.js';
import { callLLM } from '../tools/llm/index.js';
import { getModelsByLayer, ModelConfig } from '../config/models.js';
import {
    ReActAgent,
    createReActAgent,
    AgentMemory,
    createAgentMemory,
    TaskDecomposer,
    createTaskDecomposer,
    toolSelector,
    createGroupChat,
    createCodeReviewGroup,
    createPlanningGroup,
    initializeAgentTables,
    AGENT_ROLES,
    type ReActTool,
} from '../agents/index.js';
import { createDocumentSynthesizer } from '../agents/documentSynthesizer.js';

/**
 * Simple LLM wrapper for agents
 * Converts messages array to prompt/systemPrompt format for callLLM
 */
class AgentLLMClient {
    private model: ModelConfig;

    constructor() {
        // Get the best available L0 model
        const l0Models = getModelsByLayer('L0');
        const l1Models = getModelsByLayer('L1');
        this.model = l0Models[0] || l1Models[0] || {
            id: 'default',
            provider: 'openrouter',
            apiModelName: 'meta-llama/llama-3.3-70b-instruct:free',
            layer: 'L0',
            relativeCost: 0,
            capabilities: ['chat'],
            contextWindow: 8192,
            enabled: true,
        };
    }

    async chat(options: {
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
        maxTokens?: number;
        temperature?: number;
    }): Promise<{ content: string; usage?: { totalTokens?: number } }> {
        // Convert messages to prompt/systemPrompt format
        let systemPrompt: string | undefined;
        const promptParts: string[] = [];

        for (const msg of options.messages) {
            if (msg.role === 'system') {
                systemPrompt = msg.content;
            } else if (msg.role === 'user') {
                promptParts.push(`User: ${msg.content}`);
            } else if (msg.role === 'assistant') {
                promptParts.push(`Assistant: ${msg.content}`);
            }
        }

        const prompt = promptParts.join('\n\n');

        const response = await callLLM(
            {
                prompt,
                systemPrompt,
                maxTokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7,
            },
            this.model
        );

        return {
            content: response.content,
            usage: {
                totalTokens: response.inputTokens + response.outputTokens,
            },
        };
    }
}

/**
 * Create agent routes
 */
export function createAgentRoutes(): Router {
    const router = Router();
    const llmClient = new AgentLLMClient();

    // Initialize agent tables on startup
    initializeAgentTables().catch((error) => {
        logger.error('Failed to initialize agent tables', { error });
    });

    /**
     * Execute a ReAct agent task
     * POST /v1/agents/react
     */
    router.post('/react', async (req: Request, res: Response) => {
        try {
            const { goal, tools = [], config = {} } = req.body;

            if (!goal) {
                res.status(400).json({ error: 'Goal is required' });
                return;
            }

            // Build tools from request
            const agentTools: ReActTool[] = tools.map((t: { name: string; description: string; handler?: string }) => ({
                name: t.name,
                description: t.description,
                parameters: {},
                execute: async (args: Record<string, unknown>) => {
                    // For now, return a placeholder - real tools would be injected
                    return { message: `Tool ${t.name} called with args`, args };
                },
            }));

            // Add default tools if none provided
            if (agentTools.length === 0) {
                agentTools.push({
                    name: 'search',
                    description: 'Search for information',
                    parameters: { query: { type: 'string', description: 'Search query' } },
                    execute: async (args) => ({ results: [`Results for: ${args.query}`] }),
                });
                agentTools.push({
                    name: 'analyze',
                    description: 'Analyze data or text',
                    parameters: { data: { type: 'string', description: 'Data to analyze' } },
                    execute: async (args) => ({ analysis: `Analysis of: ${args.data}` }),
                });
            }

            const agent = createReActAgent(llmClient, agentTools, {
                maxIterations: config.maxIterations || 10,
                verbose: config.verbose || false,
                ...config,
            });

            const result = await agent.execute(goal);

            res.json({
                success: result.success,
                answer: result.answer,
                steps: result.steps,
                metadata: {
                    iterations: result.iterations,
                    toolsUsed: result.toolsUsed,
                    totalTokens: result.totalTokens,
                    duration: result.duration,
                },
            });
        } catch (error) {
            logger.error('ReAct agent error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Agent execution failed',
            });
        }
    });

    /**
     * Decompose a goal into tasks
     * POST /v1/agents/decompose
     */
    router.post('/decompose', async (req: Request, res: Response) => {
        try {
            const { goal, context } = req.body;

            if (!goal) {
                res.status(400).json({ error: 'Goal is required' });
                return;
            }

            const decomposer = createTaskDecomposer(llmClient);
            const tasks = await decomposer.decompose(goal, context);

            res.json({
                goal,
                tasks: tasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    description: t.description,
                    status: t.status,
                    priority: t.priority,
                    dependencies: t.dependencies,
                    complexity: t.metadata.estimatedComplexity,
                })),
                progress: decomposer.getProgress(),
            });
        } catch (error) {
            logger.error('Task decomposition error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Decomposition failed',
            });
        }
    });

    /**
     * Store a memory
     * POST /v1/agents/memory
     */
    router.post('/memory', async (req: Request, res: Response) => {
        try {
            const { conversationId, content, type = 'episodic', importance, tags } = req.body;

            if (!conversationId || !content) {
                res.status(400).json({ error: 'conversationId and content are required' });
                return;
            }

            const memory = createAgentMemory(conversationId);
            const entry = await memory.store(content, type, { importance, tags });

            res.json({
                id: entry.id,
                type: entry.type,
                stored: true,
                importance: entry.metadata.importance,
            });
        } catch (error) {
            logger.error('Memory store error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to store memory',
            });
        }
    });

    /**
     * Retrieve memories
     * GET /v1/agents/memory/:conversationId
     */
    router.get('/memory/:conversationId', async (req: Request, res: Response) => {
        try {
            const { conversationId } = req.params;
            const { query, type, limit } = req.query;

            const memory = createAgentMemory(conversationId);

            if (query) {
                const results = await memory.retrieve(query as string, {
                    type: type as 'episodic' | 'semantic' | 'procedural',
                    limit: limit ? parseInt(limit as string) : undefined,
                });
                res.json({ memories: results });
            } else {
                const recent = await memory.getRecent(limit ? parseInt(limit as string) : 10);
                res.json({ memories: recent });
            }
        } catch (error) {
            logger.error('Memory retrieve error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to retrieve memories',
            });
        }
    });

    /**
     * Get tool recommendations
     * POST /v1/agents/tools/recommend
     */
    router.post('/tools/recommend', async (req: Request, res: Response) => {
        try {
            const { taskContext, availableTools } = req.body;

            if (!taskContext || !availableTools) {
                res.status(400).json({ error: 'taskContext and availableTools are required' });
                return;
            }

            const recommendations = await toolSelector.recommend(taskContext, availableTools);

            res.json({ recommendations });
        } catch (error) {
            logger.error('Tool recommendation error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to get recommendations',
            });
        }
    });

    /**
     * Record tool execution result
     * POST /v1/agents/tools/record
     */
    router.post('/tools/record', async (req: Request, res: Response) => {
        try {
            const { toolName, success, duration, taskContext, errorType } = req.body;

            if (!toolName || success === undefined || !duration) {
                res.status(400).json({
                    error: 'toolName, success, and duration are required',
                });
                return;
            }

            await toolSelector.recordExecution({
                toolName,
                success,
                duration,
                taskContext: taskContext || '',
                errorType,
            });

            res.json({ recorded: true });
        } catch (error) {
            logger.error('Tool record error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to record execution',
            });
        }
    });

    /**
     * Get tool statistics
     * GET /v1/agents/tools/stats
     */
    router.get('/tools/stats', async (_req: Request, res: Response) => {
        try {
            const stats = await toolSelector.getStatistics();
            res.json(stats);
        } catch (error) {
            logger.error('Tool stats error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to get statistics',
            });
        }
    });

    /**
     * Start a group chat
     * POST /v1/agents/group-chat
     */
    router.post('/group-chat', async (req: Request, res: Response) => {
        try {
            const { topic, roles, type = 'custom', config = {} } = req.body;

            if (!topic) {
                res.status(400).json({ error: 'Topic is required' });
                return;
            }

            let groupChat;

            if (type === 'code-review') {
                groupChat = createCodeReviewGroup(llmClient, topic, config);
            } else if (type === 'planning') {
                groupChat = createPlanningGroup(llmClient, topic, config);
            } else {
                if (!roles || roles.length === 0) {
                    res.status(400).json({ error: 'Roles are required for custom group chat' });
                    return;
                }
                groupChat = createGroupChat(llmClient, topic, roles, config);
            }

            const conversation = await groupChat.start();

            res.json({
                id: conversation.id,
                topic: conversation.topic,
                status: conversation.status,
                participants: conversation.participants.map((p) => ({
                    id: p.id,
                    name: p.name,
                    expertise: p.expertise,
                })),
                messages: conversation.messages,
                conclusion: conversation.conclusion,
                metadata: conversation.metadata,
            });
        } catch (error) {
            logger.error('Group chat error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Group chat failed',
            });
        }
    });

    /**
     * Get available agent roles
     * GET /v1/agents/roles
     */
    router.get('/roles', (_req: Request, res: Response) => {
        res.json({
            roles: Object.entries(AGENT_ROLES).map(([id, role]) => ({
                id,
                name: role.name,
                description: role.description,
                expertise: role.expertise,
                tools: role.tools,
            })),
        });
    });

    /**
     * Synthesize multiple documents into a single developer guide (Markdown)
     * POST /v1/agents/synthesize-docs
     */
    router.post('/synthesize-docs', async (req: Request, res: Response) => {
        try {
            const { documents, title, includeTOC = true, writeToFile = false } = req.body;

            if (!documents || !Array.isArray(documents) || documents.length === 0) {
                res.status(400).json({ error: 'documents array is required' });
                return;
            }

            const synthesizer = createDocumentSynthesizer(llmClient as any);
            const md = await synthesizer.synthesize(documents, { title, includeTOC });

            if (writeToFile) {
                try {
                    const fs = await import('fs');
                    await fs.promises.writeFile('dev-guide.md', md, 'utf8');
                } catch (err) {
                    logger.warn('Failed to write dev-guide.md', { err });
                }
            }

            res.json({ success: true, content: md });
        } catch (error) {
            logger.error('Document synthesis error', { error });
            res.status(500).json({ error: error instanceof Error ? error.message : 'Synthesis failed' });
        }
    });

    /**
     * Combined agent endpoint for complex tasks
     * POST /v1/agents/execute
     * This combines decomposition, tool selection, and ReAct execution
     */
    router.post('/execute', async (req: Request, res: Response) => {
        try {
            const { goal, context, useDecomposition = true, useGroupChat = false } = req.body;

            if (!goal) {
                res.status(400).json({ error: 'Goal is required' });
                return;
            }

            const startTime = Date.now();
            const results: {
                decomposition?: unknown;
                groupChat?: unknown;
                execution?: unknown;
            } = {};

            // Step 1: Decompose if enabled
            if (useDecomposition) {
                const decomposer = createTaskDecomposer(llmClient);
                const tasks = await decomposer.decompose(goal, context);
                results.decomposition = {
                    tasks: tasks.map((t) => ({
                        id: t.id,
                        title: t.title,
                        complexity: t.metadata.estimatedComplexity,
                    })),
                };
            }

            // Step 2: Group chat for planning if enabled
            if (useGroupChat) {
                const planningGroup = createPlanningGroup(llmClient, goal, { maxTurns: 5 });
                const conversation = await planningGroup.start();
                results.groupChat = {
                    conclusion: conversation.conclusion,
                    turns: conversation.metadata.turnCount,
                };
            }

            // Step 3: Execute with ReAct agent
            const defaultTools: ReActTool[] = [
                {
                    name: 'think',
                    description: 'Think through a problem step by step',
                    parameters: { problem: { type: 'string', description: 'Problem to think about' } },
                    execute: async (args) => ({ thought: `Thinking about: ${args.problem}` }),
                },
                {
                    name: 'conclude',
                    description: 'Draw a conclusion from analysis',
                    parameters: { analysis: { type: 'string', description: 'Analysis to conclude from' } },
                    execute: async (args) => ({ conclusion: `Conclusion from: ${args.analysis}` }),
                },
            ];

            const agent = createReActAgent(llmClient, defaultTools, { maxIterations: 5 });
            const execution = await agent.execute(goal);

            results.execution = {
                success: execution.success,
                answer: execution.answer,
                iterations: execution.iterations,
            };

            const duration = Date.now() - startTime;

            res.json({
                goal,
                success: execution.success,
                answer: execution.answer,
                results,
                duration,
            });
        } catch (error) {
            logger.error('Agent execute error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Execution failed',
            });
        }
    });

    // ============================================
    // NEW SPECIALIZED AGENTS
    // ============================================

    /**
     * Web Research endpoint
     * POST /v1/agents/research
     */
    router.post('/research', async (req: Request, res: Response) => {
        try {
            const { topic, context, sources = [], focusAreas, maxSources = 10 } = req.body;

            if (!topic) {
                res.status(400).json({ error: 'Topic is required' });
                return;
            }

            const { createWebResearcher } = await import('../agents/webResearcher.js');
            const researcher = createWebResearcher(llmClient);

            const result = await researcher.research(
                { topic, context, focusAreas, maxSources },
                sources
            );

            res.json(result);
        } catch (error) {
            logger.error('Web research error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Research failed',
            });
        }
    });

    /**
     * Fact check endpoint
     * POST /v1/agents/fact-check
     */
    router.post('/fact-check', async (req: Request, res: Response) => {
        try {
            const { claim, sources = [] } = req.body;

            if (!claim) {
                res.status(400).json({ error: 'Claim is required' });
                return;
            }

            const { createWebResearcher } = await import('../agents/webResearcher.js');
            const researcher = createWebResearcher(llmClient);

            const result = await researcher.factCheck(claim, sources);

            res.json(result);
        } catch (error) {
            logger.error('Fact check error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Fact check failed',
            });
        }
    });

    /**
     * Code analysis endpoint
     * POST /v1/agents/analyze-code
     */
    router.post('/analyze-code', async (req: Request, res: Response) => {
        try {
            const { file, files } = req.body;

            if (!file && !files) {
                res.status(400).json({ error: 'File or files array is required' });
                return;
            }

            const { createCodeAnalyzer } = await import('../agents/codeAnalyzer.js');
            const analyzer = createCodeAnalyzer(llmClient);

            if (files && Array.isArray(files)) {
                const result = await analyzer.analyzeProject(files);
                res.json(result);
            } else {
                const result = await analyzer.analyze(file);
                res.json(result);
            }
        } catch (error) {
            logger.error('Code analysis error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Code analysis failed',
            });
        }
    });

    /**
     * Code security scan endpoint
     * POST /v1/agents/security-scan
     */
    router.post('/security-scan', async (req: Request, res: Response) => {
        try {
            const { file } = req.body;

            if (!file || !file.path || !file.content) {
                res.status(400).json({ error: 'File with path and content is required' });
                return;
            }

            const { createCodeAnalyzer } = await import('../agents/codeAnalyzer.js');
            const analyzer = createCodeAnalyzer(llmClient);

            const result = await analyzer.securityScan(file);

            res.json(result);
        } catch (error) {
            logger.error('Security scan error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Security scan failed',
            });
        }
    });

    /**
     * Generate documentation endpoint
     * POST /v1/agents/generate-docs
     */
    router.post('/generate-docs', async (req: Request, res: Response) => {
        try {
            const { file, format = 'tsdoc' } = req.body;

            if (!file || !file.path || !file.content) {
                res.status(400).json({ error: 'File with path and content is required' });
                return;
            }

            const { createCodeAnalyzer } = await import('../agents/codeAnalyzer.js');
            const analyzer = createCodeAnalyzer(llmClient);

            const result = await analyzer.generateDocumentation(file, format);

            res.json(result);
        } catch (error) {
            logger.error('Generate docs error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Documentation generation failed',
            });
        }
    });

    /**
     * Data extraction endpoint
     * POST /v1/agents/extract-data
     */
    router.post('/extract-data', async (req: Request, res: Response) => {
        try {
            const { content, schema, type = 'schema' } = req.body;

            if (!content) {
                res.status(400).json({ error: 'Content is required' });
                return;
            }

            const { createDataExtractor } = await import('../agents/dataExtractor.js');
            const extractor = createDataExtractor(llmClient);

            let result;
            switch (type) {
                case 'entities':
                    result = await extractor.extractEntities(content, req.body.entityTypes);
                    break;
                case 'table':
                    result = await extractor.extractTable(content, req.body.columns);
                    break;
                case 'keyvalues':
                    result = await extractor.extractKeyValues(content);
                    break;
                case 'schema':
                default:
                    if (!schema) {
                        res.status(400).json({ error: 'Schema is required for schema extraction' });
                        return;
                    }
                    result = await extractor.extractWithSchema(content, schema);
                    break;
            }

            res.json(result);
        } catch (error) {
            logger.error('Data extraction error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Data extraction failed',
            });
        }
    });

    /**
     * Infer schema from example data
     * POST /v1/agents/infer-schema
     */
    router.post('/infer-schema', async (req: Request, res: Response) => {
        try {
            const { exampleData, schemaName } = req.body;

            if (!exampleData) {
                res.status(400).json({ error: 'Example data is required' });
                return;
            }

            const { createDataExtractor } = await import('../agents/dataExtractor.js');
            const extractor = createDataExtractor(llmClient);

            const schema = await extractor.inferSchema(exampleData, schemaName);

            res.json(schema);
        } catch (error) {
            logger.error('Schema inference error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Schema inference failed',
            });
        }
    });

    // ============================================
    // WORKFLOW ORCHESTRATOR & N8N INTEGRATION
    // ============================================

    // Lazy initialization for workflow orchestrator
    let _workflowOrchestrator: Awaited<ReturnType<typeof import('../agents/workflowOrchestrator.js').createWorkflowOrchestrator>> | null = null;

    const getWorkflowOrchestrator = async () => {
        if (!_workflowOrchestrator) {
            const { createWorkflowOrchestrator } = await import('../agents/workflowOrchestrator.js');
            _workflowOrchestrator = createWorkflowOrchestrator(llmClient);
        }
        return _workflowOrchestrator;
    };

    /**
     * Register a workflow
     * POST /v1/agents/workflows
     */
    router.post('/workflows', async (req: Request, res: Response) => {
        try {
            const workflow = req.body;

            if (!workflow.id || !workflow.name || !workflow.steps) {
                res.status(400).json({ error: 'Workflow id, name, and steps are required' });
                return;
            }

            const workflowOrchestrator = await getWorkflowOrchestrator();
            workflowOrchestrator.registerWorkflow(workflow);

            res.json({ success: true, message: `Workflow ${workflow.id} registered`, workflow });
        } catch (error) {
            logger.error('Register workflow error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to register workflow',
            });
        }
    });

    /**
     * List all workflows
     * GET /v1/agents/workflows
     */
    router.get('/workflows', async (_req: Request, res: Response) => {
        try {
            const workflowOrchestrator = await getWorkflowOrchestrator();
            const workflows = workflowOrchestrator.listWorkflows();
            res.json({ workflows });
        } catch (error) {
            logger.error('List workflows error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to list workflows',
            });
        }
    });

    /**
     * Get a specific workflow
     * GET /v1/agents/workflows/:workflowId
     */
    router.get('/workflows/:workflowId', async (req: Request, res: Response) => {
        try {
            const workflowOrchestrator = await getWorkflowOrchestrator();
            const workflow = workflowOrchestrator.getWorkflow(req.params.workflowId);

            if (!workflow) {
                res.status(404).json({ error: 'Workflow not found' });
                return;
            }

            res.json(workflow);
        } catch (error) {
            logger.error('Get workflow error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to get workflow',
            });
        }
    });

    /**
     * Execute a workflow
     * POST /v1/agents/workflows/:workflowId/execute
     */
    router.post('/workflows/:workflowId/execute', async (req: Request, res: Response) => {
        try {
            const { workflowId } = req.params;
            const input = req.body;

            const workflowOrchestrator = await getWorkflowOrchestrator();
            const execution = await workflowOrchestrator.executeWorkflow(workflowId, input);

            res.json(execution);
        } catch (error) {
            logger.error('Execute workflow error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to execute workflow',
            });
        }
    });

    /**
     * Get workflow execution status
     * GET /v1/agents/workflows/executions/:executionId
     */
    router.get('/workflows/executions/:executionId', async (req: Request, res: Response) => {
        try {
            const workflowOrchestrator = await getWorkflowOrchestrator();
            const execution = workflowOrchestrator.getExecution(req.params.executionId);

            if (!execution) {
                res.status(404).json({ error: 'Execution not found' });
                return;
            }

            res.json(execution);
        } catch (error) {
            logger.error('Get execution error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to get execution',
            });
        }
    });

    /**
     * Generate a workflow from natural language
     * POST /v1/agents/workflows/generate
     */
    router.post('/workflows/generate', async (req: Request, res: Response) => {
        try {
            const { description } = req.body;

            if (!description) {
                res.status(400).json({ error: 'Description is required' });
                return;
            }

            const workflowOrchestrator = await getWorkflowOrchestrator();
            const workflow = await workflowOrchestrator.generateWorkflow(description);

            res.json(workflow);
        } catch (error) {
            logger.error('Generate workflow error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to generate workflow',
            });
        }
    });

    /**
     * Register n8n webhook
     * POST /v1/agents/webhooks
     */
    router.post('/webhooks', async (req: Request, res: Response) => {
        try {
            const { name, url, method = 'POST', headers, authentication } = req.body;

            if (!name || !url) {
                res.status(400).json({ error: 'Webhook name and url are required' });
                return;
            }

            const workflowOrchestrator = await getWorkflowOrchestrator();
            workflowOrchestrator.registerWebhook(name, {
                url,
                method,
                headers,
                authentication,
            });

            res.json({ success: true, message: `Webhook ${name} registered` });
        } catch (error) {
            logger.error('Register webhook error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to register webhook',
            });
        }
    });

    /**
     * Trigger n8n webhook
     * POST /v1/agents/webhooks/:webhookName/trigger
     */
    router.post('/webhooks/:webhookName/trigger', async (req: Request, res: Response) => {
        try {
            const { webhookName } = req.params;
            const data = req.body;

            const workflowOrchestrator = await getWorkflowOrchestrator();
            const result = await workflowOrchestrator.callN8nWebhook(webhookName, data);

            res.json({ success: true, result });
        } catch (error) {
            logger.error('Trigger webhook error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to trigger webhook',
            });
        }
    });

    /**
     * n8n-compatible webhook receiver
     * POST /v1/agents/n8n/webhook
     * This endpoint can be called by n8n to trigger agent actions
     */
    router.post('/n8n/webhook', async (req: Request, res: Response) => {
        try {
            const { action, payload } = req.body;

            logger.info('n8n webhook received', { action });

            let result: unknown;

            switch (action) {
                case 'research':
                    const { createWebResearcher } = await import('../agents/webResearcher.js');
                    const researcher = createWebResearcher(llmClient);
                    result = await researcher.research(payload.query, payload.sources || []);
                    break;

                case 'analyze-code':
                    const { createCodeAnalyzer } = await import('../agents/codeAnalyzer.js');
                    const analyzer = createCodeAnalyzer(llmClient);
                    result = await analyzer.analyze(payload.file);
                    break;

                case 'extract-data':
                    const { createDataExtractor } = await import('../agents/dataExtractor.js');
                    const extractor = createDataExtractor(llmClient);
                    result = await extractor.extractWithSchema(payload.content, payload.schema);
                    break;

                case 'synthesize-docs':
                    const synthesizer = createDocumentSynthesizer(llmClient);
                    result = await synthesizer.synthesize(payload.sources, payload.options);
                    break;

                case 'execute-workflow':
                    const wfOrchestrator = await getWorkflowOrchestrator();
                    result = await wfOrchestrator.executeWorkflow(payload.workflowId, payload.input);
                    break;

                case 'decompose-task':
                    const decomposer = createTaskDecomposer(llmClient);
                    result = await decomposer.decompose(payload.goal, payload.context);
                    break;

                case 'react':
                    const defaultTools: ReActTool[] = [
                        {
                            name: 'analyze',
                            description: 'Analyze information',
                            parameters: {},
                            execute: async (args) => ({ analysis: JSON.stringify(args) }),
                        },
                    ];
                    const agent = createReActAgent(llmClient, defaultTools, { maxIterations: 5 });
                    result = await agent.execute(payload.goal);
                    break;

                default:
                    res.status(400).json({ error: `Unknown action: ${action}` });
                    return;
            }

            res.json({
                success: true,
                action,
                result,
                timestamp: Date.now(),
            });
        } catch (error) {
            logger.error('n8n webhook error', { error });
            res.status(500).json({
                error: error instanceof Error ? error.message : 'n8n webhook failed',
            });
        }
    });

    return router;
}
