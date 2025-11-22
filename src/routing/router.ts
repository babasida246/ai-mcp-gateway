import {
    ModelLayer,
    getModelsByLayer,
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
} from '../mcp/types.js';

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
function pickModelFromLayer(
    layer: ModelLayer,
    taskType: string,
): ReturnType<typeof getModelsByLayer>[number] | undefined {
    const models = getModelsByLayer(layer);

    if (models.length === 0) {
        logger.warn(`No models found for layer ${layer}`);
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
    const models = getModelsByLayer(layer);

    if (models.length < 2) {
        // Not enough models for cross-check, use single model
        const model = pickModelFromLayer(layer, taskType);
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

    // Simple conflict detection (check if review mentions "issue" or "problem")
    const reviewLower = reviewResponse.content.toLowerCase();
    const hasConflicts =
        reviewLower.includes('issue') ||
        reviewLower.includes('problem') ||
        reviewLower.includes('bug') ||
        reviewLower.includes('error');

    const conflicts = hasConflicts
        ? ['Review identified potential issues']
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
    const enableCrossCheck = context.enableCrossCheck ?? env.ENABLE_CROSS_CHECK;
    const enableAutoEscalate =
        context.enableAutoEscalate ?? env.ENABLE_AUTO_ESCALATE;

    let currentLayer = selectInitialLayer(context);
    logger.info('Routing request', {
        taskType: context.taskType,
        complexity: context.complexity,
        quality: context.quality,
        initialLayer: currentLayer,
        crossCheck: enableCrossCheck,
    });

    // Try current layer
    if (enableCrossCheck) {
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

        // If auto-escalate is enabled and we can escalate
        if (enableAutoEscalate) {
            const nextLayer = getNextLayer(currentLayer);
            const maxLayer = env.MAX_ESCALATION_LAYER as ModelLayer;
            const maxLayerIndex = LAYERS_IN_ORDER.indexOf(maxLayer);
            const currentLayerIndex = LAYERS_IN_ORDER.indexOf(currentLayer);

            if (nextLayer && currentLayerIndex < maxLayerIndex) {
                logger.info('Auto-escalating to next layer', {
                    from: currentLayer,
                    to: nextLayer,
                });
                currentLayer = nextLayer;

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
        const model = pickModelFromLayer(currentLayer, context.taskType);
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
