/**
 * Provider Configuration Wrapper
 * 
 * Provides backward-compatible access to provider credentials
 * Reads from ConfigService (DB) instead of process.env
 */

import { configService } from '../config/index.js';

class ProviderConfig {
    private initialized = false;

    async ensureInitialized() {
        if (!this.initialized) {
            await configService.initialize();
            this.initialized = true;
        }
    }

    /**
     * Get OpenRouter API key
     */
    async getOpenRouterKey(): Promise<string | null> {
        await this.ensureInitialized();
        const provider = await configService.getProvider('openrouter');
        return provider?.enabled ? (provider as any).api_key : null;
    }

    /**
     * Get OpenAI API key
     */
    async getOpenAIKey(): Promise<string | null> {
        await this.ensureInitialized();
        const provider = await configService.getProvider('openai');
        return provider?.enabled ? (provider as any).api_key : null;
    }

    /**
     * Get Anthropic API key
     */
    async getAnthropicKey(): Promise<string | null> {
        await this.ensureInitialized();
        const provider = await configService.getProvider('anthropic');
        return provider?.enabled ? (provider as any).api_key : null;
    }

    /**
     * Get Ollama configuration
     */
    async getOllamaConfig(): Promise<{ endpoint: string; enabled: boolean } | null> {
        await this.ensureInitialized();
        const provider = await configService.getProvider('ollama');
        return provider ? {
            endpoint: provider.api_endpoint || 'http://localhost:11434',
            enabled: provider.enabled
        } : null;
    }

    /**
     * Get all enabled providers with their keys
     */
    async getAllProviders(): Promise<Map<string, string>> {
        await this.ensureInitialized();
        const providers = await configService.getEnabledProviders();
        const map = new Map<string, string>();

        for (const provider of providers) {
            const key = (provider as any).api_key;
            if (key) {
                map.set(provider.provider, key);
            }
        }

        return map;
    }

    /**
     * Check if a provider is configured and enabled
     */
    async isProviderEnabled(providerName: string): Promise<boolean> {
        await this.ensureInitialized();
        const provider = await configService.getProvider(providerName);
        return provider?.enabled && !!(provider as any).api_key;
    }
}

export const providerConfig = new ProviderConfig();
