/**
 * Phase 3: Policy-Based Routing
 * Advanced routing with risk levels, budget controls, and simulation
 */

import type { ModelLayer } from '../../config/models.js';
import type { TaskType } from '../../mcp/types.js';
import { logger } from '../../logging/logger.js';

export interface RoutingPolicy {
    id: string;
    name: string;
    description: string;
    rules: PolicyRule[];
    priority: number;
    enabled: boolean;
}

export interface PolicyRule {
    condition: RuleCondition;
    action: RuleAction;
    risk: RiskLevel;
}

export interface RuleCondition {
    taskType?: TaskType | TaskType[];
    complexity?: 'low' | 'medium' | 'high';
    filePattern?: string; // regex pattern
    costThreshold?: number;
    timeOfDay?: { start: number; end: number }; // hours 0-23
    userRole?: string[];
}

export interface RuleAction {
    type: 'allow' | 'deny' | 'escalate' | 'downgrade' | 'route-to';
    targetLayer?: ModelLayer;
    maxCost?: number;
    requireApproval?: boolean;
    alertUsers?: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Predefined routing policies
 */
export const DEFAULT_POLICIES: RoutingPolicy[] = [
    {
        id: 'cost-control',
        name: 'Cost Control Policy',
        description: 'Limit expensive model usage for non-critical tasks',
        priority: 100,
        enabled: true,
        rules: [
            {
                condition: {
                    complexity: 'low',
                    costThreshold: 0.01,
                },
                action: {
                    type: 'route-to',
                    targetLayer: 'L0',
                    maxCost: 0.005,
                },
                risk: 'low',
            },
            {
                condition: {
                    costThreshold: 1.0,
                },
                action: {
                    type: 'escalate',
                    requireApproval: true,
                    alertUsers: ['admin'],
                },
                risk: 'high',
            },
        ],
    },
    {
        id: 'business-hours',
        name: 'Business Hours Policy',
        description: 'Route to cheaper models outside business hours',
        priority: 80,
        enabled: true,
        rules: [
            {
                condition: {
                    timeOfDay: { start: 18, end: 8 }, // 6 PM - 8 AM
                    complexity: 'low',
                },
                action: {
                    type: 'downgrade',
                    targetLayer: 'L0',
                },
                risk: 'low',
            },
        ],
    },
    {
        id: 'security-sensitive',
        name: 'Security Sensitive Files',
        description: 'Require high-quality models for security-critical code',
        priority: 200,
        enabled: true,
        rules: [
            {
                condition: {
                    filePattern: '.*(auth|security|crypto|password).*',
                },
                action: {
                    type: 'route-to',
                    targetLayer: 'L2',
                },
                risk: 'critical',
            },
        ],
    },
    {
        id: 'test-files',
        name: 'Test File Policy',
        description: 'Use cheaper models for test file generation',
        priority: 50,
        enabled: true,
        rules: [
            {
                condition: {
                    filePattern: '.*\\.test\\.(ts|js)$',
                    taskType: 'code',
                },
                action: {
                    type: 'route-to',
                    targetLayer: 'L1',
                    maxCost: 0.05,
                },
                risk: 'low',
            },
        ],
    },
];

/**
 * Policy Matcher - Evaluate routing policies
 */
export class PolicyMatcher {
    private policies: RoutingPolicy[];

    constructor(policies: RoutingPolicy[] = DEFAULT_POLICIES) {
        this.policies = policies.filter((p) => p.enabled).sort((a, b) => b.priority - a.priority);
    }

    /**
     * Match policies against request context
     */
    match(context: {
        taskType?: TaskType;
        complexity?: 'low' | 'medium' | 'high';
        filePath?: string;
        estimatedCost?: number;
        userRole?: string;
    }): {
        matchedPolicies: RoutingPolicy[];
        action: RuleAction | null;
        risk: RiskLevel;
    } {
        const matchedPolicies: RoutingPolicy[] = [];
        let finalAction: RuleAction | null = null;
        let finalRisk: RiskLevel = 'low';

        for (const policy of this.policies) {
            for (const rule of policy.rules) {
                if (this.matchesCondition(rule.condition, context)) {
                    matchedPolicies.push(policy);
                    finalAction = rule.action;
                    finalRisk = this.maxRisk(finalRisk, rule.risk);

                    logger.info('Policy matched', {
                        policyId: policy.id,
                        policyName: policy.name,
                        action: rule.action.type,
                        risk: rule.risk,
                    });

                    // Stop at first match (highest priority)
                    break;
                }
            }

            if (finalAction) break;
        }

        return {
            matchedPolicies,
            action: finalAction,
            risk: finalRisk,
        };
    }

