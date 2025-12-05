import { env } from './env.js';
import { logger } from '../logging/logger.js';

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
    priority: number; // Priority within layer (0 = highest priority, lower numbers = higher priority)
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
        priority: 10, // Lower priority due to limited capabilities
    },
    {
        id: 'openrouter-llama-3.3-70b-free',
        provider: 'openrouter',
        apiModelName: 'meta-llama/llama-3.3-70b-instruct:free',
        layer: 'L0',
        relativeCost: 0,
        pricePer1kInputTokens: 0,
        pricePer1kOutputTokens: 0,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 131072,
        enabled: true, // Free model via OpenRouter
        priority: 0, // Highest priority - best free model
    },
    {
        id: 'openrouter-grok-free',
        provider: 'openrouter',
        apiModelName: 'x-ai/grok-4.1-fast:free',
        layer: 'L0',
        relativeCost: 0,
        pricePer1kInputTokens: 0,
        pricePer1kOutputTokens: 0,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 131072,
        enabled: true, // Free model via OpenRouter
        priority: 1, // Second priority - good alternative
    },

    // Layer L1 - Low-cost models
    {
        id: 'openrouter-gemini-flash',
        provider: 'openrouter',
        apiModelName: 'google/gemini-flash-1.5-8b',
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
        enabled: false, // Model not available on OpenRouter
        priority: 0, // Would be highest priority in L1 if available
    },
    {
        id: 'openrouter-gpt-4o-mini',
        provider: 'openrouter',
        apiModelName: 'openai/gpt-4o-mini',
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
        enabled: true, // Via OpenRouter
        priority: 1, // Second priority - reliable and affordable
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
        enabled: false, // Requires OPENAI_API_KEY
    },

    // Layer L2 - Mid-tier models
    {
        id: 'openrouter-claude-haiku',
        provider: 'openrouter',
        apiModelName: 'anthropic/claude-3-haiku',
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
        enabled: true, // Via OpenRouter
    },
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
        enabled: false, // Requires ANTHROPIC_API_KEY
    },
    {
        id: 'openrouter-gpt-4o',
        provider: 'openrouter',
        apiModelName: 'openai/gpt-4o',
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
        enabled: true, // Via OpenRouter
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
        enabled: false, // Requires OPENAI_API_KEY
    },

    // Layer L3 - Premium/SOTA models
    {
        id: 'openrouter-claude-sonnet',
        provider: 'openrouter',
        apiModelName: 'anthropic/claude-3.5-sonnet',
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
        enabled: true, // Via OpenRouter
    },
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
        enabled: false, // Requires ANTHROPIC_API_KEY
    },
    {
        id: 'openrouter-o1-preview',
        provider: 'openrouter',
        apiModelName: 'openai/o1-preview',
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
        enabled: false, // Very expensive
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
 * Check if a layer is enabled via environment variable
 */
export function isLayerEnabled(layer: ModelLayer): boolean {
    switch (layer) {
        case 'L0':
            return env.LAYER_L0_ENABLED;
        case 'L1':
            return env.LAYER_L1_ENABLED;
        case 'L2':
            return env.LAYER_L2_ENABLED;
        case 'L3':
            return env.LAYER_L3_ENABLED;
        default:
            return true;
    }
}

/**
 * Get models by layer (respects layer enable/disable setting)
 * Sorted by priority ASC (0 = highest priority)
 */
export function getModelsByLayer(layer: ModelLayer): ModelConfig[] {
    if (!isLayerEnabled(layer)) {
        logger.warn(`Layer ${layer} is disabled in configuration`);
        return [];
    }
    return MODEL_CATALOG
        .filter((m) => m.layer === layer && m.enabled)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
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
 * Get enabled layers only
 */
export function getEnabledLayers(): ModelLayer[] {
    return LAYERS_IN_ORDER.filter(layer => isLayerEnabled(layer));
}

/**
 * Get layers in order (L0 -> L1 -> L2 -> L3)
 */
export const LAYERS_IN_ORDER: ModelLayer[] = ['L0', 'L1', 'L2', 'L3'];

/**
 * Get next layer for escalation (skips disabled layers)
 */
export function getNextLayer(
    currentLayer: ModelLayer,
): ModelLayer | undefined {
    const enabledLayers = getEnabledLayers();
    const currentIndex = enabledLayers.indexOf(currentLayer);
    if (currentIndex === -1 || currentIndex === enabledLayers.length - 1) {
        return undefined;
    }
    return enabledLayers[currentIndex + 1];
}

/**
 * Fetch top ranked free models from OpenRouter as fallback
 */
export async function fetchOpenRouterFreeModels(): Promise<ModelConfig[]> {
    interface OpenRouterModel {
        id: string;
        pricing?: {
            prompt?: number | string;
        };
        context_length?: number;
    }

    try {
        // Use OpenRouter SDK if available, fallback to fetch API
        let data: { data: OpenRouterModel[] };

        try {
            const { OpenRouter } = await import('@openrouter/sdk');
            const client = new OpenRouter({
                apiKey: env.OPENROUTER_API_KEY || '',
            });
            const response = await client.models.list();
            data = response;
        } catch (sdkError) {
            // Fallback to direct API call if SDK fails
            logger.warn('OpenRouter SDK failed, using fallback API', { error: sdkError });
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${env.OPENROUTER_API_KEY || ''}`,
                },
            });

            if (!response.ok) {
                logger.warn('Failed to fetch OpenRouter models', { status: response.status });
                return [];
            }

            data = await response.json();
        }

        // Filter free models and sort by ranking
        const freeModels = data.data
            .filter((model: OpenRouterModel) =>
                model.pricing?.prompt === 0 ||
                model.pricing?.prompt === '0' ||
                model.id.includes(':free')
            )
            .sort((a: OpenRouterModel, b: OpenRouterModel) => {
                // Sort by context window (higher is better)
                const rankA = a.context_length || 0;
                const rankB = b.context_length || 0;
                return rankB - rankA;
            })
            .slice(0, 5); // Top 5 free models

        logger.info('Fetched top free models from OpenRouter', {
            count: freeModels.length,
            models: freeModels.map((m: OpenRouterModel) => m.id),
        });

        // Convert to ModelConfig format
        return freeModels.map((model: OpenRouterModel) => ({
            id: `openrouter-${model.id.replace(/\//g, '-')}`,
            provider: 'openrouter' as ModelProvider,
            apiModelName: model.id,
            layer: 'L0' as ModelLayer,
            relativeCost: 0,
            pricePer1kInputTokens: 0,
            pricePer1kOutputTokens: 0,
            capabilities: {
                code: model.id.includes('code') || model.id.includes('coder'),
                general: true,
                reasoning: (model.context_length || 0) > 32000,
            },
            contextWindow: model.context_length || 8192,
            enabled: true,
        }));
    } catch (error) {
        logger.error('Error fetching OpenRouter models', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        return [];
    }
}

/**
 * Get models for a specific task type
 */
export function getTaskSpecificModels(taskType: string, layer: ModelLayer): ModelConfig[] {
    const allModels = getModelsByLayer(layer);

    // Check for task-specific model configuration
    let preferredModels: string[] = [];

    switch (taskType) {
        case 'code':
            if (env.CODE_MODELS) {
                preferredModels = env.CODE_MODELS.split(',').map(m => m.trim());
            }
            // Filter models with 'code' or 'coder' in name
            return allModels.filter(m =>
                preferredModels.includes(m.apiModelName) ||
                (preferredModels.length === 0 && (
                    m.apiModelName.toLowerCase().includes('code') ||
                    m.apiModelName.toLowerCase().includes('coder') ||
                    m.capabilities.code
                ))
            );

        case 'chat':
        case 'general':
            if (env.CHAT_MODELS) {
                preferredModels = env.CHAT_MODELS.split(',').map(m => m.trim());
            }
            return preferredModels.length > 0
                ? allModels.filter(m => preferredModels.includes(m.apiModelName))
                : allModels.filter(m => m.capabilities.general);

        case 'analyze':
            if (env.ANALYZE_MODELS) {
                preferredModels = env.ANALYZE_MODELS.split(',').map(m => m.trim());
            }
            return preferredModels.length > 0
                ? allModels.filter(m => preferredModels.includes(m.apiModelName))
                : allModels.filter(m => m.capabilities.reasoning);

        case 'create-project':
            if (env.CREATE_PROJECT_MODELS) {
                preferredModels = env.CREATE_PROJECT_MODELS.split(',').map(m => m.trim());
            }
            return preferredModels.length > 0
                ? allModels.filter(m => preferredModels.includes(m.apiModelName))
                : allModels.filter(m => m.capabilities.code && m.capabilities.reasoning);

        default:
            return allModels;
    }
}

/**
 * Get models for a specific layer with fallback to OpenRouter
 * Sorted by priority ASC (0 = highest priority)
 */
export async function getModelsByLayerWithFallback(layer: ModelLayer): Promise<ModelConfig[]> {
    const models = getModelsByLayer(layer); // Already sorted by priority

    // If L0 has no models, fetch from OpenRouter
    if (layer === 'L0' && models.length === 0) {
        logger.info('No L0 models configured, fetching from OpenRouter...');
        const openrouterModels = await fetchOpenRouterFreeModels();

        if (openrouterModels.length > 0) {
            // Add to catalog temporarily
            MODEL_CATALOG.push(...openrouterModels);
            // Sort by priority before returning
            return openrouterModels.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        }
    }

    return models;
}
