import {
    ModelLayer,
    getModelsByLayer,
    getModelsByLayerWithFallback,
    getNextLayer,
    LAYERS_IN_ORDER,
} from '../config/models.js';
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
 * Detect task complexity using a free/local LLM model
 */
export async function detectComplexity(message: string): Promise<TaskComplexity> {
    try {
        // Use L0 free model for complexity detection
        const models = await getModelsByLayerWithFallback('L0');
        if (models.length === 0) {
            logger.warn('No L0 models available for complexity detection, using heuristics');
            return detectComplexityHeuristic(message);
        }

        const complexityModel = models[0]; // Use first free model

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
 * Fallback heuristic-based complexity detection
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
 * Select initial layer based on task context
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
 * Pick a model from a layer (prefer cheapest with required capabilities)
 */
async function pickModelFromLayer(
    layer: ModelLayer,
    taskType: string,
): Promise<ReturnType<typeof getModelsByLayer>[number] | undefined> {
    const models = layer === 'L0'
        ? await getModelsByLayerWithFallback(layer)
        : getModelsByLayer(layer);

    if (models.length === 0) {
        logger.warn(`No models found for layer ${layer}`);

        // If layer is disabled or has no models, fallback to L0 (free tier)
        if (layer !== 'L0') {
            logger.info(`Falling back to L0 (free tier) as ${layer} is unavailable`);
            const l0Models = await getModelsByLayerWithFallback('L0');

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
                return l0Models[0]; // Fallback to any L0 model
            }

            return capableL0Models.reduce((cheapest, current) =>
                current.relativeCost < cheapest.relativeCost ? current : cheapest,
            );
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
        return models[0]; // Fallback to any model
    }

    // Return cheapest
    return capableModels.reduce((cheapest, current) =>
        current.relativeCost < cheapest.relativeCost ? current : cheapest,
    );
}

/**
 * Perform cross-check between models
 */
async function crossCheck(
    request: LLMRequest,
    layer: ModelLayer,
    taskType: string,
): Promise<CrossCheckResult> {
    const models = layer === 'L0'
        ? await getModelsByLayerWithFallback(layer)
        : getModelsByLayer(layer);

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

        // If auto-escalate is enabled and we can escalate
        if (enableAutoEscalate && canEscalate) {
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
        if (!enableAutoEscalate && canEscalate) {
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
