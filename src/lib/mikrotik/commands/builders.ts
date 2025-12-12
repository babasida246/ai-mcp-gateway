/**
 * Shared RouterOS command builders
 * These functions generate RouterOS CLI commands for common network operations
 * Used by both frontend (UI command generators) and backend (service methods)
 */

import { normalizeList, parseCidr } from '../utils.js';
import type {
    VlanWizardOptions,
    DhcpQuickOptions,
    L2tpServerOptions,
    IpsecSiteToSiteOptions,
    SimpleQueueOptions,
    NetwatchOptions,
    BackupOptions,
} from '../types.js';

/**
 * Generate commands to create a bridge
 */
export function buildBridge(name: string, vlanFiltering: boolean = false): string[] {
    return [
        `/interface bridge add name=${name}`,
        ...(vlanFiltering ? [`/interface bridge set [find name=${name}] vlan-filtering=yes`] : []),
    ];
}

/**
 * Generate commands for bridge access port (untagged VLAN)
 */
export function buildAccessPort(bridge: string, iface: string, vlan: number): string[] {
    return [
        `/interface bridge port add bridge=${bridge} interface=${iface}`,
        `/interface bridge port set [find interface=${iface}] pvid=${vlan} frame-types=admit-only-untagged-and-priority-tagged`,
        `/interface bridge vlan add bridge=${bridge} vlan-ids=${vlan} untagged=${iface}`,
    ];
}

/**
 * Generate commands for bridge trunk port (multiple tagged VLANs)
 */
export function buildTrunkPort(bridge: string, iface: string, vlans: number[]): string[] {
    const base = [
        `/interface bridge port add bridge=${bridge} interface=${iface}`,
        `/interface bridge port set [find interface=${iface}] frame-types=admit-only-vlan-tagged`,
    ];
    const vlanCmds = vlans.map((v) => `/interface bridge vlan add bridge=${bridge} vlan-ids=${v} tagged=${iface}`);
    return [...base, ...vlanCmds];
}

/**
 * Generate bonding/LAG interface command
 */
export function buildBonding(name: string, slaves: string, mode: string = '802.3ad'): string[] {
    const normalized = normalizeList(slaves);
    return [`/interface bonding add name=${name} slaves=${normalized} mode=${mode}`];
}

/**
 * Generate complete VLAN setup (interface, addressing, DHCP)
 */
export function buildVlanNetwork(opts: VlanWizardOptions): string[] {
    const { vlanName, vlanId, bridge, gatewayCidr, accessIfaces, trunkIfaces, dhcpPool } = opts;
    const parsed = parseCidr(gatewayCidr);
    if (!parsed) {
        throw new Error(`Invalid CIDR: ${gatewayCidr}`);
    }

    const vlanIface = `vlan${vlanId}`;
    const access = accessIfaces ? normalizeList(accessIfaces) : '';
    const trunk = trunkIfaces ? normalizeList(trunkIfaces) : 'ether1';

    const commands: string[] = [
        `/interface vlan add name=${vlanIface} interface=${bridge} vlan-id=${vlanId}`,
        `/interface bridge vlan add bridge=${bridge} vlan-ids=${vlanId} tagged=${trunk}${access ? ` untagged=${access}` : ''}`,
        `/ip address add address=${gatewayCidr} interface=${vlanIface}`,
    ];

    if (dhcpPool) {
        const [poolStart, poolEnd] = dhcpPool.split('-').map((s) => s.trim());
        if (poolStart && poolEnd) {
            commands.push(
                `/ip pool add name=${vlanName}-pool ranges=${poolStart}-${poolEnd}`,
                `/ip dhcp-server add name=dhcp-${vlanName} interface=${vlanIface} address-pool=${vlanName}-pool disabled=no`,
                `/ip dhcp-server network add address=${parsed.networkCidr} gateway=${parsed.gateway}`
            );
        }
    }

    return commands;
}

/**
 * Generate basic firewall template (NAT + filter rules)
 */
export function buildFirewallTemplate(wan: string, lan: string): string[] {
    return [
        `/ip firewall filter add chain=input connection-state=established,related action=accept comment="Allow established/related"`,
        `/ip firewall filter add chain=input in-interface=${wan} connection-state=invalid action=drop comment="Drop invalid from WAN"`,
        `/ip firewall filter add chain=input in-interface=${wan} protocol=tcp dst-port=8291,8728,8729,21,23,80 action=drop comment="Drop mgmt from WAN"`,
        `/ip firewall filter add chain=forward connection-state=established,related action=accept comment="Allow established/related fwd"`,
        `/ip firewall filter add chain=forward in-interface=${wan} connection-state=invalid action=drop comment="Drop invalid fwd"`,
        `/ip firewall filter add chain=forward in-interface=${wan} action=drop comment="Drop all inbound from WAN"`,
        `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade comment="Masquerade LAN"`,
        `/ip service set telnet disabled=yes ftp disabled=yes www disabled=yes api disabled=yes api-ssl disabled=yes ssh address=${lan}`,
    ];
}

