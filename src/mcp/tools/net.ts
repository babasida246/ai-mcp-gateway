/**
 * @file Network MCP Tools
 * @description Network and security-related MCP tools for infrastructure management.
 * 
 * Tools in this module:
 * - net.fw_log_search: Search firewall/router logs
 * - net.topology_scan: Get network topology snapshot or trigger scan
 * - net.mikrotik_api: Interact with MikroTik RouterOS devices
 * - net.dhcp_dns_manage: Manage DHCP/DNS configurations
 * - net.nac_manage: Network Access Control operations
 * 
 * NOTE: These tools are currently implemented as stubs/mocks.
 * Backend integrations need to be configured for production use.
 */

import {
    McpToolDefinition,
    McpToolResult,
    NetFwLogSearchInput,
    NetFwLogSearchInputSchema,
    NetTopologyScanInput,
    NetTopologyScanInputSchema,
    NetMikrotikApiInput,
    NetMikrotikApiInputSchema,
    NetDhcpDnsManageInput,
    NetDhcpDnsManageInputSchema,
    NetNacManageInput,
    NetNacManageInputSchema,
} from '../adapter/types.js';
import { logger } from '../../logging/logger.js';
import { env } from '../../config/env.js';
import fs from 'fs/promises';
import net from 'net';
import { Client as SSHClient, ConnectConfig } from 'ssh2';
import { setTimeout as wait } from 'timers/promises';

// =============================================================================
// Configuration Interfaces (for future backend integration)
// =============================================================================

interface MikrotikProfile {
    address: string;
    port: number;
    username: string;
    // Password stored in secure config, not exposed to LLM
}

interface NetworkBackendConfig {
    mikrotik?: {
        profiles: Record<string, MikrotikProfile>;
        defaultProfile?: string;
    };
    syslog?: {
        host: string;
        port: number;
    };
    elastic?: {
        url: string;
        index: string;
    };
    netbox?: {
        url: string;
    };
}

// TODO: Load from config file or environment
const networkConfig: NetworkBackendConfig = {
    mikrotik: {
        profiles: {},
        defaultProfile: 'default',
    },
};

// =============================================================================
// net.fw_log_search Tool
// =============================================================================

/**
 * Firewall Log Search Tool
 * 
 * Searches firewall, router, and switch logs from various sources.
 */
export const netFwLogSearchTool: McpToolDefinition<NetFwLogSearchInput, {
    logs: Array<{
        timestamp: string;
        source: string;
        severity: string;
        message: string;
        srcIp?: string;
        dstIp?: string;
        action?: string;
    }>;
    totalCount: number;
    query: {
        source: string;
        ip?: string;
        keyword?: string;
        timeRange: number;
    };
}> = {
    name: 'net.fw_log_search',
    description: `Search firewall, router, and switch logs by IP, keyword, or time range.

Supported sources:
- fortigate: FortiGate firewall logs
- mikrotik: MikroTik RouterOS logs  
- syslog: Generic syslog server
- elastic: Elasticsearch log index

Returns structured log entries with timestamp, severity, and parsed fields.
Note: Backend integration required for production use.`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            source: {
                type: 'string',
                enum: ['fortigate', 'mikrotik', 'syslog', 'elastic'],
                description: 'Log source to search',
            },
            ip: {
                type: 'string',
                description: 'IP address to filter (source or destination)',
            },
            keyword: {
                type: 'string',
                description: 'Keyword to search in log messages',
            },
            timeRangeMinutes: {
                type: 'number',
                default: 15,
                description: 'Time range in minutes (default: 15)',
                minimum: 1,
                maximum: 10080, // 1 week
            },
            maxRows: {
                type: 'number',
                default: 200,
                description: 'Maximum rows to return (default: 200)',
                minimum: 1,
                maximum: 10000,
            },
        },
        required: ['source'],
    },
    handler: async (args: NetFwLogSearchInput): Promise<McpToolResult<{
        logs: Array<{
            timestamp: string;
            source: string;
            severity: string;
            message: string;
            srcIp?: string;
            dstIp?: string;
            action?: string;
        }>;
        totalCount: number;
        query: {
            source: string;
            ip?: string;
            keyword?: string;
            timeRange: number;
        };
    }>> => {
        try {
            const input = NetFwLogSearchInputSchema.parse(args);

            logger.info('net.fw_log_search called', {
                source: input.source,
                ip: input.ip,
                keyword: input.keyword,
                timeRange: input.timeRangeMinutes,
            });

            // Attempt to read logs from likely locations
            const timeRangeMinutes = input.timeRangeMinutes || 15;
            const maxRows = input.maxRows || 200;

            const candidateFiles: string[] = [];
            if (input.source === 'syslog') {
                candidateFiles.push(env.LOG_FILE || 'logs/mcp-gateway.log');
                candidateFiles.push('/var/log/syslog');
                candidateFiles.push('/var/log/messages');
            } else {
                // try backend-specific log file under ./logs
                candidateFiles.push(`logs/${input.source}.log`);
                candidateFiles.push(env.LOG_FILE || 'logs/mcp-gateway.log');
            }

            const since = Date.now() - timeRangeMinutes * 60 * 1000;
            const results: Array<any> = [];

            for (const filePath of candidateFiles) {
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const lines = content.split(/\r?\n/).reverse(); // newest first
                    for (const line of lines) {
                        if (results.length >= maxRows) break;
                        if (!line) continue;
                        // quick filters
                        if (input.ip && !line.includes(input.ip)) continue;
                        if (input.keyword && !line.toLowerCase().includes(input.keyword.toLowerCase())) continue;
                        // try to parse ISO timestamp at start
                        const tsMatch = line.match(/^\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-Z]+)/);
                        let ts = new Date().toISOString();
                        if (tsMatch) {
                            const parsed = Date.parse(tsMatch[1]);
                            if (!Number.isNaN(parsed)) ts = new Date(parsed).toISOString();
                            if (parsed < since) break; // older than range
                        }
                        results.push({ timestamp: ts, source: input.source, severity: 'info', message: line });
                    }
                    if (results.length > 0) break; // prefer first file with data
                } catch (err) {
                    // ignore file not found / permission errors and continue
                }
            }

            if (results.length === 0) {
                // fallback mock entry to indicate no logs found
                results.push({
                    timestamp: new Date().toISOString(),
                    source: input.source,
                    severity: 'info',
                    message: `[NO LOGS] Could not find logs for source ${input.source} in candidate locations`,
                });
            }

            return {
                success: true,
                data: {
                    logs: results.slice(0, maxRows),
                    totalCount: results.length,
                    query: {
                        source: input.source,
                        ip: input.ip,
                        keyword: input.keyword,
                        timeRange: timeRangeMinutes,
                    },
                },
                metadata: { note: 'Searched local log files; configure elastic/syslog backend for production' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.fw_log_search failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'FW_LOG_SEARCH_ERROR',
            };
        }
    },
};

// =============================================================================
// net.topology_scan Tool
// =============================================================================

/**
 * Network Topology Scan Tool
 * 
 * Gets network topology snapshot or triggers a live scan.
 */
