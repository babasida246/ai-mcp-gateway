/**
 * @file MikroTik Command Builder Types
 * @description Type definitions for Plan JSON schema, device facts, compiler params, and validation
 */

/**
 * Device target information
 */
export interface DeviceTarget {
    deviceId: string;
    routeros: string; // e.g. "7.16"
    model: string;    // e.g. "CCR2116"
}

/**
 * Device facts (retrieved from router or user input)
 */
export interface DeviceFacts {
    deviceId: string;
    routeros: string;
    model: string;
    interfaces: InterfaceFact[];
    bridges: BridgeFact[];
    vlans: VlanFact[];
    ipAddresses: IpAddressFact[];
    services: ServiceFact[];
    routes: RouteFact[];
    firewallSummary?: FirewallSummary;
    dhcpServers?: DhcpServerFact[];
    dhcpClients?: DhcpClientFact[];
    users?: UserFact[];
    systemIdentity?: string;
    snmpEnabled?: boolean;
    ntpEnabled?: boolean;
    dnsServers?: string[];
}

export interface InterfaceFact {
    name: string;
    type: 'ether' | 'bridge' | 'vlan' | 'bonding' | 'pppoe' | 'other';
    disabled: boolean;
    mtu?: number;
    comment?: string;
}

export interface BridgeFact {
    name: string;
    vlanFiltering: boolean;
    ports: string[]; // interface names
}

export interface VlanFact {
    id: number;
    name: string;
    interface: string;
}

export interface IpAddressFact {
    address: string; // CIDR format
    interface: string;
    disabled: boolean;
}

export interface ServiceFact {
    name: string;
    port: number;
    disabled: boolean;
    address?: string; // allowed addresses
}

export interface RouteFact {
    dstAddress: string;
    gateway: string;
    distance: number;
    disabled: boolean;
}

export interface FirewallSummary {
    inputRules: number;
    forwardRules: number;
    outputRules: number;
    natRules: number;
}

export interface DhcpServerFact {
    name: string;
    interface: string;
    addressPool: string;
    disabled: boolean;
}

export interface DhcpClientFact {
    interface: string;
    disabled: boolean;
    addDefaultRoute: boolean;
}

export interface UserFact {
    name: string;
    group: string;
}

/**
 * Plan JSON Schema (AI generates this, not raw commands)
 */
export interface MikrotikPlan {
    changeId: string;
    createdAt: string;
    target: DeviceTarget;
    assumptions: string[]; // Things AI assumes (e.g., "ether1 is WAN", "br-lan exists")
    steps: PlanStep[];
    policy: PolicyConfig;
    metadata?: {
        intent: string;
        selectedModules: string[];
        estimatedDuration?: string;
    };
}

export interface PlanStep {
    id: string;          // e.g., "step-001"
    title: string;       // e.g., "Configure system identity"
    module: ModuleName;
    action: ActionType;
    params: Record<string, any>;
    risk: 'low' | 'medium' | 'high';
    precheck: PreCheck[];
    postcheck?: PostCheck[];
    rollback?: string;   // Description of rollback action
}

export type ModuleName =
    | 'system'
    | 'services'
    | 'interfaceLists'
    | 'ip'
    | 'dns'
    | 'dhcpClient'
    | 'dhcpServer'
    | 'firewall'
    | 'nat'
    | 'logging'
    | 'snmp'
    | 'routing'
    | 'bridge'
    | 'vlan'
    | 'bonding'
    | 'backup';

export type ActionType =
    | 'set'
    | 'add'
    | 'remove'
    | 'enable'
    | 'disable'
    | 'configure';

export interface PreCheck {
    type: 'interface_exists' | 'bridge_exists' | 'vlan_available' | 'ip_not_conflict' | 'service_port_free' | 'mgmt_not_blocked';
    description: string;
    params: Record<string, any>;
}

export interface PostCheck {
    type: 'verify_interface' | 'verify_connectivity' | 'verify_service' | 'verify_route';
    description: string;
    params: Record<string, any>;
}

export interface PolicyConfig {
    noLockout: boolean;           // Prevent lockout from management
    requireSnapshot: boolean;     // Take backup before apply
    mgmtSubnets: string[];        // Management allowed subnets (e.g., ["192.168.1.0/24"])
    allowVlanFiltering: boolean;  // Allow enabling vlan-filtering (risky)
    allowMgmtIpChange: boolean;   // Allow changing IP on mgmt interface
}

/**
 * Compiled output from Plan
 */
export interface CompiledResult {
    changeId: string;
    commandsByModule: Record<ModuleName, ModuleCommands>;
    allCommands: string[];
    warnings: Warning[];
    estimatedDuration: string;
    snapshotCommands?: string[];
}

