import { useState, useEffect } from 'react';
import { X, Save, Plus } from 'lucide-react';

export interface ModelFormData {
  provider: string;
  apiModelName: string;
  layer: string;
  relativeCost: number;
  pricePer1kInputTokens: number;
  pricePer1kOutputTokens: number;
  contextWindow: number;
}

export interface OpenRouterModelData {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

interface ModelFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<ModelFormData>;
  modelId?: string;
  /** For create mode from OpenRouter - display the source model name */
  sourceModelName?: string;
  /** Current priority of the model (read-only, for display in edit mode) */
  currentPriority?: number;
  onSave: (data: ModelFormData, modelId?: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Maps OpenRouter model data to our internal ModelFormData format
 */
export function mapOpenRouterToModelForm(orModel: OpenRouterModelData): Partial<ModelFormData> {
  // Parse pricing - OpenRouter returns price per token as string
  // Convert to price per 1k tokens
  let pricePer1kInput = 0;
  let pricePer1kOutput = 0;

  if (orModel.pricing) {
    // OpenRouter pricing is per token, we need per 1k tokens
    const promptPrice = parseFloat(orModel.pricing.prompt) || 0;
    const completionPrice = parseFloat(orModel.pricing.completion) || 0;
    pricePer1kInput = promptPrice * 1000;
    pricePer1kOutput = completionPrice * 1000;
  }

  // Determine suggested layer based on pricing
  let suggestedLayer = 'L0';
  if (pricePer1kInput === 0 && pricePer1kOutput === 0) {
    suggestedLayer = 'L0'; // Free models
  } else if (pricePer1kInput < 0.001) {
    suggestedLayer = 'L1'; // Very cheap
  } else if (pricePer1kInput < 0.01) {
    suggestedLayer = 'L2'; // Medium cost
  } else {
    suggestedLayer = 'L3'; // Premium
  }

  return {
    provider: 'openrouter',
    apiModelName: orModel.id,
    layer: suggestedLayer,
    relativeCost: pricePer1kInput > 0 ? Math.round(pricePer1kInput * 100) / 100 : 0,
    pricePer1kInputTokens: pricePer1kInput,
    pricePer1kOutputTokens: pricePer1kOutput,
    contextWindow: orModel.context_length || 8192,
  };
}

const DEFAULT_FORM_DATA: ModelFormData = {
  provider: '',
  apiModelName: '',
  layer: 'L0',
  relativeCost: 0,
  pricePer1kInputTokens: 0,
  pricePer1kOutputTokens: 0,
  contextWindow: 8192,
};

export default function ModelFormModal({
  isOpen,
  mode,
  initialData,
  modelId,
  sourceModelName,
  currentPriority,
  onSave,
  onClose,
}: ModelFormModalProps) {
  const [formData, setFormData] = useState<ModelFormData>(DEFAULT_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...DEFAULT_FORM_DATA,
        ...initialData,
      });
      setError(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.provider.trim()) {
      setError('Provider is required');
      return;
    }
    if (!formData.apiModelName.trim()) {
      setError('API Model Name is required');
      return;
    }
    if (!formData.layer) {
      setError('Layer is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(formData, modelId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ModelFormData>(field: K, value: ModelFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const title = mode === 'create' 
    ? (sourceModelName ? `Add Model: ${sourceModelName}` : 'Add New Model')
    : 'Edit Model';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-white transition-colors"
              disabled={saving}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          {mode === 'edit' && modelId && (
            <p className="text-sm text-slate-400 mt-1">Model ID: {modelId}</p>
          )}
          {mode === 'create' && sourceModelName && (
            <p className="text-sm text-blue-400 mt-1">
              Adding from OpenRouter: {formData.apiModelName}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Provider <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.provider}
                  onChange={(e) => updateField('provider', e.target.value)}
                  placeholder="e.g., openrouter"
                  className="input w-full"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Model Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.apiModelName}
                  onChange={(e) => updateField('apiModelName', e.target.value)}
                  placeholder="e.g., meta-llama/llama-3.3-70b-instruct:free"
                  className="input w-full"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Layer <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.layer}
                  onChange={(e) => updateField('layer', e.target.value)}
                  className="input w-full"
                  disabled={saving || mode === 'edit'} // Disable layer change in edit mode
                >
                  <option value="L0">L0 - Free/Cheapest</option>
                  <option value="L1">L1 - Low Cost</option>
                  <option value="L2">L2 - Medium Cost</option>
                  <option value="L3">L3 - Premium</option>
                </select>
                {mode === 'edit' && (
                  <p className="text-xs text-slate-500 mt-1">Layer cannot be changed. Use priority buttons to reorder.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {mode === 'edit' ? 'Priority (use ↑↓ buttons to change)' : 'Relative Cost'}
                </label>
                {mode === 'edit' && currentPriority !== undefined ? (
                  <div className="input w-full bg-slate-700/50 text-slate-300 cursor-not-allowed flex items-center">
                    <span className="text-indigo-400 font-semibold">{currentPriority}</span>
                    <span className="text-xs text-slate-500 ml-2">(0 = highest priority)</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.1"
                    value={formData.relativeCost}
                    onChange={(e) => updateField('relativeCost', parseFloat(e.target.value) || 0)}
                    className="input w-full"
                    disabled={saving}
                  />
                )}
              </div>
            </div>

            {/* Relative Cost - only show in edit mode since priority takes its place in create */}
            {mode === 'edit' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Relative Cost
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.relativeCost}
                  onChange={(e) => updateField('relativeCost', parseFloat(e.target.value) || 0)}
                  className="input w-full"
                  disabled={saving}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Price per 1k Input Tokens ($)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.pricePer1kInputTokens}
                  onChange={(e) => updateField('pricePer1kInputTokens', parseFloat(e.target.value) || 0)}
                  className="input w-full"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Price per 1k Output Tokens ($)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.pricePer1kOutputTokens}
                  onChange={(e) => updateField('pricePer1kOutputTokens', parseFloat(e.target.value) || 0)}
                  className="input w-full"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Context Window
              </label>
              <input
                type="number"
                value={formData.contextWindow}
                onChange={(e) => updateField('contextWindow', parseInt(e.target.value) || 8192)}
                placeholder="8192"
                className="input w-full"
                disabled={saving}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-700 flex items-center justify-end gap-3">
            <button 
              type="button"
              onClick={onClose} 
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : mode === 'create' ? (
                <>
                  <Plus className="w-4 h-4" />
                  Add Model
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