    /**
     * Check if rule condition matches context
     */
    private matchesCondition(
        condition: RuleCondition,
        context: {
            taskType?: TaskType;
            complexity?: 'low' | 'medium' | 'high';
            filePath?: string;
            estimatedCost?: number;
            userRole?: string;
        },
    ): boolean {
        // Task type match
        if (condition.taskType) {
            const taskTypes = Array.isArray(condition.taskType) ? condition.taskType : [condition.taskType];
            if (context.taskType && !taskTypes.includes(context.taskType)) {
                return false;
            }
        }

        // Complexity match
        if (condition.complexity && context.complexity !== condition.complexity) {
            return false;
        }

        // File pattern match
        if (condition.filePattern && context.filePath) {
            const regex = new RegExp(condition.filePattern);
            if (!regex.test(context.filePath)) {
                return false;
            }
        }

        // Cost threshold match
        if (condition.costThreshold !== undefined && context.estimatedCost !== undefined) {
            if (context.estimatedCost < condition.costThreshold) {
                return false;
            }
        }

        // Time of day match
        if (condition.timeOfDay) {
            const hour = new Date().getHours();
            const { start, end } = condition.timeOfDay;

            // Handle overnight range (e.g., 18:00 - 08:00)
            const inRange = start > end
                ? hour >= start || hour < end
                : hour >= start && hour < end;

            if (!inRange) {
                return false;
            }
        }

        // User role match
        if (condition.userRole && context.userRole) {
            if (!condition.userRole.includes(context.userRole)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get maximum risk level
     */
    private maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
        const levels: Record<RiskLevel, number> = {
            low: 1,
            medium: 2,
            high: 3,
            critical: 4,
        };

        return levels[a] > levels[b] ? a : b;
    }

    /**
     * Add custom policy
     */
    addPolicy(policy: RoutingPolicy): void {
        this.policies.push(policy);
        this.policies.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Remove policy by ID
     */
    removePolicy(policyId: string): void {
        this.policies = this.policies.filter((p) => p.id !== policyId);
    }

    /**
     * Update policy
     */
    updatePolicy(policyId: string, updates: Partial<RoutingPolicy>): void {
        const index = this.policies.findIndex((p) => p.id === policyId);
        if (index !== -1) {
            this.policies[index] = { ...this.policies[index], ...updates };
            this.policies.sort((a, b) => b.priority - a.priority);
        }
    }
}

/**
 * Route Simulator - Test routing decisions without execution
 */
export class RouteSimulator {
    constructor(private policyMatcher: PolicyMatcher) { }

    /**
     * Simulate routing decision
     */
    simulate(context: {
        taskType?: TaskType;
        complexity?: 'low' | 'medium' | 'high';
        filePath?: string;
        estimatedCost?: number;
        userRole?: string;
    }): {
        selectedLayer: ModelLayer;
        matchedPolicies: string[];
        risk: RiskLevel;
        estimatedCost: number;
        reasoning: string;
    } {
        const result = this.policyMatcher.match(context);

        let selectedLayer: ModelLayer = 'L0'; // Default
        let reasoning = 'Default routing to L0';

        if (result.action) {
            if (result.action.type === 'route-to' && result.action.targetLayer) {
                selectedLayer = result.action.targetLayer;
                reasoning = `Policy-based routing to ${selectedLayer}`;
            } else if (result.action.type === 'escalate') {
                selectedLayer = 'L2';
                reasoning = 'Escalated to L2 due to policy';
            } else if (result.action.type === 'downgrade') {
                selectedLayer = result.action.targetLayer || 'L0';
                reasoning = `Downgraded to ${selectedLayer} due to policy`;
            }
        }

        const estimatedCost = this.estimateCost(selectedLayer);

        return {
            selectedLayer,
            matchedPolicies: result.matchedPolicies.map((p) => p.name),
            risk: result.risk,
            estimatedCost,
            reasoning,
        };
    }

    /**
     * Estimate cost for layer (simplified)
     */
    private estimateCost(layer: ModelLayer): number {
        const costMap: Record<ModelLayer, number> = {
            L0: 0.0,
            L1: 0.01,
            L2: 0.05,
            L3: 0.20,
        };

        return costMap[layer] || 0.0;
    }

    /**
     * Batch simulation for multiple scenarios
     */
    batchSimulate(
        scenarios: Array<{
            name: string;
            context: Parameters<RouteSimulator['simulate']>[0];
        }>,
    ): Array<{
        scenario: string;
        result: ReturnType<RouteSimulator['simulate']>;
    }> {
        return scenarios.map((scenario) => ({
            scenario: scenario.name,
            result: this.simulate(scenario.context),
        }));
    }
}
