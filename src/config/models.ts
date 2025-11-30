/**
 * Model layer definition for N-layer dynamic routing
 */
export type ModelLayer = 'L0' | 'L1' | 'L2' | 'L3';

/**
 * LLM Provider types
 */
export type ModelProvider =
    | 'openrouter'
    | 'anthropic'
    | 'openai'
    | 'oss-local';

/**
 * Model capabilities
 */
export interface ModelCapabilities {
    code: boolean; // Can write/analyze code
    general: boolean; // General knowledge
    reasoning: boolean; // Complex reasoning
    vision?: boolean; // Image understanding
}

/**
 * Model configuration
 */
export interface ModelConfig {
    id: string; // Model identifier
    provider: ModelProvider; // Provider name
    apiModelName: string; // Model name for API calls
    layer: ModelLayer; // Cost/quality layer
    relativeCost: number; // Relative cost (0=free, 1=low, 10=high, 100=very high)
    pricePer1kInputTokens?: number; // USD per 1k input tokens
    pricePer1kOutputTokens?: number; // USD per 1k output tokens
    capabilities: ModelCapabilities;
    contextWindow: number; // Max context window size
    enabled: boolean; // Is this model enabled?
}

/**
 * Model catalog with layer-based organization
 */
export const MODEL_CATALOG: ModelConfig[] = [
    // Layer L0 - Free/OSS/Cheapest models
    {
        id: 'oss-llama-3-8b',
        provider: 'oss-local',
        apiModelName: 'llama3:8b',
        layer: 'L0',
        relativeCost: 0,
        pricePer1kInputTokens: 0,
        pricePer1kOutputTokens: 0,
        capabilities: {
            code: true,
            general: true,
            reasoning: false,
        },
        contextWindow: 8192,
        enabled: false, // Enable when OSS_MODEL_ENABLED=true
    },
    {
        id: 'openrouter-grok-beta',
        provider: 'openrouter',
        apiModelName: 'x-ai/grok-beta',
        layer: 'L0',
        relativeCost: 1,
        pricePer1kInputTokens: 0.005,
        pricePer1kOutputTokens: 0.015,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 131072,
        enabled: false, // Disabled - model not available
    },
    {
        id: 'openrouter-qwen-coder-32b',
        provider: 'openrouter',
        apiModelName: 'qwen/qwen-2.5-coder-32b-instruct',
        layer: 'L0',
        relativeCost: 1,
        pricePer1kInputTokens: 0.0006,
        pricePer1kOutputTokens: 0.0006,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 32768,
        enabled: false, // Disabled - model not available
    },

    // Layer L1 - Low-cost models
    {
        id: 'openrouter-gemini-flash',
        provider: 'openrouter',
        apiModelName: 'google/gemini-flash-1.5',
        layer: 'L1',
        relativeCost: 2,
        pricePer1kInputTokens: 0.000075,
        pricePer1kOutputTokens: 0.0003,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
            vision: true,
        },
        contextWindow: 1000000,
        enabled: true,
    },
    {
        id: 'openai-gpt-4o-mini',
        provider: 'openai',
        apiModelName: 'gpt-4o-mini',
        layer: 'L1',
        relativeCost: 3,
        pricePer1kInputTokens: 0.00015,
        pricePer1kOutputTokens: 0.0006,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
            vision: true,
        },
        contextWindow: 128000,
        enabled: true,
    },

    // Layer L2 - Mid-tier models
    {
        id: 'anthropic-haiku',
        provider: 'anthropic',
        apiModelName: 'claude-3-haiku-20240307',
        layer: 'L2',
        relativeCost: 5,
        pricePer1kInputTokens: 0.00025,
        pricePer1kOutputTokens: 0.00125,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
            vision: true,
        },
        contextWindow: 200000,
        enabled: true,
    },
    {
        id: 'openai-gpt-4o',
        provider: 'openai',
        apiModelName: 'gpt-4o',
        layer: 'L2',
        relativeCost: 8,
        pricePer1kInputTokens: 0.0025,
        pricePer1kOutputTokens: 0.01,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
            vision: true,
        },
        contextWindow: 128000,
        enabled: true,
    },

    // Layer L3 - Premium/SOTA models
    {
        id: 'anthropic-sonnet',
        provider: 'anthropic',
        apiModelName: 'claude-3-5-sonnet-20241022',
        layer: 'L3',
        relativeCost: 15,
        pricePer1kInputTokens: 0.003,
        pricePer1kOutputTokens: 0.015,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
            vision: true,
        },
        contextWindow: 200000,
        enabled: true,
    },
    {
        id: 'openai-o1',
        provider: 'openai',
        apiModelName: 'o1-preview',
        layer: 'L3',
        relativeCost: 50,
        pricePer1kInputTokens: 0.015,
        pricePer1kOutputTokens: 0.06,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 128000,
        enabled: false, // Very expensive, enable only when needed
    },
];

/**
 * Get models by layer
 */
export function getModelsByLayer(layer: ModelLayer): ModelConfig[] {
    return MODEL_CATALOG.filter((m) => m.layer === layer && m.enabled);
}

/**
 * Get model by ID
 */
export function getModelById(id: string): ModelConfig | undefined {
    return MODEL_CATALOG.find((m) => m.id === id && m.enabled);
}

/**
 * Get all enabled models
 */
export function getEnabledModels(): ModelConfig[] {
    return MODEL_CATALOG.filter((m) => m.enabled);
}

/**
 * Get layers in order (L0 -> L1 -> L2 -> L3)
 */
export const LAYERS_IN_ORDER: ModelLayer[] = ['L0', 'L1', 'L2', 'L3'];

/**
 * Get next layer for escalation
 */
export function getNextLayer(
    currentLayer: ModelLayer,
): ModelLayer | undefined {
    const currentIndex = LAYERS_IN_ORDER.indexOf(currentLayer);
    if (currentIndex === -1 || currentIndex === LAYERS_IN_ORDER.length - 1) {
        return undefined;
    }
    return LAYERS_IN_ORDER[currentIndex + 1];
}
