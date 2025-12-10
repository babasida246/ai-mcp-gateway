/**
 * @file Multi-Pass LLM Orchestrator
 * @description Orchestrates multiple LLM calls with ChatContextBuilder integration
 * for enhanced reasoning and response generation
 */

import { z } from 'zod';
import { logger } from '../../logging/logger.js';
import { chatContextBuilder } from './ChatContextBuilder.js';
import { estimateTokensSync } from './TokenEstimator.js';
import {
    AnalysisResponse,
    AnalysisResponseSchema,
    GenerationResponse,
    GenerationResponseSchema,
    RefinementResponse,
    RefinementResponseSchema,
    OrchestratorStrategy,
    OrchestratorResult,
} from './orchestrator.schemas.js';
import type { OpenAIMessage, ContextMessage } from './ChatContextBuilder.js';

/**
 * LLM client interface for orchestrator
 */
export interface OrchestratorLLMClient {
    generateCompletion(
        messages: OpenAIMessage[],
        options?: {
            modelId?: string;
            temperature?: number;
            maxTokens?: number;
            jsonMode?: boolean;
        }
    ): Promise<string>;
}

/**
 * Request context for orchestration
 */
export interface OrchestratorRequest {
    conversationId?: string;
    messages: OpenAIMessage[];
    model?: string;
    projectId?: string;
    toolId?: string;
    strategy?: OrchestratorStrategy;
}

/**
 * Multi-pass LLM Orchestrator
 */
export class Orchestrator {
    private llmClient: OrchestratorLLMClient;
    private defaultStrategy: OrchestratorStrategy;

    constructor(llmClient: OrchestratorLLMClient, defaultStrategy?: OrchestratorStrategy) {
        this.llmClient = llmClient;
        this.defaultStrategy = defaultStrategy || {
            enabled: false,
            passes: 'two-pass',
            include_analysis: true,
            include_refinement: false,
            max_total_tokens: 8000,
            timeout_ms: 30000,
        };
    }

