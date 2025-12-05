/**
 * @file Intelligent AI Model Router
 * @description Core routing engine implementing N-layer model selection strategy.
 * 
 * **N-Layer Architecture:**
 * - **L0 (Free)**: Local/OSS models (Ollama, etc.) - No API costs
 * - **L1 (Standard)**: OpenRouter, budget APIs - Low cost per token  
 * - **L2 (Premium)**: OpenAI GPT-4, Claude - Higher cost, better quality
 * - **L3 (Elite)**: GPT-4o, Claude Opus - Highest cost, best quality
 * 
 * **Routing Strategy:**
 * 1. Detect task complexity (low/medium/high) using free model or heuristics
 * 2. Select initial layer based on complexity and quality requirements
 * 3. Pick best model within layer by priority (from database)
 * 4. Escalate to higher layer if response quality is insufficient
 * 5. Optionally cross-check with multiple models for consensus
 * 
 * **Priority System:**
 * - Models are sorted by `priority` field (0 = highest, 99 = lowest)
 * - Priority is configured in database via admin dashboard
 * - Within same layer, higher priority models are selected first
 * 
 * @see {@link docs/ai-routing-heuristics.md} for detailed routing logic
 */

import {
    ModelLayer,
    getNextLayer,
    LAYERS_IN_ORDER,
    ModelConfig,
} from '../config/models.js';
import { modelConfigService } from '../db/model-config.js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { callLLM } from '../tools/llm/index.js';
import {
    LLMRequest,
    LLMResponse,
    RoutingContext,
    CrossCheckResult,
    TaskComplexity,
} from '../mcp/types.js';

/**
 * Detect task complexity using a free/local LLM model.
 * Falls back to heuristic-based detection if no L0 model available.
 * 
 * @param message - The user's input message to analyze
 * @returns Promise resolving to 'low', 'medium', or 'high' complexity
 * 
 * @example
 * ```typescript
 * const complexity = await detectComplexity("Hello!");
 * // Returns 'low' for simple greetings
 * 
 * const complexity = await detectComplexity("Explain the transformer architecture");
 * // Returns 'high' for technical questions
 * ```
 */
export async function detectComplexity(message: string): Promise<TaskComplexity> {
    try {
        // Use L0 free model for complexity detection (from DB, sorted by priority)
        const models = await modelConfigService.getModelsByLayer('L0');
        if (models.length === 0) {
            logger.warn('No L0 models available for complexity detection, using heuristics');
            return detectComplexityHeuristic(message);
        }

        const complexityModel = models[0]; // Use first model (highest priority)

        const prompt = `Analyze this user message and classify its complexity level.

USER MESSAGE: "${message}"

Classify as:
- "low": Simple greetings, short questions (≤5 words), casual chat
- "medium": General questions, explanations, standard requests
- "high": Complex analysis, code tasks, multi-step reasoning, technical deep-dives

Respond with ONLY ONE WORD: low, medium, or high`;

        const response = await callLLM(
            { prompt, maxTokens: 10, temperature: 0 },
            complexityModel
        );

        const detectedComplexity = response.content.trim().toLowerCase();

        if (['low', 'medium', 'high'].includes(detectedComplexity)) {
            logger.info('Complexity detected by LLM', {
                message: message.substring(0, 50),
                complexity: detectedComplexity,
                model: complexityModel.id
            });
            return detectedComplexity as TaskComplexity;
        }

        logger.warn('Invalid complexity from LLM, using heuristics', { response: detectedComplexity });
        return detectComplexityHeuristic(message);
    } catch (error) {
        logger.error('Complexity detection failed, using heuristics', {
            error: error instanceof Error ? error.message : 'Unknown'
        });
        return detectComplexityHeuristic(message);
    }
}

/**
 * Fallback heuristic-based complexity detection.
 * Used when LLM-based detection fails or no L0 models are available.
 * 
 * **Heuristics:**
 * - **Low**: ≤5 words, no code markers, no complex words
 * - **High**: Code markers (```, function, class), complex words (analyze, implement), >50 words
 * - **Medium**: Everything else
 * 
 * @param message - The user's input message
 * @returns TaskComplexity based on heuristic analysis
 */
