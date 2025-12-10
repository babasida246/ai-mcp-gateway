/**
 * @file Security MCP Tools
 * @description SIEM and security analytics tools for incident investigation.
 * 
 * Tools in this module:
 * - sec.siem_search: Search SIEM for security events
 * - sec.incident_timeline: Build timeline for IP/MAC/user
 * - sec.alerts_triage: Aggregate and prioritize alerts
 * 
 * SECURITY NOTES (ATTT cấp 3):
 * - All operations are READ-ONLY
 * - No secrets exposed in responses
 * - All calls are logged for audit trail
 * - Results are limited by timeRange and maxRows
 * - Source data is aggregated, never raw credentials
 */

import { z } from 'zod';
import { McpToolDefinition, McpToolResult } from '../adapter/types.js';
import { logger } from '../../logging/logger.js';
import { env } from '../../config/env.js';
import fs from 'fs/promises';

// =============================================================================
// Zod Schemas
// =============================================================================

export const SecSiemSearchInputSchema = z.object({
    ip: z.string().optional().describe('IP address to search'),
    user: z.string().optional().describe('Username to search'),
    mac: z.string().optional().describe('MAC address to search'),
    eventType: z.enum(['intrusion', 'auth_failure', 'malware', 'policy_violation', 'anomaly', 'all']).optional().describe('Event type filter'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Minimum severity level'),
    timeRange: z.string().default('last_1h').describe('Time range: last_15m, last_1h, last_24h, last_7d, or ISO8601'),
    maxRows: z.number().default(100).describe('Maximum rows to return'),
});
export type SecSiemSearchInput = z.infer<typeof SecSiemSearchInputSchema>;

export const SecIncidentTimelineInputSchema = z.object({
    principal: z.string().describe('IP address, MAC address, or username to investigate'),
    timeRange: z.string().default('last_24h').describe('Time range for timeline'),
    sources: z.array(z.enum(['siem', 'syslog', 'firewall', 'nac', 'all'])).default(['all']).describe('Data sources to query'),
});
export type SecIncidentTimelineInput = z.infer<typeof SecIncidentTimelineInputSchema>;

export const SecAlertsTriageInputSchema = z.object({
    sources: z.array(z.enum(['siem', 'syslog', 'firewall', 'nac'])).default(['siem', 'firewall']).describe('Alert sources'),
    timeRange: z.string().default('last_1h').describe('Time range for alerts'),
    onlyHighSeverity: z.boolean().default(false).describe('Only return high/critical alerts'),
    groupBy: z.enum(['host', 'type', 'severity', 'source']).default('host').describe('Group alerts by'),
});
export type SecAlertsTriageInput = z.infer<typeof SecAlertsTriageInputSchema>;

// =============================================================================
// Output Types
// =============================================================================

interface SiemEvent {
    timestamp: string;
    source: string;
    eventType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    srcIp?: string;
    dstIp?: string;
    user?: string;
    mac?: string;
    description: string;
    rawEvent?: string;
    ruleId?: string;
    ruleName?: string;
}

interface SiemSearchResult {
    summary: string;
    events: SiemEvent[];
    totalCount: number;
    query: {
        ip?: string;
        user?: string;
        mac?: string;
        eventType?: string;
        severity?: string;
        timeRange: string;
    };
}

interface TimelineEvent {
    timestamp: string;
    source: string;
    eventType: string;
    severity: string;
    description: string;
    details?: Record<string, unknown>;
}

interface IncidentTimelineResult {
    summary: string;
    principal: string;
    timeline: TimelineEvent[];
    firstSeen?: string;
    lastSeen?: string;
    eventCount: number;
    riskScore?: number;
    relatedEntities?: {
        ips: string[];
        macs: string[];
        users: string[];
    };
}

interface AlertGroup {
    groupKey: string;
    alertCount: number;
    severityBreakdown: Record<string, number>;
    alerts: SiemEvent[];
    suggestedPriority: 'P1' | 'P2' | 'P3' | 'P4';
    recommendation?: string;
}

interface AlertsTriageResult {
    summary: string;
    totalAlerts: number;
    groups: AlertGroup[];
    topPriority: AlertGroup[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseTimeRange(timeRange: string): { since: number; until: number } {
    const now = Date.now();
    const patterns: Record<string, number> = {
        'last_5m': 5 * 60 * 1000,
        'last_15m': 15 * 60 * 1000,
        'last_30m': 30 * 60 * 1000,
        'last_1h': 60 * 60 * 1000,
        'last_6h': 6 * 60 * 60 * 1000,
        'last_12h': 12 * 60 * 60 * 1000,
        'last_24h': 24 * 60 * 60 * 1000,
        'last_7d': 7 * 24 * 60 * 60 * 1000,
    };

    if (patterns[timeRange]) {
        return { since: now - patterns[timeRange], until: now };
    }

    if (timeRange.includes('/')) {
        const [start, end] = timeRange.split('/');
        return {
            since: Date.parse(start) || now - 60 * 60 * 1000,
            until: Date.parse(end) || now,
        };
    }

    return { since: now - 60 * 60 * 1000, until: now };
}

const SEVERITY_ORDER: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};

/**
 * Generate mock SIEM events for demonstration.
 * In production, replace with actual SIEM API calls (ELK, Wazuh, FortiAnalyzer, etc.)
 */
function generateMockSiemEvents(input: SecSiemSearchInput): SiemEvent[] {
    // TODO: Replace with actual SIEM backend integration
    // This is a placeholder that returns sample data for development/testing

    const mockEvents: SiemEvent[] = [
        {
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            source: 'FortiAnalyzer',
            eventType: 'intrusion',
            severity: 'high',
            srcIp: input.ip || '192.168.1.100',
            dstIp: '10.0.0.50',
            description: '[MOCK] IPS detected potential SQL injection attempt',
            ruleId: 'IPS-SQL-001',
            ruleName: 'SQL Injection Attack',
        },
        {
            timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            source: 'Wazuh',
            eventType: 'auth_failure',
            severity: 'medium',
            srcIp: input.ip || '192.168.1.100',
            user: input.user || 'admin',
            description: '[MOCK] Multiple failed SSH login attempts detected',
            ruleId: 'AUTH-SSH-003',
            ruleName: 'Brute Force Detection',
        },
        {
            timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            source: 'FortiGate',
            eventType: 'policy_violation',
            severity: 'low',
            srcIp: input.ip || '192.168.1.100',
            dstIp: '8.8.8.8',
            description: '[MOCK] Outbound DNS query to external resolver blocked by policy',
            ruleId: 'FW-DNS-001',
            ruleName: 'External DNS Block',
        },
    ];

    // Filter by severity if specified
    if (input.severity) {
        const minSeverity = SEVERITY_ORDER[input.severity] || 0;
        return mockEvents.filter(e => (SEVERITY_ORDER[e.severity] || 0) >= minSeverity);
    }

    // Filter by event type if specified
    if (input.eventType && input.eventType !== 'all') {
        return mockEvents.filter(e => e.eventType === input.eventType);
    }

    return mockEvents;
}

// =============================================================================
// sec.siem_search Tool
// =============================================================================

export const secSiemSearchTool: McpToolDefinition<SecSiemSearchInput, SiemSearchResult> = {
    name: 'sec.siem_search',
    description: `Search SIEM for security events and alerts.

**Purpose:** Query security information and event management system for threat detection,
incident investigation, and compliance monitoring.

**Filters:**
- ip: Source or destination IP address
- user: Username involved in the event
- mac: MAC address
- eventType: intrusion, auth_failure, malware, policy_violation, anomaly
- severity: low, medium, high, critical
- timeRange: Time window for search

**Output:** Structured security events with severity, source, and description.

**Supported Backends (TODO):**
- ELK/Elasticsearch
- Wazuh
- FortiAnalyzer
- Graylog

**Security Notes (ATTT cấp 3):**
- Read-only operation
- All searches logged for audit
- No raw credentials in output
- Results limited by maxRows`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            ip: {
                type: 'string',
                description: 'IP address to search (source or destination)',
            },
            user: {
                type: 'string',
                description: 'Username to search',
            },
            mac: {
                type: 'string',
                description: 'MAC address to search',
            },
            eventType: {
                type: 'string',
                enum: ['intrusion', 'auth_failure', 'malware', 'policy_violation', 'anomaly', 'all'],
                description: 'Event type filter',
            },
            severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Minimum severity level',
            },
            timeRange: {
                type: 'string',
                default: 'last_1h',
                description: 'Time range: last_15m, last_1h, last_24h, last_7d',
            },
            maxRows: {
                type: 'number',
                default: 100,
                minimum: 1,
                maximum: 1000,
                description: 'Maximum rows to return',
            },
        },
        required: [],
    },
    handler: async (args: SecSiemSearchInput): Promise<McpToolResult<SiemSearchResult>> => {
        try {
            const input = SecSiemSearchInputSchema.parse(args);
            const maxRows = Math.min(input.maxRows || 100, 1000);

            // Audit log
            logger.info('sec.siem_search called', {
                ip: input.ip,
                user: input.user,
                eventType: input.eventType,
                severity: input.severity,
                timeRange: input.timeRange,
            });

            // TODO: Replace with actual SIEM backend
            const events = generateMockSiemEvents(input).slice(0, maxRows);

            const summary = events.length === 0
                ? 'No security events found matching criteria'
                : `Found ${events.length} security events (${events.filter(e => e.severity === 'critical' || e.severity === 'high').length} high/critical)`;

            return {
                success: true,
                data: {
                    summary,
                    events,
                    totalCount: events.length,
                    query: {
                        ip: input.ip,
                        user: input.user,
                        mac: input.mac,
                        eventType: input.eventType,
                        severity: input.severity,
                        timeRange: input.timeRange,
                    },
                },
                metadata: {
                    note: 'SIEM backend integration pending - returning mock data',
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('sec.siem_search failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'SIEM_SEARCH_ERROR',
            };
        }
    },
};

// =============================================================================
// sec.incident_timeline Tool
// =============================================================================

export const secIncidentTimelineTool: McpToolDefinition<SecIncidentTimelineInput, IncidentTimelineResult> = {
    name: 'sec.incident_timeline',
    description: `Build an incident timeline for a specific IP, MAC, or user.

**Purpose:** Aggregate events from multiple sources to create a chronological view
of activities for incident investigation and forensics.

**Data Sources:**
- SIEM security events
- Syslog entries
- Firewall logs
- NAC status changes

**Input:**
- principal: The IP address, MAC address, or username to investigate
- timeRange: Time window for the timeline
- sources: Which data sources to query

**Output:** Chronological timeline with events from all sources, risk assessment,
and related entities discovered during the investigation.

**Security Notes (ATTT cấp 3):**
- Read-only aggregation
- Cross-references multiple systems
- All queries logged for audit
- Useful for SOC analysts and incident response`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            principal: {
                type: 'string',
                description: 'IP address, MAC address, or username to investigate',
            },
            timeRange: {
                type: 'string',
                default: 'last_24h',
                description: 'Time range for timeline',
            },
            sources: {
                type: 'array',
                items: { type: 'string', enum: ['siem', 'syslog', 'firewall', 'nac', 'all'] },
                default: ['all'],
                description: 'Data sources to query',
            },
        },
        required: ['principal'],
    },
    handler: async (args: SecIncidentTimelineInput): Promise<McpToolResult<IncidentTimelineResult>> => {
        try {
            const input = SecIncidentTimelineInputSchema.parse(args);

            // Audit log
            logger.info('sec.incident_timeline called', {
                principal: input.principal,
                timeRange: input.timeRange,
                sources: input.sources,
            });

            // TODO: Implement actual backend aggregation
            // In production, this should:
            // 1. Query SIEM for events related to principal
            // 2. Query syslog for log entries
            // 3. Query firewall for traffic logs
            // 4. Query NAC for status changes
            // 5. Merge and sort by timestamp

            const mockTimeline: TimelineEvent[] = [
                {
                    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                    source: 'NAC',
                    eventType: 'device_connected',
                    severity: 'info',
                    description: `[MOCK] Device ${input.principal} connected to port Gi0/1 on SW-CORE-01`,
                    details: { vlan: 100, port: 'Gi0/1', switch: 'SW-CORE-01' },
                },
                {
                    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                    source: 'DHCP',
                    eventType: 'lease_assigned',
                    severity: 'info',
                    description: `[MOCK] DHCP lease assigned to ${input.principal}`,
                    details: { ip: '192.168.1.150', leaseTime: 86400 },
                },
                {
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    source: 'Firewall',
                    eventType: 'connection_allowed',
                    severity: 'info',
                    description: `[MOCK] Outbound HTTPS traffic from ${input.principal} to 142.250.190.78 (google.com)`,
                    details: { protocol: 'TCP', dstPort: 443 },
                },
                {
                    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                    source: 'SIEM',
                    eventType: 'anomaly',
                    severity: 'medium',
                    description: `[MOCK] Unusual data transfer volume detected from ${input.principal}`,
                    details: { bytesOut: 1073741824, threshold: 536870912 },
                },
                {
                    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                    source: 'Firewall',
                    eventType: 'connection_blocked',
                    severity: 'high',
                    description: `[MOCK] Outbound connection to known C2 server blocked`,
                    details: { dstIp: '45.33.32.156', threat: 'C2 Communication' },
                },
            ];

            const riskScore = mockTimeline.filter(e => e.severity === 'high' || e.severity === 'critical').length * 30 +
                mockTimeline.filter(e => e.severity === 'medium').length * 10;

            return {
                success: true,
                data: {
                    summary: `Timeline for ${input.principal}: ${mockTimeline.length} events, risk score ${riskScore}/100`,
                    principal: input.principal,
                    timeline: mockTimeline,
                    firstSeen: mockTimeline[0]?.timestamp,
                    lastSeen: mockTimeline[mockTimeline.length - 1]?.timestamp,
                    eventCount: mockTimeline.length,
                    riskScore: Math.min(riskScore, 100),
                    relatedEntities: {
                        ips: ['192.168.1.150', '10.0.0.1'],
                        macs: [input.principal.includes(':') ? input.principal : 'AA:BB:CC:DD:EE:FF'],
                        users: [],
                    },
                },
                metadata: {
                    note: 'Backend integration pending - returning mock timeline',
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('sec.incident_timeline failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'INCIDENT_TIMELINE_ERROR',
            };
        }
    },
};

// =============================================================================
// sec.alerts_triage Tool
// =============================================================================

export const secAlertsTriageTool: McpToolDefinition<SecAlertsTriageInput, AlertsTriageResult> = {
    name: 'sec.alerts_triage',
    description: `Aggregate and prioritize security alerts from multiple sources.

**Purpose:** Help SOC analysts quickly identify and prioritize alerts that need
immediate attention by grouping and scoring alerts from various security tools.

**Features:**
- Aggregate alerts from SIEM, syslog, firewall, NAC
- Group by host, type, severity, or source
- Calculate priority scores (P1-P4)
- Suggest triage actions

**Grouping Options:**
- host: Group by affected host/IP
- type: Group by event type
- severity: Group by severity level
- source: Group by data source

**Output:** Grouped alerts with priority scoring and recommendations.

**Security Notes (ATTT cấp 3):**
- Read-only aggregation
- Designed for SOC workflow
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            sources: {
                type: 'array',
                items: { type: 'string', enum: ['siem', 'syslog', 'firewall', 'nac'] },
                default: ['siem', 'firewall'],
                description: 'Alert sources to query',
            },
            timeRange: {
                type: 'string',
                default: 'last_1h',
                description: 'Time range for alerts',
            },
            onlyHighSeverity: {
                type: 'boolean',
                default: false,
                description: 'Only return high/critical alerts',
            },
            groupBy: {
                type: 'string',
                enum: ['host', 'type', 'severity', 'source'],
                default: 'host',
                description: 'How to group alerts',
            },
        },
        required: [],
    },
    handler: async (args: SecAlertsTriageInput): Promise<McpToolResult<AlertsTriageResult>> => {
        try {
            const input = SecAlertsTriageInputSchema.parse(args);

            // Audit log
            logger.info('sec.alerts_triage called', {
                sources: input.sources,
                timeRange: input.timeRange,
                onlyHighSeverity: input.onlyHighSeverity,
                groupBy: input.groupBy,
            });

            // TODO: Implement actual backend aggregation
            // In production, query each source and aggregate results

            const mockGroups: AlertGroup[] = [
                {
                    groupKey: '192.168.1.100',
                    alertCount: 5,
                    severityBreakdown: { critical: 1, high: 2, medium: 2 },
                    alerts: [
                        {
                            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                            source: 'SIEM',
                            eventType: 'intrusion',
                            severity: 'critical',
                            srcIp: '192.168.1.100',
                            description: '[MOCK] Possible ransomware activity detected',
                        },
                    ],
                    suggestedPriority: 'P1',
                    recommendation: 'Immediate investigation required. Consider isolating host.',
                },
                {
                    groupKey: '10.0.0.50',
                    alertCount: 3,
                    severityBreakdown: { high: 1, medium: 2 },
                    alerts: [
                        {
                            timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
                            source: 'Firewall',
                            eventType: 'policy_violation',
                            severity: 'high',
                            srcIp: '10.0.0.50',
                            description: '[MOCK] Server attempting outbound connection to blacklisted IP',
                        },
                    ],
                    suggestedPriority: 'P2',
                    recommendation: 'Review server configuration and outbound rules.',
                },
                {
                    groupKey: 'Auth-Failures',
                    alertCount: 15,
                    severityBreakdown: { medium: 10, low: 5 },
                    alerts: [
                        {
                            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                            source: 'Syslog',
                            eventType: 'auth_failure',
                            severity: 'medium',
                            user: 'admin',
                            description: '[MOCK] Multiple failed SSH login attempts from various IPs',
                        },
                    ],
                    suggestedPriority: 'P3',
                    recommendation: 'Review SSH access logs and consider fail2ban rules.',
                },
            ];

            // Filter by severity if requested
            let filteredGroups = mockGroups;
            if (input.onlyHighSeverity) {
                filteredGroups = mockGroups.filter(g =>
                    (g.severityBreakdown.critical || 0) > 0 ||
                    (g.severityBreakdown.high || 0) > 0
                );
            }

            const totalAlerts = filteredGroups.reduce((sum, g) => sum + g.alertCount, 0);
            const topPriority = filteredGroups.filter(g => g.suggestedPriority === 'P1' || g.suggestedPriority === 'P2');

            return {
                success: true,
                data: {
                    summary: `${totalAlerts} alerts in ${filteredGroups.length} groups. ${topPriority.length} groups need immediate attention (P1/P2).`,
                    totalAlerts,
                    groups: filteredGroups,
                    topPriority,
                },
                metadata: {
                    note: 'Backend integration pending - returning mock triage data',
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('sec.alerts_triage failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'ALERTS_TRIAGE_ERROR',
            };
        }
    },
};

// =============================================================================
// Export all Security tools
// =============================================================================

export const securityTools: McpToolDefinition[] = [
    secSiemSearchTool,
    secIncidentTimelineTool,
    secAlertsTriageTool,
];

export default securityTools;
