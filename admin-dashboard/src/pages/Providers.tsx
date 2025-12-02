import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, AlertCircle, Power, PowerOff, Settings, Eye, EyeOff, Save, Plus, Trash2, X } from 'lucide-react';
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
  id: string;
  provider_name: string;
  display_name: string;
  enabled: boolean;
  api_key: string | null;
  api_endpoint: string | null;
  config: Record<string, any> | null;
  health_status: boolean | null;
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
  // Legacy fields for backward compatibility with custom providers
  description?: string;
  isDefault?: boolean;
  apiFunction?: string;
}

export default function Providers() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState<Partial<ProviderConfig>>({
    id: '',
    provider_name: '',
    display_name: '',
    description: '',
    api_key: '',
    api_endpoint: '',
    apiFunction: '',
    enabled: true,
  });

  useEffect(() => {
    loadProviders();
    const interval = setInterval(loadHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadProviders() {
    try {
      const response = await axios.get(`${API_BASE}/v1/providers`);
      if (response.data?.success && Array.isArray(response.data.providers)) {
        setProviderConfigs(response.data.providers);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load providers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load providers');
      setLoading(false);
    }
  }

  async function loadHealth() {
    try {
      const response = await axios.get(`${API_BASE}/health`);
      setHealth(response.data);
    } catch (err) {
      console.error('Failed to load health:', err);
    }
  }

  async function toggleProvider(id: string) {
    const provider = providerConfigs.find(p => p.id === id);
    if (!provider) return;

    try {
      const action = provider.enabled ? 'disable' : 'enable';
      await axios.post(`${API_BASE}/v1/providers/${provider.provider_name}/${action}`);
      
      setProviderConfigs(configs =>
        configs.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p)
      );
      setSaveStatus(`Provider ${provider.display_name} ${provider.enabled ? 'disabled' : 'enabled'}`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to toggle provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle provider');
    }
  }

  async function saveProviderConfig(id: string) {
    const provider = providerConfigs.find(p => p.id === id);
    if (!provider) return;

    try {
      // Update API key if changed
      if (provider.api_key) {
        await axios.put(`${API_BASE}/v1/providers/${provider.provider_name}/api-key`, {
          apiKey: provider.api_key
        });
      }
      
      // Update config if changed
      await axios.patch(`${API_BASE}/v1/providers/${provider.provider_name}`, {
        api_endpoint: provider.api_endpoint,
        config: provider.config,
      });
      
      setSaveStatus(`Configuration saved for ${provider.display_name}`);
      setEditingProvider(null);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save provider config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save provider configuration');
    }
  }

  async function addCustomProvider() {
    if (!newProvider.id || !newProvider.provider_name || !newProvider.api_endpoint) {
      setError('Please fill in all required fields (ID, Provider Name, Base URL)');
      return;
    }

    try {
      await axios.post(`${API_BASE}/v1/providers`, newProvider);
      
      setSaveStatus(`Custom provider ${newProvider.display_name || newProvider.provider_name} added successfully`);
      setShowAddForm(false);
      setNewProvider({
        id: '',
        provider_name: '',
        display_name: '',
        description: '',
        api_key: '',
        api_endpoint: '',
        apiFunction: '',
        enabled: true,
      });
      setTimeout(() => setSaveStatus(null), 3000);
      loadProviders(); // Reload providers
    } catch (err) {
      console.error('Failed to add provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to add custom provider');
    }
  }

  async function deleteProvider(id: string) {
    const provider = providerConfigs.find(p => p.id === id);
    if (!provider) return;
    
    if (!confirm(`Are you sure you want to delete provider "${provider.display_name}"?`)) return;

    try {
      await axios.delete(`${API_BASE}/v1/providers/${provider.provider_name}`);
      
      setSaveStatus(`Provider ${provider.display_name} deleted successfully`);
      setTimeout(() => setSaveStatus(null), 3000);
      loadProviders(); // Reload providers
    } catch (err) {
      console.error('Failed to delete provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  }

  function updateProviderField(id: string, field: keyof ProviderConfig, value: string | boolean) {
    setProviderConfigs(configs =>
      configs.map(p => p.id === id ? { ...p, [field]: value } : p)
    );
  }

  function toggleApiKeyVisibility(id: string) {
    setShowApiKeys(prev => ({ ...prev, [id]: !prev[id] }));
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
          <button onClick={() => setShowAddForm(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Custom Provider
          </button>
          <button onClick={() => { loadProviders(); loadHealth(); }} className="btn-secondary flex items-center gap-2">
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
            <button onClick={() => setError(null)} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Add Custom Provider Form */}
      {showAddForm && (
        <div className="card p-6 border-2 border-blue-500/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Add Custom Provider</h2>
            <button onClick={() => setShowAddForm(false)} className="btn-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Provider Name (ID) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newProvider.provider_name || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, provider_name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., custom-llm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Display Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newProvider.display_name || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, display_name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Custom LLM Provider"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Description
              </label>
              <input
                type="text"
                value={newProvider.description || ''}
                onChange={(e) => setNewProvider({ ...newProvider, description: e.target.value })}
                className="input w-full"
                placeholder="Provider description"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Base URL <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newProvider.api_endpoint || ''}
                onChange={(e) => setNewProvider({ ...newProvider, api_endpoint: e.target.value })}
                className="input w-full font-mono text-sm"
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                API Key (optional)
              </label>
              <input
                type="password"
                value={newProvider.api_key || ''}
                onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                className="input w-full font-mono text-sm"
                placeholder="API key if required"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                API Function (JavaScript code to call the provider)
              </label>
              <textarea
                value={newProvider.apiFunction || ''}
                onChange={(e) => setNewProvider({ ...newProvider, apiFunction: e.target.value })}
                className="input w-full font-mono text-xs h-32 resize-y"
                placeholder={`async function callProvider(messages, options) {\n  // Your custom API call logic here\n  const response = await fetch(baseUrl, {\n    method: 'POST',\n    headers: { 'Authorization': \`Bearer \${apiKey}\` },\n    body: JSON.stringify({ messages })\n  });\n  return response.json();\n}`}
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={addCustomProvider} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Provider
              </button>
              <button onClick={() => setShowAddForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
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
          const isHealthy = health?.healthyProviders?.includes(provider.provider_name) || provider.health_status;
          const isEditing = editingProvider === provider.id;
          
          return (
            <div key={provider.id} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">{provider.display_name}</h3>
                    {isHealthy !== undefined && (
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
                    )}
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
                    {provider.isDefault === false && (
                      <span className="badge badge-info text-xs">Custom</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">{provider.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleProvider(provider.id)}
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
                    onClick={() => setEditingProvider(isEditing ? null : provider.id)}
                    className="btn-secondary"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {!provider.isDefault && (
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      className="btn-secondary bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
                        type={showApiKeys[provider.id] ? 'text' : 'password'}
                        value={provider.api_key || ''}
                        onChange={(e) => updateProviderField(provider.id, 'api_key', e.target.value)}
                        className="input flex-1 font-mono text-sm"
                        placeholder="Enter API key..."
                      />
                      <button
                        onClick={() => toggleApiKeyVisibility(provider.id)}
                        className="btn-secondary px-3"
                      >
                        {showApiKeys[provider.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {provider.api_endpoint && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={provider.api_endpoint}
                        onChange={(e) => updateProviderField(provider.id, 'api_endpoint', e.target.value)}
                        className="input w-full font-mono text-sm"
                        placeholder="https://api.example.com"
                      />
                    </div>
                  )}

                  {provider.isDefault === false && provider.apiFunction !== undefined && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        API Function
                      </label>
                      <textarea
                        value={provider.apiFunction}
                        onChange={(e) => updateProviderField(provider.id, 'apiFunction', e.target.value)}
                        className="input w-full font-mono text-xs h-32 resize-y"
                        placeholder="async function callProvider(messages, options) { ... }"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => saveProviderConfig(provider.id)}
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
                    <span className={provider.health_status ? 'text-green-400' : 'text-red-400'}>
                      {provider.health_status ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">API Key</span>
                    <span className="text-white font-mono text-xs">
                      {provider.api_key ? `${provider.api_key.substring(0, 10)}...` : 'Not configured'}
                    </span>
                  </div>
                  {provider.api_endpoint && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Base URL</span>
                      <span className="text-white font-mono text-xs">{provider.api_endpoint}</span>
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