    /**
     * Handle orchestration flow
     */
    async handle(request: OrchestratorRequest): Promise<OrchestratorResult> {
        const startTime = Date.now();
        const strategy = request.strategy || this.defaultStrategy;

        if (!strategy.enabled) {
            // Fallback: single-pass generation
            return this.singlePassGeneration(request);
        }

        const passesCompleted: string[] = [];
        let analysis: AnalysisResponse | undefined;
        let draft: GenerationResponse | undefined;
        let refined: RefinementResponse | undefined;
        let totalTokens = 0;

        try {
            // Pass 1: Analysis
            if (strategy.include_analysis) {
                logger.info('[Orchestrator] Starting analysis pass', {
                    conversationId: request.conversationId,
                });
                const analysisResult = await this.analysisPass(request);
                analysis = analysisResult.data;
                totalTokens += analysisResult.tokens;
                passesCompleted.push('analysis');

                if (totalTokens > strategy.max_total_tokens * 0.7) {
                    logger.warn('[Orchestrator] Token budget approaching, skipping refinement', {
                        totalTokens,
                        budget: strategy.max_total_tokens,
                    });
                    strategy.include_refinement = false;
                }
            }

            // Retrieve context if analysis suggests it
            let enhancedContext: ContextMessage[] = [];
            if (analysis?.requires_retrieval) {
                logger.info('[Orchestrator] Retrieving context based on analysis', {
                    keywords: analysis.keywords,
                });
                enhancedContext = await this.retrieveContext(
                    request,
                    analysis.keywords
                );
            }

            // Pass 2: Generation
            logger.info('[Orchestrator] Starting generation pass', {
                conversationId: request.conversationId,
            });
            const generationResult = await this.generationPass(
                request,
                analysis,
                enhancedContext
            );
            draft = generationResult.data;
            totalTokens += generationResult.tokens;
            passesCompleted.push('generation');

            if (totalTokens > strategy.max_total_tokens) {
                logger.warn('[Orchestrator] Token budget exceeded, skipping refinement', {
                    totalTokens,
                    budget: strategy.max_total_tokens,
                });
                strategy.include_refinement = false;
            }

            // Pass 3: Refinement (optional)
            if (strategy.include_refinement && strategy.passes === 'three-pass' && draft) {
                logger.info('[Orchestrator] Starting refinement pass', {
                    conversationId: request.conversationId,
                });
                const refinementResult = await this.refinementPass(request, draft);
                refined = refinementResult.data;
                totalTokens += refinementResult.tokens;
                passesCompleted.push('refinement');
            }

            const finalResponse = refined?.refined_response || draft?.response || '';
            const duration = Date.now() - startTime;

            logger.info('[Orchestrator] Completed orchestration', {
                conversationId: request.conversationId,
                passesCompleted,
                totalTokens,
                durationMs: duration,
            });

            return {
                final_response: finalResponse,
                analysis,
                draft,
                refined,
                token_usage: {
                    analysis_tokens: analysis ? totalTokens / 3 : 0, // Approximate
                    generation_tokens: draft ? totalTokens / 2 : 0,
                    refinement_tokens: refined ? totalTokens / 3 : 0,
                    total_tokens: totalTokens,
                },
                duration_ms: duration,
                passes_completed: passesCompleted,
            };
        } catch (error) {
            logger.error('[Orchestrator] Orchestration failed', {
                conversationId: request.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            // Fallback to single-pass
            return this.singlePassGeneration(request);
        }
    }

    /**
     * Analysis pass: understand intent and plan approach
     */
    private async analysisPass(
        request: OrchestratorRequest
    ): Promise<{ data: AnalysisResponse; tokens: number }> {
        const userMessage = request.messages[request.messages.length - 1]?.content || '';

        const systemPrompt = `You are an expert assistant that analyzes user requests to extract actionable insights.
For each request, determine:
1. The core intent
2. Key search terms that would help find relevant information
3. Whether external context/history is needed
4. The appropriate solving approach

Respond with valid JSON matching this structure:
{
  "intent": "string",
  "keywords": ["array", "of", "keywords"],
  "requires_retrieval": boolean,
  "requires_tools": false,
  "complexity_level": "simple|moderate|complex",
  "approach": "string describing the approach"
}`;

        const analysisMessages: OpenAIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ];

        const analysisResponse = await this.llmClient.generateCompletion(analysisMessages, {
            modelId: request.model,
            temperature: 0.3,
            maxTokens: 500,
            jsonMode: true,
        });

        const estimatedTokens = estimateTokensSync(analysisResponse, request.model);

        try {
            const parsed = JSON.parse(analysisResponse);
            const validated = AnalysisResponseSchema.parse(parsed);
            return { data: validated, tokens: estimatedTokens };
        } catch (error) {
            logger.warn('[Orchestrator] Analysis parsing failed, using fallback', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                data: {
                    intent: userMessage.substring(0, 100),
                    keywords: [],
                    requires_retrieval: false,
                    complexity_level: 'simple',
                    approach: 'Direct response',
                },
                tokens: estimatedTokens,
            };
        }
    }

    /**
     * Retrieve context using ChatContextBuilder
     */
    private async retrieveContext(
        request: OrchestratorRequest,
        keywords: string[]
    ): Promise<ContextMessage[]> {
        if (!request.conversationId) {
            return [];
        }

        try {
            const contextResult = await chatContextBuilder.buildContext({
                conversationId: request.conversationId,
                currentUserMessage: keywords.join(' '),
                modelId: request.model,
                projectId: request.projectId,
                toolId: request.toolId,
                configOverrides: {
                    strategy: 'span-retrieval', // Use vector search for relevant messages
                    maxPromptTokens: 2000,
                },
            });

            return contextResult.messages.slice(0, -1); // Exclude the current message
        } catch (error) {
            logger.warn('[Orchestrator] Context retrieval failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }

    /**
     * Generation pass: create main response
     */
    private async generationPass(
        request: OrchestratorRequest,
        analysis?: AnalysisResponse,
        enhancedContext?: ContextMessage[]
    ): Promise<{ data: GenerationResponse; tokens: number }> {
        const userMessage = request.messages[request.messages.length - 1]?.content || '';

        let contextString = '';
        if (enhancedContext && enhancedContext.length > 0) {
            contextString = '\n\nRelevant context:\n' +
                enhancedContext.map(m => `${m.role}: ${m.content}`).join('\n');
        }

        const approachString = analysis?.approach ? `\n\nSuggested approach: ${analysis.approach}` : '';

        const systemPrompt = `You are a helpful assistant. Generate a comprehensive and accurate response.
If context is provided, cite it using [C1], [C2], etc.
Respond with valid JSON matching this structure:
{
  "response": "string",
  "citations": [{"reference": "C1", "text": "cited text"}],
  "confidence": 0.95
}`;

        const generationMessages: OpenAIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage + contextString + approachString },
        ];

        const generationResponse = await this.llmClient.generateCompletion(
            generationMessages,
            {
                modelId: request.model,
                temperature: 0.7,
                maxTokens: 1000,
                jsonMode: true,
            }
        );

        const estimatedTokens = estimateTokensSync(generationResponse, request.model);

        try {
            const parsed = JSON.parse(generationResponse);
            const validated = GenerationResponseSchema.parse(parsed);
            return { data: validated, tokens: estimatedTokens };
        } catch (error) {
            logger.warn('[Orchestrator] Generation parsing failed, using fallback', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                data: {
                    response: generationResponse,
                    confidence: 0.5,
                },
                tokens: estimatedTokens,
            };
        }
    }

    /**
     * Refinement pass: improve draft response
     */
    private async refinementPass(
        request: OrchestratorRequest,
        draft: GenerationResponse
    ): Promise<{ data: RefinementResponse; tokens: number }> {
        const systemPrompt = `You are an expert editor. Improve the provided draft response:
1. Enhance clarity and conciseness
2. Fix any errors or inconsistencies
3. Improve tone and readability
4. Ensure accuracy

Respond with valid JSON:
{
  "refined_response": "string",
  "improvements_made": ["list", "of", "improvements"],
  "quality_score": 85,
  "ready_to_send": true
}`;

        const refinementMessages: OpenAIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Draft response to improve:\n\n${draft.response}` },
        ];

        const refinementResponse = await this.llmClient.generateCompletion(
            refinementMessages,
            {
                modelId: request.model,
                temperature: 0.5,
                maxTokens: 1000,
                jsonMode: true,
            }
        );

        const estimatedTokens = estimateTokensSync(refinementResponse, request.model);

        try {
            const parsed = JSON.parse(refinementResponse);
            const validated = RefinementResponseSchema.parse(parsed);
            return { data: validated, tokens: estimatedTokens };
        } catch (error) {
            logger.warn('[Orchestrator] Refinement parsing failed, using draft as-is', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                data: {
                    refined_response: draft.response,
                    improvements_made: [],
                    quality_score: 50,
                    ready_to_send: true,
                },
                tokens: estimatedTokens,
            };
        }
    }

    /**
     * Single-pass generation (fallback)
     */
    private async singlePassGeneration(
        request: OrchestratorRequest
    ): Promise<OrchestratorResult> {
        const startTime = Date.now();

        try {
            const response = await this.llmClient.generateCompletion(request.messages, {
                modelId: request.model,
                temperature: 0.7,
                maxTokens: 2000,
            });

            const tokens = estimateTokensSync(response, request.model);
            const duration = Date.now() - startTime;

            return {
                final_response: response,
                token_usage: {
                    analysis_tokens: 0,
                    generation_tokens: tokens,
                    refinement_tokens: 0,
                    total_tokens: tokens,
                },
                duration_ms: duration,
                passes_completed: ['single-pass'],
            };
        } catch (error) {
            logger.error('[Orchestrator] Single-pass generation failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                final_response: 'Error generating response. Please try again.',
                token_usage: {
                    analysis_tokens: 0,
                    generation_tokens: 0,
                    refinement_tokens: 0,
                    total_tokens: 0,
                },
                duration_ms: Date.now() - startTime,
                passes_completed: [],
            };
        }
    }
}

/**
 * Global orchestrator instance
 */
export let orchestrator: Orchestrator | null = null;

/**
 * Initialize orchestrator with LLM client
 */
export function initializeOrchestrator(
    llmClient: OrchestratorLLMClient,
    strategy?: OrchestratorStrategy
): void {
    orchestrator = new Orchestrator(llmClient, strategy);
    logger.info('[Orchestrator] Initialized', { strategy });
}
