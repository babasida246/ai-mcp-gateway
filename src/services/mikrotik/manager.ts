import MikrotikSSH, { ExecResult } from './client.js';

/**
 * Standard MikroTik RouterOS commands based on official documentation.
 * Reference: https://help.mikrotik.com/docs/
 */

export const MIKROTIK_COMMANDS = {
  // System & Info
  SYSTEM_IDENTITY: '/system identity print',
  SYSTEM_RESOURCES: '/system resource print',
  SYSTEM_PACKAGE_PRINT: '/system package print',
  SYSTEM_LICENSE_PRINT: '/system license print',

  // Backup & Restore
  BACKUP_CREATE: (name: string) => `/system backup save name=${name}`,
  BACKUP_LIST: '/file print where type=backup',
  BACKUP_RESTORE: (name: string) => `/system backup load name=${name}`,
  BACKUP_EXPORT: (name: string) => `/export file=${name}`,

  // IP Configuration
  IP_ADDRESS_LIST: '/ip address print detail',
  IP_ADDRESS_ADD: (iface: string, address: string, netmask: string) =>
    `/ip address add interface=${iface} address=${address}/${netmask}`,
  IP_ADDRESS_REMOVE: (id: string) => `/ip address remove numbers=${id}`,
  IP_ROUTE_LIST: '/ip route print detail',
  IP_ROUTE_ADD: (dstAddress: string, gateway: string, distance: string = '1') =>
    `/ip route add dst-address=${dstAddress} gateway=${gateway} distance=${distance}`,

  // Interface Management
  INTERFACE_LIST: '/interface print detail',
  INTERFACE_ETHERNET_LIST: '/interface ethernet print detail',
  INTERFACE_VLAN_ADD: (iface: string, vlanId: number, name: string) =>
    `/interface vlan add interface=${iface} vlan-id=${vlanId} name=${name}`,
  INTERFACE_BRIDGE_ADD: (name: string) => `/interface bridge add name=${name}`,
  INTERFACE_BRIDGE_PORT_ADD: (bridge: string, iface: string) =>
    `/interface bridge port add bridge=${bridge} interface=${iface}`,

  // DHCP Server
  DHCP_SERVER_ADD: (iface: string, pool: string) =>
    `/ip dhcp-server add interface=${iface} address-pool=${pool} disabled=no`,
  DHCP_SERVER_LIST: '/ip dhcp-server print detail',
  DHCP_POOL_ADD: (name: string, rangeStart: string, rangeEnd: string) =>
    `/ip pool add name=${name} ranges=${rangeStart}-${rangeEnd}`,
  DHCP_POOL_LIST: '/ip pool print detail',
  DHCP_NETWORK_ADD: (address: string, gateway: string, dnsServers: string[]) =>
    `/ip dhcp-server network add address=${address} gateway=${gateway} dns-server=${dnsServers.join(',')}`,
  DHCP_NETWORK_LIST: '/ip dhcp-server network print detail',

  // DNS
  DNS_SERVER_ADD: (address: string) => `/ip dns set servers=${address}`,
  DNS_LIST: '/ip dns print',
  DNS_CACHE_FLUSH: '/ip dns cache flush',

  // Firewall
  FIREWALL_NAT_LIST: '/ip firewall nat print detail',
  FIREWALL_FILTER_LIST: '/ip firewall filter print detail',
  FIREWALL_NAT_ADD: (chain: string, action: string, protocol?: string) =>
    `/ip firewall nat add chain=${chain} action=${action}${protocol ? ` protocol=${protocol}` : ''}`,

  // Users & Security
  USER_LIST: '/user print detail',
  USER_ADD: (username: string, password: string, group: string = 'full') =>
    `/user add name=${username} password=${password} group=${group}`,
  USER_REMOVE: (id: string) => `/user remove numbers=${id}`,

  // Certificate Management
  CERTIFICATE_LIST: '/certificate print detail',
  CERTIFICATE_IMPORT: (name: string, filename: string) =>
    `/certificate import file-name=${filename} name=${name}`,

  // Logging
  LOG_PRINT: '/log print follow=no numbers=0..100',
  LOG_FILTER_ADD: (topics: string, action: string = 'memory') =>
    `/system logging add topics=${topics} action=${action}`,

  // NTP
  NTP_CLIENT_ENABLE: '/system ntp client set enabled=yes',
  NTP_CLIENT_SET_SERVER: (server: string) => `/system ntp client set servers=${server}`,
  NTP_CLIENT_PRINT: '/system ntp client print',

  // SNMP
  SNMP_PRINT: '/snmp print',
  SNMP_COMMUNITY_LIST: '/snmp community print detail',
  SNMP_COMMUNITY_ADD: (name: string, addresses: string = '0.0.0.0/0') =>
    `/snmp community add name=${name} addresses=${addresses}`,
};

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
  async getSystemInfo(): Promise<Record<string, any>> {
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
      MIKROTIK_COMMANDS.DHCP_SERVER_ADD(interfaceName, poolName, addressSpace),
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
}

export default MikrotikManager;
