/**
 * @file Firewall Module Compiler
 * @description Compiles firewall filter rules based on presets: Basic, Standard, Strict
 */

import type { FirewallParams, ModuleCommands, DeviceFacts, Warning } from '../types.js';

export function compileFirewall(
    facts: DeviceFacts,
    params: FirewallParams
): ModuleCommands {
    const commands: string[] = [];
    const warnings: Warning[] = [];

    // Warning for FastTrack
    if (params.enableFastTrack) {
        warnings.push({
            level: 'warning',
            message: 'FastTrack enabled. This bypasses many firewall rules for performance. Ensure you understand the security implications.',
            module: 'firewall',
        });
    }

    const preset = params.preset;

    if (preset === 'basic') {
        commands.push(...compileBasicFirewall(params));
    } else if (preset === 'standard') {
        commands.push(...compileStandardFirewall(params));
    } else if (preset === 'strict') {
        commands.push(...compileStrictFirewall(params));
    }

    // Custom rules
    if (params.customRules) {
        for (const rule of params.customRules) {
            commands.push(compileFirewallRule(rule));
        }
    }

    return {
        module: 'firewall',
        title: `Firewall (${preset.charAt(0).toUpperCase() + preset.slice(1)} Preset)`,
        commands,
        risk: preset === 'strict' ? 'high' : 'medium',
    };
}

function compileBasicFirewall(params: FirewallParams): string[] {
    const cmds: string[] = [];
    const wanList = params.wanInterfaces.join(',');
    const mgmtSubnets = params.mgmtSubnets.join(',');

    // INPUT chain
    cmds.push(
        `/ip firewall filter add chain=input action=accept connection-state=established,related comment="Allow established/related"`,
        `/ip firewall filter add chain=input action=drop connection-state=invalid comment="Drop invalid"`,
        `/ip firewall filter add chain=input action=accept protocol=icmp comment="Allow ICMP"`,
        `/ip firewall filter add chain=input action=accept src-address=${mgmtSubnets} comment="Allow management"`,
        `/ip firewall filter add chain=input action=drop in-interface-list=WAN comment="Drop WAN input"`
    );

    // FORWARD chain
    cmds.push(
        `/ip firewall filter add chain=forward action=accept connection-state=established,related comment="Allow established/related"`,
        `/ip firewall filter add chain=forward action=drop connection-state=invalid comment="Drop invalid"`,
        `/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN comment="Allow LAN to WAN"`
    );

    // FastTrack
    if (params.enableFastTrack) {
        cmds.unshift(
            `/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack"`
        );
    }

    return cmds;
}

function compileStandardFirewall(params: FirewallParams): string[] {
    const cmds = compileBasicFirewall(params);

    // Add more granular rules
    cmds.push(
        `/ip firewall filter add chain=input action=drop protocol=tcp dst-port=23,135,139,445 comment="Drop common exploits"`,
        `/ip firewall filter add chain=forward action=drop src-address-list=blacklist comment="Drop blacklisted"`
    );

    return cmds;
}

function compileStrictFirewall(params: FirewallParams): string[] {
    const cmds: string[] = [];
    const mgmtSubnets = params.mgmtSubnets.join(',');

    // Strict INPUT: default drop
    cmds.push(
        `/ip firewall filter add chain=input action=accept connection-state=established,related comment="Allow established/related"`,
        `/ip firewall filter add chain=input action=drop connection-state=invalid comment="Drop invalid"`,
        `/ip firewall filter add chain=input action=accept protocol=icmp limit=50/5s:20 comment="Allow ICMP (rate-limited)"`,
        `/ip firewall filter add chain=input action=accept src-address=${mgmtSubnets} comment="Allow management"`,
        `/ip firewall filter add chain=input action=drop comment="Drop all other input"`
    );

    // Strict FORWARD: default drop inter-VLAN
    cmds.push(
        `/ip firewall filter add chain=forward action=accept connection-state=established,related comment="Allow established/related"`,
        `/ip firewall filter add chain=forward action=drop connection-state=invalid comment="Drop invalid"`,
        `/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN comment="Allow LAN to WAN"`,
        `/ip firewall filter add chain=forward action=drop comment="Drop inter-VLAN (add allow rules as needed)"`
    );

    if (params.enableFastTrack) {
        cmds.unshift(
            `/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack"`
        );
    }

    return cmds;
}

function compileFirewallRule(rule: any): string {
    const parts: string[] = [
        `/ip firewall filter add`,
        `chain=${rule.chain}`,
        `action=${rule.action}`,
    ];

    if (rule.protocol) parts.push(`protocol=${rule.protocol}`);
    if (rule.srcAddress) parts.push(`src-address=${rule.srcAddress}`);
    if (rule.dstAddress) parts.push(`dst-address=${rule.dstAddress}`);
    if (rule.srcPort) parts.push(`src-port=${rule.srcPort}`);
    if (rule.dstPort) parts.push(`dst-port=${rule.dstPort}`);
    if (rule.inInterface) parts.push(`in-interface=${rule.inInterface}`);
    if (rule.outInterface) parts.push(`out-interface=${rule.outInterface}`);
    if (rule.comment) parts.push(`comment="${rule.comment}"`);

    return parts.join(' ');
}
