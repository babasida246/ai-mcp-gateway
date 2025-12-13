/**
 * @file Main Compiler
 * @description Orchestrates compilation of Plan JSON to RouterOS commands
 */

import type {
    MikrotikPlan,
    CompiledResult,
    DeviceFacts,
    ModuleCommands,
    Warning,
} from './types.js';

import { compileSystem } from './compiler/system.js';
import { compileServices } from './compiler/services.js';
import { compileIp } from './compiler/ip.js';
import { compileDns } from './compiler/dns.js';
import { compileDhcpClient } from './compiler/dhcpClient.js';
import { compileDhcpServer } from './compiler/dhcpServer.js';
import { compileFirewall } from './compiler/firewall.js';
import { compileNat } from './compiler/nat.js';
import { compileRouting } from './compiler/routing.js';

export async function compilePlan(
    plan: MikrotikPlan,
    facts: DeviceFacts
): Promise<CompiledResult> {
    const commandsByModule: Record<string, ModuleCommands> = {};
    const allCommands: string[] = [];
    const warnings: Warning[] = [];

    // Snapshot commands (if required)
    const snapshotCommands: string[] = [];
    if (plan.policy.requireSnapshot) {
        snapshotCommands.push(
            `/system backup save name="prechange-${plan.changeId}"`,
            `/export file="prechange-export-${plan.changeId}"`
        );
        allCommands.push(...snapshotCommands);
        allCommands.push('# --- Configuration changes below ---');
    }

    // Compile each step
    for (const step of plan.steps) {
        let moduleResult: ModuleCommands | null = null;

        switch (step.module) {
            case 'system':
                moduleResult = compileSystem(facts, step.params);
                break;
            case 'services':
                moduleResult = compileServices(facts, step.params);
                break;
            case 'ip':
                moduleResult = compileIp(facts, step.params);
                break;
            case 'dns':
                moduleResult = compileDns(facts, step.params);
                break;
            case 'dhcpClient':
                moduleResult = compileDhcpClient(facts, step.params);
                break;
            case 'dhcpServer':
                moduleResult = compileDhcpServer(facts, step.params);
                break;
            case 'firewall':
                moduleResult = compileFirewall(facts, step.params);
                break;
            case 'nat':
                moduleResult = compileNat(facts, step.params);
                break;
            case 'routing':
                moduleResult = compileRouting(facts, step.params);
                break;
            default:
                warnings.push({
                    level: 'warning',
                    message: `Module ${step.module} not implemented yet`,
                    module: step.module as any,
                    step: step.id,
                });
        }

        if (moduleResult) {
            commandsByModule[step.module] = moduleResult;
            allCommands.push(`# ${moduleResult.title}`);
            allCommands.push(...moduleResult.commands);
            allCommands.push(''); // blank line
        }
    }

    // Estimate duration
    const estimatedDuration = estimateDuration(plan.steps.length, allCommands.length);

    return {
        changeId: plan.changeId,
        commandsByModule,
        allCommands,
        warnings,
        estimatedDuration,
        snapshotCommands: snapshotCommands.length > 0 ? snapshotCommands : undefined,
    };
}

function estimateDuration(steps: number, commands: number): string {
    // Rough estimate: 1s per command + 5s per step
    const seconds = commands + steps * 5;

    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        return `${Math.ceil(seconds / 60)}m`;
    } else {
        return `${Math.ceil(seconds / 3600)}h`;
    }
}
