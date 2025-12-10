/**
 * @file MCP Tool Settings Service
 * @description Service for managing MCP tool settings and backend configurations.
 * 
 * This service provides:
 * - CRUD operations for tool settings
 * - CRUD operations for backend configurations
 * - Settings enforcement during tool execution
 * - Audit logging for all changes
 * 
 * SECURITY NOTES (ATTT cấp 3):
 * - All changes are logged with user ID and timestamp
 * - Secrets are never stored or returned - only profile references
 * - Default settings enforce read-only operations
 */

import { db } from '../../db/postgres.js';
import { logger } from '../../logging/logger.js';
import {
    McpToolSetting,
    McpToolSettingUpdate,
    BackendConfig,
    BackendConfigUpdate,
    McpToolWithSetting,
    McpToolsListResponse,
    BackendConfigsListResponse,
    McpSettingsAuditLog,
    DEFAULT_TOOL_SETTINGS,
    TOOL_SPECIFIC_DEFAULTS,
    McpToolSettingSchema,
    BaseBackendConfigSchema,
} from './types.js';
import { mcpRegistry } from '../tools/registry.js';

// =============================================================================
// In-Memory Cache (for when DB is not available)
// =============================================================================

const toolSettingsCache = new Map<string, McpToolSetting>();
const backendConfigsCache = new Map<string, BackendConfig>();

// =============================================================================
// MCP Tool Settings Service
// =============================================================================

class McpToolSettingsService {
    private initialized = false;