function detectComplexityHeuristic(message: string): TaskComplexity {
    const wordCount = message.split(/\s+/).length;
    const hasCodeMarkers = /```|function|class|import|const|let|var/.test(message);
    const hasComplexWords = /(explain|analyze|compare|evaluate|implement|design|architecture|algorithm)/i.test(message);

    if (wordCount <= 5 && !hasCodeMarkers && !hasComplexWords) {
        return 'low';
    } else if (hasCodeMarkers || hasComplexWords || wordCount > 50) {
        return 'high';
    }
    return 'medium';
}

/**
 * Select initial routing layer based on task context.
 * 
 * **Selection logic:**
 * 1. User-preferred layer (if specified) - Highest priority
 * 2. Critical quality requirement → L2 (Premium)
 * 3. High complexity + High quality → L1 (Standard)
 * 4. Default → L0 (Free) from environment variable
 * 
 * @param context - Routing context containing complexity, quality, and preferences
 * @returns The selected ModelLayer (L0, L1, L2, or L3)
 */
export function selectInitialLayer(context: RoutingContext): ModelLayer {
    // If user specified a preferred layer, use it
    if (context.preferredLayer) {
        return context.preferredLayer;
    }

    // Critical tasks start at higher layer
    if (context.quality === 'critical') {
        return 'L2';
    }

    // High complexity + high quality -> L1
    if (context.complexity === 'high' && context.quality === 'high') {
        return 'L1';
    }

    // Default: start at L0 (cheapest)
    return env.DEFAULT_LAYER as ModelLayer;
}

/**
 * Pick the best model from a specific layer based on task type and priority.
 * Models are fetched from database, already sorted by priority ASC (0 = highest).
 * 
 * **Selection algorithm:**
 * 1. Get all enabled models from the layer (sorted by priority)
 * 2. Filter by task capability (code, reasoning, general)
 * 3. Select first capable model (highest priority)
 * 4. Fallback to L0 if layer has no models
 * 
 * @param layer - The model layer to pick from (L0, L1, L2, L3)
 * @param taskType - The type of task ('code', 'reasoning', 'general')
 * @returns Promise resolving to the selected ModelConfig, or undefined if none available
 */
async function pickModelFromLayer(
    layer: ModelLayer,
    taskType: string,
): Promise<ModelConfig | undefined> {
    // Models are already sorted by priority (0 = highest priority) from DB
    const models = await modelConfigService.getModelsByLayer(layer);

    if (models.length === 0) {
        logger.warn(`No models found for layer ${layer}`);

        // If layer is disabled or has no models, fallback to L0 (free tier)
        if (layer !== 'L0') {
            logger.info(`Falling back to L0 (free tier) as ${layer} is unavailable`);
            const l0Models = await modelConfigService.getModelsByLayer('L0');

            if (l0Models.length === 0) {
                logger.error('No L0 models available, cannot proceed');
                return undefined;
            }

            // Filter by capability from L0 models
            const capableL0Models = l0Models.filter((m) => {
                if (taskType === 'code') return m.capabilities.code;
                if (taskType === 'reasoning') return m.capabilities.reasoning;
                return m.capabilities.general;
            });

            if (capableL0Models.length === 0) {
                // Return first model (highest priority) as fallback
                return l0Models[0];
            }

            // Return first capable model (already sorted by priority)
            return capableL0Models[0];
        }

        return undefined;
    }

    // Filter by capability
    const capableModels = models.filter((m) => {
        if (taskType === 'code') return m.capabilities.code;
        if (taskType === 'reasoning') return m.capabilities.reasoning;
        return m.capabilities.general;
    });

    if (capableModels.length === 0) {
        logger.warn(`No capable models found for ${taskType} in layer ${layer}`);
        // Return first model (highest priority) as fallback
        return models[0];
    }

    // Return first capable model (already sorted by priority, 0 = highest)
    logger.info(`Selected model by priority`, {
        layer,
        taskType,
        selectedModel: capableModels[0].id,
        priority: capableModels[0].priority,
        totalCapable: capableModels.length,
    });
    return capableModels[0];
}

/**
 * Perform cross-check between multiple models for consensus.
 * Used for high-stakes requests where accuracy is critical.
 * 
 * **Cross-check process:**
 * 1. Get all available models in the layer
 * 2. If <2 models, skip cross-check and use single model
 * 3. Query multiple models with same request
 * 4. Compare responses for consensus
 * 5. Return primary response with conflict information
 * 
 * @param request - The LLM request to cross-check
 * @param layer - The model layer for cross-checking
 * @param taskType - The type of task for model selection
 * @returns Promise resolving to CrossCheckResult with consensus and conflicts
 */
async function crossCheck(
    request: LLMRequest,
    layer: ModelLayer,
    taskType: string,
): Promise<CrossCheckResult> {
    // Get models from DB, already sorted by priority
    const models = await modelConfigService.getModelsByLayer(layer);

    if (models.length < 2) {
        // Not enough models for cross-check, use single model
        const model = await pickModelFromLayer(layer, taskType);
        if (!model) {
            throw new Error(`No model available for layer ${layer}`);
        }

        const response = await callLLM(request, model);
        return {
            primary: { ...response, routingSummary: '' },
            consensus: response.content,
            conflicts: [],
            routingSummary: `Single model: ${model.id} (${layer})`,
        };
    }

    // Get primary and review models
    const primaryModel = models[0];
    const reviewModel = models[1];

    logger.info('Cross-checking with multiple models', {
        primary: primaryModel.id,
        review: reviewModel.id,
        layer,
    });

    // Call primary model
    const primaryResponse = await callLLM(request, primaryModel);

    // Call review model with modified prompt
    const reviewRequest: LLMRequest = {
        ...request,
        prompt: `Review the following solution and identify any issues, bugs, or improvements:

SOLUTION TO REVIEW:
${primaryResponse.content}

ORIGINAL TASK:
${request.prompt}

Please provide:
1. Overall assessment (good/acceptable/needs-improvement)
2. Specific issues found (if any)
3. Suggestions for improvement (if any)
`,
    };

    const reviewResponse = await callLLM(reviewRequest, reviewModel);

    // Improved conflict detection - check for actual negative assessment
    const reviewLower = reviewResponse.content.toLowerCase();

    // Look for explicit negative assessments
    const hasNeedsImprovement = reviewLower.includes('needs-improvement') ||
        reviewLower.includes('needs improvement');
    const hasCriticalIssue = (reviewLower.includes('critical') || reviewLower.includes('major')) &&
        (reviewLower.includes('bug') || reviewLower.includes('error'));
    const hasIncorrect = reviewLower.includes('incorrect') ||
        reviewLower.includes('wrong') ||
        reviewLower.includes('fails');

    // Only flag as conflict if there are serious issues, not just suggestions
    const hasConflicts = hasNeedsImprovement || hasCriticalIssue || hasIncorrect;

    const conflicts = hasConflicts
        ? ['Review identified serious issues requiring escalation']
        : [];

    // If review found issues, we might want to escalate or use arbitrator
    let consensus = primaryResponse.content;
    let arbitratorResponse: LLMResponse | undefined;

    if (hasConflicts && models.length >= 3) {
        logger.info('Conflicts detected, calling arbitrator');
        const arbitratorModel = models[2];
        const arbitratorRequest: LLMRequest = {
            ...request,
            prompt: `You are an arbitrator. Review these two solutions and decide which is better, or provide an improved solution.

SOLUTION A:
${primaryResponse.content}

REVIEW OF SOLUTION A:
${reviewResponse.content}

ORIGINAL TASK:
${request.prompt}

Provide the best solution:`,
        };

        const arbResponse = await callLLM(arbitratorRequest, arbitratorModel);
        arbitratorResponse = { ...arbResponse, routingSummary: '' };
        consensus = arbResponse.content;
    }

    const routingSummary = arbitratorResponse
        ? `Cross-check (3 models): ${primaryModel.id}, ${reviewModel.id}, ${arbitratorResponse.modelId} (layer ${layer})`
        : `Cross-check (2 models): ${primaryModel.id}, ${reviewModel.id} (layer ${layer})`;

    return {
        primary: { ...primaryResponse, routingSummary: '' },
        review: { ...reviewResponse, routingSummary: '' },
        arbitrator: arbitratorResponse,
        consensus,
        conflicts,
        routingSummary,
    };
}

/**
 * Main routing function with N-layer dynamic routing
 */
export async function routeRequest(
    request: LLMRequest,
    context: RoutingContext,
): Promise<LLMResponse> {
    // Check budget constraints early - if budget is 0, force L0 layer (free models only)
    if (context.budget === 0) {
        logger.info('Budget is 0, forcing L0 layer (free models only)', {
            budget: context.budget,
            forcedLayer: 'L0',
        });

        const model = await pickModelFromLayer('L0', context.taskType);
        if (!model) {
            throw new Error('No free models available in L0 layer');
        }

        // Check if the selected model is actually free
        const isFree = model.id.includes(':free') || (model as any).pricing?.prompt === 0;
        if (!isFree) {
            logger.warn('L0 model is not free, but budget is 0', {
                model: model.id,
                budget: context.budget,
            });
        }

        const response = await callLLM(request, model);
        return {
            ...response,
            routingSummary: `Budget enforcement: ${model.id} (layer L0, free tier only)`,
        };
    }

    // If user specified a preferred model, use it directly (bypass all routing)
    if (context.preferredModel) {
        logger.info('Using user-specified model', {
            model: context.preferredModel,
            skipComplexityDetection: true,
            skipCrossCheck: true,
            skipRouting: true,
        });

        const model = await modelConfigService.getModelById(context.preferredModel);
        if (!model) {
            logger.warn('Preferred model not found, falling back to routing', {
                preferredModel: context.preferredModel,
            });
        } else {
            const response = await callLLM(request, model);
            return {
                ...response,
                routingSummary: `Direct model selection: ${model.id} (layer ${model.layer})`,
            };
        }
    }

    // If user specified preferred layer, use it directly without complexity detection or cross-check
    if (context.preferredLayer) {
        logger.info('Using user-specified layer', {
            layer: context.preferredLayer,
            skipComplexityDetection: true,
            skipCrossCheck: true,
        });

        const model = await pickModelFromLayer(context.preferredLayer, context.taskType);
        if (!model) {
            throw new Error(`No model available for layer ${context.preferredLayer}`);
        }

        const response = await callLLM(request, model);
        return {
            ...response,
            routingSummary: `Direct layer selection: ${model.id} (layer ${context.preferredLayer})`,
        };
    }

    const enableAutoEscalate =
        context.enableAutoEscalate ?? env.ENABLE_AUTO_ESCALATE;

    let currentLayer = selectInitialLayer(context);

    // Only enable cross-check for high complexity tasks
    const shouldCrossCheck = (context.enableCrossCheck ?? env.ENABLE_CROSS_CHECK) &&
        context.complexity === 'high';

    logger.info('Routing request', {
        taskType: context.taskType,
        complexity: context.complexity,
        quality: context.quality,
        initialLayer: currentLayer,
        crossCheck: shouldCrossCheck,
    });

    // Try current layer with cross-check only for high complexity
    if (shouldCrossCheck) {
        const result = await crossCheck(request, currentLayer, context.taskType);

        // If no conflicts, return consensus
        if (result.conflicts.length === 0) {
            return {
                content: result.consensus,
                modelId: result.primary.modelId,
                provider: result.primary.provider,
                inputTokens: result.primary.inputTokens,
                outputTokens: result.primary.outputTokens,
                cost: result.primary.cost,
                routingSummary: result.routingSummary + ' (no conflicts)',
            };
        }

        // Conflicts detected
        logger.warn('Conflicts detected in cross-check', {
            layer: currentLayer,
            conflicts: result.conflicts,
        });

        const nextLayer = getNextLayer(currentLayer);
        const maxLayer = env.MAX_ESCALATION_LAYER as ModelLayer;
        const maxLayerIndex = LAYERS_IN_ORDER.indexOf(maxLayer);
        const currentLayerIndex = LAYERS_IN_ORDER.indexOf(currentLayer);
        const canEscalate = nextLayer && currentLayerIndex < maxLayerIndex;

        // Prevent escalation if budget is 0 (free tier only)
        const allowEscalation = context.budget !== 0;
        if (!allowEscalation && canEscalate) {
            logger.info('Escalation blocked due to budget constraint', {
                budget: context.budget,
                currentLayer,
                suggestedLayer: nextLayer,
                reason: 'Budget is 0, free tier only',
            });
        }

        // If auto-escalate is enabled and we can escalate and budget allows
        if (enableAutoEscalate && canEscalate && allowEscalation) {
            logger.info('Auto-escalating to next layer', {
                from: currentLayer,
                to: nextLayer,
            });
            currentLayer = nextLayer!;

            // Try again at higher layer
            const escalatedResult = await crossCheck(
                request,
                currentLayer,
                context.taskType,
            );
            return {
                content: escalatedResult.consensus,
                modelId: escalatedResult.primary.modelId,
                provider: escalatedResult.primary.provider,
                inputTokens: escalatedResult.primary.inputTokens,
                outputTokens: escalatedResult.primary.outputTokens,
                cost: escalatedResult.primary.cost,
                routingSummary:
                    escalatedResult.routingSummary +
                    ` (escalated from ${selectInitialLayer(context)})`,
            };
        }

        // If auto-escalate is disabled but escalation is possible, ask for confirmation
        // But only if budget allows escalation
        if (!enableAutoEscalate && canEscalate && allowEscalation) {
            const isPaidLayer = currentLayer !== 'L0' || (nextLayer && nextLayer !== 'L0');

            if (isPaidLayer) {
                logger.info('Escalation requires user confirmation', {
                    currentLayer,
                    suggestedLayer: nextLayer,
                    reason: 'ENABLE_AUTO_ESCALATE is disabled and conflicts detected',
                });

                // Generate optimized prompt for next layer
                const optimizedPrompt = `[ESCALATED FROM ${currentLayer} TO ${nextLayer}]

ORIGINAL REQUEST:
${request.messages[request.messages.length - 1]?.content || 'N/A'}

CONTEXT FROM ${currentLayer}:
${result.consensus}

CONFLICTS DETECTED:
${result.conflicts.join('\n- ')}

PLEASE PROVIDE:
- A more accurate and detailed response
- Clear resolution of the conflicts
- Higher quality output suitable for ${nextLayer} tier`;

                // Return response with escalation confirmation requirement
                return {
                    content: result.consensus,
                    modelId: result.primary.modelId,
                    provider: result.primary.provider,
                    inputTokens: result.primary.inputTokens,
                    outputTokens: result.primary.outputTokens,
                    cost: result.primary.cost,
                    routingSummary: result.routingSummary + ' (conflicts detected - escalation available)',
                    requiresEscalationConfirm: true,
                    suggestedLayer: nextLayer,
                    escalationReason: `Conflicts detected in ${currentLayer} layer. Escalating to ${nextLayer} may provide better results (paid tier).`,
                    optimizedPrompt,
                };
            }
        }

        // Return arbitrated result if available, otherwise primary
        const finalContent = result.arbitrator
            ? result.consensus
            : result.primary.content;

        return {
            content: finalContent,
            modelId: result.primary.modelId,
            provider: result.primary.provider,
            inputTokens: result.primary.inputTokens,
            outputTokens: result.primary.outputTokens,
            cost: result.primary.cost,
            routingSummary:
                result.routingSummary + ' (conflicts resolved with arbitrator)',
        };
    } else {
        // No cross-check, just use single model
        const model = await pickModelFromLayer(currentLayer, context.taskType);
        if (!model) {
            throw new Error(`No model available for layer ${currentLayer}`);
        }

        const response = await callLLM(request, model);
        return {
            ...response,
            routingSummary: `Single model: ${model.id} (layer ${currentLayer})`,
        };
    }
}
