/**
 * @file DHCP Server Module Compiler
 * @description Compiles DHCP server commands: pool, server, network
 */

import type { DhcpServerParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileDhcpServer(
    facts: DeviceFacts,
    params: DhcpServerParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];
    const rollbackCommands: string[] = [];

    for (const server of params.servers) {
        // Check if interface exists
        const ifaceExists = facts.interfaces.some(i => i.name === server.interface);
        if (!ifaceExists) {
            warnings.push({
                level: 'critical',
                message: `Interface ${server.interface} does not exist for DHCP server.`,
                module: 'dhcpServer',
            });
            continue;
        }

        // Check if DHCP server already exists
        const existing = facts.dhcpServers?.find(s => s.interface === server.interface);
        if (existing) {
            warnings.push({
                level: 'info',
                message: `DHCP server already exists on ${server.interface}. Skipping.`,
                module: 'dhcpServer',
            });
            continue;
        }

        // 1. Create IP pool
        commands.push(
            `/ip pool add name=${server.poolName} ranges=${server.poolRange}`
        );

        // 2. Add DHCP server
        commands.push(
            `/ip dhcp-server add name=${server.name} interface=${server.interface} address-pool=${server.poolName} disabled=no`
        );

        // 3. Add DHCP network
        const dnsServers = server.dnsServers?.join(',') || server.gateway;
        const leaseTime = server.leaseTime || '1d';

        commands.push(
            `/ip dhcp-server network add address=${server.network} gateway=${server.gateway} dns-server=${dnsServers} netmask=${extractNetmask(server.network)} lease-time=${leaseTime}`
        );

        // Rollback
        rollbackCommands.push(
            `/ip dhcp-server remove [find name=${server.name}]`,
            `/ip pool remove [find name=${server.poolName}]`,
            `/ip dhcp-server network remove [find address=${server.network}]`
        );
    }

    return {
        module: 'dhcpServer',
        title: 'DHCP Server (LAN/VLAN)',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: 'low',
    };
}

function extractNetmask(cidr: string): string {
    const prefix = parseInt(cidr.split('/')[1] || '24', 10);
    const masks: Record<number, string> = {
        8: '255.0.0.0',
        16: '255.255.0.0',
        24: '255.255.255.0',
        25: '255.255.255.128',
        26: '255.255.255.192',
        27: '255.255.255.224',
        28: '255.255.255.240',
        29: '255.255.255.248',
        30: '255.255.255.252',
    };
    return masks[prefix] || '255.255.255.0';
}
