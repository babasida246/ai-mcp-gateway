import { useEffect, useState } from 'react';
import { Power, PowerOff, RefreshCw, Plus, Trash2, Edit2, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import axios from 'axios';
import ModelFormModal, { type ModelFormData } from '../components/ModelFormModal';

const API_BASE = 'http://localhost:3000';

interface Model {
  id: string;
  provider: string;
  apiModelName: string;
  layer?: string;
  relativeCost?: number;
  pricePer1kInputTokens?: number;
  pricePer1kOutputTokens?: number;
  contextWindow?: number;
  enabled: boolean;
  priority?: number; // Model priority within layer
  capabilities?: {
    code?: boolean;
    general?: boolean;
    reasoning?: boolean;
    vision?: boolean;
  };
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
  const [editingModel, setEditingModel] = useState<{ id: string; priority?: number; data: ModelFormData } | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  
  // Modal state for the reusable ModelFormModal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [addingToLayer, setAddingToLayer] = useState<string | null>(null);

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
      const newEnabled = !layers[layerName].enabled;
      await axios.put(`${API_BASE}/v1/layers/${layerName}/toggle`, {
        enabled: newEnabled
      });
      
      // Update the state immediately for real-time UI feedback
      setLayers(prev => ({
        ...prev,
        [layerName]: {
          ...prev[layerName],
          enabled: newEnabled,
          // If disabling layer, disable all models in that layer
          models: newEnabled ? prev[layerName].models : prev[layerName].models.map(m => ({...m, enabled: false}))
        }
      }));
      
      setSaveStatus(`Layer ${layerName} ${newEnabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSaveStatus(null), 3000);
      
      // Reload data from server to ensure consistency
      setTimeout(() => loadLayers(), 500);
    } catch (err) {
      console.error('Failed to toggle layer:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle layer');
      // Reload to revert any optimistic updates on error
      loadLayers();
    }
  }

  // Open modal to add a new model to a specific layer
  function openAddModal(layerName: string) {
    setAddingToLayer(layerName);
    setEditingModel(null);
    setModalMode('create');
    setIsModalOpen(true);
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
      const newEnabled = !currentEnabled;
      
      // Optimistically update the state for immediate UI feedback
      setLayers(prev => {
        const newLayers = { ...prev };
        for (const layerName in newLayers) {
          const layerData = newLayers[layerName];
          layerData.models = layerData.models.map(model => 
            model.id === modelId ? { ...model, enabled: newEnabled } : model
          );
        }
        return newLayers;
      });
      
      await axios.put(`${API_BASE}/v1/models/${modelId}`, {
        enabled: newEnabled
      });
      
      setSaveStatus(`Model ${newEnabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSaveStatus(null), 3000);
      
      // Reload data from server to ensure consistency
      setTimeout(() => loadLayers(), 500);
    } catch (err) {
      console.error('Failed to toggle model:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle model');
      // Reload to revert any optimistic updates on error
      loadLayers();
    }
  }

  function openEditModal(model: Model) {
    setAddingToLayer(null);
    setEditingModel({
      id: model.id,
      priority: model.priority,
      data: {
        provider: model.provider,
        apiModelName: model.apiModelName,
        layer: model.layer || 'L0',
        relativeCost: model.relativeCost || 0,
        pricePer1kInputTokens: model.pricePer1kInputTokens || 0,
        pricePer1kOutputTokens: model.pricePer1kOutputTokens || 0,
        contextWindow: model.contextWindow || 8192,
      }
    });
    setModalMode('edit');
    setIsModalOpen(true);
  }

  async function handleModalSave(data: ModelFormData, modelId?: string) {
    if (modalMode === 'edit' && modelId) {
      // Update existing model
      await axios.put(`${API_BASE}/v1/models/${modelId}`, data);
      setSaveStatus(`Model ${modelId} updated`);
    } else {
      // Create new model - use addingToLayer if set, otherwise data.layer
      const targetLayer = addingToLayer || data.layer;
      const newModelId = `${data.provider}-${data.apiModelName.replace(/\//g, '-')}`;
      await axios.post(`${API_BASE}/v1/models`, {
        id: newModelId,
        ...data,
        layer: targetLayer,
        enabled: true,
      });
      setSaveStatus(`Model added to ${targetLayer}`);
    }
    setTimeout(() => setSaveStatus(null), 3000);
    loadLayers();
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingModel(null);
    setAddingToLayer(null);
  }

  // Model ordering functions - reorder all models in layer at once
  async function moveModel(layerName: string, modelId: string, direction: 'up' | 'down') {
    const layer = layers[layerName];
    if (!layer) return;

    // Sort models by current priority first
    const models = [...layer.models].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const currentIndex = models.findIndex(m => m.id === modelId);
    
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= models.length) return;

    // Swap models in the array
    [models[currentIndex], models[newIndex]] = [models[newIndex], models[currentIndex]];
    
    // Update priorities based on new order
    models.forEach((model, index) => {
      model.priority = index;
    });

    // Update local state immediately for responsive UI
    setLayers(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        models: models
      }
    }));

    try {
      // Use the reorder API to update all priorities at once
      const modelIds = models.map(m => m.id);
      await axios.put(`${API_BASE}/v1/layers/${layerName}/reorder`, { modelIds });
      setSaveStatus(`Model order updated in ${layerName}`);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Failed to update model order:', err);
      setError('Failed to update model order');
      loadLayers(); // Reload to restore original order
    }
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

              {/* Add Model Button - opens full modal */}
              {isEditing && (
                <div className="mb-4">
                  <button
                    onClick={() => openAddModal(layerName)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Model to {layerName}
                  </button>
                </div>
              )}

              {/* Models */}
              {layer.models.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                    Models ({layer.models.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {layer.models
                      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                      .map((model, index) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors group"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isEditing && layer.models.length > 1 && (
                              <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-indigo-400 bg-indigo-500/20 rounded-full">
                                {index + 1}
                              </span>
                            )}
                            <span className="text-white font-semibold">{model.apiModelName}</span>
                            <span className={`badge ${model.enabled ? 'badge-success' : 'badge-error'} text-xs`}>
                              {model.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="badge badge-info">{model.provider}</span>
                            <span>ID: {model.id}</span>
                            {isEditing && layer.models.length > 1 && (
                              <span className="text-indigo-400">Priority: {model.priority || 0}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Model Ordering Controls */}
                          {isEditing && layer.models.length > 1 && (
                            <>
                              <button
                                onClick={() => moveModel(layerName, model.id, 'up')}
                                disabled={layer.models[0].id === model.id}
                                className="btn-secondary text-sm bg-indigo-500/20 text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Move model up in priority"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => moveModel(layerName, model.id, 'down')}
                                disabled={layer.models[layer.models.length - 1].id === model.id}
                                className="btn-secondary text-sm bg-indigo-500/20 text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Move model down in priority"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          
                          <button
                            onClick={() => openEditModal(model)}
                            className="btn-secondary text-sm bg-blue-500/20 text-blue-400"
                            title="Edit model details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
                    <div className="mt-3">
                      <button
                        onClick={() => openAddModal(layerName)}
                        className="btn-primary flex items-center gap-2 mx-auto"
                      >
                        <Plus className="w-4 h-4" />
                        Add First Model to {layerName}
                      </button>
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

      {/* Model Modal - Using reusable ModelFormModal component */}
      <ModelFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        initialData={modalMode === 'edit' ? editingModel?.data : (addingToLayer ? { layer: addingToLayer } : undefined)}
        modelId={editingModel?.id}
        currentPriority={editingModel?.priority}
        onSave={handleModalSave}
        onClose={closeModal}
      />
    </div>
  );
}