/**
 * @file Services Module Compiler
 * @description Compiles service management commands: winbox, ssh, api, www, etc.
 */

import type { ServicesParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileServices(
    facts: DeviceFacts,
    params: ServicesParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];
    const rollbackCommands: string[] = [];

    for (const svc of params.services) {
        const existingSvc = facts.services.find(s => s.name === svc.name);

        // Build set command
        const parts: string[] = [];
        parts.push(`/ip service set ${svc.name}`);

        if (svc.disabled !== undefined) {
            parts.push(`disabled=${svc.disabled ? 'yes' : 'no'}`);
        }

        if (svc.port !== undefined) {
            parts.push(`port=${svc.port}`);
        }

        if (svc.address !== undefined) {
            parts.push(`address="${svc.address}"`);
        }

        commands.push(parts.join(' '));

        // Rollback
        if (existingSvc) {
            rollbackCommands.push(
                `/ip service set ${svc.name} disabled=${existingSvc.disabled ? 'yes' : 'no'} port=${existingSvc.port}${existingSvc.address ? ` address="${existingSvc.address}"` : ''}`
            );
        }

        // Warnings
        if (['winbox', 'ssh'].includes(svc.name) && svc.disabled && !svc.address) {
            warnings.push({
                level: 'critical',
                message: `Disabling ${svc.name} without address restriction may lock you out! Ensure other management access is configured.`,
                module: 'services',
            });
        }

        if (!svc.disabled && !svc.address) {
            warnings.push({
                level: 'warning',
                message: `${svc.name} is enabled without address restriction. Consider limiting access to management subnets.`,
                module: 'services',
            });
        }
    }

    return {
        module: 'services',
        title: 'Services Management',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: commands.some(c => c.includes('winbox') || c.includes('ssh')) ? 'high' : 'medium',
    };
}
