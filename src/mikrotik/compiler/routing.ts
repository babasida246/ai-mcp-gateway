/**
 * @file Routing Module Compiler
 * @description Compiles routing commands: default route, static routes
 */

import type { RoutingParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileRouting(
    facts: DeviceFacts,
    params: RoutingParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];
    const rollbackCommands: string[] = [];

    // Default route
    if (params.defaultRoute) {
        const checkGateway = params.defaultRoute.checkGateway === true ? 'ping' :
            params.defaultRoute.checkGateway === false ? 'arp' :
                params.defaultRoute.checkGateway || 'ping';
        const distance = params.defaultRoute.distance || 1;

        commands.push(
            `/ip route add dst-address=0.0.0.0/0 gateway=${params.defaultRoute.gateway} distance=${distance} check-gateway=${checkGateway} comment="Default route"`
        );

        rollbackCommands.push(
            `/ip route remove [find dst-address=0.0.0.0/0 gateway=${params.defaultRoute.gateway}]`
        );
    }

    // Static routes
    if (params.staticRoutes) {
        for (const route of params.staticRoutes) {
            const distance = route.distance || 1;
            const commentPart = route.comment ? ` comment="${route.comment}"` : '';

            commands.push(
                `/ip route add dst-address=${route.dstAddress} gateway=${route.gateway} distance=${distance}${commentPart}`
            );

            rollbackCommands.push(
                `/ip route remove [find dst-address=${route.dstAddress} gateway=${route.gateway}]`
            );
        }
    }

    return {
        module: 'routing',
        title: 'Routing Configuration',
        commands,
        rollbackCommands: rollbackCommands.length > 0 ? rollbackCommands : undefined,
        risk: 'medium',
    };
}
