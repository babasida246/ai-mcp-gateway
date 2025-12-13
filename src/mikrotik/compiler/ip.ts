/**
 * @file IP Module Compiler
 * @description Compiles IP address management commands
 */

import type { IpAddressParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileIp(
    facts: DeviceFacts,
    params: IpAddressParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];
    const rollbackCommands: string[] = [];

    for (const addr of params.addresses) {
        // Check if interface exists
        const ifaceExists = facts.interfaces.some(i => i.name === addr.interface);
        if (!ifaceExists) {
            warnings.push({
                level: 'critical',
                message: `Interface ${addr.interface} does not exist. Ensure interface is created first.`,
                module: 'ip',
            });
            continue;
        }

        // Check for conflicts
        const existingIp = facts.ipAddresses.find(
            ip => ip.interface === addr.interface && ip.address === addr.address
        );

        if (existingIp) {
            warnings.push({
                level: 'info',
                message: `IP ${addr.address} already exists on ${addr.interface}. Skipping.`,
                module: 'ip',
            });
            continue;
        }

        // Check if this is a management interface
        const mgmtInterfaces = ['br-lan', 'bridge', 'ether2', 'ether8']; // common mgmt interfaces
        const isMgmt = mgmtInterfaces.includes(addr.interface);

        if (isMgmt) {
            warnings.push({
                level: 'critical',
                message: `Changing IP on management interface ${addr.interface}. Risk of lockout! Verify new address is accessible.`,
                module: 'ip',
            });
        }

        const commentPart = addr.comment ? ` comment="${addr.comment}"` : '';
        commands.push(
            `/ip address add interface=${addr.interface} address=${addr.address}${commentPart}`
        );

        // Rollback: remove the added address
        rollbackCommands.push(
            `/ip address remove [find interface=${addr.interface} address=${addr.address}]`
        );
    }

    return {
        module: 'ip',
        title: 'IP Addressing',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: warnings.some(w => w.level === 'critical') ? 'high' : 'low',
    };
}
