/**
 * Shared TypeScript types for MikroTik RouterOS operations
 */

/**
 * Result from UI command builder functions
 * Contains generated RouterOS commands and optional disabled state
 */
export interface UICommandResult {
    commands: string[];
    disabled?: boolean;
}

/**
 * Options for VLAN wizard quick setup
 */
export interface VlanWizardOptions {
    vlanName: string;
    vlanId: number;
    bridge: string;
    gatewayCidr: string;
    accessIfaces?: string;
    trunkIfaces?: string;
    dhcpPool?: string;
}

/**
 * Firewall template types
 */
export type FirewallTemplate = 'basic-nat' | 'secure' | 'drop-all';

/**
 * Options for DHCP server quick setup
 */
export interface DhcpQuickOptions {
    interfaceName: string;
    gatewayCidr: string;
    poolStart: string;
    poolEnd: string;
    dnsServers: string[];
}

/**
 * Options for L2TP VPN server
 */
export interface L2tpServerOptions {
    profile: string;
    localAddress: string;
    remoteAddressPool: string;
    secret: string;
    username?: string;
}

/**
 * Options for IPsec site-to-site VPN
 */
export interface IpsecSiteToSiteOptions {
    peerAddress: string;
    psk: string;
    localSubnet: string;
    remoteSubnet: string;
    proposalName?: string;
}

/**
 * Simple queue bandwidth limit
 */
export interface SimpleQueueOptions {
    name: string;
    target: string; // IP or subnet
    maxUpload: string; // e.g., "10M"
    maxDownload: string; // e.g., "50M"
}

/**
 * Netwatch monitoring options
 */
export interface NetwatchOptions {
    host: string;
    interval?: string; // Default "30s"
    upScript?: string;
    downScript?: string;
}

/**
 * Backup configuration options
 */
export interface BackupOptions {
    name?: string;
    password?: string;
    uploadTo?: string; // FTP/SFTP URL
}

/**
 * Device target for bulk operations
 */
export interface BulkDeviceTarget {
    id: string;
    host: string;
    port?: number;
    username: string;
    password: string;
}

/**
 * Result from bulk apply operation (per device)
 */
export interface BulkApplyReport {
    deviceId: string;
    success: boolean;
    appliedCommands: number;
    errors: string[];
    rollback?: boolean;
}
