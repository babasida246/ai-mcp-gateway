/**
 * Shared RouterOS command builders for frontend
 */

import { normalizeList } from './utils';

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
 * Generate interface enable/disable command
 */
export function buildInterfaceState(iface: string, enabled: boolean): string[] {
    return [`/interface set [find name=${iface}] disabled=${enabled ? 'no' : 'yes'}`];
}

/**
 * Generate MTU configuration command
 */
export function buildMtu(iface: string, mtu: number): string[] {
    return [`/interface set [find name=${iface}] mtu=${mtu}`];
}
