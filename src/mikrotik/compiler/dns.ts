/**
 * @file DNS Module Compiler
 * @description Compiles DNS configuration commands
 */

import type { DnsParams, ModuleCommands, DeviceFacts } from '../types.js';

export function compileDns(
    facts: DeviceFacts,
    params: DnsParams
): ModuleCommands {
    const commands: string[] = [];
    const rollbackCommands: string[] = [];

    const servers = params.servers.join(',');
    const allowRemote = params.allowRemoteRequests ? 'yes' : 'no';

    commands.push(
        `/ip dns set servers=${servers} allow-remote-requests=${allowRemote}`
    );

    // Rollback to current DNS settings
    const currentServers = facts.dnsServers?.join(',') || '';
    rollbackCommands.push(
        `/ip dns set servers=${currentServers} allow-remote-requests=no`
    );

    return {
        module: 'dns',
        title: 'DNS Configuration',
        commands,
        rollbackCommands,
        risk: 'low',
    };
}
