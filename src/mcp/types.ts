import { z } from 'zod';
import { ModelLayer } from '../config/models.js';

/**
 * Task complexity levels
 */
export type TaskComplexity = 'low' | 'medium' | 'high';

/**
 * Quality requirement levels
 */
export type QualityRequirement = 'normal' | 'high' | 'critical';

/**
 * Task types
 */
export type TaskType =
    | 'code'
    | 'debug'
    | 'refactor'
    | 'test'
    | 'general'
    | 'reasoning';

/**
 * Routing context for LLM requests
 */
export interface RoutingContext {
    taskType: TaskType;
    complexity: TaskComplexity;
    quality: QualityRequirement;
    preferredLayer?: ModelLayer;
    preferredModel?: string; // Specific model ID to use (bypasses routing)
    enableCrossCheck?: boolean;
    enableAutoEscalate?: boolean;
    budget?: number; // Budget limit in USD (0 = free tier only)
}

/**
 * LLM request interface
 */
export interface LLMRequest {
    prompt: string;
    systemPrompt?: string;
    context?: RoutingContext;
    maxTokens?: number;
    temperature?: number;
}

/**
 * LLM response interface
 */
export interface LLMResponse {
    content: string;
    modelId: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    routingSummary: string;
    requiresEscalationConfirm?: boolean;
    suggestedLayer?: ModelLayer;
    escalationReason?: string;
    optimizedPrompt?: string; // Optimized prompt for next layer
}

/**
 * Cross-check result
 */
export interface CrossCheckResult {
    primary: LLMResponse;
    review?: LLMResponse;
    arbitrator?: LLMResponse;
    consensus: string;
    conflicts: string[];
    routingSummary: string;
}

/**
 * Tool result wrapper
 */
export interface ToolResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Code agent request schema
 */
export const CodeAgentRequestSchema = z.object({
    task: z.string().describe('The coding task description'),
    context: z
        .object({
            language: z.string().optional(),
            framework: z.string().optional(),
            existingCode: z.string().optional(),
            requirements: z.array(z.string()).optional(),
        })
        .optional(),
    quality: z
        .enum(['normal', 'high', 'critical'])
        .default('normal')
        .describe('Quality requirement level'),
});

export type CodeAgentRequest = z.infer<typeof CodeAgentRequestSchema>;

/**
 * Test runner request schema
 */
export const TestRunnerRequestSchema = z.object({
    testType: z
        .enum(['vitest', 'playwright'])
        .describe('Type of test to run'),
    testPath: z.string().optional().describe('Specific test file or pattern'),
    watch: z.boolean().default(false).describe('Run in watch mode'),
});

export type TestRunnerRequest = z.infer<typeof TestRunnerRequestSchema>;

/**
 * File operation request schema
 */
export const FileOperationRequestSchema = z.object({
    operation: z.enum(['read', 'write', 'list', 'delete']),
    path: z.string(),
    content: z.string().optional(),
});

export type FileOperationRequest = z.infer<typeof FileOperationRequestSchema>;
