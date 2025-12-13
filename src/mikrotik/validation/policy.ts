/**
 * @file Policy Validator
 * @description Validates Plan JSON against safety policies
 */

import type {
    MikrotikPlan,
    DeviceFacts,
    ValidationResult,
    ValidationError,
    PolicyViolation,
    Warning,
} from './types.js';

export function validatePlan(
    plan: MikrotikPlan,
    facts: DeviceFacts
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: Warning[] = [];
    const policyViolations: PolicyViolation[] = [];

    // Policy: noLockout
    if (plan.policy.noLockout) {
        checkNoLockout(plan, facts, policyViolations, warnings);
    }

    // Policy: allowVlanFiltering
    if (!plan.policy.allowVlanFiltering) {
        checkVlanFiltering(plan, policyViolations);
    }

    // Policy: allowMgmtIpChange
    if (!plan.policy.allowMgmtIpChange) {
        checkMgmtIpChange(plan, facts, policyViolations);
    }

    // Check prechecks
    for (const step of plan.steps) {
        for (const precheck of step.precheck) {
            const precheckResult = validatePrecheck(precheck, facts);
            if (!precheckResult.valid) {
                errors.push({
                    step: step.id,
                    module: step.module,
                    message: `Precheck failed: ${precheck.description}`,
                    details: precheckResult.reason,
                });
            }
        }
    }

    const valid = errors.length === 0 &&
        policyViolations.filter(v => v.severity === 'blocking').length === 0;

    return {
        valid,
        errors,
        warnings,
        policyViolations,
    };
}

function checkNoLockout(
    plan: MikrotikPlan,
    facts: DeviceFacts,
    policyViolations: PolicyViolation[],
    warnings: Warning[]
): void {
    // Check if disabling winbox/ssh without address restriction
    const serviceSteps = plan.steps.filter(s => s.module === 'services');

    for (const step of serviceSteps) {
        const services = step.params.services || [];
        for (const svc of services) {
            if (['winbox', 'ssh'].includes(svc.name) && svc.disabled && !svc.address) {
                policyViolations.push({
                    policy: 'noLockout',
                    message: `Cannot disable ${svc.name} without address restriction. Risk of lockout.`,
                    severity: 'blocking',
                });
            }
        }
    }

    // Check if changing IP on management interface
    const ipSteps = plan.steps.filter(s => s.module === 'ip');
    const mgmtInterfaces = ['br-lan', 'bridge', 'ether2', 'ether8']; // common mgmt interfaces

    for (const step of ipSteps) {
        const addresses = step.params.addresses || [];
        for (const addr of addresses) {
            if (mgmtInterfaces.includes(addr.interface)) {
                warnings.push({
                    level: 'critical',
                    message: `Changing IP on management interface ${addr.interface}. Ensure new address is accessible.`,
                    module: 'ip',
                    step: step.id,
                });
            }
        }
    }
}

function checkVlanFiltering(
    plan: MikrotikPlan,
    policyViolations: PolicyViolation[]
): void {
    const bridgeSteps = plan.steps.filter(s => s.module === 'bridge');

    for (const step of bridgeSteps) {
        if (step.params.vlanFiltering === true) {
            policyViolations.push({
                policy: 'allowVlanFiltering',
                message: 'VLAN filtering is disabled by policy. Enabling it may cause connectivity loss.',
                severity: 'blocking',
            });
        }
    }
}

function checkMgmtIpChange(
    plan: MikrotikPlan,
    facts: DeviceFacts,
    policyViolations: PolicyViolation[]
): void {
    const ipSteps = plan.steps.filter(s => s.module === 'ip');
    const mgmtInterfaces = ['br-lan', 'bridge', 'ether2', 'ether8'];

    for (const step of ipSteps) {
        const addresses = step.params.addresses || [];
        for (const addr of addresses) {
            if (mgmtInterfaces.includes(addr.interface)) {
                // Check if IP already exists
                const existing = facts.ipAddresses.find(
                    ip => ip.interface === addr.interface
                );

                if (existing && existing.address !== addr.address) {
                    policyViolations.push({
                        policy: 'allowMgmtIpChange',
                        message: `Changing management IP on ${addr.interface} is disabled by policy.`,
                        severity: 'blocking',
                    });
                }
            }
        }
    }
}

function validatePrecheck(
    precheck: any,
    facts: DeviceFacts
): { valid: boolean; reason?: string } {
    switch (precheck.type) {
        case 'interface_exists': {
            const iface = precheck.params.interface;
            const exists = facts.interfaces.some(i => i.name === iface);
            return {
                valid: exists,
                reason: exists ? undefined : `Interface ${iface} does not exist`,
            };
        }

        case 'bridge_exists': {
            const bridge = precheck.params.bridge;
            const exists = facts.bridges.some(b => b.name === bridge);
            return {
                valid: exists,
                reason: exists ? undefined : `Bridge ${bridge} does not exist`,
            };
        }

        case 'vlan_available': {
            const vlanId = precheck.params.vlanId;
            const exists = facts.vlans.some(v => v.id === vlanId);
            return {
                valid: !exists,
                reason: exists ? `VLAN ${vlanId} already exists` : undefined,
            };
        }

        case 'ip_not_conflict': {
            const address = precheck.params.address;
            const iface = precheck.params.interface;
            const exists = facts.ipAddresses.some(
                ip => ip.interface === iface && ip.address === address
            );
            return {
                valid: !exists,
                reason: exists ? `IP ${address} already exists on ${iface}` : undefined,
            };
        }

        case 'service_port_free': {
            const port = precheck.params.port;
            const exists = facts.services.some(s => s.port === port && !s.disabled);
            return {
                valid: !exists,
                reason: exists ? `Port ${port} is already in use` : undefined,
            };
        }

        case 'mgmt_not_blocked': {
            const mgmtSubnets = precheck.params.mgmtSubnets || [];
            // Simplified check: assume valid if mgmt subnets are provided
            return {
                valid: mgmtSubnets.length > 0,
                reason: mgmtSubnets.length === 0 ? 'No management subnets specified' : undefined,
            };
        }

        default:
            return { valid: true };
    }
}
