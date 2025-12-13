/**
 * @file DHCP Client Module Compiler
 * @description Compiles DHCP client commands for WAN interfaces
 */

import type { DhcpClientParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileDhcpClient(
    facts: DeviceFacts,
    params: DhcpClientParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];
    const rollbackCommands: string[] = [];

    for (const client of params.clients) {
        // Check if interface exists
        const ifaceExists = facts.interfaces.some(i => i.name === client.interface);
        if (!ifaceExists) {
            warnings.push({
                level: 'critical',
                message: `Interface ${client.interface} does not exist for DHCP client.`,
                module: 'dhcpClient',
            });
            continue;
        }

        // Check if DHCP client already exists
        const existing = facts.dhcpClients?.find(c => c.interface === client.interface);
        if (existing) {
            warnings.push({
                level: 'info',
                message: `DHCP client already exists on ${client.interface}. Skipping.`,
                module: 'dhcpClient',
            });
            continue;
        }

        const addDefaultRoute = client.addDefaultRoute ? 'yes' : 'no';
        const usePeerDns = client.usePeerDns ? 'yes' : 'no';
        const usePeerNtp = client.usePeerNtp ? 'yes' : 'no';
        const disabled = client.disabled ? 'yes' : 'no';

        commands.push(
            `/ip dhcp-client add interface=${client.interface} add-default-route=${addDefaultRoute} use-peer-dns=${usePeerDns} use-peer-ntp=${usePeerNtp} disabled=${disabled}`
        );

        rollbackCommands.push(
            `/ip dhcp-client remove [find interface=${client.interface}]`
        );
    }

    return {
        module: 'dhcpClient',
        title: 'DHCP Client (WAN)',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: 'medium',
    };
}
