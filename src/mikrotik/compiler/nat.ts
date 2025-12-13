/**
 * @file NAT Module Compiler
 * @description Compiles NAT commands: masquerade, dst-nat (port forwarding), hairpin NAT
 */

import type { NatParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileNat(
    facts: DeviceFacts,
    params: NatParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];

    // Masquerade (srcnat)
    for (const outIface of params.masquerade.outInterfaces) {
        const ifaceExists = facts.interfaces.some(i => i.name === outIface);
        if (!ifaceExists) {
            warnings.push({
                level: 'warning',
                message: `Interface ${outIface} does not exist for masquerade.`,
                module: 'nat',
            });
            continue;
        }

        commands.push(
            `/ip firewall nat add chain=srcnat out-interface=${outIface} action=masquerade comment="Masquerade ${outIface}"`
        );
    }

    // Port forwarding (dst-nat)
    if (params.portForwards) {
        for (const pf of params.portForwards) {
            const protocols: string[] = pf.protocol === 'both' ? ['tcp', 'udp'] : [pf.protocol];

            for (const proto of protocols) {
                const toPort = pf.toPort !== undefined ? pf.toPort : pf.dstPort;
                const commentPart = pf.comment ? ` comment="${pf.comment}"` : '';

                commands.push(
                    `/ip firewall nat add chain=dstnat protocol=${proto} dst-port=${pf.dstPort} action=dst-nat to-addresses=${pf.toAddress} to-ports=${toPort}${commentPart}`
                );
            }
        }
    }

    // Hairpin NAT
    if (params.hairpinNat) {
        warnings.push({
            level: 'info',
            message: 'Hairpin NAT enabled. Adds srcnat rule for local-to-local port forwards.',
            module: 'nat',
        });

        commands.push(
            `/ip firewall nat add chain=srcnat src-address=192.168.0.0/16 dst-address=192.168.0.0/16 action=masquerade comment="Hairpin NAT"`
        );
    }

    return {
        module: 'nat',
        title: 'NAT Configuration',
        commands,
        risk: 'medium',
    };
}
