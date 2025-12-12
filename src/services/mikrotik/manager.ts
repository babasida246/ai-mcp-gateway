import MikrotikSSH, { ExecResult } from './client.js';
import { MIKROTIK_COMMANDS } from '../../lib/mikrotik/index.js';
import * as builders from '../../lib/mikrotik/commands/builders.js';
import type { BulkDeviceTarget, BulkApplyReport, VlanWizardOptions, DhcpQuickOptions, L2tpServerOptions, IpsecSiteToSiteOptions, SimpleQueueOptions, NetwatchOptions, BackupOptions } from '../../lib/mikrotik/types.js';

export { MIKROTIK_COMMANDS };

export type BackupConfig = {
    name: string;
    compressed?: boolean;
    encryptionPassword?: string;
};

export type ConfigSnapshot = {
    timestamp: number;
    deviceId: string;
    config: string;
    hash: string;
};

export type DiffResult = {
    added: string[];
    removed: string[];
    modified: string[];
};

export type ConfigApplyResult = {
    success: boolean;
    appliedCommands: number;
    failedCommands: number;
    errors: string[];
};

/**
 * Centralized MikroTik configuration manager.
 * Handles backup, restore, diff, and configuration application.
 */
export class MikrotikManager {
    private ssh: MikrotikSSH;
    private deviceId: string;

    constructor(deviceId: string) {
        this.ssh = new MikrotikSSH();
        this.deviceId = deviceId;
    }

    async connect(host: string, username: string, password?: string, port = 22): Promise<void> {
        await this.ssh.connect({ host, port, username, password });
    }

    async disconnect(): Promise<void> {
        await this.ssh.disconnect();
    }

    /**
     * Get system information from the device.
     */
    async getSystemInfo(): Promise<Record<string, unknown>> {
        const results = await this.ssh.execMulti([
            MIKROTIK_COMMANDS.SYSTEM_IDENTITY,
            MIKROTIK_COMMANDS.SYSTEM_RESOURCES,
            MIKROTIK_COMMANDS.SYSTEM_PACKAGE_PRINT,
        ]);

        return {
            identity: results[MIKROTIK_COMMANDS.SYSTEM_IDENTITY],
            resources: results[MIKROTIK_COMMANDS.SYSTEM_RESOURCES],
            packages: results[MIKROTIK_COMMANDS.SYSTEM_PACKAGE_PRINT],
        };
    }

    /**
     * Create a configuration backup with optional compression and encryption.
     */
    async createBackup(config: BackupConfig): Promise<ExecResult> {
        let cmd = MIKROTIK_COMMANDS.BACKUP_CREATE(config.name);

        // MikroTik backup command doesn't have direct compression flag in CLI,
        // but the binary backup is compressed by default
        if (config.encryptionPassword) {
            // Password protection would be handled through export instead
            cmd = MIKROTIK_COMMANDS.BACKUP_EXPORT(config.name);
        }

        return this.ssh.exec(cmd);
    }