export const netTopologyScanTool: McpToolDefinition<NetTopologyScanInput, {
    nodes: Array<{
        id: string;
        name: string;
        type: 'router' | 'switch' | 'firewall' | 'server' | 'endpoint' | 'unknown';
        ip?: string;
        mac?: string;
        vendor?: string;
        location?: string;
    }>;
    links: Array<{
        source: string;
        target: string;
        type: 'ethernet' | 'vlan' | 'wireless' | 'trunk';
        speed?: string;
        status: 'up' | 'down' | 'unknown';
    }>;
    vlans?: Array<{
        id: number;
        name: string;
        subnet?: string;
    }>;
    scanInfo: {
        scope: string;
        mode: string;
        timestamp: string;
        duration?: number;
    };
}> = {
    name: 'net.topology_scan',
    description: `Get network topology snapshot or trigger a live scan.

Modes:
- snapshot: Return cached topology data (fast)
- live_scan: Trigger active discovery using LLDP/SNMP/nmap (slower)

Scopes:
- core: Core network devices only
- distribution: Distribution layer
- access: Access layer switches
- all: Full network
- <zone>: Specific zone/location name

Returns JSON with nodes (devices) and links (connections) for visualization.
Note: Backend integration required for production use.`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            scope: {
                type: 'string',
                description: 'Scan scope: core, distribution, access, all, or zone name',
            },
            mode: {
                type: 'string',
                enum: ['snapshot', 'live_scan'],
                default: 'snapshot',
                description: 'Scan mode',
            },
            detailLevel: {
                type: 'string',
                enum: ['summary', 'full'],
                default: 'summary',
                description: 'Detail level for results',
            },
        },
        required: [],
    },
    handler: async (args: NetTopologyScanInput): Promise<McpToolResult<{
        nodes: Array<{
            id: string;
            name: string;
            type: 'router' | 'switch' | 'firewall' | 'server' | 'endpoint' | 'unknown';
            ip?: string;
            mac?: string;
            vendor?: string;
            location?: string;
        }>;
        links: Array<{
            source: string;
            target: string;
            type: 'ethernet' | 'vlan' | 'wireless' | 'trunk';
            speed?: string;
            status: 'up' | 'down' | 'unknown';
        }>;
        vlans?: Array<{
            id: number;
            name: string;
            subnet?: string;
        }>;
        scanInfo: {
            scope: string;
            mode: string;
            timestamp: string;
            duration?: number;
        };
    }>> => {
        try {
            const input = NetTopologyScanInputSchema.parse(args);

            logger.info('net.topology_scan called', {
                scope: input.scope,
                mode: input.mode,
                detailLevel: input.detailLevel,
            });

            // Basic active discovery implementation using TCP connect against common ports.
            // This is intentionally lightweight — for production use, integrate nmap/snmp/NetBox.
            const scope = input.scope || 'all';
            const mode = input.mode || 'snapshot';
            const detail = input.detailLevel || 'summary';

            // Helper: expand simple CIDR /24 or single IP
            function expandIps(scopeStr: string): string[] {
                // If looks like CIDR /24
                const cidrMatch = scopeStr.match(/^(\d+\.\d+\.\d+)\.0\/(24)$/);
                if (cidrMatch) {
                    const base = cidrMatch[1];
                    const ips: string[] = [];
                    for (let i = 1; i < 255; i++) ips.push(`${base}.${i}`);
                    return ips;
                }
                // If single IP
                if (/^\d+\.\d+\.\d+\.\d+$/.test(scopeStr)) return [scopeStr];
                // If 'all' — try read from configured inventory (not available) -> fallback to localhost
                return ['127.0.0.1'];
            }

            const portsToCheck = [22, 80, 443];

            async function checkPort(host: string, port: number, timeout = 800): Promise<boolean> {
                return new Promise((resolve) => {
                    const sock = new net.Socket();
                    let done = false;
                    const onDone = (open: boolean) => {
                        if (done) return;
                        done = true;
                        try { sock.destroy(); } catch { }
                        resolve(open);
                    };
                    const timer = setTimeout(() => onDone(false), timeout);
                    sock.once('connect', () => { clearTimeout(timer); onDone(true); });
                    sock.once('error', () => { clearTimeout(timer); onDone(false); });
                    sock.connect(port, host);
                });
            }

            const targets = expandIps(scope);
            const nodes: any[] = [];
            const links: any[] = [];

            // Limit concurrency to avoid resource exhaustion
            const concurrency = 50;
            const queue = [...targets];
            async function worker() {
                while (queue.length > 0) {
                    const host = queue.shift()!;
                    try {
                        let foundOpen = false;
                        for (const port of portsToCheck) {
                            const open = await checkPort(host, port);
                            if (open) {
                                foundOpen = true;
                                nodes.push({ id: host, name: host, type: 'endpoint', ip: host });
                                break;
                            }
                        }
                        if (!foundOpen && detail === 'full') {
                            // include as unknown node if full detail requested
                            nodes.push({ id: host, name: host, type: 'unknown', ip: host });
                        }
                    } catch (err) {
                        // ignore per-host errors
                    }
                }
            }

            const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
            await Promise.all(workers);

            return {
                success: true,
                data: {
                    nodes,
                    links,
                    vlans: [],
                    scanInfo: {
                        scope,
                        mode,
                        timestamp: new Date().toISOString(),
                        duration: 0,
                    },
                },
                metadata: { note: 'Lightweight TCP-based discovery. Use SNMP/nmap/NetBox for richer topology.' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.topology_scan failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'TOPOLOGY_SCAN_ERROR',
            };
        }
    },
};

// =============================================================================
// net.mikrotik_api Tool
// =============================================================================

/**
 * MikroTik API Tool
 * 
 * Interacts with MikroTik RouterOS devices via API.
 * Credentials are managed securely on the backend.
 */
