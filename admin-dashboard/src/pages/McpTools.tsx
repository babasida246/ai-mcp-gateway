/**
 * @file MCP Tools Settings Page
 * @description Admin page for managing MCP tool settings.
 * 
 * Features:
 * - List all MCP tools grouped by category
 * - Toggle tools on/off
 * - Configure tool settings (limits, modes, backends)
 * - View input schema for each tool
 */

import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
    Wrench,
    Settings,
    ChevronDown,
    ChevronRight,
    Info,
    Save,
    X,
    RefreshCw,
    Search,
    Filter,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface McpToolSetting {
    toolName: string;
    enabled: boolean;
    defaultEnabledForMcpClients?: boolean;
    maxTimeRange?: string;
    maxRows?: number;
    modeAllowed?: string[];
    allowedBackends?: string[];
    backendRef?: string;
    extra?: Record<string, unknown>;
    updatedAt: string;
    updatedBy?: string;
}

interface McpToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: Record<string, unknown>;
}

interface McpToolWithSetting {
    definition: McpToolDefinition;
    setting: McpToolSetting;
}

interface McpToolsListResponse {
    tools: McpToolWithSetting[];
    categories: string[];
    totalCount: number;
}

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Toggle switch component
 */
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

/**
 * Category badge colors
 */
const categoryColors: Record<string, string> = {
    ai: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
    net: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    log: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
    sec: 'bg-red-600/20 text-red-400 border-red-500/30',
    ops: 'bg-green-600/20 text-green-400 border-green-500/30',
};

/**
 * Get category from tool name
 */
function getCategory(toolName: string): string {
    return toolName.split('.')[0] || 'system';
}

/**
 * Category labels
 */
const categoryLabels: Record<string, string> = {
    ai: 'AI & Chat',
    net: 'Network',
    log: 'Logging',
    sec: 'Security',
    ops: 'Operations',
};

// =============================================================================
// Tool Card Component
// =============================================================================

