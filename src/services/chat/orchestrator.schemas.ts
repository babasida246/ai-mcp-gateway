/**
 * @file Orchestrator Schemas
 * @description Zod schemas for structured LLM responses in multi-pass orchestration
 */

import { z } from 'zod';

/**
 * Schema for analysis pass output
 * LLM extracts intent, queries, and determines if retrieval is needed
 */
export const AnalysisResponseSchema = z.object({
    intent: z.string().describe('The user intent or main goal of the request'),
    keywords: z.array(z.string()).describe('Key search terms for context retrieval'),
    requires_retrieval: z.boolean().describe('Whether external context/history is needed'),
    requires_tools: z.boolean().optional().describe('Whether tool calls are needed'),
    complexity_level: z.enum(['simple', 'moderate', 'complex']).describe('Estimated complexity'),
    approach: z.string().describe('Suggested approach to solve this request'),
    clarifications: z.array(z.string()).optional().describe('Questions needing clarification'),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

/**
 * Schema for generation pass output
 * LLM generates the main response with citations
 */
export const GenerationResponseSchema = z.object({
    response: z.string().describe('Main response to the user query'),
    citations: z.array(z.object({
        reference: z.string().describe('Source or evidence reference'),
        text: z.string().describe('Cited text'),
    })).optional().describe('Citations from provided context'),
    confidence: z.number().min(0).max(1).optional().describe('Confidence level of the response'),
    requires_follow_up: z.boolean().optional().describe('Whether follow-up questions should be asked'),
});

export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;

/**
 * Schema for refinement pass output
 * LLM improves draft response based on criteria
 */
export const RefinementResponseSchema = z.object({
    refined_response: z.string().describe('Refined and improved response'),
    improvements_made: z.array(z.string()).describe('List of improvements applied'),
    quality_score: z.number().min(0).max(100).optional().describe('Quality score of refined response'),
    ready_to_send: z.boolean().describe('Whether response is ready to send to user'),
});

export type RefinementResponse = z.infer<typeof RefinementResponseSchema>;

/**
 * Configuration for orchestrator strategy
 */
export const OrchestratorStrategySchema = z.object({
    enabled: z.boolean().default(false).describe('Enable multi-pass orchestration'),
    passes: z.enum(['two-pass', 'three-pass']).default('two-pass').describe('Number of LLM passes'),
    include_analysis: z.boolean().default(true).describe('Include analysis pass'),
    include_refinement: z.boolean().default(false).describe('Include refinement pass'),
    max_total_tokens: z.number().default(8000).describe('Max tokens for entire orchestration'),
    timeout_ms: z.number().default(30000).describe('Timeout for orchestration'),
});

export type OrchestratorStrategy = z.infer<typeof OrchestratorStrategySchema>;

/**
 * Orchestration result with all passes' outputs
 */
export const OrchestratorResultSchema = z.object({
    final_response: z.string().describe('Final response to send to user'),
    analysis: AnalysisResponseSchema.optional(),
    draft: GenerationResponseSchema.optional(),
    refined: RefinementResponseSchema.optional(),
    token_usage: z.object({
        analysis_tokens: z.number().default(0),
        generation_tokens: z.number().default(0),
        refinement_tokens: z.number().default(0),
        total_tokens: z.number(),
    }),
    duration_ms: z.number(),
    passes_completed: z.array(z.string()),
});

export type OrchestratorResult = z.infer<typeof OrchestratorResultSchema>;
