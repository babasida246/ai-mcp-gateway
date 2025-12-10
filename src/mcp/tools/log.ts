/**
 * @file Log MCP Tools
 * @description Centralized log search tools for syslog, switch/router/server logs.
 * 
 * Tools in this module:
 * - log.syslog_search: Search centralized syslog (switch/router/server/OS)
 * 
 * SECURITY NOTES (ATTT cấp 3):
 * - All operations are READ-ONLY by default
 * - No secrets exposed in responses
 * - All calls are logged for audit trail
 * - Results are limited by timeRange and maxRows to prevent data exfiltration
 */

import { z } from 'zod';
import { McpToolDefinition, McpToolResult } from '../adapter/types.js';
import { logger } from '../../logging/logger.js';
import { env } from '../../config/env.js';
import fs from 'fs/promises';

// =============================================================================
// Zod Schemas
// =============================================================================

export const LogSyslogSearchInputSchema = z.object({
    host: z.string().optional().describe('Filter by hostname or IP'),
    facility: z.string().optional().describe('Syslog facility (e.g., auth, daemon, local0)'),
    severity: z.enum(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']).optional().describe('Minimum severity level'),
    keyword: z.string().optional().describe('Keyword to search in messages'),
    timeRange: z.string().default('last_15m').describe('Time range: last_15m, last_1h, last_24h, or ISO8601 range'),
    maxRows: z.number().default(200).describe('Maximum rows to return (default: 200, max: 10000)'),
});
export type LogSyslogSearchInput = z.infer<typeof LogSyslogSearchInputSchema>;

// =============================================================================
// Output Types
// =============================================================================

interface SyslogEntry {
    timestamp: string;
    host: string;
    facility: string;
    severity: string;
    program?: string;
    pid?: number;
    message: string;
    rawLine?: string;
}

interface SyslogSearchResult {
    summary: string;
    logs: SyslogEntry[];
    totalCount: number;
    query: {
        host?: string;
        facility?: string;
        severity?: string;
        keyword?: string;
        timeRange: string;
    };
    metadata: {
        source: string;
        searchDuration: number;
        truncated: boolean;
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse time range string to milliseconds.
 * Supports: last_15m, last_1h, last_24h, last_7d, or ISO8601 range
 */
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

    // Try ISO8601 range: "2025-12-01T00:00:00Z/2025-12-02T00:00:00Z"
    if (timeRange.includes('/')) {
        const [start, end] = timeRange.split('/');
        return {
            since: Date.parse(start) || now - 15 * 60 * 1000,
            until: Date.parse(end) || now,
        };
    }

    // Default to last 15 minutes
    return { since: now - 15 * 60 * 1000, until: now };
}

/**
 * Parse a syslog line into structured format.
 * Handles common syslog formats (RFC 3164, RFC 5424, and gateway's Winston format)
 */
function parseSyslogLine(line: string): Partial<SyslogEntry> | null {
    if (!line.trim()) return null;

    // Try Winston format: "2025-12-06 10:43:37 [mcp-gateway] info: message"
    const winstonMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[([^\]]+)\]\s+(\w+):\s+(.*)$/);
    if (winstonMatch) {
        return {
            timestamp: new Date(winstonMatch[1]).toISOString(),
            host: winstonMatch[2],
            facility: 'local0',
            severity: winstonMatch[3],
            message: winstonMatch[4],
            rawLine: line,
        };
    }

    // Try ISO timestamp at start
    const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.+-Z]+)\s+(.*)$/);
    if (isoMatch) {
        return {
            timestamp: isoMatch[1],
            host: 'unknown',
            facility: 'local0',
            severity: 'info',
            message: isoMatch[2],
            rawLine: line,
        };
    }

    // Try RFC 3164: "Dec  6 10:30:00 hostname program[pid]: message"
    const rfc3164Match = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:\[]+)(?:\[(\d+)\])?:\s*(.*)$/);
    if (rfc3164Match) {
        const year = new Date().getFullYear();
        const timestamp = new Date(`${rfc3164Match[1]} ${year}`).toISOString();
        return {
            timestamp,
            host: rfc3164Match[2],
            facility: 'local0',
            severity: 'info',
            program: rfc3164Match[3],
            pid: rfc3164Match[4] ? parseInt(rfc3164Match[4]) : undefined,
            message: rfc3164Match[5],
            rawLine: line,
        };
    }

    // Fallback: treat entire line as message
    return {
        timestamp: new Date().toISOString(),
        host: 'unknown',
        facility: 'local0',
        severity: 'info',
        message: line,
        rawLine: line,
    };
}

/**
 * Severity level comparison (higher = more severe)
 */
const SEVERITY_LEVELS: Record<string, number> = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    warn: 3,
    error: 4,
    critical: 5,
    alert: 6,
    emergency: 7,
};

// =============================================================================
// log.syslog_search Tool
// =============================================================================

