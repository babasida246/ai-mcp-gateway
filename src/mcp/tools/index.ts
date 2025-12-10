/**
 * @file MCP Tools Index
 * @description Central export for all MCP tool modules.
 * 
 * This module exports:
 * - All tool definitions grouped by category
 * - Tool registry with all tools registered
 * - Helper functions for tool management
 */

import { mcpRegistry, McpToolRegistry } from './registry.js';
import { aiTools } from './ai.js';
import { networkTools } from './net.js';
import { opsTools } from './ops.js';
import { logTools } from './log.js';
import { securityTools } from './sec.js';
import { McpToolDefinition } from '../adapter/types.js';

// =============================================================================
// Register all tools
// =============================================================================

/**
 * Initialize the MCP tool registry with all available tools.
 * This should be called once at application startup.
 */
export function initializeToolRegistry(): void {
    // Clear any existing registrations
    mcpRegistry.clear();

    // Register AI tools
    mcpRegistry.registerMany(aiTools);

    // Register Network tools
    mcpRegistry.registerMany(networkTools);

    // Register Ops tools
    mcpRegistry.registerMany(opsTools);

    // Register Log tools
    mcpRegistry.registerMany(logTools);

    // Register Security tools
    mcpRegistry.registerMany(securityTools);
}

/**
 * Get all registered tools.
 */
export function getAllTools(): McpToolDefinition[] {
    return [
        ...aiTools,
        ...networkTools,
        ...opsTools,
        ...logTools,
        ...securityTools,
    ];
}

/**
 * Get tools by category.
 */
export function getToolsByCategory(category: 'ai' | 'network' | 'ops' | 'log' | 'security'): McpToolDefinition[] {
    switch (category) {
        case 'ai':
            return aiTools;
        case 'network':
            return networkTools;
        case 'ops':
            return opsTools;
        case 'log':
            return logTools;
        case 'security':
            return securityTools;
        default:
            return [];
    }
}

// =============================================================================
// Exports
// =============================================================================

// Export registry
export { mcpRegistry, McpToolRegistry };

// Export tool arrays
export { aiTools } from './ai.js';
export { networkTools } from './net.js';
export { opsTools } from './ops.js';
export { logTools } from './log.js';
export { securityTools } from './sec.js';

// Export individual tools for direct import
export {
    aiChatRouterTool,
    aiCodeAgentTool,
} from './ai.js';

export {
    netFwLogSearchTool,
    netTopologyScanTool,
    netMikrotikApiTool,
    netDhcpDnsManageTool,
    netNacManageTool,
} from './net.js';

export {
    opsCostReportTool,
    opsTraceSessionTool,
} from './ops.js';

export {
    logSyslogSearchTool,
} from './log.js';

export {
    secSiemSearchTool,
    secIncidentTimelineTool,
    secAlertTriageTool,
} from './sec.js';

// =============================================================================
// Tool Summary
// =============================================================================

/**
 * Summary of all available MCP tools.
 */
export const toolSummary = {
    ai: {
        description: 'AI-powered chat and code generation tools',
        tools: [
            { name: 'ai.chat_router', description: 'Route chat requests through N-layer model system' },
            { name: 'ai.code_agent', description: 'Execute coding tasks with multi-model orchestration' },
        ],
    },
    network: {
        description: 'Network infrastructure and security management (ATTT cấp 3)',
        tools: [
            { name: 'net.fw_log_search', description: 'Search firewall/router logs' },
            { name: 'net.topology_scan', description: 'Get network topology snapshot or trigger scan' },
            { name: 'net.mikrotik_api', description: 'Interact with MikroTik RouterOS devices' },
            { name: 'net.dhcp_dns_manage', description: 'Manage DHCP/DNS configurations' },
            { name: 'net.nac_manage', description: 'Network Access Control operations' },
            { name: 'net.asset_inventory', description: 'Query device inventory from CMDB' },
            { name: 'net.nms_inventory', description: 'Get NMS device list from NetBox/LibreNMS' },
            { name: 'net.port_inspect', description: 'Inspect port details and connected devices' },
            { name: 'net.vlan_map', description: 'Map VLAN/subnet to zone/department' },
            { name: 'net.config_backup', description: 'Create/list device config snapshots' },
            { name: 'net.config_diff', description: 'Compare config snapshots for changes' },
            { name: 'net.config_baseline_check', description: 'Check config against ATTT baseline' },
            { name: 'net.nac_query', description: 'Query NAC device status (read-only)' },
            { name: 'net.nac_policy_suggest', description: 'Suggest NAC policy adjustments' },
        ],
    },
    ops: {
        description: 'Operations, monitoring, and analytics',
        tools: [
            { name: 'ops.cost_report', description: 'Get cost/token usage analytics' },
            { name: 'ops.trace_session', description: 'Trace and debug session lifecycle' },
        ],
    },
    log: {
        description: 'Centralized log management and search',
        tools: [
            { name: 'log.syslog_search', description: 'Search centralized syslog server' },
        ],
    },
    security: {
        description: 'SIEM and security incident analysis (ATTT cấp 3)',
        tools: [
            { name: 'sec.siem_search', description: 'Search SIEM events by IP/user/severity' },
            { name: 'sec.incident_timeline', description: 'Build incident timeline for investigation' },
            { name: 'sec.alerts_triage', description: 'Group and prioritize security alerts' },
        ],
    },
};

export default {
    mcpRegistry,
    initializeToolRegistry,
    getAllTools,
    getToolsByCategory,
    toolSummary,
};
