import { useEffect, useState } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

interface Configuration {
  logLevel: string;
  defaultLayer: string;
  enableCrossCheck: boolean;
  enableAutoEscalate: boolean;
  maxEscalationLayer: string;
  enableCostTracking: boolean;
  costAlertThreshold: number;
  layerControl: {
    L0: boolean;
    L1: boolean;
    L2: boolean;
    L3: boolean;
  };
  taskSpecificModels: {
    chat: string;
    code: string;
    analyze: string;
    createProject: string;
  };
}

export default function Settings() {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await axios.get(`${API_BASE}/health`);
      if (response.data.configuration) {
        setConfig(response.data.configuration);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      setLoading(false);
    }
  }

  function handleSave() {
    // In a real implementation, this would POST to an API endpoint
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-400 text-xl">Failed to load configuration</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <div className="flex items-center gap-3">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span>Settings saved</span>
            </div>
          )}
          <button onClick={loadSettings} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save Changes
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
          </div>
        </div>
      )}

      {/* General Settings */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">General Settings</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Log Level
              </label>
              <select
                value={config.logLevel}
                onChange={(e) => setConfig({ ...config, logLevel: e.target.value })}
                className="input w-full"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Default Layer
              </label>
              <select
                value={config.defaultLayer}
                onChange={(e) => setConfig({ ...config, defaultLayer: e.target.value })}
                className="input w-full"
              >
                <option value="L0">L0 - Free Tier</option>
                <option value="L1">L1 - Low Cost</option>
                <option value="L2">L2 - Balanced</option>
                <option value="L3">L3 - Premium</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Routing Features */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Routing Features</h2>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
            <div>
              <div className="font-semibold text-white">Cross-Check</div>
              <div className="text-sm text-slate-400 mt-1">
                Validate responses across multiple models
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.enableCrossCheck}
              onChange={(e) => setConfig({ ...config, enableCrossCheck: e.target.checked })}
              className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
            <div>
              <div className="font-semibold text-white">Auto Escalate</div>
              <div className="text-sm text-slate-400 mt-1">
                Automatically escalate to higher layers on failure
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.enableAutoEscalate}
              onChange={(e) => setConfig({ ...config, enableAutoEscalate: e.target.checked })}
              className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {config.enableAutoEscalate && (
            <div className="ml-4 pl-4 border-l-2 border-slate-600">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Max Escalation Layer
              </label>
              <select
                value={config.maxEscalationLayer}
                onChange={(e) => setConfig({ ...config, maxEscalationLayer: e.target.value })}
                className="input w-full md:w-1/2"
              >
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Cost Tracking */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Cost Management</h2>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
            <div>
              <div className="font-semibold text-white">Enable Cost Tracking</div>
              <div className="text-sm text-slate-400 mt-1">
                Track and monitor API costs
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.enableCostTracking}
              onChange={(e) => setConfig({ ...config, enableCostTracking: e.target.checked })}
              className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {config.enableCostTracking && (
            <div className="ml-4 pl-4 border-l-2 border-slate-600">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Cost Alert Threshold ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={config.costAlertThreshold}
                onChange={(e) => setConfig({ ...config, costAlertThreshold: parseFloat(e.target.value) })}
                className="input w-full md:w-1/3"
              />
              <p className="text-xs text-slate-400 mt-1">
                Alert when costs exceed this threshold
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Layer Control */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Layer Control</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(config.layerControl).map(([layer, enabled]) => (
            <label
              key={layer}
              className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors"
            >
              <div className="font-semibold text-white">{layer}</div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setConfig({
                  ...config,
                  layerControl: { ...config.layerControl, [layer]: e.target.checked }
                })}
                className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Task-Specific Models */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-white mb-6">Task-Specific Models</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(config.taskSpecificModels).map(([task, model]) => (
            <div key={task}>
              <label className="block text-sm font-semibold text-slate-300 mb-2 capitalize">
                {task}
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setConfig({
                  ...config,
                  taskSpecificModels: { ...config.taskSpecificModels, [task]: e.target.value }
                })}
                className="input w-full"
                placeholder="default"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