/**
 * Generate address-list blocking commands
 */
export function buildBlockAddressList(listName: string, addresses: string, action: 'drop' | 'reject' = 'drop'): string[] {
    const normalized = normalizeList(addresses);
    const commands = normalized.split(',').map((ip) => `/ip firewall address-list add list=${listName} address=${ip}`);
    commands.push(`/ip firewall filter add chain=forward src-address-list=${listName} action=${action} comment="Block list ${listName}"`);
    return commands;
}

/**
 * Generate DNS enforcement commands (redirect all DNS to specific server)
 */
export function buildDnsForce(lanInterface: string, primaryDns: string, secondaryDns?: string): string[] {
    const dnsList = secondaryDns ? `${primaryDns},${secondaryDns}` : primaryDns;
    return [
        `/ip dns set servers=${dnsList} allow-remote-requests=yes`,
        `/ip firewall nat add chain=dstnat in-interface=${lanInterface} protocol=udp dst-port=53 action=dst-nat to-addresses=${primaryDns} to-ports=53 comment="Force DNS UDP"`,
        `/ip firewall nat add chain=dstnat in-interface=${lanInterface} protocol=tcp dst-port=53 action=dst-nat to-addresses=${primaryDns} to-ports=53 comment="Force DNS TCP"`,
    ];
}

/**
 * Generate quick DHCP server setup
 */
export function buildDhcpQuick(opts: DhcpQuickOptions): string[] {
    const { interfaceName, gatewayCidr, poolStart, poolEnd, dnsServers } = opts;
    const parsed = parseCidr(gatewayCidr);
    if (!parsed) {
        throw new Error(`Invalid CIDR: ${gatewayCidr}`);
    }

    return [
        `/ip pool add name=${interfaceName}-pool ranges=${poolStart}-${poolEnd}`,
        `/ip address add address=${gatewayCidr} interface=${interfaceName}`,
        `/ip dhcp-server add name=dhcp-${interfaceName} interface=${interfaceName} address-pool=${interfaceName}-pool disabled=no`,
        `/ip dhcp-server network add address=${parsed.networkCidr} gateway=${parsed.gateway} dns-server=${dnsServers.join(',')}`,
    ];
}

/**
 * Generate NTP and timezone commands
 */
export function buildTimeNtp(timezone: string, primaryNtp: string, secondaryNtp?: string): string[] {
    return [
        `/system clock set time-zone-name=${timezone}`,
        `/system ntp client set enabled=yes primary-ntp=${primaryNtp}${secondaryNtp ? ` secondary-ntp=${secondaryNtp}` : ''} mode=unicast`,
    ];
}

/**
 * Generate identity and SNMP setup commands
 */
export function buildIdentitySnmp(identity: string, location: string, contact: string, community: string, trapTarget?: string): string[] {
    const commands = [
        `/system identity set name=${identity}`,
        `/snmp set enabled=yes contact="${contact}" location="${location}"`,
    ];

    if (community) {
        commands.push(`/snmp community set [find name=public] name=${community}`);
    }

    if (trapTarget) {
        commands.push(`/snmp/trap-target add address=${trapTarget} community=${community}`);
    }

    return commands;
}

/**
 * Generate L2TP VPN server setup
 */
export function buildL2tpServer(opts: L2tpServerOptions): string[] {
    const { profile, localAddress, remoteAddressPool, secret, username } = opts;
    const commands = [
        `/ip pool add name=${profile}-pool ranges=${remoteAddressPool}`,
        `/ppp profile add name=${profile} local-address=${localAddress} remote-address=${profile}-pool use-encryption=yes`,
        `/interface l2tp-server server set enabled=yes use-ipsec=yes ipsec-secret=${secret} default-profile=${profile}`,
        `/ip firewall filter add chain=input protocol=udp dst-port=1701,500,4500 action=accept comment="Allow L2TP/IPsec"`,
    ];

    if (username) {
        commands.push(`/ppp secret add name=${username} service=l2tp profile=${profile}`);
    }

    return commands;
}

/**
 * Generate IPsec site-to-site VPN setup
 */
