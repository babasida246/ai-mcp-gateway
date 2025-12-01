import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, AlertCircle, Power, PowerOff, Settings, Eye, EyeOff, Save } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

interface ProviderStatus {
  openai: boolean;
  anthropic: boolean;
  openrouter: boolean;
  'oss-local': boolean;
}

interface HealthData {
  status: string;
  providers: ProviderStatus;
  healthyProviders: string[];
}

interface ProviderConfig {
  name: string;
  key: string;
  description: string;
  apiKey: string;
  enabled: boolean;
  baseUrl?: string;
}

export default function Providers() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([
    { name: 'OpenAI', key: 'openai', description: 'GPT models (GPT-4, GPT-4-turbo, GPT-3.5)', apiKey: 'sk-...', enabled: true },
    { name: 'Anthropic', key: 'anthropic', description: 'Claude models (Claude 3.5 Sonnet, Haiku, Opus)', apiKey: 'sk-ant-...', enabled: true },
    { name: 'OpenRouter', key: 'openrouter', description: 'Multi-provider API gateway', apiKey: 'sk-or-...', enabled: true, baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'OSS Local', key: 'oss-local', description: 'Self-hosted open-source models', apiKey: '', enabled: false, baseUrl: 'http://localhost:8000' },
  ]);

  useEffect(() => {
    loadProviders();
    const interval = setInterval(loadProviders, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadProviders() {
    try {
      const response = await axios.get(`${API_BASE}/health`);
      setHealth(response.data);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load providers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load providers');
      setLoading(false);
    }
  }

  function toggleProvider(key: string) {
    setProviderConfigs(configs =>
      configs.map(p => p.key === key ? { ...p, enabled: !p.enabled } : p)
    );
    setSaveStatus(`Provider ${key} ${providerConfigs.find(p => p.key === key)?.enabled ? 'disabled' : 'enabled'}`);
    setTimeout(() => setSaveStatus(null), 3000);
  }

  function updateApiKey(key: string, apiKey: string) {
    setProviderConfigs(configs =>
      configs.map(p => p.key === key ? { ...p, apiKey } : p)
    );
  }

  function updateBaseUrl(key: string, baseUrl: string) {
    setProviderConfigs(configs =>
      configs.map(p => p.key === key ? { ...p, baseUrl } : p)
    );
  }

  function saveProviderConfig(key: string) {
    // In real implementation: POST to API endpoint
    setSaveStatus(`Configuration saved for ${key}`);
    setEditingProvider(null);
    setTimeout(() => setSaveStatus(null), 3000);
  }

  function toggleApiKeyVisibility(key: string) {
    setShowApiKeys(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Providers</h1>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {saveStatus}
            </div>
          )}
          <button onClick={loadProviders} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold">Error</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
            <button onClick={loadProviders} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Overall Status */}
      {health && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">System Status</h2>
              <p className="text-slate-400">
                {health.healthyProviders.length} of {providerConfigs.filter(p => p.enabled).length} enabled providers healthy
              </p>
            </div>
            <div className={`badge ${health.status === 'ok' ? 'badge-success' : 'badge-error'} text-lg px-4 py-2`}>
              {health.status === 'ok' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Operational
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 mr-2" />
                  Degraded
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Provider Cards */}
      <div className="grid grid-cols-1 gap-6">
        {providerConfigs.map((provider) => {
          const isHealthy = health?.providers[provider.key as keyof ProviderStatus];
          const isEditing = editingProvider === provider.key;
          
          return (
            <div key={provider.key} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">{provider.name}</h3>
                    <div className={`badge ${isHealthy ? 'badge-success' : 'badge-error'}`}>
                      {isHealthy ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Healthy
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" />
                          Unhealthy
                        </>
                      )}
                    </div>
                    <div className={`badge ${provider.enabled ? 'badge-success' : 'badge-error'}`}>
                      {provider.enabled ? (
                        <>
                          <Power className="w-3 h-3 mr-1" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-3 h-3 mr-1" />
                          Disabled
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">{provider.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleProvider(provider.key)}
                    className={`btn-secondary ${!provider.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {provider.enabled ? (
                      <>
                        <PowerOff className="w-4 h-4 mr-2" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="w-4 h-4 mr-2" />
                        Enable
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingProvider(isEditing ? null : provider.key)}
                    className="btn-secondary"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      API Key
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type={showApiKeys[provider.key] ? 'text' : 'password'}
                        value={provider.apiKey}
                        onChange={(e) => updateApiKey(provider.key, e.target.value)}
                        className="input flex-1 font-mono text-sm"
                        placeholder="Enter API key..."
                      />
                      <button
                        onClick={() => toggleApiKeyVisibility(provider.key)}
                        className="btn-secondary px-3"
                      >
                        {showApiKeys[provider.key] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {provider.baseUrl !== undefined && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={provider.baseUrl}
                        onChange={(e) => updateBaseUrl(provider.key, e.target.value)}
                        className="input w-full font-mono text-sm"
                        placeholder="https://api.example.com"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => saveProviderConfig(provider.key)}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Configuration
                    </button>
                    <button
                      onClick={() => setEditingProvider(null)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!isEditing && (
                <div className="space-y-3 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Status</span>
                    <span className={isHealthy ? 'text-green-400' : 'text-red-400'}>
                      {isHealthy ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">API Key</span>
                    <span className="text-white font-mono text-xs">
                      {provider.apiKey ? `${provider.apiKey.substring(0, 10)}...` : 'Not configured'}
                    </span>
                  </div>
                  {provider.baseUrl && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Base URL</span>
                      <span className="text-white font-mono text-xs">{provider.baseUrl}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Healthy Providers List */}
      {health && health.healthyProviders.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-bold text-white mb-4">Active Providers</h3>
          <div className="flex flex-wrap gap-2">
            {health.healthyProviders.map((provider) => (
              <span key={provider} className="badge badge-success">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {provider}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
