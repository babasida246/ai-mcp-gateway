/**
 * @file System Module Compiler
 * @description Compiles system-related commands: identity, note, clock, NTP
 */

import type { SystemParams, ModuleCommands, DeviceFacts } from '../types.js';

export function compileSystem(
    facts: DeviceFacts,
    params: SystemParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: string[] = [];
    const rollbackCommands: string[] = [];

    // Identity
    if (params.identity) {
        const currentIdentity = facts.systemIdentity || 'MikroTik';
        commands.push(`/system identity set name="${params.identity}"`);
        rollbackCommands.push(`/system identity set name="${currentIdentity}"`);
    }

    // System note
    if (params.note) {
        commands.push(
            `/system note set show-at-login=yes note="${params.note}"`
        );
        rollbackCommands.push(`/system note set show-at-login=no note=""`);
    }

    // Timezone
    if (params.timezone) {
        commands.push(`/system clock set time-zone-name=${params.timezone}`);
        rollbackCommands.push(`/system clock set time-zone-name=UTC`);
    }

    // NTP
    if (params.ntpEnabled !== undefined || params.ntpServers) {
        const enabled = params.ntpEnabled ?? true;
        const servers = params.ntpServers?.join(',') || '0.pool.ntp.org,1.pool.ntp.org';

        commands.push(
            `/system ntp client set enabled=${enabled ? 'yes' : 'no'} servers=${servers}`
        );

        if (enabled) {
            warnings.push('NTP client enabled. Ensure firewall allows NTP (UDP 123) outbound.');
        }

        rollbackCommands.push(`/system ntp client set enabled=no servers=""`);
    }

    return {
        module: 'system',
        title: 'System Basics',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: 'low',
    };
}