function ToolCard({
    tool,
    onToggle,
    onConfigure,
}: {
    tool: McpToolWithSetting;
    onToggle: (toolName: string, enabled: boolean) => void;
    onConfigure: (tool: McpToolWithSetting) => void;
}) {
    const category = getCategory(tool.definition.name);
    const colorClass = categoryColors[category] || 'bg-slate-600/20 text-slate-400 border-slate-500/30';

    return (
        <div className={`bg-slate-800 rounded-lg p-4 border ${
            tool.setting.enabled ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
                            {category.toUpperCase()}
                        </span>
                        <h3 className="font-medium text-white truncate">
                            {tool.definition.name}
                        </h3>
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-2">
                        {tool.definition.description.split('\n')[0]}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <Toggle
                        enabled={tool.setting.enabled}
                        onChange={(enabled) => onToggle(tool.definition.name, enabled)}
                    />
                    <button
                        onClick={() => onConfigure(tool)}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                        title="Configure"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Quick settings preview */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {tool.setting.maxRows && (
                    <span className="px-2 py-1 bg-slate-700/50 rounded text-slate-400">
                        Max rows: {tool.setting.maxRows}
                    </span>
                )}
                {tool.setting.maxTimeRange && (
                    <span className="px-2 py-1 bg-slate-700/50 rounded text-slate-400">
                        Time range: {tool.setting.maxTimeRange}
                    </span>
                )}
                {tool.setting.modeAllowed && tool.setting.modeAllowed.length > 0 && (
                    <span className="px-2 py-1 bg-slate-700/50 rounded text-slate-400">
                        Modes: {tool.setting.modeAllowed.join(', ')}
                    </span>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// Tool Config Modal Component
// =============================================================================

function ToolConfigModal({
    tool,
    onClose,
    onSave,
}: {
    tool: McpToolWithSetting;
    onClose: () => void;
    onSave: (toolName: string, setting: Partial<McpToolSetting>) => void;
}) {
    const [setting, setSetting] = useState<McpToolSetting>({ ...tool.setting });
    const [showSchema, setShowSchema] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(tool.definition.name, setting);
        } finally {
            setSaving(false);
        }
    };

    const handleModeToggle = (mode: string) => {
        const modes = setting.modeAllowed || [];
        if (modes.includes(mode)) {
            setSetting({
                ...setting,
                modeAllowed: modes.filter((m) => m !== mode),
            });
        } else {
            setSetting({
                ...setting,
                modeAllowed: [...modes, mode],
            });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Configure: {tool.definition.name}
                        </h2>
                        <p className="text-sm text-slate-400">
                            {categoryLabels[getCategory(tool.definition.name)] || 'Tool'} Settings
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
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Description */}
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                        <p className="text-sm text-slate-300">
                            {tool.definition.description.split('\n\n')[0]}
                        </p>
                    </div>

                    {/* Basic Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-white">Basic Settings</h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Enabled */}
                            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                                <div>
                                    <label className="text-sm text-white">Enabled</label>
                                    <p className="text-xs text-slate-400">Allow this tool to be used</p>
                                </div>
                                <Toggle
                                    enabled={setting.enabled}
                                    onChange={(enabled) => setSetting({ ...setting, enabled })}
                                />
                            </div>

                            {/* Default for MCP clients */}
                            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                                <div>
                                    <label className="text-sm text-white">Default for Clients</label>
                                    <p className="text-xs text-slate-400">Enable by default for new clients</p>
                                </div>
                                <Toggle
                                    enabled={setting.defaultEnabledForMcpClients ?? true}
                                    onChange={(enabled) =>
                                        setSetting({ ...setting, defaultEnabledForMcpClients: enabled })
                                    }
                                />
                            </div>
                        </div>
                    </div>

                    {/* Limits */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-white">Limits</h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Max Rows */}
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">
                                    Max Rows
                                    <span className="text-xs text-slate-500 ml-1">(per query)</span>
                                </label>
                                <input
                                    type="number"
                                    value={setting.maxRows || ''}
                                    onChange={(e) =>
                                        setSetting({
                                            ...setting,
                                            maxRows: e.target.value ? parseInt(e.target.value) : undefined,
                                        })
                                    }
                                    placeholder="1000"
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {/* Max Time Range */}
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">
                                    Max Time Range
                                </label>
                                <select
                                    value={setting.maxTimeRange || '24h'}
                                    onChange={(e) =>
                                        setSetting({ ...setting, maxTimeRange: e.target.value })
                                    }
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="1h">1 hour</option>
                                    <option value="6h">6 hours</option>
                                    <option value="12h">12 hours</option>
                                    <option value="24h">24 hours</option>
                                    <option value="7d">7 days</option>
                                    <option value="30d">30 days</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Allowed Modes */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-white">
                            Allowed Modes
                            <span className="text-xs text-slate-500 ml-2">
                                (ATTT cấp 3: disable "apply" for safety)
                            </span>
                        </h3>

                        <div className="flex flex-wrap gap-2">
                            {['inspect', 'plan', 'apply', 'get_config', 'create_snapshot', 'list_snapshots'].map(
                                (mode) => {
                                    const isSelected = setting.modeAllowed?.includes(mode);
                                    const isDangerous = mode === 'apply';

                                    return (
                                        <button
                                            key={mode}
                                            onClick={() => handleModeToggle(mode)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                                isSelected
                                                    ? isDangerous
                                                        ? 'bg-red-600/30 text-red-400 border border-red-500/50'
                                                        : 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
                                                    : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
                                            }`}
                                        >
                                            {mode}
                                            {isDangerous && (
                                                <span className="ml-1 text-xs">⚠️</span>
                                            )}
                                        </button>
                                    );
                                }
                            )}
                        </div>
                    </div>

                    {/* Backend Reference */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-white">Backend Integration</h3>

                        <div>
                            <label className="block text-sm text-slate-300 mb-1">
                                Backend Reference
                                <span className="text-xs text-slate-500 ml-1">
                                    (ID from Backend Integrations)
                                </span>
                            </label>
                            <input
                                type="text"
                                value={setting.backendRef || ''}
                                onChange={(e) =>
                                    setSetting({ ...setting, backendRef: e.target.value || undefined })
                                }
                                placeholder="e.g., siem_prod, cmdb_default"
                                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Input Schema */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setShowSchema(!showSchema)}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {showSchema ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                            <Info className="w-4 h-4" />
                            View Input Schema
                        </button>

                        {showSchema && (
                            <pre className="p-3 bg-slate-900 rounded-lg text-xs text-slate-300 overflow-x-auto">
                                {JSON.stringify(tool.definition.inputSchema, null, 2)}
                            </pre>
                        )}
                    </div>

                    {/* Last Updated */}
                    {setting.updatedAt && (
                        <div className="text-xs text-slate-500">
                            Last updated: {new Date(setting.updatedAt).toLocaleString()}
                            {setting.updatedBy && ` by ${setting.updatedBy}`}
                        </div>
                    )}
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
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function McpTools() {
    const [tools, setTools] = useState<McpToolWithSetting[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [configTool, setConfigTool] = useState<McpToolWithSetting | null>(null);

    // Filter tools
    const filteredTools = tools.filter((tool) => {
        const matchesSearch =
            searchQuery === '' ||
            tool.definition.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tool.definition.description.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
            selectedCategory === null ||
            getCategory(tool.definition.name) === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    // Fetch tools
    const fetchTools = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get<McpToolsListResponse>('/v1/admin/mcp-tools');
            setTools(response.data.tools);
            setCategories(response.data.categories);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load tools');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTools();
    }, []);

    // Toggle tool
    const handleToggle = async (toolName: string, enabled: boolean) => {
        try {
            await api.post(`/v1/admin/mcp-tools/${encodeURIComponent(toolName)}/toggle`, { enabled });
            setTools((prev) =>
                prev.map((t) =>
                    t.definition.name === toolName
                        ? { ...t, setting: { ...t.setting, enabled } }
                        : t
                )
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle tool');
        }
    };

    // Save tool config
    const handleSaveConfig = async (toolName: string, setting: Partial<McpToolSetting>) => {
        try {
            await api.put(`/v1/admin/mcp-tools/${encodeURIComponent(toolName)}`, setting);
            setTools((prev) =>
                prev.map((t) =>
                    t.definition.name === toolName
                        ? { ...t, setting: { ...t.setting, ...setting } as McpToolSetting }
                        : t
                )
            );
            setConfigTool(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save config');
            throw err;
        }
    };

    // Stats
    const totalTools = tools.length;
    const enabledTools = tools.filter((t) => t.setting.enabled).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wrench className="w-7 h-7" />
                        MCP Tools Settings
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Configure MCP tools behavior, limits, and access controls
                    </p>
                </div>
                <button
                    onClick={fetchTools}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-white">{totalTools}</div>
                    <div className="text-sm text-slate-400">Total Tools</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-green-400">{enabledTools}</div>
                    <div className="text-sm text-slate-400">Enabled</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-red-400">{totalTools - enabledTools}</div>
                    <div className="text-sm text-slate-400">Disabled</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div className="text-2xl font-bold text-blue-400">{categories.length}</div>
                    <div className="text-sm text-slate-400">Categories</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search tools..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={selectedCategory || ''}
                        onChange={(e) => setSelectedCategory(e.target.value || null)}
                        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">All Categories</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {categoryLabels[cat] || cat.toUpperCase()}
                            </option>
                        ))}
                    </select>
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

            {/* Tools Grid */}
            {!loading && filteredTools.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTools.map((tool) => (
                        <ToolCard
                            key={tool.definition.name}
                            tool={tool}
                            onToggle={handleToggle}
                            onConfigure={setConfigTool}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && filteredTools.length === 0 && (
                <div className="text-center py-12">
                    <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">
                        {searchQuery || selectedCategory
                            ? 'No tools match your filters'
                            : 'No MCP tools registered'}
                    </p>
                </div>
            )}

            {/* Config Modal */}
            {configTool && (
                <ToolConfigModal
                    tool={configTool}
                    onClose={() => setConfigTool(null)}
                    onSave={handleSaveConfig}
                />
            )}
        </div>
    );
}
