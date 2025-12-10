/**
 * @file MCP Tool Settings Types
 * @description Type definitions for MCP tool settings and backend configurations.
 * 
 * SECURITY NOTES (ATTT cấp 3):
 * - Secrets (passwords, tokens) are NEVER stored or returned in these types
 * - Only profile references (IDs/names) are used to link to credentials
 * - All changes are audited via updatedAt/updatedBy
 */

import { z } from 'zod';

// =============================================================================
// MCP Tool Setting Schema
// =============================================================================

/**
 * Settings for an individual MCP tool.
 * These settings control tool behavior and enforce security policies.
 */
export const McpToolSettingSchema = z.object({
    /** Unique tool identifier (e.g., "net.fw_log_search") */
    toolName: z.string(),

    /** Whether the tool is enabled for use */
    enabled: z.boolean().default(true),

    /** Whether enabled by default for new MCP clients */
    defaultEnabledForMcpClients: z.boolean().default(true),

    /** Maximum time range for queries (e.g., "24h", "7d") */
    maxTimeRange: z.string().optional(),

    /** Maximum rows/events to return per query */
    maxRows: z.number().optional(),

    /** Allowed operation modes (e.g., ["inspect", "plan"]) - excludes "apply" by default for safety */
    modeAllowed: z.array(z.string()).optional(),

    /** Allowed backend IDs this tool can use */
    allowedBackends: z.array(z.string()).optional(),

    /** Reference to primary backend config (e.g., "cmdb_default", "siem_prod") */
    backendRef: z.string().optional(),

    /** Tool-specific extra settings */
    extra: z.record(z.unknown()).optional(),

    /** ISO timestamp of last update */
    updatedAt: z.string(),

    /** User ID who made the last update */
    updatedBy: z.string().optional(),
});

export type McpToolSetting = z.infer<typeof McpToolSettingSchema>;

/**
 * Input schema for updating tool settings.
 */
export const McpToolSettingUpdateSchema = McpToolSettingSchema.omit({
    toolName: true,
    updatedAt: true,
}).partial();

export type McpToolSettingUpdate = z.infer<typeof McpToolSettingUpdateSchema>;

// =============================================================================
// Backend Configuration Schemas
// =============================================================================

/**
 * Base schema for all backend configurations.
 */
export const BaseBackendConfigSchema = z.object({
    /** Unique backend identifier */
    id: z.string(),

    /** Human-readable display name */
    displayName: z.string(),

    /** Backend type category */
    backendType: z.enum([
        'cmdb',           // CMDB/Asset management (NetBox, etc.)
        'nms',            // Network Management System (LibreNMS, Zabbix)
        'syslog',         // Centralized syslog server
        'siem',           // Security Information and Event Management
        'mikrotik',       // MikroTik RouterOS API
        'fortigate',      // FortiGate firewall API
        'dhcp_dns',       // DHCP/DNS management
        'nac',            // Network Access Control
        'config_backup',  // Config backup system (Oxidized, RANCID)
        'custom',         // Custom/other backend
    ]),

    /** Whether this backend is enabled */
    enabled: z.boolean().default(true),

    /** Backend API endpoint (URL) - non-secret */
    endpoint: z.string().optional(),

    /** Reference to credentials profile (stored separately in vault/env) */
    credentialsProfileId: z.string().optional(),

    /** Additional non-secret configuration */
    config: z.record(z.unknown()).optional(),

    /** ISO timestamp of last update */
    updatedAt: z.string(),

    /** User ID who made the last update */
    updatedBy: z.string().optional(),
});

export type BackendConfig = z.infer<typeof BaseBackendConfigSchema>;

/**
 * CMDB/NMS Backend Configuration
 */
export const CmdbNmsBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('cmdb').or(z.literal('nms')),
    config: z.object({
        /** API type: netbox, librenms, zabbix, custom */
        apiType: z.enum(['netbox', 'librenms', 'zabbix', 'custom']).optional(),
        /** Default site/location filter */
        defaultSite: z.string().optional(),
        /** Allowed device types to query */
        allowedDeviceTypes: z.array(z.string()).optional(),
        /** Cache TTL in seconds */
        cacheTtlSeconds: z.number().default(300),
    }).optional(),
});

export type CmdbNmsBackendConfig = z.infer<typeof CmdbNmsBackendConfigSchema>;

/**
 * Syslog Backend Configuration
 */
export const SyslogBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('syslog'),
    config: z.object({
        /** Source type: file, elasticsearch, loki, custom */
        sourceType: z.enum(['file', 'elasticsearch', 'loki', 'custom']).optional(),
        /** File path for local syslog */
        filePath: z.string().optional(),
        /** Index/table name for log storage */
        indexPattern: z.string().optional(),
        /** Allowed hostnames to query */
        allowedHosts: z.array(z.string()).optional(),
        /** Default max rows */
        defaultMaxRows: z.number().default(200),
    }).optional(),
});

export type SyslogBackendConfig = z.infer<typeof SyslogBackendConfigSchema>;

/**
 * SIEM Backend Configuration
 */
export const SiemBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('siem'),
    config: z.object({
        /** SIEM type: wazuh, elastic_siem, splunk, fortianalyzer, custom */
        siemType: z.enum(['wazuh', 'elastic_siem', 'splunk', 'fortianalyzer', 'custom']).optional(),
        /** Default index/pipeline */
        defaultIndex: z.string().optional(),
        /** Allowed event types */
        allowedEventTypes: z.array(z.string()).optional(),
        /** Max events per query */
        maxEventsPerQuery: z.number().default(1000),
        /** Max time range allowed */
        maxTimeRange: z.string().default('7d'),
    }).optional(),
});