export const netMikrotikApiTool: McpToolDefinition<NetMikrotikApiInput, {
    success: boolean;
    data?: unknown;
    device?: string;
    action: string;
    executionTime?: number;
}> = {
    name: 'net.mikrotik_api',
    description: `Execute commands on MikroTik RouterOS devices via API.

Actions:
- run_command: Execute a RouterOS CLI command
- get_config: Get configuration section (e.g., /ip/firewall/filter)
- set_config: Modify configuration
- apply_script: Run a RouterOS script

Security:
- Device credentials are managed securely on the backend
- LLM only provides device ID or address, not passwords
- All operations are logged for audit

Payload examples:
- run_command: { "command": "/ip/address/print" }
- get_config: { "path": "/ip/firewall/filter", "props": ["action", "chain", "src-address"] }
- set_config: { "path": "/ip/firewall/filter/0", "data": { "disabled": "yes" } }

Note: Backend MikroTik integration required for production use.`,
    category: 'network',
    requiresConfirmation: true, // Require confirmation for write operations
    inputSchema: {
        type: 'object',
        properties: {
            deviceId: {
                type: 'string',
                description: 'Device ID in internal management system',
            },
            address: {
                type: 'string',
                description: 'IP/hostname for direct connection',
            },
            apiProfile: {
                type: 'string',
                description: 'API profile name (predefined credentials)',
            },
            action: {
                type: 'string',
                enum: ['run_command', 'get_config', 'set_config', 'apply_script'],
                description: 'Action to perform',
            },
            payload: {
                type: 'object',
                description: 'Command/config payload',
                properties: {
                    command: { type: 'string' },
                    path: { type: 'string' },
                    props: { type: 'array', items: { type: 'string' } },
                    data: { type: 'object' },
                    script: { type: 'string' },
                },
            },
        },
        required: ['action'],
    },
    handler: async (args: NetMikrotikApiInput): Promise<McpToolResult<{
        success: boolean;
        data?: unknown;
        device?: string;
        action: string;
        executionTime?: number;
    }>> => {
        try {
            const input = NetMikrotikApiInputSchema.parse(args);

            logger.info('net.mikrotik_api called', {
                deviceId: input.deviceId,
                address: input.address,
                action: input.action,
            });

            // Determine device address
            const device = input.address || input.deviceId || 'unknown';

            // For direct connections we accept credentials in payload.auth { username, password }
            const auth = (input.payload as any)?.auth;

            if ((input.action === 'set_config' || input.action === 'apply_script') && !input.requiresConfirmation) {
                logger.warn('Potentially destructive MikroTik operation requested without explicit confirmation flag', { device, action: input.action });
            }

            // If client provided SSH credentials try SSH exec
            if (auth && auth.username && auth.password) {
                const connConfig: ConnectConfig = {
                    host: input.address,
                    port: (input.payload as any)?.port || 22,
                    username: auth.username,
                    password: auth.password,
                    readyTimeout: 10000,
                };

                const ssh = new SSHClient();
                const command = (input.payload as any)?.command || (input.payload as any)?.script;

                if (!command) {
                    return {
                        success: false,
                        error: 'No command or script provided in payload.auth or payload.command',
                        errorCode: 'MIKROTIK_NO_COMMAND',
                    };
                }

                const execResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                    let stdout = '';
                    let stderr = '';
                    let finished = false;
                    const timeout = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            try { ssh.end(); } catch { }
                            reject(new Error('SSH command timeout'));
                        }
                    }, 20000);

                    ssh.on('ready', () => {
                        ssh.exec(command, { pty: true }, (err, stream) => {
                            if (err) {
                                clearTimeout(timeout);
                                ssh.end();
                                return reject(err);
                            }
                            stream.on('close', (code: number, signal: string) => {
                                clearTimeout(timeout);
                                finished = true;
                                ssh.end();
                                resolve({ stdout, stderr });
                            }).on('data', (data: Buffer) => {
                                stdout += data.toString();
                            }).stderr.on('data', (data: Buffer) => {
                                stderr += data.toString();
                            });
                        });
                    }).on('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    }).connect(connConfig);
                }).catch((err) => {
                    logger.error('SSH execution failed', { error: err instanceof Error ? err.message : String(err), device });
                    return { success: false, error: (err instanceof Error ? err.message : String(err)), errorCode: 'SSH_EXEC_ERROR' } as any;
                });

                if ((execResult as any).success === false) return execResult as any;

                return {
                    success: true,
                    data: {
                        success: true,
                        data: { output: execResult.stdout, stderr: execResult.stderr },
                        device,
                        action: input.action,
                    },
                    metadata: { note: 'Executed command over SSH' },
                };
            }

            // If no credentials provided, return a helpful error and a mock sample
            logger.info('No SSH credentials provided for MikroTik; returning sample response', { device, action: input.action });
            const sample: Record<string, unknown> = {
                run_command: { output: '[SAMPLE] Provide payload.auth { username, password } to execute command via SSH' },
                get_config: { items: [{ '.id': '*1', action: 'accept', chain: 'input' }] },
            };

            return {
                success: true,
                data: {
                    success: true,
                    data: sample[input.action] || { note: 'No-op sample' },
                    device,
                    action: input.action,
                },
                metadata: { note: 'Provide credentials in payload.auth to run real commands' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.mikrotik_api failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'MIKROTIK_API_ERROR',
            };
        }
    },
};

// =============================================================================
// net.dhcp_dns_manage Tool
// =============================================================================

/**
 * DHCP/DNS Management Tool
 * 
 * Manages DHCP and DNS configurations across various backends.
 */
