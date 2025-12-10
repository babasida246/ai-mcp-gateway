/**
 * @file Backend Integrations Page
 * @description Admin page for managing backend configurations (CMDB, NMS, Syslog, SIEM, etc.)
 * 
 * Features:
 * - List all backend configurations
 * - Add/edit/delete backends
 * - Toggle backends on/off
 * - Configure backend-specific settings
 * 
 * SECURITY: Credentials are stored separately - only profile references shown here
 */

import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
    Database,
    Server,
    Shield,
    Network,
    FileText,
    Plus,
    Settings,
    Trash2,
    RefreshCw,
    Save,
    X,
    ChevronDown,
    AlertTriangle,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface BackendConfig {
    id: string;
    displayName: string;
    backendType: string;
    enabled: boolean;
    endpoint?: string;
    credentialsProfileId?: string;
    config?: Record<string, unknown>;
    updatedAt: string;
    updatedBy?: string;
}

interface BackendConfigsListResponse {
    backends: BackendConfig[];
    backendTypes: string[];
    totalCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const backendTypeInfo: Record<string, {
    label: string;
    icon: typeof Database;
    color: string;
    description: string;
}> = {
    cmdb: {
        label: 'CMDB',
        icon: Database,
        color: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
        description: 'Configuration Management Database (NetBox, etc.)',
    },
    nms: {
        label: 'NMS',
        icon: Network,
        color: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
        description: 'Network Management System (LibreNMS, Zabbix)',
    },
    syslog: {
        label: 'Syslog',
        icon: FileText,
        color: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
        description: 'Centralized Syslog Server',
    },
    siem: {
        label: 'SIEM',
        icon: Shield,
        color: 'bg-red-600/20 text-red-400 border-red-500/30',
        description: 'Security Information and Event Management',
    },
    mikrotik: {
        label: 'MikroTik',
        icon: Server,
        color: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
        description: 'MikroTik RouterOS API',
    },
    fortigate: {
        label: 'FortiGate',
        icon: Shield,
        color: 'bg-red-600/20 text-red-400 border-red-500/30',
        description: 'FortiGate Firewall API',
    },
    dhcp_dns: {
        label: 'DHCP/DNS',
        icon: Network,
        color: 'bg-green-600/20 text-green-400 border-green-500/30',
        description: 'DHCP/DNS Management',
    },
    nac: {
        label: 'NAC',
        icon: Shield,
        color: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
        description: 'Network Access Control',
    },
    config_backup: {
        label: 'Config Backup',
        icon: Database,
        color: 'bg-teal-600/20 text-teal-400 border-teal-500/30',
        description: 'Configuration Backup System (Oxidized, RANCID)',
    },
    custom: {
        label: 'Custom',
        icon: Settings,
        color: 'bg-slate-600/20 text-slate-400 border-slate-500/30',
        description: 'Custom Backend Integration',
    },
};

// =============================================================================
// Helper Components
// =============================================================================

function Toggle({
    enabled,
    onChange,
    disabled = false,
}: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={() => !disabled && onChange(!enabled)}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${enabled ? 'bg-green-600' : 'bg-slate-600'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    );
}

// =============================================================================
// Backend Card Component
// =============================================================================

function BackendCard({
    backend,
    onToggle,
    onEdit,
    onDelete,
}: {
    backend: BackendConfig;
    onToggle: (id: string, enabled: boolean) => void;
    onEdit: (backend: BackendConfig) => void;
    onDelete: (id: string) => void;
}) {
    const info = backendTypeInfo[backend.backendType] || backendTypeInfo.custom;
    const Icon = info.icon;

    return (
        <div className={`bg-slate-800 rounded-lg p-4 border ${
            backend.enabled ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${info.color}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-medium text-white">{backend.displayName}</h3>
                        <p className="text-sm text-slate-400">{backend.id}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs border ${info.color}`}>
                            {info.label}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Toggle
                        enabled={backend.enabled}
                        onChange={(enabled) => onToggle(backend.id, enabled)}
                    />
                </div>
            </div>

            {/* Details */}
            <div className="mt-3 space-y-1 text-sm">
                {backend.endpoint && (
                    <div className="text-slate-400">
                        <span className="text-slate-500">Endpoint:</span>{' '}
                        <span className="font-mono text-xs">{backend.endpoint}</span>
                    </div>
                )}
                {backend.credentialsProfileId && (
                    <div className="text-slate-400">
                        <span className="text-slate-500">Credentials:</span>{' '}
                        <span className="font-mono text-xs">{backend.credentialsProfileId}</span>
                        <span className="text-slate-500 ml-1">(stored in vault)</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                    Updated: {new Date(backend.updatedAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onEdit(backend)}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                        title="Edit"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(backend.id)}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-red-600/30 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Backend Edit Modal
// =============================================================================

function BackendEditModal({
    backend,
    isNew,
    onClose,
    onSave,
}: {
    backend: BackendConfig | null;
    isNew: boolean;
    onClose: () => void;
    onSave: (id: string, config: Partial<BackendConfig>) => void;
}) {
    const [formData, setFormData] = useState<Partial<BackendConfig>>({
        id: backend?.id || '',
        displayName: backend?.displayName || '',
        backendType: backend?.backendType || 'custom',
        enabled: backend?.enabled ?? true,
        endpoint: backend?.endpoint || '',
        credentialsProfileId: backend?.credentialsProfileId || '',
        config: backend?.config || {},
    });
    const [saving, setSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSave = async () => {
        if (!formData.id || !formData.displayName || !formData.backendType) {
            return;
        }

        setSaving(true);
        try {
            await onSave(formData.id, formData);
        } finally {
            setSaving(false);
        }
    };

    const info = backendTypeInfo[formData.backendType || 'custom'] || backendTypeInfo.custom;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            {isNew ? 'Add Backend Integration' : 'Edit Backend'}
                        </h2>
                        <p className="text-sm text-slate-400">
                            {info.description}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* ID */}
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">
                            Backend ID <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.id || ''}
                            onChange={(e) =>
                                setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })
                            }
                            disabled={!isNew}
                            placeholder="e.g., siem_prod, cmdb_default"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Unique identifier used by MCP tools to reference this backend
                        </p>
                    </div>

                    {/* Display Name */}
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">
                            Display Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.displayName || ''}
                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                            placeholder="e.g., Production SIEM"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Backend Type */}
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">
                            Backend Type <span className="text-red-400">*</span>
                        </label>
                        <select
                            value={formData.backendType || 'custom'}
                            onChange={(e) => setFormData({ ...formData, backendType: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {Object.entries(backendTypeInfo).map(([type, info]) => (
                                <option key={type} value={type}>
                                    {info.label} - {info.description}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Enabled */}
                    <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                        <div>
                            <label className="text-sm text-white">Enabled</label>
                            <p className="text-xs text-slate-400">Allow MCP tools to use this backend</p>
                        </div>
                        <Toggle
                            enabled={formData.enabled ?? true}
                            onChange={(enabled) => setFormData({ ...formData, enabled })}
                        />
                    </div>

                    {/* Endpoint */}
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">
                            API Endpoint
                        </label>
                        <input
                            type="text"
                            value={formData.endpoint || ''}
                            onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                            placeholder="e.g., https://siem.internal.local/api"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Credentials Profile */}
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">
                            Credentials Profile ID
                        </label>
                        <input
                            type="text"
                            value={formData.credentialsProfileId || ''}
                            onChange={(e) =>
                                setFormData({ ...formData, credentialsProfileId: e.target.value })
                            }
                            placeholder="e.g., siem_api_key"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-yellow-500" />
                            Actual credentials stored in vault/environment variables
                        </p>
                    </div>

                    {/* Advanced Config */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            <ChevronDown
                                className={`w-4 h-4 transition-transform ${
                                    showAdvanced ? 'rotate-180' : ''
                                }`}
                            />
                            Advanced Configuration (JSON)
                        </button>

                        {showAdvanced && (
                            <textarea
                                value={JSON.stringify(formData.config || {}, null, 2)}
                                onChange={(e) => {
                                    try {
                                        const config = JSON.parse(e.target.value);
                                        setFormData({ ...formData, config });
                                    } catch {
                                        // Invalid JSON, ignore
                                    }
                                }}
                                rows={6}
                                className="mt-2 w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !formData.id || !formData.displayName}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {isNew ? 'Create' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================

function DeleteConfirmModal({
    backendId,
    onClose,
    onConfirm,
}: {
    backendId: string;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onConfirm();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-full bg-red-600/20">
                        <Trash2 className="w-6 h-6 text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Delete Backend?</h2>
                </div>
                <p className="text-slate-400 mb-6">
                    Are you sure you want to delete backend <span className="font-mono text-white">{backendId}</span>?
                    MCP tools using this backend will fall back to default behavior.
                </p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {deleting && <RefreshCw className="w-4 h-4 animate-spin" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function Backends() {
    const [backends, setBackends] = useState<BackendConfig[]>([]);
    const [backendTypes, setBackendTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editBackend, setEditBackend] = useState<BackendConfig | null>(null);
    const [isNewBackend, setIsNewBackend] = useState(false);
    const [deleteBackendId, setDeleteBackendId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | null>(null);

    // Fetch backends
    const fetchBackends = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get<BackendConfigsListResponse>('/v1/admin/backends');
            setBackends(response.data.backends);
            setBackendTypes(response.data.backendTypes);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load backends');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackends();
    }, []);

    // Toggle backend
    const handleToggle = async (id: string, enabled: boolean) => {
        try {
            await api.post(`/v1/admin/backends/${encodeURIComponent(id)}/toggle`, { enabled });
            setBackends((prev) =>
                prev.map((b) => (b.id === id ? { ...b, enabled } : b))
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle backend');
        }
    };

    // Save backend
    const handleSave = async (id: string, config: Partial<BackendConfig>) => {
        try {
            const response = await api.put(`/v1/admin/backends/${encodeURIComponent(id)}`, config);
            const saved = response.data.config;

            if (isNewBackend) {
                setBackends((prev) => [...prev, saved]);
            } else {
                setBackends((prev) =>
                    prev.map((b) => (b.id === id ? saved : b))
                );
            }

            setEditBackend(null);
            setIsNewBackend(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save backend');
            throw err;
        }
    };

    // Delete backend
    const handleDelete = async () => {
        if (!deleteBackendId) return;

        try {
            await api.delete(`/v1/admin/backends/${encodeURIComponent(deleteBackendId)}`);
            setBackends((prev) => prev.filter((b) => b.id !== deleteBackendId));
            setDeleteBackendId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete backend');
        }
    };

    // Filter backends
    const filteredBackends = filterType
        ? backends.filter((b) => b.backendType === filterType)
        : backends;

    const enabledCount = backends.filter((b) => b.enabled).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Server className="w-7 h-7" />
                        Backend Integrations
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Configure data sources for MCP tools (CMDB, NMS, SIEM, etc.)
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchBackends}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => {
                            setEditBackend(null);
                            setIsNewBackend(true);
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Backend
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-white">{backends.length}</div>
                    <div className="text-sm text-slate-400">Total Backends</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-green-400">{enabledCount}</div>
                    <div className="text-sm text-slate-400">Enabled</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-red-400">{backends.length - enabledCount}</div>
                    <div className="text-sm text-slate-400">Disabled</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-blue-400">{backendTypes.length}</div>
                    <div className="text-sm text-slate-400">Types</div>
                </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400">Filter by type:</span>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setFilterType(null)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            filterType === null
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                    >
                        All
                    </button>
                    {Object.entries(backendTypeInfo).map(([type, info]) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                filterType === type
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            }`}
                        >
                            {info.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            )}

            {/* Backends Grid */}
            {!loading && filteredBackends.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBackends.map((backend) => (
                        <BackendCard
                            key={backend.id}
                            backend={backend}
                            onToggle={handleToggle}
                            onEdit={(b) => {
                                setEditBackend(b);
                                setIsNewBackend(false);
                            }}
                            onDelete={setDeleteBackendId}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && filteredBackends.length === 0 && (
                <div className="text-center py-12">
                    <Server className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 mb-4">
                        {filterType
                            ? `No ${backendTypeInfo[filterType]?.label || filterType} backends configured`
                            : 'No backend integrations configured'}
                    </p>
                    <button
                        onClick={() => {
                            setEditBackend(null);
                            setIsNewBackend(true);
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors inline-flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Your First Backend
                    </button>
                </div>
            )}

            {/* Edit Modal */}
            {(editBackend || isNewBackend) && (
                <BackendEditModal
                    backend={editBackend}
                    isNew={isNewBackend}
                    onClose={() => {
                        setEditBackend(null);
                        setIsNewBackend(false);
                    }}
                    onSave={handleSave}
                />
            )}

            {/* Delete Confirmation */}
            {deleteBackendId && (
                <DeleteConfirmModal
                    backendId={deleteBackendId}
                    onClose={() => setDeleteBackendId(null)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}