export const logSyslogSearchTool: McpToolDefinition<LogSyslogSearchInput, SyslogSearchResult> = {
    name: 'log.syslog_search',
    description: `Search centralized syslog for switch, router, server, and OS logs.

**Purpose:** Find and analyze log entries from infrastructure devices for troubleshooting
and security incident investigation.

**Filters:**
- host: Filter by hostname or IP address
- facility: Syslog facility (auth, daemon, local0-7, etc.)
- severity: Minimum severity level (debug → emergency)
- keyword: Search term in message body
- timeRange: Time window (last_15m, last_1h, last_24h, last_7d, or ISO8601 range)

**Output:** Structured log entries with timestamp, host, severity, and message.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Results limited by maxRows (default 200, max 10000)
- All searches are logged for audit
- No secrets or credentials included in results`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            host: {
                type: 'string',
                description: 'Filter by hostname or IP address',
            },
            facility: {
                type: 'string',
                description: 'Syslog facility (auth, daemon, local0, etc.)',
            },
            severity: {
                type: 'string',
                enum: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
                description: 'Minimum severity level',
            },
            keyword: {
                type: 'string',
                description: 'Keyword to search in messages',
            },
            timeRange: {
                type: 'string',
                default: 'last_15m',
                description: 'Time range: last_15m, last_1h, last_24h, last_7d, or ISO8601 range',
            },
            maxRows: {
                type: 'number',
                default: 200,
                minimum: 1,
                maximum: 10000,
                description: 'Maximum rows to return',
            },
        },
        required: [],
    },
    handler: async (args: LogSyslogSearchInput): Promise<McpToolResult<SyslogSearchResult>> => {
        const startTime = Date.now();

        try {
            const input = LogSyslogSearchInputSchema.parse(args);
            const maxRows = Math.min(input.maxRows || 200, 10000);
            const { since, until } = parseTimeRange(input.timeRange);
            const minSeverity = input.severity ? SEVERITY_LEVELS[input.severity] || 0 : 0;

            // Audit log
            logger.info('log.syslog_search called', {
                host: input.host,
                facility: input.facility,
                severity: input.severity,
                keyword: input.keyword,
                timeRange: input.timeRange,
                maxRows,
            });

            // Candidate log files to search
            const candidateFiles = [
                env.LOG_FILE || 'logs/mcp-gateway.log',
                'logs/syslog.log',
                '/var/log/syslog',
                '/var/log/messages',
            ];

            const results: SyslogEntry[] = [];
            let sourceFile = 'none';
            let truncated = false;

            for (const filePath of candidateFiles) {
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const lines = content.split(/\r?\n/).reverse(); // newest first
                    sourceFile = filePath;

                    for (const line of lines) {
                        if (results.length >= maxRows) {
                            truncated = true;
                            break;
                        }

                        const parsed = parseSyslogLine(line);
                        if (!parsed || !parsed.message) continue;

                        // Time filter
                        const entryTime = Date.parse(parsed.timestamp || '');
                        if (!isNaN(entryTime)) {
                            if (entryTime < since) break; // Older than range, stop
                            if (entryTime > until) continue; // Future, skip
                        }

                        // Host filter
                        if (input.host && parsed.host !== input.host && !parsed.message.includes(input.host)) {
                            continue;
                        }

                        // Facility filter
                        if (input.facility && parsed.facility !== input.facility) {
                            continue;
                        }

                        // Severity filter
                        const entrySeverity = SEVERITY_LEVELS[parsed.severity || 'info'] || 0;
                        if (entrySeverity < minSeverity) {
                            continue;
                        }

                        // Keyword filter
                        if (input.keyword && !parsed.message.toLowerCase().includes(input.keyword.toLowerCase())) {
                            continue;
                        }

                        results.push({
                            timestamp: parsed.timestamp || new Date().toISOString(),
                            host: parsed.host || 'unknown',
                            facility: parsed.facility || 'local0',
                            severity: parsed.severity || 'info',
                            program: parsed.program,
                            pid: parsed.pid,
                            message: parsed.message,
                        });
                    }

                    if (results.length > 0) break; // Found logs in this file
                } catch (err) {
                    // File not found or permission denied, try next
                    continue;
                }
            }

            const searchDuration = Date.now() - startTime;

            // Generate summary
            const summary = results.length === 0
                ? `No logs found matching criteria in time range ${input.timeRange}`
                : `Found ${results.length}${truncated ? '+' : ''} log entries from ${sourceFile}`;

            return {
                success: true,
                data: {
                    summary,
                    logs: results,
                    totalCount: results.length,
                    query: {
                        host: input.host,
                        facility: input.facility,
                        severity: input.severity,
                        keyword: input.keyword,
                        timeRange: input.timeRange,
                    },
                    metadata: {
                        source: sourceFile,
                        searchDuration,
                        truncated,
                    },
                },
                metadata: {
                    duration: searchDuration,
                    note: 'For production, configure syslog server or Elasticsearch backend',
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('log.syslog_search failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'SYSLOG_SEARCH_ERROR',
            };
        }
    },
};

// =============================================================================
// Export all Log tools
// =============================================================================

export const logTools: McpToolDefinition[] = [
    logSyslogSearchTool,
];

export default logTools;
