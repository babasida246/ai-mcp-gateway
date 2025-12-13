/**
 * Configuration Helpers
 * Convenient wrappers around ConfigService for common use cases
 */

import { configService } from './index.js';

/**
 * Get configuration value with type safety
 */
export async function getConfig<T = string>(key: string, defaultValue?: T): Promise<T> {
    return await configService.get(key, defaultValue) as T;
}

/**
 * Get number configuration
 */
export async function getConfigNumber(key: string, defaultValue: number): Promise<number> {
    const value = await configService.get(key, defaultValue);
    return typeof value === 'number' ? value : parseInt(String(value), 10) || defaultValue;
}

/**
 * Get boolean configuration
 */
export async function getConfigBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await configService.get(key, defaultValue);
    return typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
}

/**
 * Get JSON configuration
 */
export async function getConfigJSON<T = any>(key: string, defaultValue?: T): Promise<T> {
    return await configService.get(key, defaultValue) as T;
}

/**
 * Get provider API key
 */
export async function getProviderKey(provider: 'openrouter' | 'openai' | 'anthropic' | 'ollama'): Promise<string | null> {
    const cred = await configService.getProvider(provider);
    return cred?.enabled ? (cred as any).api_key || null : null;
}

/**
 * Get provider configuration
 */
export async function getProviderConfig(provider: string): Promise<any> {
    const cred = await configService.getProvider(provider);
    return cred?.configuration || {};
}

/**
 * Check if feature is enabled
 */
export async function isFeatureEnabled(flagKey: string): Promise<boolean> {
    return await configService.getFeatureFlag(flagKey);
}

/**
 * Get models for a specific layer
 */
export async function getLayerModels(layerName: string): Promise<string[]> {
    const layer = await configService.getLayer(layerName);
    return layer?.enabled ? layer.models : [];
}

/**
 * Get models for a specific task
 */
export async function getTaskModels(taskType: string): Promise<string[]> {
    const task = await configService.getTask(taskType);
    return task?.enabled ? task.models : [];
}

/**
 * Get all configuration by category (useful for debugging)
 */
export async function getAllConfig(category?: string): Promise<Record<string, any>> {
    if (category) {
        return await configService.getByCategory(category);
    }

    // Get all categories
    const categories = ['server', 'api', 'redis', 'logging', 'features'];
    const allConfig: Record<string, any> = {};

    for (const cat of categories) {
        const catConfig = await configService.getByCategory(cat);
        Object.assign(allConfig, catConfig);
    }

    return allConfig;
}
