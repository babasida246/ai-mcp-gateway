import { z } from 'zod';

/**
 * Client mode types
 */
export type ClientMode = 'cli' | 'web' | 'mcp' | 'telegram' | 'ci' | 'other';

/**
 * Quality levels
 */
export type QualityLevel = 'normal' | 'high' | 'critical';

/**
 * API Request - Base schema for all endpoints
 */
export const ApiRequestSchema = z.object({
    conversationId: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    message: z.string().min(1, 'Message is required'),
    mode: z.enum(['cli', 'web', 'mcp', 'telegram', 'ci', 'other']).default('web'),
    metadata: z
        .object({
            project: z.string().optional(),
            quality: z.enum(['normal', 'high', 'critical']).default('normal'),
            client: z.string().optional(),
            telegramChatId: z.number().optional(),
            tags: z.array(z.string()).optional(),
        })
        .optional(),
});

export type ApiRequest = z.infer<typeof ApiRequestSchema>;

/**
 * Routing summary structure
 */
export interface RoutingSummary {
    layersUsed: string[];
    models: string[];
    fromCache: boolean;
    escalated?: boolean;
    crossCheckPerformed?: boolean;
    totalCost?: number;
}

/**
 * Context response structure
 */
export interface ContextResponse {
    conversationId: string;
    updatedSummary?: string;
    messageCount?: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    durationMs: number;
    tokens?: {
        input: number;
        output: number;
    };
    cost?: number;
}

/**
 * API Response - Standard response format
 */
export interface ApiResponse {
    result: {
        text: string;
        todo?: string;
        code?: string;
        metadata?: Record<string, unknown>;
    };
    routingSummary: RoutingSummary;
    context: ContextResponse;
    performance?: PerformanceMetrics;
}

/**
 * Code Agent specific request
 */
export const CodeAgentRequestSchema = ApiRequestSchema.extend({
    task: z.string().optional(),
    language: z.string().optional(),
    framework: z.string().optional(),
    testRequired: z.boolean().default(true),
});

export type CodeAgentRequest = z.infer<typeof CodeAgentRequestSchema>;

/**
 * Cache clear request
 */
export const CacheClearRequestSchema = z.object({
    pattern: z.string().optional(),
    conversationId: z.string().optional(),
});

export type CacheClearRequest = z.infer<typeof CacheClearRequestSchema>;

/**
 * Stats request
 */
export const StatsRequestSchema = z.object({
    conversationId: z.string().optional(),
    userId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    groupBy: z.enum(['model', 'layer', 'day', 'conversation']).optional(),
});

export type StatsRequest = z.infer<typeof StatsRequestSchema>;

/**
 * Stats response
 */
export interface StatsResponse {
    totalCalls: number;
    totalCost: number;
    totalTokens: {
        input: number;
        output: number;
    };
    byModel?: Record<string, {
        calls: number;
        cost: number;
        tokens: { input: number; output: number };
    }>;
    byLayer?: Record<string, {
        calls: number;
        cost: number;
    }>;
    cacheHitRate?: number;
}

/**
 * Error response
 */
export interface ErrorResponse {
    error: string;
    details?: string;
    code?: string;
}