export type SiemBackendConfig = z.infer<typeof SiemBackendConfigSchema>;

/**
 * MikroTik Backend Configuration (API Profile)
 */
export const MikrotikBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('mikrotik'),
    config: z.object({
        /** Router hostname/IP (non-secret) */
        routerHost: z.string().optional(),
        /** API port (default 8728) */
        apiPort: z.number().default(8728),
        /** Use SSL */
        useSsl: z.boolean().default(false),
        /** Allowed commands (whitelist) */
        allowedCommands: z.array(z.string()).optional(),
        /** Allowed modes: get_config, inspect, plan, apply */
        allowedModes: z.array(z.string()).default(['get_config', 'inspect']),
    }).optional(),
});

export type MikrotikBackendConfig = z.infer<typeof MikrotikBackendConfigSchema>;

/**
 * NAC Backend Configuration
 */
export const NacBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('nac'),
    config: z.object({
        /** NAC type: fortigate_nac, cisco_ise, aruba_clearpass, custom */
        nacType: z.enum(['fortigate_nac', 'cisco_ise', 'aruba_clearpass', 'custom']).optional(),
        /** Allow policy suggestions only (no apply) */
        suggestOnly: z.boolean().default(true),
        /** Allowed policy scopes */
        allowedScopes: z.array(z.string()).optional(),
    }).optional(),
});

export type NacBackendConfig = z.infer<typeof NacBackendConfigSchema>;

/**
 * Config Backup System Configuration
 */
export const ConfigBackupBackendConfigSchema = BaseBackendConfigSchema.extend({
    backendType: z.literal('config_backup'),
    config: z.object({
        /** Backup system type: oxidized, rancid, git, custom */
        systemType: z.enum(['oxidized', 'rancid', 'git', 'custom']).optional(),
        /** Repository path */
        repoPath: z.string().optional(),
        /** Allowed baseline profiles */
        allowedBaselineProfiles: z.array(z.string()).optional(),
        /** Allow snapshot creation */
        allowSnapshotCreate: z.boolean().default(false),
    }).optional(),
});

export type ConfigBackupBackendConfig = z.infer<typeof ConfigBackupBackendConfigSchema>;

/**
 * Input schema for creating/updating backend config.
 */
export const BackendConfigUpdateSchema = BaseBackendConfigSchema.omit({
    id: true,
    updatedAt: true,
}).partial();

export type BackendConfigUpdate = z.infer<typeof BackendConfigUpdateSchema>;

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Tool with its definition and current settings.
 */
export interface McpToolWithSetting {
    /** Tool definition from registry */
    definition: {
        name: string;
        description: string;
        category: string;
        inputSchema: Record<string, unknown>;
    };
    /** Current settings (merged with defaults) */
    setting: McpToolSetting;
}

/**
 * Response for listing all tools with settings.
 */
export interface McpToolsListResponse {
    tools: McpToolWithSetting[];
    categories: string[];
    totalCount: number;
}

/**
 * Response for listing all backend configurations.
 */
export interface BackendConfigsListResponse {
    backends: BackendConfig[];
    backendTypes: string[];
    totalCount: number;
}

// =============================================================================
// Audit Log Types
// =============================================================================

/**
 * Audit log entry for settings changes.
 */
export interface McpSettingsAuditLog {
    id: string;
    timestamp: string;
    userId: string;
    action: 'create' | 'update' | 'delete';
    entityType: 'tool_setting' | 'backend_config';
    entityId: string;
    changes: {
        field: string;
        oldValue: unknown;
        newValue: unknown;
    }[];
    ipAddress?: string;
    userAgent?: string;
}

// =============================================================================
// Default Settings
// =============================================================================

/**
 * Default settings for tools that don't have explicit configuration.
 */
export const DEFAULT_TOOL_SETTINGS: Partial<McpToolSetting> = {
    enabled: true,
    defaultEnabledForMcpClients: true,
    maxTimeRange: '24h',
    maxRows: 1000,
    modeAllowed: ['inspect', 'plan'], // 'apply' disabled by default for ATTT safety
};

/**
 * Tool-specific default overrides.
 */
export const TOOL_SPECIFIC_DEFAULTS: Record<string, Partial<McpToolSetting>> = {
    // Log/Search tools - stricter limits
    'net.fw_log_search': { maxRows: 500, maxTimeRange: '24h' },
    'log.syslog_search': { maxRows: 200, maxTimeRange: '24h' },
    'sec.siem_search': { maxRows: 1000, maxTimeRange: '7d' },
    'sec.incident_timeline': { maxRows: 500, maxTimeRange: '7d' },
    'sec.alerts_triage': { maxRows: 200, maxTimeRange: '24h' },

    // Config tools - no apply by default
    'net.config_backup': { modeAllowed: ['create_snapshot', 'list_snapshots'] },
    'net.config_diff': { modeAllowed: ['inspect'] },
    'net.config_baseline_check': { modeAllowed: ['inspect'] },

    // NAC tools - suggest only, no apply
    'net.nac_manage': { modeAllowed: ['inspect', 'plan'] },
    'net.nac_query': { modeAllowed: ['inspect'] },
    'net.nac_policy_suggest': { modeAllowed: ['plan'] },

    // MikroTik - read-only by default
    'net.mikrotik_api': { modeAllowed: ['get_config', 'inspect'] },
    'net.dhcp_dns_manage': { modeAllowed: ['inspect', 'plan'] },
};