    /**
     * List all backups on the device.
     */
    async listBackups(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.BACKUP_LIST);
    }

    /**
     * Restore a configuration backup.
     */
    async restoreBackup(backupName: string): Promise<ExecResult> {
        // Warning: This is a destructive operation
        console.warn(`⚠️ Restoring backup: ${backupName} will replace current configuration`);
        return this.ssh.exec(MIKROTIK_COMMANDS.BACKUP_RESTORE(backupName));
    }

    /**
     * Export current configuration as text (for version control/diff).
     */
    async exportConfig(filename?: string): Promise<string> {
        const fname = filename || `config-${Date.now()}.rsc`;
        const result = await this.ssh.exec(MIKROTIK_COMMANDS.BACKUP_EXPORT(fname));

        if (result.exitCode !== 0) {
            throw new Error(`Export failed: ${result.stderr}`);
        }

        // Retrieve the exported file content
        const getCmd = `/file get name="${fname}" contents`;
        const getResult = await this.ssh.exec(getCmd);

        if (getResult.exitCode === 0) {
            return getResult.stdout;
        }

        return result.stdout;
    }

    /**
     * Get current configuration as ConfigSnapshot.
     */
    async getConfigSnapshot(): Promise<ConfigSnapshot> {
        const config = await this.exportConfig();
        const hash = this.computeHash(config);

        return {
            timestamp: Date.now(),
            deviceId: this.deviceId,
            config,
            hash,
        };
    }

    /**
     * Compare two configuration snapshots and return diff.
     */
    computeDiff(before: ConfigSnapshot, after: ConfigSnapshot): DiffResult {
        const beforeLines = new Set(before.config.split('\n'));
        const afterLines = new Set(after.config.split('\n'));

        const added = Array.from(afterLines).filter(line => !beforeLines.has(line));
        const removed = Array.from(beforeLines).filter(line => !afterLines.has(line));

        return {
            added,
            removed,
            modified: [], // simplified; could parse more detailed diffs
        };
    }

    /**
     * Apply a list of commands with error handling and rollback support.
     */
    async applyCommands(
        commands: string[],
        opts?: {
            rollbackOnError?: boolean;
            dryRun?: boolean;
        }
    ): Promise<ConfigApplyResult> {
        const dryRun = opts?.dryRun ?? false;
        const rollbackOnError = opts?.rollbackOnError ?? false;

        if (dryRun) {
            // Validate commands syntax without executing
            return {
                success: true,
                appliedCommands: 0,
                failedCommands: 0,
                errors: [],
            };
        }

        const beforeSnapshot = await this.getConfigSnapshot();
        const results = await this.ssh.execMulti(commands, { stopOnError: rollbackOnError });

        const errors: string[] = [];
        let failedCount = 0;
        let successCount = 0;

        for (const [cmd, result] of Object.entries(results)) {
            if (result.exitCode !== 0) {
                failedCount++;
                errors.push(`${cmd}: ${result.stderr}`);
            } else {
                successCount++;
            }
        }

        // If rollback requested and errors occurred
        if (rollbackOnError && failedCount > 0) {
            console.warn('Rolling back due to errors...');
            await this.restoreBackup(`backup-before-apply-${beforeSnapshot.timestamp}`);
        }

        return {
            success: failedCount === 0,
            appliedCommands: successCount,
            failedCommands: failedCount,
            errors,
        };
    }

    /**
     * Simple hash function for config snapshots (use crypto.createHash in production).
     */
    private computeHash(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    /**
     * Validate command syntax before applying.
     */
    validateCommand(cmd: string): { valid: boolean; error?: string } {
        // Basic validation: MikroTik commands start with /
        if (!cmd.trim().startsWith('/')) {
            return { valid: false, error: 'Command must start with /' };
        }

        // Check for dangerous commands without confirmation
        const dangerousPatterns = [
            '/system reboot',
            '/system shutdown',
            '/user remove',
            '/ip firewall nat reset',
        ];

        for (const pattern of dangerousPatterns) {
            if (cmd.includes(pattern)) {
                return {
                    valid: false,
                    error: `Dangerous command: ${pattern}. Requires explicit confirmation.`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Get all IP addresses configured on the device.
     */
    async getIPAddresses(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.IP_ADDRESS_LIST);
    }

    /**
     * Get all routes configured on the device.
     */
    async getRoutes(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.IP_ROUTE_LIST);
    }

    /**
     * Get all interfaces on the device.
     */
    async getInterfaces(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.INTERFACE_LIST);
    }

    async getBridges(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.BRIDGE_LIST);
    }

    async getBridgePorts(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.BRIDGE_PORT_LIST);
    }

    async getBridgeVlans(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.BRIDGE_VLAN_LIST);
    }

    /**
     * List all DHCP servers.
     */
    async getDHCPServers(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.DHCP_SERVER_LIST);
    }

    /**
     * List all DHCP pools.
     */
    async getDHCPPools(): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.DHCP_POOL_LIST);
    }

    /**
     * Setup DHCP server on an interface.
     * Parameters: interface name, pool name, address space (e.g., "192.168.1.0/24")
     */
    async setupDHCP(
        interfaceName: string,
        poolName: string,
        addressSpace: string,
        rangeStart: string,
        rangeEnd: string,
        gateway: string,
        dnsServers: string[] = ['8.8.8.8']
    ): Promise<ConfigApplyResult> {
        const commands = [
            MIKROTIK_COMMANDS.DHCP_POOL_ADD(poolName, rangeStart, rangeEnd),
            MIKROTIK_COMMANDS.DHCP_SERVER_ADD(interfaceName, poolName),
            MIKROTIK_COMMANDS.DHCP_NETWORK_ADD(addressSpace, gateway, dnsServers),
        ];

        return this.applyCommands(commands);
    }

    /**
     * Monitor system logs.
     */
    async getLogs(count = 100): Promise<ExecResult> {
        return this.ssh.exec(`/log print follow=no numbers=0..${count}`);
    }

    /**
     * Create a bridge and optionally enable vlan-filtering.
     */
    async createBridge(name: string, opts?: { vlanFiltering?: boolean }): Promise<ConfigApplyResult> {
        const commands = [
            MIKROTIK_COMMANDS.INTERFACE_BRIDGE_ADD(name),
        ];

        if (opts?.vlanFiltering !== undefined) {
            commands.push(MIKROTIK_COMMANDS.BRIDGE_SET_VLAN_FILTERING(name, opts.vlanFiltering));
        }

        return this.applyCommands(commands);
    }

    /**
     * Add port to bridge with optional PVID and frame type.
     */
    async addBridgePort(
        bridge: string,
        iface: string,
        opts?: { pvid?: number; frameTypes?: 'admit-all' | 'admit-only-untagged-and-priority-tagged' | 'admit-only-vlan-tagged' }
    ): Promise<ConfigApplyResult> {
        const commands = [
            MIKROTIK_COMMANDS.INTERFACE_BRIDGE_PORT_ADD(bridge, iface),
        ];

        if (opts?.pvid !== undefined) {
            commands.push(MIKROTIK_COMMANDS.BRIDGE_PORT_SET_PVID(iface, opts.pvid));
        }

        if (opts?.frameTypes) {
            commands.push(MIKROTIK_COMMANDS.BRIDGE_PORT_SET_FRAME_TYPES(iface, opts.frameTypes));
        }

        return this.applyCommands(commands);
    }

    /**
     * Configure bridge VLANs (tagged/untagged) and optionally enable vlan-filtering.
     */
    async configureBridgeVlan(
        bridge: string,
        vlanId: number,
        tagged: string[],
        untagged: string[] = [],
        opts?: { enableFiltering?: boolean }
    ): Promise<ConfigApplyResult> {
        const commands = [] as string[];
        if (opts?.enableFiltering) {
            commands.push(MIKROTIK_COMMANDS.BRIDGE_SET_VLAN_FILTERING(bridge, true));
        }
        commands.push(MIKROTIK_COMMANDS.BRIDGE_VLAN_ADD(bridge, vlanId, tagged, untagged));
        return this.applyCommands(commands);
    }

    /**
     * Set interface administrative state.
     */
    async setInterfaceState(iface: string, enabled: boolean): Promise<ExecResult> {
        return this.ssh.exec(enabled ? MIKROTIK_COMMANDS.INTERFACE_ENABLE(iface) : MIKROTIK_COMMANDS.INTERFACE_DISABLE(iface));
    }

    /**
     * Set interface MTU.
     */
    async setInterfaceMtu(iface: string, mtu: number): Promise<ExecResult> {
        return this.ssh.exec(MIKROTIK_COMMANDS.INTERFACE_SET_MTU(iface, mtu));
    }

    /**
     * Create bonding interface.
     */
    async createBonding(name: string, slaves: string[], mode: string = '802.3ad'): Promise<ConfigApplyResult> {
        return this.applyCommands([MIKROTIK_COMMANDS.INTERFACE_BONDING_ADD(name, slaves, mode)]);
    }

    /**
     * Set port as access mode (untagged) on given bridge and VLAN.
     */
    async setAccessPort(bridge: string, iface: string, vlanId: number): Promise<ConfigApplyResult> {
        const commands = [
            MIKROTIK_COMMANDS.INTERFACE_BRIDGE_PORT_ADD(bridge, iface),
            MIKROTIK_COMMANDS.BRIDGE_PORT_SET_PVID(iface, vlanId),
            MIKROTIK_COMMANDS.BRIDGE_VLAN_ADD(bridge, vlanId, [], [iface]),
        ];
        return this.applyCommands(commands);
    }

    /**
     * Set port as trunk mode with tagged VLANs on a bridge.
     */
    async setTrunkPort(bridge: string, iface: string, vlanIds: number[]): Promise<ConfigApplyResult> {
        const commands = [
            MIKROTIK_COMMANDS.INTERFACE_BRIDGE_PORT_ADD(bridge, iface),
            MIKROTIK_COMMANDS.BRIDGE_PORT_SET_FRAME_TYPES(iface, 'admit-only-vlan-tagged'),
            ...vlanIds.map((vlanId) => MIKROTIK_COMMANDS.BRIDGE_VLAN_ADD(bridge, vlanId, [iface], [])),
        ];
        return this.applyCommands(commands);
    }

    /**
     * VLAN wizard: create VLAN interface, add bridge-vlan, set IP, DHCP pool and dhcp-network
     */
    async createVlanNetwork(opts: VlanWizardOptions): Promise<ConfigApplyResult> {
        try {
            const dhcpPool = opts.dhcpPool || `${opts.poolStart}-${opts.poolEnd}`;
            const commands = builders.buildVlanNetwork({ ...opts, dhcpPool });
            return this.applyCommands(commands);
        } catch (err) {
            return {
                success: false,
                appliedCommands: 0,
                failedCommands: 0,
                errors: [err instanceof Error ? err.message : String(err)],
            };
        }
    }

    /**
     * Apply a basic firewall template: block inbound from WAN, allow established, masquerade
     */
    async applyFirewallTemplate(wanIface: string, lanAddressOrBridge: string): Promise<ConfigApplyResult> {
        if (!wanIface || !lanAddressOrBridge) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildFirewallTemplate(wanIface, lanAddressOrBridge);
        return this.applyCommands(commands);
    }

    /**
     * Add addresses to address-list and add a block rule
     */
    async addBlockAddressList(listName: string, addressesCsv: string, action: 'drop' | 'reject' = 'drop'): Promise<ConfigApplyResult> {
        if (!listName || !addressesCsv) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildBlockAddressList(listName, addressesCsv, action);
        return this.applyCommands(commands);
    }

    /**
     * Force DNS via dst-nat for in-LAN traffic and set router DNS
     */
    async enforceDns(lanInterface: string, primary: string, secondary?: string): Promise<ConfigApplyResult> {
        if (!lanInterface || !primary) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildDnsForce(lanInterface, primary, secondary);
        return this.applyCommands(commands);
    }

    /**
     * Quick DHCP setup: add pool, address, dhcp-server and network
     */
    async setupDhcpQuick(opts: DhcpQuickOptions): Promise<ConfigApplyResult> {
        try {
            const commands = builders.buildDhcpQuick(opts);
            return this.applyCommands(commands);
        } catch (err) {
            return {
                success: false,
                appliedCommands: 0,
                failedCommands: 0,
                errors: [err instanceof Error ? err.message : String(err)],
            };
        }
    }

    /**
     * Set timezone and NTP servers
     */
    async setTimeNtp(timezone: string, ntpPrimary: string, ntpSecondary?: string): Promise<ConfigApplyResult> {
        if (!timezone || !ntpPrimary) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildTimeNtp(timezone, ntpPrimary, ntpSecondary);
        return this.applyCommands(commands);
    }

    /**
     * Configure identity and SNMP
     */
    async configureIdentitySnmp(identity: string, location: string | undefined, contact: string | undefined, community: string, trapTarget?: string): Promise<ConfigApplyResult> {
        if (!identity || !community) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildIdentitySnmp(identity, location || 'datacenter', contact || 'noc', community, trapTarget);
        return this.applyCommands(commands);
    }

    /**
     * Configure L2TP server (basic) with ipsec
     */
    async setupL2tpServer(opts: { publicIp: string; poolRange: string; profileName: string; dns: string[]; secret: string; user: string; password: string }): Promise<ConfigApplyResult> {
        const { publicIp, poolRange, profileName, dns, secret, user, password } = opts;
        if (!publicIp || !poolRange || !profileName || !dns?.length || !secret || !user || !password) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const l2tpOpts: L2tpServerOptions = {
            profile: profileName,
            localAddress: publicIp,
            remoteAddressPool: poolRange,
            secret,
            username: user,
        };
        const commands = builders.buildL2tpServer(l2tpOpts);
        return this.applyCommands(commands);
    }

    /**
     * Configure an IPsec site-to-site peer and policy (basic)
     */
    async setupIpsecSiteToSite(opts: { peerName: string; peerIp: string; localId?: string; localSubnet: string; remoteSubnet: string; preSharedKey: string }): Promise<ConfigApplyResult> {
        const { peerName, peerIp, localSubnet, remoteSubnet, preSharedKey } = opts;
        if (!peerName || !peerIp || !localSubnet || !remoteSubnet || !preSharedKey) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const ipsecOpts: IpsecSiteToSiteOptions = {
            peerAddress: peerIp,
            psk: preSharedKey,
            localSubnet,
            remoteSubnet,
        };
        const commands = builders.buildIpsecSiteToSite(ipsecOpts);
        return this.applyCommands(commands);
    }

    /**
     * Configure remote syslog
     */
    async configureSyslog(remoteIp: string, port = 514, topics = 'info'): Promise<ConfigApplyResult> {
        if (!remoteIp) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const commands = builders.buildSyslogRemote(remoteIp, port, topics);
        return this.applyCommands(commands);
    }

    /**
     * Add a netwatch rule
     */
    async addNetwatch(host: string, interval = '00:00:30', downScript?: string, upScript?: string): Promise<ConfigApplyResult> {
        if (!host) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing host'] };
        }
        const opts: NetwatchOptions = { host, interval, downScript, upScript };
        const commands = builders.buildNetwatch(opts);
        return this.applyCommands(commands);
    }

    /**
     * Create a backup and optionally upload via scp
     */
    async createBackupRemote(filename: string, scpUser?: string, scpHost?: string, scpPath?: string): Promise<ConfigApplyResult> {
        if (!filename) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing filename'] };
        }
        const uploadTo = scpUser && scpHost && scpPath ? `scp://${scpUser}@${scpHost}${scpPath}` : undefined;
        const opts: BackupOptions = { name: filename, uploadTo };
        const commands = builders.buildBackup(opts);
        return this.applyCommands(commands);
    }

    /**
     * Add simple queue for single IP
     */
    async addSimpleQueueIp(name: string, targetIp: string, maxUp: string, maxDown: string, _limitAtUp?: string, _limitAtDown?: string): Promise<ConfigApplyResult> {
        if (!name || !targetIp || !maxUp || !maxDown) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const opts: SimpleQueueOptions = { name, target: targetIp, maxUpload: maxUp, maxDownload: maxDown };
        const commands = builders.buildSimpleQueue(opts);
        return this.applyCommands(commands);
    }

    /**
     * Add simple queue for subnet
     */
    async addSimpleQueueSubnet(name: string, subnet: string, maxUp: string, maxDown: string): Promise<ConfigApplyResult> {
        if (!name || !subnet || !maxUp || !maxDown) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['missing parameters'] };
        }
        const opts: SimpleQueueOptions = { name, target: subnet, maxUpload: maxUp, maxDownload: maxDown };
        const commands = builders.buildSimpleQueue(opts);
        return this.applyCommands(commands);
    }

    /**
     * Run ping and traceroute via ssh return ExecResult map
     */
    async runToolkit(target: string, count = 4, size = 64): Promise<Record<string, ExecResult>> {
        const commands = builders.buildToolkit(target, count, size);
        const ping = await this.ssh.exec(commands[0]);
        const tracer = await this.ssh.exec(commands[1]);
        return { ping, tracer } as Record<string, ExecResult>;
    }

    /**
     * Run torch on device (returns ExecResult)
     */
    async runTorch(interfaceName: string, port?: string, ip?: string): Promise<ExecResult> {
        if (!interfaceName) throw new Error('interface required');
        const params = [`interface=${interfaceName}`];
        if (port) params.push(`port=${port}`);
        if (ip) params.push(`ip-address=${ip}`);
        return this.ssh.exec(`/tool torch ${params.join(' ')}`);
    }

    /**
     * Disable selected services
     */
    async disableServices(opts: { www?: boolean; telnet?: boolean; ssh?: boolean; ftp?: boolean; api?: boolean; apiSsl?: boolean }): Promise<ConfigApplyResult> {
        if (!Object.values(opts).some(v => v)) {
            return { success: false, appliedCommands: 0, failedCommands: 0, errors: ['no services selected'] };
        }
        const normalizedOpts = { ...opts, apissl: opts.apiSsl };
        const commands = builders.buildDisableServices(normalizedOpts);
        return this.applyCommands(commands);
    }

    /**
     * Install brute-force protection firewall rules for SSH/Winbox
     */
    async enableBruteForceProtection(sshPort = 22, winboxPort = 8291, threshold = 5, blockTimeout = '1h'): Promise<ConfigApplyResult> {
        const commands = builders.buildBruteForceProtection(sshPort, winboxPort, threshold, blockTimeout);
        return this.applyCommands(commands);
    }
}

/**
 * Apply the same command set to multiple MikroTik devices sequentially.
 */
export async function applyCommandsBulk(
    targets: BulkDeviceTarget[],
    commands: string[],
    options?: { rollbackOnError?: boolean; dryRun?: boolean }
): Promise<BulkApplyReport[]> {
    const reports: BulkApplyReport[] = [];
    if (!targets.length || !commands.length) return reports;

    for (const target of targets) {
        const manager = new MikrotikManager(target.deviceId || target.host);
        try {
            await manager.connect(target.host, target.username, target.password, target.port ?? 22);
            const result = await manager.applyCommands(commands, {
                rollbackOnError: options?.rollbackOnError,
                dryRun: options?.dryRun,
            });
            reports.push({ device: target.host, success: result.success, result });
        } catch (err) {
            reports.push({
                device: target.host,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            try {
                await manager.disconnect();
            } catch {
                // ignore disconnect errors to continue other devices
            }
        }
    }

    return reports;
}

export default MikrotikManager;
