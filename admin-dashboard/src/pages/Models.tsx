import { useEffect, useState } from 'react';
import { Power, PowerOff, RefreshCw, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

interface Layer {
  enabled: boolean;
  models: string[];
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
  const [newModel, setNewModel] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    loadLayers();
  }, []);

  async function loadLayers() {
    try {
      const response = await axios.get(`${API_BASE}/health`);
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

  function toggleLayer(layerName: string) {
    setLayers(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        enabled: !prev[layerName].enabled
      }
    }));
    setSaveStatus(`Layer ${layerName} ${layers[layerName].enabled ? 'disabled' : 'enabled'}`);
    setTimeout(() => setSaveStatus(null), 3000);
  }

  function addModel(layerName: string) {
    if (!newModel.trim()) return;
    
    setLayers(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        models: [...prev[layerName].models, newModel.trim()]
      }
    }));
    setNewModel('');
    setSaveStatus(`Model ${newModel} added to ${layerName}`);
    setTimeout(() => setSaveStatus(null), 3000);
  }

  function removeModel(layerName: string, model: string) {
    if (confirm(`Remove model "${model}" from ${layerName}?`)) {
      setLayers(prev => ({
        ...prev,
        [layerName]: {
          ...prev[layerName],
          models: prev[layerName].models.filter(m => m !== model)
        }
      }));
      setSaveStatus(`Model ${model} removed from ${layerName}`);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }

  function cancelEditing() {
    setEditingLayer(null);
    setNewModel('');
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
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      placeholder="e.g., openrouter-gpt-4o"
                      className="input flex-1"
                      onKeyPress={(e) => e.key === 'Enter' && addModel(layerName)}
                    />
                    <button
                      onClick={() => addModel(layerName)}
                      disabled={!newModel.trim()}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Models */}
              {layer.models.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                    Models ({layer.models.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {layer.models.map((model) => (
                      <div
                        key={model}
                        className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors group"
                      >
                        <span className="text-white font-medium text-sm flex-1 truncate">{model}</span>
                        {isEditing && (
                          <button
                            onClick={() => removeModel(layerName, model)}
                            className="ml-2 p-1 text-red-400 hover:bg-red-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove model"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
