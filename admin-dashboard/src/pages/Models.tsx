import { useEffect, useState } from 'react';
import { Power, PowerOff, RefreshCw, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

interface Model {
  id: string;
  provider: string;
  apiModelName: string;
  enabled: boolean;
}

interface Layer {
  enabled: boolean;
  models: Model[];
  providers: string[];
}

interface LayersData {
  [key: string]: Layer;
}

export default function Models() {
  const [layers, setLayers] = useState<LayersData>({});
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ provider: '', apiModelName: '' });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    loadLayers();
  }, []);

  async function loadLayers() {
    try {
      const response = await axios.get(`${API_BASE}/v1/models/layers`);
      if (response.data.layers) {
        setLayers(response.data.layers);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load layers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load layers');
      setLoading(false);
    }
  }

  async function toggleLayer(layerName: string) {
    try {
      await axios.put(`${API_BASE}/v1/layers/${layerName}/toggle`, {
        enabled: !layers[layerName].enabled
      });
      setLayers(prev => ({
        ...prev,
        [layerName]: {
          ...prev[layerName],
          enabled: !prev[layerName].enabled
        }
      }));
      setSaveStatus(`Layer ${layerName} ${layers[layerName].enabled ? 'disabled' : 'enabled'}`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to toggle layer:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle layer');
    }
  }

  async function addModel(layerName: string) {
    if (!newModel.provider.trim() || !newModel.apiModelName.trim()) return;
    
    try {
      const modelId = `${newModel.provider}-${newModel.apiModelName.replace(/\//g, '-')}`;
      await axios.post(`${API_BASE}/v1/models`, {
        id: modelId,
        provider: newModel.provider,
        apiModelName: newModel.apiModelName,
        layer: layerName,
        enabled: true
      });
      
      setNewModel({ provider: '', apiModelName: '' });
      setSaveStatus(`Model added to ${layerName}`);
      setTimeout(() => setSaveStatus(null), 3000);
      loadLayers(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to add model:', err);
      setError(err instanceof Error ? err.message : 'Failed to add model');
    }
  }

  async function removeModel(layerName: string, modelId: string, modelName: string) {
    if (confirm(`Remove model "${modelName}" from ${layerName}?`)) {
      try {
        await axios.delete(`${API_BASE}/v1/models/${modelId}`);
        setSaveStatus(`Model ${modelName} removed from ${layerName}`);
        setTimeout(() => setSaveStatus(null), 3000);
        loadLayers(); // Reload to get updated data
      } catch (err) {
        console.error('Failed to remove model:', err);
        setError(err instanceof Error ? err.message : 'Failed to remove model');
      }
    }
  }

  async function toggleModel(modelId: string, currentEnabled: boolean) {
    try {
      await axios.put(`${API_BASE}/v1/models/${modelId}`, {
        enabled: !currentEnabled
      });
      loadLayers(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to toggle model:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle model');
    }
  }

  function cancelEditing() {
    setEditingLayer(null);
    setNewModel({ provider: '', apiModelName: '' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Model Layers</h1>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <Save className="w-4 h-4" />
              {saveStatus}
            </div>
          )}
          <button onClick={loadLayers} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-red-400 text-xl">⚠️</div>
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold">Error</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
            <button onClick={loadLayers} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors">
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {Object.entries(layers).map(([layerName, layer]) => {
          const isEditing = editingLayer === layerName;
          
          return (
            <div key={layerName} className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">{layerName}</h2>
                  <span className={`badge ${layer.enabled ? 'badge-success' : 'badge-error'}`}>
                    {layer.enabled ? (
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
                  </span>
                  <span className="text-sm text-slate-400">
                    {layer.models.length} model(s)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleLayer(layerName)}
                    className={`btn-secondary ${!layer.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {layer.enabled ? (
                      <>
                        <PowerOff className="w-4 h-4 mr-2" />
                        Disable Layer
                      </>
                    ) : (
                      <>
                        <Power className="w-4 h-4 mr-2" />
                        Enable Layer
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingLayer(isEditing ? null : layerName)}
                    className="btn-secondary"
                  >
                    {isEditing ? (
                      <>
                        <X className="w-4 h-4 mr-2" />
                        Close
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit Models
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Providers */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Providers
                </h3>
                <div className="flex flex-wrap gap-2">
                  {layer.providers.map((provider) => (
                    <span key={provider} className="badge badge-info">
                      {provider}
                    </span>
                  ))}
                </div>
              </div>

              {/* Add Model Form */}
              {isEditing && (
                <div className="mb-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                  <h3 className="text-sm font-semibold text-white mb-3">Add New Model</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Provider</label>
                        <input
                          type="text"
                          value={newModel.provider}
                          onChange={(e) => setNewModel({ ...newModel, provider: e.target.value })}
                          placeholder="e.g., openrouter"
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Model Name</label>
                        <input
                          type="text"
                          value={newModel.apiModelName}
                          onChange={(e) => setNewModel({ ...newModel, apiModelName: e.target.value })}
                          placeholder="e.g., openai/gpt-4o"
                          className="input w-full"
                          onKeyPress={(e) => e.key === 'Enter' && addModel(layerName)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addModel(layerName)}
                        disabled={!newModel.provider.trim() || !newModel.apiModelName.trim()}
                        className="btn-primary flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Model
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Models */}
              {layer.models.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                    Models ({layer.models.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {layer.models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors group"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-semibold">{model.apiModelName}</span>
                            <span className={`badge ${model.enabled ? 'badge-success' : 'badge-error'} text-xs`}>
                              {model.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="badge badge-info">{model.provider}</span>
                            <span>ID: {model.id}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleModel(model.id, model.enabled)}
                            className={`btn-secondary text-sm ${!model.enabled ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}
                            title={model.enabled ? 'Disable model' : 'Enable model'}
                          >
                            {model.enabled ? (
                              <PowerOff className="w-4 h-4" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                          {isEditing && (
                            <button
                              onClick={() => removeModel(layerName, model.id, model.apiModelName)}
                              className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-opacity"
                              title="Remove model"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No models configured for this layer
                  {isEditing && (
                    <div className="mt-2 text-sm">
                      Use the form above to add models
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(layers).length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-slate-400 text-lg">No layers configured</div>
        </div>
      )}
    </div>
  );
}