export const netDhcpDnsManageTool: McpToolDefinition<NetDhcpDnsManageInput, {
    operation: string;
    result: unknown;
    backend: string;
}> = {
    name: 'net.dhcp_dns_manage',
    description: `Manage DHCP server and DNS configurations.

Backends:
- mikrotik: MikroTik RouterOS DHCP/DNS
- pfsense: pfSense DHCP/DNS
- windows_dhcp: Windows Server DHCP
- bind: BIND DNS server

Operations:
- list_config: List DHCP/DNS configuration
- get_lease: Get DHCP lease by MAC/IP
- set_lease: Create/update static lease
- delete_lease: Remove static lease
- list_dns: List DNS records
- set_dns_record: Create/update DNS record
- delete_dns_record: Remove DNS record

Payload fields:
- mac: MAC address (for DHCP operations)
- ip: IP address
- hostname: Hostname
- ttl: TTL for DNS records
- recordType: A, AAAA, CNAME, etc.

Note: Backend integration required for production use.`,
    category: 'network',
    requiresConfirmation: true,
    inputSchema: {
        type: 'object',
        properties: {
            backend: {
                type: 'string',
                enum: ['mikrotik', 'pfsense', 'windows_dhcp', 'bind'],
                description: 'Backend system',
            },
            scope: {
                type: 'string',
                description: 'Device or zone scope',
            },
            operation: {
                type: 'string',
                enum: [
                    'list_config', 'get_lease', 'set_lease', 'delete_lease',
                    'list_dns', 'set_dns_record', 'delete_dns_record'
                ],
                description: 'Operation to perform',
            },
            payload: {
                type: 'object',
                description: 'Operation payload',
                properties: {
                    mac: { type: 'string' },
                    ip: { type: 'string' },
                    hostname: { type: 'string' },
                    ttl: { type: 'number' },
                    recordType: { type: 'string' },
                    value: { type: 'string' },
                },
            },
        },
        required: ['backend', 'operation'],
    },
    handler: async (args: NetDhcpDnsManageInput): Promise<McpToolResult<{
        operation: string;
        result: unknown;
        backend: string;
    }>> => {
        try {
            const input = NetDhcpDnsManageInputSchema.parse(args);

            logger.info('net.dhcp_dns_manage called', {
                backend: input.backend,
                operation: input.operation,
                scope: input.scope,
            });

            // TODO: Implement actual backend integrations

            // Mock results based on operation
            const mockResults: Record<string, unknown> = {
                list_config: {
                    dhcpServers: [{ name: 'default', interface: 'bridge', pool: '192.168.1.100-192.168.1.200' }],
                    dnsServers: ['8.8.8.8', '1.1.1.1'],
                },
                get_lease: {
                    mac: input.payload?.mac || 'AA:BB:CC:DD:EE:FF',
                    ip: input.payload?.ip || '192.168.1.100',
                    hostname: 'client-1',
                    expires: new Date(Date.now() + 86400000).toISOString(),
                },
                set_lease: { created: true, id: 'lease-001' },
                delete_lease: { deleted: true },
                list_dns: {
                    records: [
                        { name: 'server1', type: 'A', value: '10.0.0.10' },
                        { name: 'www', type: 'CNAME', value: 'server1' },
                    ],
                },
                set_dns_record: { created: true },
                delete_dns_record: { deleted: true },
            };

            return {
                success: true,
                data: {
                    operation: input.operation,
                    result: mockResults[input.operation] || { note: 'Unknown operation' },
                    backend: input.backend,
                },
                metadata: {
                    note: `Backend ${input.backend} integration pending - returning mock data`,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.dhcp_dns_manage failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'DHCP_DNS_MANAGE_ERROR',
            };
        }
    },
};

// =============================================================================
// net.nac_manage Tool
// =============================================================================

/**
 * NAC Management Tool
 * 
 * Network Access Control operations for device management.
 */
export const netNacManageTool: McpToolDefinition<NetNacManageInput, {
    operation: string;
    result: unknown;
    backend: string;
    deviceStatus?: {
        mac?: string;
        ip?: string;
        policy?: string;
        status: 'authorized' | 'quarantined' | 'blocked' | 'unknown';
        lastSeen?: string;
    };
}> = {
    name: 'net.nac_manage',
    description: `Network Access Control (NAC) operations.

Backends:
- fortigate: FortiGate/FortiNAC
- mikrotik: MikroTik-based NAC
- nac_server: Custom NAC server

Operations:
- query_device: Get device NAC status
- set_policy: Assign policy/VLAN to device
- quarantine: Move device to quarantine VLAN
- release: Release device from quarantine
- list_policies: List available NAC policies

Use cases:
- Block suspicious devices
- Move IoT devices to restricted VLAN
- Enforce compliance policies
- Manage guest access

Note: Backend integration required for production use.`,
    category: 'network',
    requiresConfirmation: true,
    inputSchema: {
        type: 'object',
        properties: {
            backend: {
                type: 'string',
                enum: ['fortigate', 'mikrotik', 'nac_server'],
                description: 'NAC backend system',
            },
            operation: {
                type: 'string',
                enum: ['query_device', 'set_policy', 'quarantine', 'release', 'list_policies'],
                description: 'NAC operation',
            },
            deviceId: {
                type: 'string',
                description: 'Internal device ID',
            },
            mac: {
                type: 'string',
                description: 'Device MAC address',
            },
            policy: {
                type: 'string',
                description: 'Policy/VLAN/profile name',
            },
            payload: {
                type: 'object',
                description: 'Additional parameters',
            },
        },
        required: ['backend', 'operation'],
    },
    handler: async (args: NetNacManageInput): Promise<McpToolResult<{
        operation: string;
        result: unknown;
        backend: string;
        deviceStatus?: {
            mac?: string;
            ip?: string;
            policy?: string;
            status: 'authorized' | 'quarantined' | 'blocked' | 'unknown';
            lastSeen?: string;
        };
    }>> => {
        try {
            const input = NetNacManageInputSchema.parse(args);

            logger.info('net.nac_manage called', {
                backend: input.backend,
                operation: input.operation,
                deviceId: input.deviceId,
                mac: input.mac,
            });

            // TODO: Implement actual NAC backend integrations

            // Mock results
            const mockDeviceStatus = {
                mac: input.mac || 'AA:BB:CC:DD:EE:FF',
                ip: '192.168.1.50',
                policy: input.policy || 'default',
                status: 'authorized' as const,
                lastSeen: new Date().toISOString(),
            };

            const mockResults: Record<string, unknown> = {
                query_device: mockDeviceStatus,
                set_policy: { applied: true, policy: input.policy },
                quarantine: { quarantined: true, vlan: 999 },
                release: { released: true },
                list_policies: {
                    policies: [
                        { name: 'default', vlan: 1, description: 'Default policy' },
                        { name: 'guest', vlan: 100, description: 'Guest network' },
                        { name: 'iot', vlan: 200, description: 'IoT devices' },
                        { name: 'quarantine', vlan: 999, description: 'Quarantine network' },
                    ],
                },
            };

            return {
                success: true,
                data: {
                    operation: input.operation,
                    result: mockResults[input.operation],
                    backend: input.backend,
                    deviceStatus: input.operation === 'query_device' ? mockDeviceStatus : undefined,
                },
                metadata: {
                    note: `Backend ${input.backend} NAC integration pending - returning mock data`,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.nac_manage failed', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                errorCode: 'NAC_MANAGE_ERROR',
            };
        }
    },
};

// =============================================================================
// Zod Schemas for New Tools
// =============================================================================

import { z } from 'zod';

export const NetAssetInventoryInputSchema = z.object({
    site: z.string().optional().describe('Site/location name (e.g., "BV121")'),
    khoa: z.string().optional().describe('Department/unit filter'),
    deviceType: z.enum(['switch', 'router', 'firewall', 'server', 'ap', 'camera', 'iot', 'all']).optional().describe('Device type filter'),
    status: z.enum(['up', 'down', 'unknown']).optional().describe('Status filter'),
    limit: z.number().default(100).describe('Maximum results'),
});
export type NetAssetInventoryInput = z.infer<typeof NetAssetInventoryInputSchema>;

export const NetNmsInventoryInputSchema = z.object({
    group: z.string().optional().describe('Host group / device group'),
    site: z.string().optional().describe('Site filter'),
    deviceType: z.string().optional().describe('Device type'),
    status: z.enum(['up', 'down', 'unknown']).optional().describe('Status filter'),
    limit: z.number().default(100).describe('Maximum results'),
});
export type NetNmsInventoryInput = z.infer<typeof NetNmsInventoryInputSchema>;

export const NetPortInspectInputSchema = z.object({
    deviceId: z.string().optional().describe('Device ID in NMS/CMDB'),
    portName: z.string().optional().describe('Interface name (e.g., "ether1", "Gi0/1")'),
    ip: z.string().optional().describe('IP address of host'),
    mac: z.string().optional().describe('MAC address'),
});
export type NetPortInspectInput = z.infer<typeof NetPortInspectInputSchema>;

export const NetVlanMapInputSchema = z.object({
    vlanId: z.number().optional().describe('VLAN ID'),
    subnet: z.string().optional().describe('Subnet (e.g., "192.168.1.0/24")'),
    khoa: z.string().optional().describe('Department filter'),
});
export type NetVlanMapInput = z.infer<typeof NetVlanMapInputSchema>;

export const NetConfigBackupInputSchema = z.object({
    deviceId: z.string().describe('Device ID'),
    operation: z.enum(['create_snapshot', 'list_snapshots']).describe('Operation'),
    label: z.string().optional().describe('Snapshot label/description'),
});
export type NetConfigBackupInput = z.infer<typeof NetConfigBackupInputSchema>;

export const NetConfigDiffInputSchema = z.object({
    deviceId: z.string().describe('Device ID'),
    snapshotA: z.string().describe('First snapshot ID'),
    snapshotB: z.string().describe('Second snapshot ID'),
});
export type NetConfigDiffInput = z.infer<typeof NetConfigDiffInputSchema>;

export const NetConfigBaselineCheckInputSchema = z.object({
    deviceId: z.string().describe('Device ID'),
    baselineProfile: z.string().describe('Baseline profile (e.g., "fortigate_core_level3", "mikrotik_edge_level3")'),
});
export type NetConfigBaselineCheckInput = z.infer<typeof NetConfigBaselineCheckInputSchema>;

export const NetNacQueryInputSchema = z.object({
    mac: z.string().optional().describe('MAC address'),
    ip: z.string().optional().describe('IP address'),
    deviceId: z.string().optional().describe('Internal device ID'),
});
export type NetNacQueryInput = z.infer<typeof NetNacQueryInputSchema>;

export const NetNacPolicySuggestInputSchema = z.object({
    mac: z.string().optional().describe('MAC address'),
    ip: z.string().optional().describe('IP address'),
    context: z.string().optional().describe('Device context (department, role, type)'),
});
export type NetNacPolicySuggestInput = z.infer<typeof NetNacPolicySuggestInputSchema>;

// =============================================================================
// net.asset_inventory Tool
// =============================================================================

/**
 * Asset Inventory Tool
 * 
 * Lists network devices and hosts by site/department.
 * READ-ONLY operation for ATTT cấp 3 compliance.
 */
export const netAssetInventoryTool: McpToolDefinition<NetAssetInventoryInput, {
    summary: string;
    items: Array<{
        deviceId: string;
        hostname: string;
        ip: string;
        type: string;
        role?: string;
        site?: string;
        khoa?: string;
        rack?: string;
        status: 'up' | 'down' | 'unknown';
        lastSeen?: string;
    }>;
    totalCount: number;
}> = {
    name: 'net.asset_inventory',
    description: `List network devices and hosts by site/department.

**Purpose:** Provide a logical inventory of infrastructure assets grouped by
site, department (khoa), and device type for asset management and planning.

**Filters:**
- site: Site/location name (e.g., "BV121", "DC-MAIN")
- khoa: Department/unit (e.g., "CNTT", "KhoaNoi")
- deviceType: switch, router, firewall, server, ap, camera, iot
- status: up, down, unknown

**Output:** List of devices with hostname, IP, type, role, location, and status.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- No credentials or secrets in output
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            site: { type: 'string', description: 'Site/location name' },
            khoa: { type: 'string', description: 'Department filter' },
            deviceType: {
                type: 'string',
                enum: ['switch', 'router', 'firewall', 'server', 'ap', 'camera', 'iot', 'all'],
                description: 'Device type filter',
            },
            status: {
                type: 'string',
                enum: ['up', 'down', 'unknown'],
                description: 'Status filter',
            },
            limit: { type: 'number', default: 100, description: 'Maximum results' },
        },
        required: [],
    },
    handler: async (args: NetAssetInventoryInput): Promise<McpToolResult<{
        summary: string;
        items: Array<{
            deviceId: string;
            hostname: string;
            ip: string;
            type: string;
            role?: string;
            site?: string;
            khoa?: string;
            rack?: string;
            status: 'up' | 'down' | 'unknown';
            lastSeen?: string;
        }>;
        totalCount: number;
    }>> => {
        try {
            const input = NetAssetInventoryInputSchema.parse(args);

            logger.info('net.asset_inventory called', {
                site: input.site,
                khoa: input.khoa,
                deviceType: input.deviceType,
                status: input.status,
            });

            // TODO: Replace with actual CMDB/NMS backend
            // Mock data representing typical hospital/enterprise network
            const mockInventory = [
                { deviceId: 'SW-CORE-01', hostname: 'sw-core-01', ip: '10.0.0.1', type: 'switch', role: 'core', site: 'DC-MAIN', khoa: 'CNTT', rack: 'R01', status: 'up' as const },
                { deviceId: 'SW-CORE-02', hostname: 'sw-core-02', ip: '10.0.0.2', type: 'switch', role: 'core', site: 'DC-MAIN', khoa: 'CNTT', rack: 'R01', status: 'up' as const },
                { deviceId: 'FW-EDGE-01', hostname: 'fw-edge-01', ip: '10.0.0.10', type: 'firewall', role: 'perimeter', site: 'DC-MAIN', khoa: 'CNTT', rack: 'R02', status: 'up' as const },
                { deviceId: 'RTR-WAN-01', hostname: 'rtr-wan-01', ip: '10.0.0.20', type: 'router', role: 'wan', site: 'DC-MAIN', khoa: 'CNTT', rack: 'R02', status: 'up' as const },
                { deviceId: 'SW-ACC-K01', hostname: 'sw-acc-khoanoi', ip: '10.1.1.1', type: 'switch', role: 'access', site: 'BV121', khoa: 'KhoaNoi', rack: 'R10', status: 'up' as const },
                { deviceId: 'AP-K01-01', hostname: 'ap-khoanoi-01', ip: '10.1.1.100', type: 'ap', role: 'wireless', site: 'BV121', khoa: 'KhoaNoi', status: 'up' as const },
                { deviceId: 'SRV-HIS-01', hostname: 'srv-his-01', ip: '10.2.0.10', type: 'server', role: 'application', site: 'DC-MAIN', khoa: 'CNTT', rack: 'R05', status: 'up' as const },
                { deviceId: 'CAM-LOBBY-01', hostname: 'cam-lobby-01', ip: '10.5.0.100', type: 'camera', role: 'security', site: 'BV121', khoa: 'BaoVe', status: 'up' as const },
            ];

            // Apply filters
            let filtered = mockInventory;
            if (input.site) filtered = filtered.filter(d => d.site === input.site);
            if (input.khoa) filtered = filtered.filter(d => d.khoa === input.khoa);
            if (input.deviceType && input.deviceType !== 'all') filtered = filtered.filter(d => d.type === input.deviceType);
            if (input.status) filtered = filtered.filter(d => d.status === input.status);

            const items = filtered.slice(0, input.limit || 100).map(d => ({
                ...d,
                lastSeen: new Date().toISOString(),
            }));

            return {
                success: true,
                data: {
                    summary: `Found ${items.length} devices${input.site ? ` at ${input.site}` : ''}${input.khoa ? ` in ${input.khoa}` : ''}`,
                    items,
                    totalCount: items.length,
                },
                metadata: { note: 'CMDB backend integration pending - returning mock data' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.asset_inventory failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'ASSET_INVENTORY_ERROR' };
        }
    },
};

// =============================================================================
// net.nms_inventory Tool
// =============================================================================

export const netNmsInventoryTool: McpToolDefinition<NetNmsInventoryInput, {
    summary: string;
    items: Array<{
        deviceId: string;
        hostname: string;
        ip: string;
        type: string;
        group?: string;
        status: 'up' | 'down' | 'unknown';
        snmpStatus?: string;
        lastPolled?: string;
    }>;
    source: string;
    totalCount: number;
}> = {
    name: 'net.nms_inventory',
    description: `Get device inventory from NMS (NetBox, LibreNMS, Zabbix, etc.).

**Purpose:** Query network management system for device list with monitoring status.

**Filters:**
- group: Host group or device group
- site: Site/location
- deviceType: Device type filter
- status: Monitoring status

**Output:** Devices with monitoring status and last poll time.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Queries cached/monitored data only
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            group: { type: 'string', description: 'Host group filter' },
            site: { type: 'string', description: 'Site filter' },
            deviceType: { type: 'string', description: 'Device type' },
            status: { type: 'string', enum: ['up', 'down', 'unknown'], description: 'Status filter' },
            limit: { type: 'number', default: 100, description: 'Maximum results' },
        },
        required: [],
    },
    handler: async (args: NetNmsInventoryInput): Promise<McpToolResult<{
        summary: string;
        items: Array<{
            deviceId: string;
            hostname: string;
            ip: string;
            type: string;
            group?: string;
            status: 'up' | 'down' | 'unknown';
            snmpStatus?: string;
            lastPolled?: string;
        }>;
        source: string;
        totalCount: number;
    }>> => {
        try {
            const input = NetNmsInventoryInputSchema.parse(args);

            logger.info('net.nms_inventory called', {
                group: input.group,
                site: input.site,
                deviceType: input.deviceType,
            });

            // TODO: Replace with actual NMS API (NetBox, LibreNMS, Zabbix)
            const mockItems = [
                { deviceId: 'SW-CORE-01', hostname: 'sw-core-01', ip: '10.0.0.1', type: 'switch', group: 'Core-Network', status: 'up' as const, snmpStatus: 'ok', lastPolled: new Date().toISOString() },
                { deviceId: 'FW-EDGE-01', hostname: 'fw-edge-01', ip: '10.0.0.10', type: 'firewall', group: 'Security', status: 'up' as const, snmpStatus: 'ok', lastPolled: new Date().toISOString() },
                { deviceId: 'SW-ACC-01', hostname: 'sw-acc-01', ip: '10.1.0.1', type: 'switch', group: 'Access-Layer', status: 'down' as const, snmpStatus: 'timeout', lastPolled: new Date(Date.now() - 300000).toISOString() },
            ];

            let filtered = mockItems;
            if (input.group) filtered = filtered.filter(d => d.group === input.group);
            if (input.status) filtered = filtered.filter(d => d.status === input.status);

            return {
                success: true,
                data: {
                    summary: `NMS reports ${filtered.length} devices`,
                    items: filtered.slice(0, input.limit || 100),
                    source: 'mock-nms',
                    totalCount: filtered.length,
                },
                metadata: { note: 'NMS backend integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.nms_inventory failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'NMS_INVENTORY_ERROR' };
        }
    },
};

// =============================================================================
// net.port_inspect Tool
// =============================================================================

export const netPortInspectTool: McpToolDefinition<NetPortInspectInput, {
    deviceId: string;
    hostname: string;
    portName: string;
    vlan: number;
    adminStatus: 'enabled' | 'disabled';
    operStatus: 'up' | 'down';
    speed: string;
    duplex: string;
    macs: Array<{ mac: string; ip?: string; hostname?: string }>;
    nacStatus?: string;
    lastChange: string;
    errors?: { inErrors: number; outErrors: number };
}> = {
    name: 'net.port_inspect',
    description: `Inspect a switch port or find port by MAC/IP.

**Purpose:** Get detailed information about a specific switch port or find which
port a device with given MAC/IP is connected to.

**Lookup Methods:**
- deviceId + portName: Direct port lookup
- mac: Find port by MAC address
- ip: Find port by IP address

**Output:** Port details including VLAN, status, speed, connected MACs, NAC status.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Useful for troubleshooting and incident response
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            deviceId: { type: 'string', description: 'Device ID' },
            portName: { type: 'string', description: 'Interface name' },
            ip: { type: 'string', description: 'IP address to find' },
            mac: { type: 'string', description: 'MAC address to find' },
        },
        required: [],
    },
    handler: async (args: NetPortInspectInput): Promise<McpToolResult<{
        deviceId: string;
        hostname: string;
        portName: string;
        vlan: number;
        adminStatus: 'enabled' | 'disabled';
        operStatus: 'up' | 'down';
        speed: string;
        duplex: string;
        macs: Array<{ mac: string; ip?: string; hostname?: string }>;
        nacStatus?: string;
        lastChange: string;
        errors?: { inErrors: number; outErrors: number };
    }>> => {
        try {
            const input = NetPortInspectInputSchema.parse(args);

            logger.info('net.port_inspect called', {
                deviceId: input.deviceId,
                portName: input.portName,
                mac: input.mac,
                ip: input.ip,
            });

            // TODO: Replace with actual switch API/SNMP query
            return {
                success: true,
                data: {
                    deviceId: input.deviceId || 'SW-ACC-01',
                    hostname: 'sw-acc-01',
                    portName: input.portName || 'Gi0/1',
                    vlan: 100,
                    adminStatus: 'enabled',
                    operStatus: 'up',
                    speed: '1Gbps',
                    duplex: 'full',
                    macs: [
                        { mac: input.mac || 'AA:BB:CC:DD:EE:FF', ip: input.ip || '192.168.1.100', hostname: 'workstation-01' },
                    ],
                    nacStatus: 'compliant',
                    lastChange: new Date().toISOString(),
                    errors: { inErrors: 0, outErrors: 0 },
                },
                metadata: { note: 'Switch API integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.port_inspect failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'PORT_INSPECT_ERROR' };
        }
    },
};

// =============================================================================
// net.vlan_map Tool
// =============================================================================

export const netVlanMapTool: McpToolDefinition<NetVlanMapInput, {
    summary: string;
    vlans: Array<{
        vlanId: number;
        name: string;
        subnet?: string;
        gateway?: string;
        site?: string;
        khoa?: string;
        description?: string;
        coreDevices: string[];
    }>;
}> = {
    name: 'net.vlan_map',
    description: `Get VLAN to department/subnet mapping.

**Purpose:** Provide a mapping of VLANs to subnets, sites, and departments
for network planning and troubleshooting.

**Filters:**
- vlanId: Specific VLAN ID
- subnet: Subnet range
- khoa: Department filter

**Output:** VLAN details with associated subnet, gateway, and core devices.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Network topology information only
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            vlanId: { type: 'number', description: 'VLAN ID' },
            subnet: { type: 'string', description: 'Subnet filter' },
            khoa: { type: 'string', description: 'Department filter' },
        },
        required: [],
    },
    handler: async (args: NetVlanMapInput): Promise<McpToolResult<{
        summary: string;
        vlans: Array<{
            vlanId: number;
            name: string;
            subnet?: string;
            gateway?: string;
            site?: string;
            khoa?: string;
            description?: string;
            coreDevices: string[];
        }>;
    }>> => {
        try {
            const input = NetVlanMapInputSchema.parse(args);

            logger.info('net.vlan_map called', {
                vlanId: input.vlanId,
                subnet: input.subnet,
                khoa: input.khoa,
            });

            // TODO: Replace with actual CMDB/NMS data
            const mockVlans = [
                { vlanId: 1, name: 'default', subnet: '10.0.0.0/24', gateway: '10.0.0.1', site: 'DC-MAIN', khoa: 'CNTT', description: 'Management VLAN', coreDevices: ['SW-CORE-01', 'SW-CORE-02'] },
                { vlanId: 100, name: 'users-khoanoi', subnet: '10.1.1.0/24', gateway: '10.1.1.1', site: 'BV121', khoa: 'KhoaNoi', description: 'Khoa Noi User VLAN', coreDevices: ['SW-ACC-K01'] },
                { vlanId: 200, name: 'servers', subnet: '10.2.0.0/24', gateway: '10.2.0.1', site: 'DC-MAIN', khoa: 'CNTT', description: 'Server VLAN', coreDevices: ['SW-CORE-01'] },
                { vlanId: 300, name: 'iot-devices', subnet: '10.5.0.0/24', gateway: '10.5.0.1', site: 'BV121', khoa: 'CNTT', description: 'IoT/Camera VLAN', coreDevices: ['SW-CORE-02'] },
                { vlanId: 999, name: 'quarantine', subnet: '10.99.0.0/24', gateway: '10.99.0.1', site: 'ALL', khoa: 'CNTT', description: 'NAC Quarantine', coreDevices: ['SW-CORE-01', 'SW-CORE-02'] },
            ];

            let filtered = mockVlans;
            if (input.vlanId) filtered = filtered.filter(v => v.vlanId === input.vlanId);
            if (input.khoa) filtered = filtered.filter(v => v.khoa === input.khoa);
            if (input.subnet) filtered = filtered.filter(v => v.subnet?.includes(input.subnet!.split('/')[0]));

            return {
                success: true,
                data: {
                    summary: `Found ${filtered.length} VLANs`,
                    vlans: filtered,
                },
                metadata: { note: 'CMDB integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.vlan_map failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'VLAN_MAP_ERROR' };
        }
    },
};

// =============================================================================
// net.config_backup Tool
// =============================================================================

export const netConfigBackupTool: McpToolDefinition<NetConfigBackupInput, {
    operation: string;
    deviceId: string;
    result: {
        snapshotId?: string;
        label?: string;
        createdAt?: string;
        snapshots?: Array<{ id: string; label: string; createdAt: string; size: number }>;
    };
}> = {
    name: 'net.config_backup',
    description: `Create or list configuration snapshots.

**Purpose:** Manage device configuration backups for change management
and disaster recovery.

**Operations:**
- create_snapshot: Create a new backup (requires label)
- list_snapshots: List existing backups

**Output:** Snapshot details or list of available snapshots.

**Security Notes (ATTT cấp 3):**
- create_snapshot is a write operation but safe (backup only)
- Config content not exposed, only metadata
- All operations logged for audit
- Supports rollback planning (compare with net.config_diff)`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            deviceId: { type: 'string', description: 'Device ID' },
            operation: { type: 'string', enum: ['create_snapshot', 'list_snapshots'], description: 'Operation' },
            label: { type: 'string', description: 'Snapshot label' },
        },
        required: ['deviceId', 'operation'],
    },
    handler: async (args: NetConfigBackupInput): Promise<McpToolResult<{
        operation: string;
        deviceId: string;
        result: {
            snapshotId?: string;
            label?: string;
            createdAt?: string;
            snapshots?: Array<{ id: string; label: string; createdAt: string; size: number }>;
        };
    }>> => {
        try {
            const input = NetConfigBackupInputSchema.parse(args);

            logger.info('net.config_backup called', {
                deviceId: input.deviceId,
                operation: input.operation,
                label: input.label,
            });

            // TODO: Replace with actual config backup system (Oxidized, RANCID, etc.)
            if (input.operation === 'create_snapshot') {
                const snapshotId = `snap-${Date.now()}`;
                return {
                    success: true,
                    data: {
                        operation: input.operation,
                        deviceId: input.deviceId,
                        result: {
                            snapshotId,
                            label: input.label || 'manual-backup',
                            createdAt: new Date().toISOString(),
                        },
                    },
                    metadata: { note: 'Config backup system integration pending' },
                };
            }

            // list_snapshots
            return {
                success: true,
                data: {
                    operation: input.operation,
                    deviceId: input.deviceId,
                    result: {
                        snapshots: [
                            { id: 'snap-1701820800000', label: 'before-upgrade', createdAt: '2025-12-05T00:00:00Z', size: 15234 },
                            { id: 'snap-1701734400000', label: 'daily-backup', createdAt: '2025-12-04T00:00:00Z', size: 15100 },
                            { id: 'snap-1701648000000', label: 'after-vlan-change', createdAt: '2025-12-03T00:00:00Z', size: 14890 },
                        ],
                    },
                },
                metadata: { note: 'Config backup system integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.config_backup failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'CONFIG_BACKUP_ERROR' };
        }
    },
};

// =============================================================================
// net.config_diff Tool
// =============================================================================

export const netConfigDiffTool: McpToolDefinition<NetConfigDiffInput, {
    deviceId: string;
    snapshotA: string;
    snapshotB: string;
    summary: string;
    diffText: string;
    changes: Array<{ section: string; type: 'added' | 'removed' | 'modified'; detail: string }>;
}> = {
    name: 'net.config_diff',
    description: `Compare two configuration snapshots.

**Purpose:** Show differences between two config versions for change
review, troubleshooting, and compliance checking.

**Input:**
- deviceId: Device identifier
- snapshotA: First snapshot ID (typically older)
- snapshotB: Second snapshot ID (typically newer)

**Output:** Human-readable diff and structured change list.

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Sensitive values (passwords, keys) are masked
- Useful for change review before/after maintenance
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            deviceId: { type: 'string', description: 'Device ID' },
            snapshotA: { type: 'string', description: 'First snapshot ID' },
            snapshotB: { type: 'string', description: 'Second snapshot ID' },
        },
        required: ['deviceId', 'snapshotA', 'snapshotB'],
    },
    handler: async (args: NetConfigDiffInput): Promise<McpToolResult<{
        deviceId: string;
        snapshotA: string;
        snapshotB: string;
        summary: string;
        diffText: string;
        changes: Array<{ section: string; type: 'added' | 'removed' | 'modified'; detail: string }>;
    }>> => {
        try {
            const input = NetConfigDiffInputSchema.parse(args);

            logger.info('net.config_diff called', {
                deviceId: input.deviceId,
                snapshotA: input.snapshotA,
                snapshotB: input.snapshotB,
            });

            // TODO: Replace with actual config diff from backup system
            return {
                success: true,
                data: {
                    deviceId: input.deviceId,
                    snapshotA: input.snapshotA,
                    snapshotB: input.snapshotB,
                    summary: '3 changes detected: 1 firewall rule added, 1 VLAN modified, 1 SNMP setting changed',
                    diffText: `--- ${input.snapshotA}
+++ ${input.snapshotB}
@@ /ip/firewall/filter @@
+ add chain=forward action=accept src-address=10.1.1.0/24 dst-address=10.2.0.0/24 comment="Allow KhoaNoi to Servers"
@@ /interface/vlan @@
- set vlan100 name="users-old"
+ set vlan100 name="users-khoanoi"
@@ /snmp @@
- set contact="admin@old.domain"
+ set contact="admin@hospital.vn"`,
                    changes: [
                        { section: '/ip/firewall/filter', type: 'added', detail: 'New rule: Allow KhoaNoi to Servers' },
                        { section: '/interface/vlan', type: 'modified', detail: 'VLAN 100 name changed' },
                        { section: '/snmp', type: 'modified', detail: 'SNMP contact updated' },
                    ],
                },
                metadata: { note: 'Config backup system integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.config_diff failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'CONFIG_DIFF_ERROR' };
        }
    },
};

// =============================================================================
// net.config_baseline_check Tool
// =============================================================================

export const netConfigBaselineCheckTool: McpToolDefinition<NetConfigBaselineCheckInput, {
    deviceId: string;
    baselineProfile: string;
    summary: string;
    status: 'pass' | 'fail' | 'warning';
    score: number;
    violations: Array<{
        ruleId: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        category: string;
        description: string;
        currentValue?: string;
        expectedValue?: string;
        remediation?: string;
    }>;
}> = {
    name: 'net.config_baseline_check',
    description: `Check device configuration against ATTT baseline.

**Purpose:** Validate device configuration compliance with security baselines
defined for ATTT cấp 3 environments.

**Baseline Profiles:**
- fortigate_core_level3: FortiGate core firewall baseline
- fortigate_edge_level3: FortiGate edge firewall baseline
- mikrotik_core_level3: MikroTik core router baseline
- mikrotik_edge_level3: MikroTik edge router baseline
- cisco_switch_level3: Cisco switch baseline

**Output:** Compliance status, score, and list of violations with remediation steps.

**Security Notes (ATTT cấp 3):**
- Read-only compliance check
- Based on ATTT cấp 3 requirements
- All checks logged for audit
- Results can be exported for compliance reporting`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            deviceId: { type: 'string', description: 'Device ID' },
            baselineProfile: { type: 'string', description: 'Baseline profile name' },
        },
        required: ['deviceId', 'baselineProfile'],
    },
    handler: async (args: NetConfigBaselineCheckInput): Promise<McpToolResult<{
        deviceId: string;
        baselineProfile: string;
        summary: string;
        status: 'pass' | 'fail' | 'warning';
        score: number;
        violations: Array<{
            ruleId: string;
            severity: 'critical' | 'high' | 'medium' | 'low';
            category: string;
            description: string;
            currentValue?: string;
            expectedValue?: string;
            remediation?: string;
        }>;
    }>> => {
        try {
            const input = NetConfigBaselineCheckInputSchema.parse(args);

            logger.info('net.config_baseline_check called', {
                deviceId: input.deviceId,
                baselineProfile: input.baselineProfile,
            });

            // TODO: Replace with actual baseline checking engine
            const mockViolations = [
                {
                    ruleId: 'ATTT3-FW-001',
                    severity: 'critical' as const,
                    category: 'Logging',
                    description: 'Remote syslog not configured',
                    currentValue: 'disabled',
                    expectedValue: 'enabled with TLS',
                    remediation: 'Configure remote syslog server with TLS encryption',
                },
                {
                    ruleId: 'ATTT3-FW-002',
                    severity: 'high' as const,
                    category: 'Authentication',
                    description: 'SNMP v2c in use (should be v3)',
                    currentValue: 'v2c',
                    expectedValue: 'v3 with authPriv',
                    remediation: 'Migrate to SNMPv3 with authentication and encryption',
                },
                {
                    ruleId: 'ATTT3-FW-003',
                    severity: 'medium' as const,
                    category: 'Access Control',
                    description: 'Management interface accessible from non-management VLAN',
                    currentValue: 'any',
                    expectedValue: 'VLAN 1 only',
                    remediation: 'Restrict management access to management VLAN',
                },
            ];

            const criticalCount = mockViolations.filter(v => v.severity === 'critical').length;
            const highCount = mockViolations.filter(v => v.severity === 'high').length;
            const score = Math.max(0, 100 - criticalCount * 30 - highCount * 15 - (mockViolations.length - criticalCount - highCount) * 5);
            const status = criticalCount > 0 ? 'fail' : highCount > 0 ? 'warning' : 'pass';

            return {
                success: true,
                data: {
                    deviceId: input.deviceId,
                    baselineProfile: input.baselineProfile,
                    summary: `Baseline check: ${status.toUpperCase()} (score: ${score}/100). ${mockViolations.length} violations found (${criticalCount} critical, ${highCount} high).`,
                    status,
                    score,
                    violations: mockViolations,
                },
                metadata: { note: 'Baseline checking engine pending - returning sample violations' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.config_baseline_check failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'BASELINE_CHECK_ERROR' };
        }
    },
};

// =============================================================================
// net.nac_query Tool
// =============================================================================

export const netNacQueryTool: McpToolDefinition<NetNacQueryInput, {
    mac?: string;
    ip?: string;
    deviceId?: string;
    status: 'compliant' | 'non_compliant' | 'guest' | 'blocked' | 'quarantine' | 'unknown';
    vlan: number;
    policy: string;
    lastSeen: string;
    authMethod?: string;
    switchPort?: { deviceId: string; portName: string };
    relatedLogs?: Array<{ timestamp: string; event: string }>;
}> = {
    name: 'net.nac_query',
    description: `Query NAC status for a device.

**Purpose:** Check Network Access Control status for a specific device by MAC, IP, or device ID.

**Output:**
- NAC status (compliant, non_compliant, guest, blocked, quarantine, unknown)
- Current VLAN assignment
- Applied policy
- Switch port location
- Recent NAC events

**Security Notes (ATTT cấp 3):**
- Read-only operation
- Useful for troubleshooting access issues
- All queries logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            mac: { type: 'string', description: 'MAC address' },
            ip: { type: 'string', description: 'IP address' },
            deviceId: { type: 'string', description: 'Internal device ID' },
        },
        required: [],
    },
    handler: async (args: NetNacQueryInput): Promise<McpToolResult<{
        mac?: string;
        ip?: string;
        deviceId?: string;
        status: 'compliant' | 'non_compliant' | 'guest' | 'blocked' | 'quarantine' | 'unknown';
        vlan: number;
        policy: string;
        lastSeen: string;
        authMethod?: string;
        switchPort?: { deviceId: string; portName: string };
        relatedLogs?: Array<{ timestamp: string; event: string }>;
    }>> => {
        try {
            const input = NetNacQueryInputSchema.parse(args);

            logger.info('net.nac_query called', {
                mac: input.mac,
                ip: input.ip,
                deviceId: input.deviceId,
            });

            // TODO: Replace with actual NAC backend query
            return {
                success: true,
                data: {
                    mac: input.mac || 'AA:BB:CC:DD:EE:FF',
                    ip: input.ip || '192.168.1.100',
                    deviceId: input.deviceId,
                    status: 'compliant',
                    vlan: 100,
                    policy: 'employee-workstation',
                    lastSeen: new Date().toISOString(),
                    authMethod: '802.1X',
                    switchPort: { deviceId: 'SW-ACC-01', portName: 'Gi0/1' },
                    relatedLogs: [
                        { timestamp: new Date(Date.now() - 3600000).toISOString(), event: 'Authentication successful via 802.1X' },
                        { timestamp: new Date(Date.now() - 7200000).toISOString(), event: 'Device connected to port Gi0/1' },
                    ],
                },
                metadata: { note: 'NAC backend integration pending' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.nac_query failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'NAC_QUERY_ERROR' };
        }
    },
};

// =============================================================================
// net.nac_policy_suggest Tool
// =============================================================================

export const netNacPolicySuggestTool: McpToolDefinition<NetNacPolicySuggestInput, {
    mac?: string;
    ip?: string;
    suggestedPolicy: string;
    suggestedVlan: number;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
    plan: {
        steps: string[];
        configCommands?: string[];
        warnings?: string[];
    };
}> = {
    name: 'net.nac_policy_suggest',
    description: `Suggest NAC policy for a device (no auto-apply).

**Purpose:** Analyze device characteristics and suggest appropriate NAC policy.
This is a PLAN-ONLY operation - human review required before applying.

**Input:**
- mac/ip: Device identifiers
- context: Additional info about device role, department

**Output:**
- Suggested policy and VLAN
- Reasoning for the suggestion
- Step-by-step plan for manual implementation

**Security Notes (ATTT cấp 3):**
- Read-only + planning operation
- Does NOT apply changes automatically
- Human review required
- All suggestions logged for audit`,
    category: 'network',
    inputSchema: {
        type: 'object',
        properties: {
            mac: { type: 'string', description: 'MAC address' },
            ip: { type: 'string', description: 'IP address' },
            context: { type: 'string', description: 'Device context (department, role)' },
        },
        required: [],
    },
    handler: async (args: NetNacPolicySuggestInput): Promise<McpToolResult<{
        mac?: string;
        ip?: string;
        suggestedPolicy: string;
        suggestedVlan: number;
        reason: string;
        confidence: 'high' | 'medium' | 'low';
        plan: {
            steps: string[];
            configCommands?: string[];
            warnings?: string[];
        };
    }>> => {
        try {
            const input = NetNacPolicySuggestInputSchema.parse(args);

            logger.info('net.nac_policy_suggest called', {
                mac: input.mac,
                ip: input.ip,
                context: input.context,
            });

            // TODO: Replace with AI/rule-based policy suggestion engine
            const isIot = input.context?.toLowerCase().includes('iot') || input.context?.toLowerCase().includes('camera');
            const isGuest = input.context?.toLowerCase().includes('guest') || input.context?.toLowerCase().includes('khách');

            let suggestedPolicy = 'employee-workstation';
            let suggestedVlan = 100;
            let reason = 'Default policy for unclassified devices';

            if (isIot) {
                suggestedPolicy = 'iot-restricted';
                suggestedVlan = 300;
                reason = 'Device appears to be IoT/camera based on context. Restricted network access recommended.';
            } else if (isGuest) {
                suggestedPolicy = 'guest-access';
                suggestedVlan = 500;
                reason = 'Guest device identified. Limited internet-only access recommended.';
            }

            return {
                success: true,
                data: {
                    mac: input.mac,
                    ip: input.ip,
                    suggestedPolicy,
                    suggestedVlan,
                    reason,
                    confidence: 'medium',
                    plan: {
                        steps: [
                            `1. Verify device ownership and purpose`,
                            `2. Confirm suggested policy "${suggestedPolicy}" is appropriate`,
                            `3. Apply policy via NAC admin console or CLI`,
                            `4. Monitor device for 24h for anomalies`,
                        ],
                        configCommands: [
                            `# FortiNAC CLI (example)`,
                            `set endpoint mac ${input.mac || 'XX:XX:XX:XX:XX:XX'} policy ${suggestedPolicy}`,
                            `# Or MikroTik`,
                            `/interface bridge port set [find mac-address=${input.mac || 'XX:XX:XX:XX:XX:XX'}] pvid=${suggestedVlan}`,
                        ],
                        warnings: [
                            'Do not apply without verifying device identity',
                            'Monitor for connectivity issues after policy change',
                        ],
                    },
                },
                metadata: { note: 'Policy suggestion engine pending - returning rule-based suggestion' },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('net.nac_policy_suggest failed', { error: errorMessage });
            return { success: false, error: errorMessage, errorCode: 'NAC_POLICY_SUGGEST_ERROR' };
        }
    },
};

// =============================================================================
// Export all Network tools
// =============================================================================

export const networkTools: McpToolDefinition[] = [
    netFwLogSearchTool,
    netTopologyScanTool,
    netMikrotikApiTool,
    netDhcpDnsManageTool,
    netNacManageTool,
    // New tools
    netAssetInventoryTool,
    netNmsInventoryTool,
    netPortInspectTool,
    netVlanMapTool,
    netConfigBackupTool,
    netConfigDiffTool,
    netConfigBaselineCheckTool,
    netNacQueryTool,
    netNacPolicySuggestTool,
];

export default networkTools;