export function buildIpsecSiteToSite(opts: IpsecSiteToSiteOptions): string[] {
    const { peerAddress, psk, localSubnet, remoteSubnet, proposalName = 'default' } = opts;
    const peerName = `peer-${peerAddress.replace(/\./g, '-')}`;

    return [
        `/ip ipsec profile add name=${peerName}-profile hash-algorithm=sha256 enc-algorithm=aes-256,aes-128 dh-group=modp2048 proposal-check=obey`,
        `/ip ipsec peer add name=${peerName} address=${peerAddress} exchange-mode=ike2 profile=${peerName}-profile secret=${psk}`,
        `/ip ipsec proposal add name=${proposalName} auth-algorithms=sha256 enc-algorithms=aes-256-cbc pfs-group=none`,
        `/ip ipsec policy add src-address=${localSubnet} dst-address=${remoteSubnet} peer=${peerName} tunnel=yes action=encrypt proposal=${proposalName}`,
        `/ip firewall nat add chain=srcnat src-address=${localSubnet} dst-address=${remoteSubnet} action=accept comment="Bypass NAT for IPsec ${peerName}"`,
    ];
}

/**
 * Generate syslog remote server commands
 */
export function buildSyslogRemote(remoteIp: string, port: number, topics: string = 'info'): string[] {
    return [
        `/system logging action add name=remote-udp target=remote remote=${remoteIp} remote-port=${port}`,
        `/system logging add action=remote-udp topics=${topics}`,
    ];
}

/**
 * Generate netwatch monitoring command
 */
export function buildNetwatch(opts: NetwatchOptions): string[] {
    const { host, interval = '30s', upScript = ':log info "Host up"', downScript = ':log warning "Host down"' } = opts;
    const safeDown = downScript.replace(/"/g, '\\"');
    const safeUp = upScript.replace(/"/g, '\\"');

    return [`/tool netwatch add host=${host} interval=${interval} down-script="${safeDown}" up-script="${safeUp}"`];
}

/**
 * Generate backup commands (local + optional remote upload)
 */
export function buildBackup(opts: BackupOptions): string[] {
    const { name = 'backup', password, uploadTo } = opts;
    const commands = [`/system backup save name=${name}${password ? ` password=${password}` : ''}`];

    if (uploadTo) {
        commands.push(`/tool fetch upload=yes url=${uploadTo}/${name}.backup src-path=${name}.backup mode=scp`);
    }

    return commands;
}

/**
 * Generate simple queue for IP or subnet
 */
export function buildSimpleQueue(opts: SimpleQueueOptions): string[] {
    const { name, target, maxUpload, maxDownload } = opts;
    return [`/queue simple add name=${name} target=${target} max-limit=${maxUpload}/${maxDownload} comment="Queue ${name}"`];
}

/**
 * Generate toolkit diagnostic commands (ping + traceroute)
 */
export function buildToolkit(target: string, count: number = 4, size: number = 64): string[] {
    return [
        `/ping ${target} count=${count} size=${size}`,
        `/tool traceroute address=${target} use-dns=yes`,
    ];
}

/**
 * Generate torch traffic monitoring command
 */
export function buildTorch(interfaceName: string, port?: string, ip?: string): string[] {
    const params = [`interface=${interfaceName}`];
    if (port) params.push(`port=${port}`);
    if (ip) params.push(`ip-address=${ip}`);
    return [`/tool torch ${params.join(' ')}`];
}

/**
 * Generate commands to disable services
 */
export function buildDisableServices(services: { www?: boolean; telnet?: boolean; ssh?: boolean; ftp?: boolean; api?: boolean; apissl?: boolean }): string[] {
    const commands: string[] = [];
    if (services.www) commands.push('/ip service set www disabled=yes');
    if (services.telnet) commands.push('/ip service set telnet disabled=yes');
    if (services.ssh) commands.push('/ip service set ssh disabled=yes');
    if (services.ftp) commands.push('/ip service set ftp disabled=yes');
    if (services.api) commands.push('/ip service set api disabled=yes');
    if (services.apissl) commands.push('/ip service set api-ssl disabled=yes');
    return commands;
}

/**
 * Generate brute-force protection rules
 */
export function buildBruteForceProtection(sshPort: number, winboxPort: number, threshold: number = 5, blockTime: string = '1h'): string[] {
    return [
        `/ip firewall filter add chain=input protocol=tcp dst-port=${sshPort},${winboxPort} connection-state=new src-address-list=bruteforce_blacklist action=drop comment="Drop brute force"`,
        `/ip firewall filter add chain=input protocol=tcp dst-port=${sshPort},${winboxPort} connection-state=new src-address-list=bruteforce_stage action=add-src-to-address-list address-list=bruteforce_blacklist address-list-timeout=${blockTime} comment="Stage to blacklist"`,
        `/ip firewall filter add chain=input protocol=tcp dst-port=${sshPort},${winboxPort} connection-state=new action=add-src-to-address-list address-list=bruteforce_stage address-list-timeout=5m limit=${threshold}/1m,5:packet comment="Detect brute force"`,
    ];
}