export interface ModuleCommands {
    module: ModuleName;
    title: string;
    commands: string[];
    rollbackCommands?: string[];
    risk: 'low' | 'medium' | 'high';
}

export interface Warning {
    level: 'info' | 'warning' | 'critical';
    message: string;
    module?: ModuleName;
    step?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: Warning[];
    policyViolations: PolicyViolation[];
}

export interface ValidationError {
    step: string;
    module: ModuleName;
    message: string;
    details?: string;
}

export interface PolicyViolation {
    policy: keyof PolicyConfig;
    message: string;
    severity: 'blocking' | 'warning';
}

/**
 * Apply result
 */
export interface ApplyResult {
    changeId: string;
    executionMode: 'dryRun' | 'apply';
    startTime: string;
    endTime: string;
    totalSteps: number;
    successSteps: number;
    failedSteps: number;
    stepResults: StepResult[];
    verified: boolean;
    rollbackAvailable: boolean;
}

export interface StepResult {
    stepId: string;
    module: ModuleName;
    commands: string[];
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
    verified?: boolean;
}

/**
 * Module-specific parameter types
 */

// System module
export interface SystemParams {
    identity?: string;
    note?: string;
    timezone?: string;
    ntpServers?: string[];
    ntpEnabled?: boolean;
}

// Services module
export interface ServicesParams {
    services: ServiceConfig[];
}

export interface ServiceConfig {
    name: 'winbox' | 'ssh' | 'api' | 'api-ssl' | 'www' | 'www-ssl' | 'telnet' | 'ftp';
    disabled: boolean;
    port?: number;
    address?: string; // allowed addresses
}

// Interface Lists module
export interface InterfaceListsParams {
    lists: InterfaceListConfig[];
}

export interface InterfaceListConfig {
    name: string;
    members: string[]; // interface names
}

// IP module
export interface IpAddressParams {
    addresses: IpAddressConfig[];
}

export interface IpAddressConfig {
    interface: string;
    address: string; // CIDR
    comment?: string;
}

// DNS module
export interface DnsParams {
    servers: string[];
    allowRemoteRequests: boolean;
}

// DHCP Client module
export interface DhcpClientParams {
    clients: DhcpClientConfig[];
}

export interface DhcpClientConfig {
    interface: string;
    addDefaultRoute: boolean;
    usePeerDns: boolean;
    usePeerNtp: boolean;
    disabled: boolean;
}

// DHCP Server module
export interface DhcpServerParams {
    servers: DhcpServerConfig[];
}

export interface DhcpServerConfig {
    name: string;
    interface: string;
    poolName: string;
    poolRange: string; // e.g., "192.168.1.100-192.168.1.200"
    network: string;   // CIDR
    gateway: string;
    dnsServers?: string[];
    leaseTime?: string; // e.g., "1d"
}

// Firewall module
export interface FirewallParams {
    preset: 'basic' | 'standard' | 'strict';
    wanInterfaces: string[];
    lanInterfaces: string[];
    mgmtSubnets: string[];
    enableFastTrack: boolean;
    customRules?: FirewallRule[];
}

export interface FirewallRule {
    chain: 'input' | 'forward' | 'output';
    action: 'accept' | 'drop' | 'reject';
    protocol?: string;
    srcAddress?: string;
    dstAddress?: string;
    srcPort?: string;
    dstPort?: string;
    inInterface?: string;
    outInterface?: string;
    comment?: string;
}

// NAT module
export interface NatParams {
    masquerade: MasqueradeConfig;
    portForwards?: PortForwardConfig[];
    hairpinNat: boolean;
}

export interface MasqueradeConfig {
    outInterfaces: string[]; // WAN interfaces
}

export interface PortForwardConfig {
    protocol: 'tcp' | 'udp' | 'both';
    dstPort: number;
    toAddress: string;
    toPort?: number;
    comment?: string;
}

// Logging module
export interface LoggingParams {
    remoteLogging?: RemoteLoggingConfig;
    topics?: string[]; // e.g., ['info', 'error', 'warning', 'firewall']
}

export interface RemoteLoggingConfig {
    remote: string; // IP or hostname
    port?: number;
}

// SNMP module
export interface SnmpParams {
    enabled: boolean;
    community?: string;
    contact?: string;
    location?: string;
}

// Routing module
export interface RoutingParams {
    defaultRoute?: DefaultRouteConfig;
    staticRoutes?: StaticRouteConfig[];
}

export interface DefaultRouteConfig {
    gateway: string;
    distance?: number;
    checkGateway?: 'ping' | 'arp' | boolean;
}

export interface StaticRouteConfig {
    dstAddress: string;
    gateway: string;
    distance?: number;
    comment?: string;
}

// Backup module
export interface BackupParams {
    snapshotName: string;
    exportFile: string;
}