    /**
     * Initialize the service and ensure database tables exist.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            if (db.isReady()) {
                await this.ensureTables();
                await this.loadFromDatabase();
            } else {
                logger.warn('Database not ready, using in-memory settings cache');
            }
            this.initialized = true;
            logger.info('McpToolSettingsService initialized', {
                toolSettings: toolSettingsCache.size,
                backendConfigs: backendConfigsCache.size,
            });
        } catch (error) {
            logger.error('Failed to initialize McpToolSettingsService', { error });
            // Continue with empty cache - will use defaults
            this.initialized = true;
        }
    }

    /**
     * Ensure database tables exist.
     */
    private async ensureTables(): Promise<void> {
        const client = await db.getClient();
        try {
            // MCP Tool Settings table
            await client.query(`
                CREATE TABLE IF NOT EXISTS mcp_tool_settings (
                    tool_name VARCHAR(255) PRIMARY KEY,
                    enabled BOOLEAN DEFAULT true,
                    default_enabled_for_mcp_clients BOOLEAN DEFAULT true,
                    max_time_range VARCHAR(50),
                    max_rows INTEGER,
                    mode_allowed TEXT[],
                    allowed_backends TEXT[],
                    backend_ref VARCHAR(255),
                    extra JSONB,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_by VARCHAR(255)
                )
            `);

            // Backend Configurations table
            await client.query(`
                CREATE TABLE IF NOT EXISTS mcp_backend_configs (
                    id VARCHAR(255) PRIMARY KEY,
                    display_name VARCHAR(255) NOT NULL,
                    backend_type VARCHAR(50) NOT NULL,
                    enabled BOOLEAN DEFAULT true,
                    endpoint VARCHAR(500),
                    credentials_profile_id VARCHAR(255),
                    config JSONB,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_by VARCHAR(255)
                )
            `);

            // Audit Log table
            await client.query(`
                CREATE TABLE IF NOT EXISTS mcp_settings_audit_log (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    timestamp TIMESTAMPTZ DEFAULT NOW(),
                    user_id VARCHAR(255),
                    action VARCHAR(50) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id VARCHAR(255) NOT NULL,
                    changes JSONB,
                    ip_address VARCHAR(45),
                    user_agent TEXT
                )
            `);

            // Create indexes
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_mcp_tool_settings_enabled 
                ON mcp_tool_settings(enabled)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_mcp_backend_configs_type 
                ON mcp_backend_configs(backend_type)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_timestamp 
                ON mcp_settings_audit_log(timestamp DESC)
            `);

            logger.info('MCP settings tables ensured');
        } finally {
            client.release();
        }
    }

    /**
     * Load settings and configs from database into cache.
     */
    private async loadFromDatabase(): Promise<void> {
        const client = await db.getClient();
        try {
            // Load tool settings
            const settingsResult = await client.query(`
                SELECT * FROM mcp_tool_settings
            `);
            for (const row of settingsResult.rows) {
                const setting: McpToolSetting = {
                    toolName: row.tool_name,
                    enabled: row.enabled,
                    defaultEnabledForMcpClients: row.default_enabled_for_mcp_clients,
                    maxTimeRange: row.max_time_range,
                    maxRows: row.max_rows,
                    modeAllowed: row.mode_allowed,
                    allowedBackends: row.allowed_backends,
                    backendRef: row.backend_ref,
                    extra: row.extra,
                    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
                    updatedBy: row.updated_by,
                };
                toolSettingsCache.set(row.tool_name, setting);
            }

            // Load backend configs
            const configsResult = await client.query(`
                SELECT * FROM mcp_backend_configs
            `);
            for (const row of configsResult.rows) {
                const config: BackendConfig = {
                    id: row.id,
                    displayName: row.display_name,
                    backendType: row.backend_type,
                    enabled: row.enabled,
                    endpoint: row.endpoint,
                    credentialsProfileId: row.credentials_profile_id,
                    config: row.config,
                    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
                    updatedBy: row.updated_by,
                };
                backendConfigsCache.set(row.id, config);
            }
        } finally {
            client.release();
        }
    }

    // =========================================================================
    // Tool Settings CRUD
    // =========================================================================

    /**
     * Get settings for a specific tool.
     * Merges with defaults if no explicit settings exist.
     */
    getToolSetting(toolName: string): McpToolSetting {
        const cached = toolSettingsCache.get(toolName);

        // Get tool-specific defaults
        const toolDefaults = TOOL_SPECIFIC_DEFAULTS[toolName] || {};

        // Merge: cached > tool-specific defaults > global defaults
        const merged: McpToolSetting = {
            toolName,
            enabled: cached?.enabled ?? toolDefaults.enabled ?? DEFAULT_TOOL_SETTINGS.enabled ?? true,
            defaultEnabledForMcpClients: cached?.defaultEnabledForMcpClients ??
                toolDefaults.defaultEnabledForMcpClients ??
                DEFAULT_TOOL_SETTINGS.defaultEnabledForMcpClients ?? true,
            maxTimeRange: cached?.maxTimeRange ?? toolDefaults.maxTimeRange ?? DEFAULT_TOOL_SETTINGS.maxTimeRange,
            maxRows: cached?.maxRows ?? toolDefaults.maxRows ?? DEFAULT_TOOL_SETTINGS.maxRows,
            modeAllowed: cached?.modeAllowed ?? toolDefaults.modeAllowed ?? DEFAULT_TOOL_SETTINGS.modeAllowed,
            allowedBackends: cached?.allowedBackends ?? toolDefaults.allowedBackends,
            backendRef: cached?.backendRef ?? toolDefaults.backendRef,
            extra: { ...toolDefaults.extra, ...cached?.extra },
            updatedAt: cached?.updatedAt ?? new Date().toISOString(),
            updatedBy: cached?.updatedBy,
        };

        return merged;
    }

    /**
     * Get all tool settings (for admin listing).
     */
    async getAllToolSettings(): Promise<McpToolsListResponse> {
        await this.initialize();

        // Get all registered tools from registry
        const registeredTools = mcpRegistry.listTools();
        const tools: McpToolWithSetting[] = [];
        const categoriesSet = new Set<string>();

        for (const toolDef of registeredTools.tools) {
            const setting = this.getToolSetting(toolDef.name);
            const category = toolDef.name.split('.')[0] || 'system';
            categoriesSet.add(category);

            tools.push({
                definition: {
                    name: toolDef.name,
                    description: toolDef.description,
                    category,
                    inputSchema: toolDef.inputSchema,
                },
                setting,
            });
        }

        return {
            tools,
            categories: Array.from(categoriesSet).sort(),
            totalCount: tools.length,
        };
    }

    /**
     * Update settings for a tool.
     */
    async updateToolSetting(
        toolName: string,
        update: McpToolSettingUpdate,
        userId?: string,
        auditContext?: { ipAddress?: string; userAgent?: string }
    ): Promise<McpToolSetting> {
        await this.initialize();

        const oldSetting = this.getToolSetting(toolName);
        const newSetting: McpToolSetting = {
            ...oldSetting,
            ...update,
            toolName,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
        };

        // Validate
        McpToolSettingSchema.parse(newSetting);

        // Update cache
        toolSettingsCache.set(toolName, newSetting);

        // Persist to database if available
        if (db.isReady()) {
            const client = await db.getClient();
            try {
                await client.query(`
                    INSERT INTO mcp_tool_settings (
                        tool_name, enabled, default_enabled_for_mcp_clients,
                        max_time_range, max_rows, mode_allowed, allowed_backends,
                        backend_ref, extra, updated_at, updated_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (tool_name) DO UPDATE SET
                        enabled = EXCLUDED.enabled,
                        default_enabled_for_mcp_clients = EXCLUDED.default_enabled_for_mcp_clients,
                        max_time_range = EXCLUDED.max_time_range,
                        max_rows = EXCLUDED.max_rows,
                        mode_allowed = EXCLUDED.mode_allowed,
                        allowed_backends = EXCLUDED.allowed_backends,
                        backend_ref = EXCLUDED.backend_ref,
                        extra = EXCLUDED.extra,
                        updated_at = EXCLUDED.updated_at,
                        updated_by = EXCLUDED.updated_by
                `, [
                    newSetting.toolName,
                    newSetting.enabled,
                    newSetting.defaultEnabledForMcpClients,
                    newSetting.maxTimeRange,
                    newSetting.maxRows,
                    newSetting.modeAllowed,
                    newSetting.allowedBackends,
                    newSetting.backendRef,
                    newSetting.extra,
                    newSetting.updatedAt,
                    newSetting.updatedBy,
                ]);

                // Log audit
                await this.logAudit({
                    userId: userId || 'system',
                    action: 'update',
                    entityType: 'tool_setting',
                    entityId: toolName,
                    oldValue: oldSetting,
                    newValue: newSetting,
                    ...auditContext,
                });
            } finally {
                client.release();
            }
        }

        logger.info('Tool setting updated', { toolName, userId });
        return newSetting;
    }

    // =========================================================================
    // Backend Configs CRUD
    // =========================================================================

    /**
     * Get a backend configuration by ID.
     */
    getBackendConfig(id: string): BackendConfig | undefined {
        return backendConfigsCache.get(id);
    }

    /**
     * Get all backend configurations.
     */
    async getAllBackendConfigs(): Promise<BackendConfigsListResponse> {
        await this.initialize();

        const backends = Array.from(backendConfigsCache.values());
        const backendTypes = [...new Set(backends.map(b => b.backendType))].sort();

        return {
            backends,
            backendTypes,
            totalCount: backends.length,
        };
    }

    /**
     * Get backends by type.
     */
    getBackendsByType(backendType: string): BackendConfig[] {
        return Array.from(backendConfigsCache.values())
            .filter(b => b.backendType === backendType && b.enabled);
    }

    /**
     * Create or update a backend configuration.
     */
    async upsertBackendConfig(
        id: string,
        update: BackendConfigUpdate,
        userId?: string,
        auditContext?: { ipAddress?: string; userAgent?: string }
    ): Promise<BackendConfig> {
        await this.initialize();

        const existing = backendConfigsCache.get(id);
        const config: BackendConfig = {
            id,
            displayName: update.displayName || existing?.displayName || id,
            backendType: update.backendType || existing?.backendType || 'custom',
            enabled: update.enabled ?? existing?.enabled ?? true,
            endpoint: update.endpoint ?? existing?.endpoint,
            credentialsProfileId: update.credentialsProfileId ?? existing?.credentialsProfileId,
            config: { ...existing?.config, ...update.config },
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
        };

        // Validate
        BaseBackendConfigSchema.parse(config);

        // Update cache
        backendConfigsCache.set(id, config);

        // Persist to database if available
        if (db.isReady()) {
            const client = await db.getClient();
            try {
                await client.query(`
                    INSERT INTO mcp_backend_configs (
                        id, display_name, backend_type, enabled,
                        endpoint, credentials_profile_id, config,
                        updated_at, updated_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        backend_type = EXCLUDED.backend_type,
                        enabled = EXCLUDED.enabled,
                        endpoint = EXCLUDED.endpoint,
                        credentials_profile_id = EXCLUDED.credentials_profile_id,
                        config = EXCLUDED.config,
                        updated_at = EXCLUDED.updated_at,
                        updated_by = EXCLUDED.updated_by
                `, [
                    config.id,
                    config.displayName,
                    config.backendType,
                    config.enabled,
                    config.endpoint,
                    config.credentialsProfileId,
                    config.config,
                    config.updatedAt,
                    config.updatedBy,
                ]);

                // Log audit
                await this.logAudit({
                    userId: userId || 'system',
                    action: existing ? 'update' : 'create',
                    entityType: 'backend_config',
                    entityId: id,
                    oldValue: existing,
                    newValue: config,
                    ...auditContext,
                });
            } finally {
                client.release();
            }
        }

        logger.info('Backend config upserted', { id, backendType: config.backendType, userId });
        return config;
    }

    /**
     * Delete a backend configuration.
     */
    async deleteBackendConfig(
        id: string,
        userId?: string,
        auditContext?: { ipAddress?: string; userAgent?: string }
    ): Promise<boolean> {
        await this.initialize();

        const existing = backendConfigsCache.get(id);
        if (!existing) return false;

        backendConfigsCache.delete(id);

        if (db.isReady()) {
            const client = await db.getClient();
            try {
                await client.query(
                    'DELETE FROM mcp_backend_configs WHERE id = $1',
                    [id]
                );

                await this.logAudit({
                    userId: userId || 'system',
                    action: 'delete',
                    entityType: 'backend_config',
                    entityId: id,
                    oldValue: existing,
                    newValue: null,
                    ...auditContext,
                });
            } finally {
                client.release();
            }
        }

        logger.info('Backend config deleted', { id, userId });
        return true;
    }

    // =========================================================================
    // Settings Enforcement
    // =========================================================================

    /**
     * Enforce tool settings on incoming arguments.
     * Returns sanitized args or throws error if settings are violated.
     */
    enforceSettings(
        toolName: string,
        args: Record<string, unknown>
    ): { valid: boolean; sanitized: Record<string, unknown>; violations: string[] } {
        const setting = this.getToolSetting(toolName);
        const violations: string[] = [];
        const sanitized = { ...args };

        // Check if tool is enabled
        if (!setting.enabled) {
            return {
                valid: false,
                sanitized: args,
                violations: [`Tool '${toolName}' is disabled`],
            };
        }

        // Enforce mode allowed
        if (args.mode && setting.modeAllowed && setting.modeAllowed.length > 0) {
            if (!setting.modeAllowed.includes(args.mode as string)) {
                violations.push(
                    `Mode '${args.mode}' is not allowed. Allowed modes: ${setting.modeAllowed.join(', ')}`
                );
            }
        }

        // Enforce maxRows
        if (args.maxRows !== undefined && setting.maxRows) {
            const requestedRows = Number(args.maxRows);
            if (requestedRows > setting.maxRows) {
                logger.warn('maxRows exceeded, clamping', {
                    toolName,
                    requested: requestedRows,
                    max: setting.maxRows,
                });
                sanitized.maxRows = setting.maxRows;
            }
        }

        // Enforce maxTimeRange
        if (args.timeRange && setting.maxTimeRange) {
            const requestedMs = this.parseTimeRangeToMs(args.timeRange as string);
            const maxMs = this.parseTimeRangeToMs(setting.maxTimeRange);
            if (requestedMs > maxMs) {
                violations.push(
                    `Time range '${args.timeRange}' exceeds maximum '${setting.maxTimeRange}'`
                );
            }
        }

        // Enforce allowed backends
        if (args.backend && setting.allowedBackends && setting.allowedBackends.length > 0) {
            if (!setting.allowedBackends.includes(args.backend as string)) {
                violations.push(
                    `Backend '${args.backend}' is not allowed. Allowed: ${setting.allowedBackends.join(', ')}`
                );
            }
        }

        return {
            valid: violations.length === 0,
            sanitized,
            violations,
        };
    }

    /**
     * Parse time range string to milliseconds.
     */
    private parseTimeRangeToMs(timeRange: string): number {
        const patterns: Record<string, number> = {
            'last_5m': 5 * 60 * 1000,
            'last_15m': 15 * 60 * 1000,
            'last_30m': 30 * 60 * 1000,
            'last_1h': 60 * 60 * 1000,
            'last_6h': 6 * 60 * 60 * 1000,
            'last_12h': 12 * 60 * 60 * 1000,
            'last_24h': 24 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            'last_7d': 7 * 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            'last_30d': 30 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
        };
        return patterns[timeRange] || 24 * 60 * 60 * 1000; // Default 24h
    }

    // =========================================================================
    // Audit Logging
    // =========================================================================

    /**
     * Log an audit entry for settings changes.
     */
    private async logAudit(entry: {
        userId: string;
        action: 'create' | 'update' | 'delete';
        entityType: 'tool_setting' | 'backend_config';
        entityId: string;
        oldValue?: unknown;
        newValue?: unknown;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<void> {
        if (!db.isReady()) {
            logger.info('Audit log (DB unavailable)', entry);
            return;
        }

        // Compute changes diff
        const changes = this.computeChanges(entry.oldValue, entry.newValue);

        const client = await db.getClient();
        try {
            await client.query(`
                INSERT INTO mcp_settings_audit_log (
                    user_id, action, entity_type, entity_id,
                    changes, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                entry.userId,
                entry.action,
                entry.entityType,
                entry.entityId,
                JSON.stringify(changes),
                entry.ipAddress,
                entry.userAgent,
            ]);
        } catch (error) {
            logger.error('Failed to write audit log', { error, entry });
        } finally {
            client.release();
        }
    }

    /**
     * Compute changes between old and new values.
     */
    private computeChanges(
        oldValue: unknown,
        newValue: unknown
    ): { field: string; oldValue: unknown; newValue: unknown }[] {
        const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

        const oldObj = (oldValue || {}) as Record<string, unknown>;
        const newObj = (newValue || {}) as Record<string, unknown>;
        const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

        for (const key of allKeys) {
            const ov = oldObj[key];
            const nv = newObj[key];
            if (JSON.stringify(ov) !== JSON.stringify(nv)) {
                changes.push({ field: key, oldValue: ov, newValue: nv });
            }
        }

        return changes;
    }

    /**
     * Get audit logs for an entity.
     */
    async getAuditLogs(options: {
        entityType?: 'tool_setting' | 'backend_config';
        entityId?: string;
        userId?: string;
        since?: string;
        limit?: number;
    }): Promise<McpSettingsAuditLog[]> {
        if (!db.isReady()) return [];

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options.entityType) {
            conditions.push(`entity_type = $${paramIndex++}`);
            params.push(options.entityType);
        }
        if (options.entityId) {
            conditions.push(`entity_id = $${paramIndex++}`);
            params.push(options.entityId);
        }
        if (options.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            params.push(options.userId);
        }
        if (options.since) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            params.push(options.since);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const client = await db.getClient();
        try {
            const result = await client.query(`
                SELECT * FROM mcp_settings_audit_log
                ${whereClause}
                ORDER BY timestamp DESC
                LIMIT $${paramIndex}
            `, [...params, options.limit || 100]);

            return result.rows.map(row => ({
                id: row.id,
                timestamp: row.timestamp?.toISOString(),
                userId: row.user_id,
                action: row.action,
                entityType: row.entity_type,
                entityId: row.entity_id,
                changes: row.changes || [],
                ipAddress: row.ip_address,
                userAgent: row.user_agent,
            }));
        } finally {
            client.release();
        }
    }
}

// Export singleton instance
export const mcpToolSettingsService = new McpToolSettingsService();
