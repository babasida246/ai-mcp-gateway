/**
 * Tracing Types - Complete request lifecycle tracking
 */

export interface RequestTrace {
    id: string;
    conversationId: string;
    requestType: RequestType;
    requestPayload: Record<string, unknown>;
    routingDecisions: RoutingDecision[];
    llmCalls: LLMCallTrace[];
    toolCalls: ToolCallTrace[];
    totalCost: number;
    totalDurationMs: number;
    errorInfo?: ErrorInfo;
    createdAt: Date;
}

export type RequestType =
    | 'route'
    | 'chat'
    | 'code-agent'
    | 'mcp-cli'
    | 'analyze'
    | 'create-project';

export interface RoutingDecision {
    layer: string;
    reason: string;
    modelSelected: string;
    timestamp: number;
    alternatives?: Array<{
        model: string;
        reason: string;
    }>;
}

export interface LLMCallTrace {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    startTime: number;
    endTime: number;
    cached?: boolean;
    error?: string;
}

export interface ToolCallTrace {
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
    error?: string;
    durationMs: number;
    startTime: number;
    endTime: number;
}

export interface ErrorInfo {
    message: string;
    code?: string;
    stack?: string;
    layer?: string;
    model?: string;
}

/**
 * Tracer interface for request tracking
 */
export interface ITracer {
    /**
     * Start a new trace
     */
    startTrace(
        requestType: RequestType,
        conversationId: string,
        payload: Record<string, unknown>,
    ): string;

    /**
     * Record a routing decision
     */
    recordRoutingDecision(
        traceId: string,
        decision: RoutingDecision,
    ): void;

    /**
     * Record an LLM call
     */
    recordLLMCall(traceId: string, call: LLMCallTrace): void;

    /**
     * Record a tool call
     */
    recordToolCall(traceId: string, call: ToolCallTrace): void;

    /**
     * Record an error
     */
    recordError(traceId: string, error: ErrorInfo): void;

    /**
     * End trace and save to database
     */
    endTrace(traceId: string, totalDurationMs: number): Promise<void>;

    /**
     * Get trace by ID
     */
    getTrace(traceId: string): Promise<RequestTrace | null>;
}

/**
 * Multi-tenant types
 */

export interface Organization {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    metadata: Record<string, unknown>;
}

export interface Project {
    id: string;
    organizationId: string;
    name: string;
    config: ProjectConfig;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProjectConfig {
    routing?: {
        defaultLayer?: string;
        maxLayer?: string;
        maxCostPerRequest?: number;
        maxContextTokens?: number;
        enableCrossCheck?: boolean;
        enableAutoEscalate?: boolean;
        filePatterns?: Record<
            string,
            {
                preferredModels?: string[];
                maxLayer?: string;
                taskType?: string;
            }
        >;
        taskOverrides?: Record<
            string,
            {
                maxLayer?: string;
                crossCheck?: boolean;
            }
        >;
    };
    features?: {
        enableCrossCheck?: boolean;
        enableAutoEscalate?: boolean;
        enableCache?: boolean;
    };
    security?: {
        scanPrompts?: boolean;
        scanOutputs?: boolean;
        secretPatterns?: string[];
        blockedKeywords?: string[];
        redactSecrets?: boolean;
    };
}

export interface UserQuota {
    userId: string;
    projectId: string;
    maxTokensDaily: number;
    maxCostDaily: number;
    currentTokensToday: number;
    currentCostToday: number;
    resetAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserRole {
    userId: string;
    projectId: string;
    role: 'viewer' | 'developer' | 'admin' | 'owner';
    createdAt: Date;
}

export interface QuotaCheck {
    allowed: boolean;
    remaining: {
        tokens: number;
        cost: number;
    };
    resetAt: Date;
    reason?: string;
}

/**
 * Analytics types
 */

export interface AnalyticsQuery {
    projectId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    groupBy?: 'day' | 'week' | 'month';
}

export interface AnalyticsResponse {
    timeRange: {
        start: string;
        end: string;
    };
    totalRequests: number;
    totalTokens: {
        input: number;
        output: number;
        total: number;
    };
    totalCost: number;
    breakdown: {
        byLayer: Record<string, LayerMetrics>;
        byModel: Record<string, ModelMetrics>;
        byDay: DailyMetrics[];
    };
}

export interface LayerMetrics {
    requests: number;
    tokens: number;
    cost: number;
    avgDurationMs: number;
    successRate: number;
}

export interface ModelMetrics {
    requests: number;
    tokens: {
        input: number;
        output: number;
        total: number;
    };
    cost: number;
    avgDurationMs: number;
    errors: number;
}

export interface DailyMetrics {
    date: string;
    requests: number;
    tokens: number;
    cost: number;
    avgDurationMs: number;
}

/**
 * Security Policy types
 */

export interface PolicyResult {
    allowed: boolean;
    violations: PolicyViolation[];
    sanitizedContent?: string;
}

export interface PolicyViolation {
    type: 'secret_detected' | 'blocked_keyword' | 'unsafe_command';
    pattern: string;
    position: {
        start: number;
        end: number;
    };
    severity: 'low' | 'medium' | 'high';
    suggestion?: string;
}
