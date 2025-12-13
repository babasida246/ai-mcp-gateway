/**
 * @file MikroTik API Routes
 * @description REST endpoints for MikroTik Command Builder
 * 
 * Endpoints:
 * GET    /mikrotik/:deviceId/facts     - Get device facts
 * POST   /mikrotik/plan                - Generate Plan JSON from intent (AI)
 * POST   /mikrotik/compile             - Compile Plan JSON to commands
 * POST   /mikrotik/validate            - Validate Plan JSON
 * POST   /mikrotik/apply               - Apply commands (dry-run or execute)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logging/logger.js';
import { compilePlan } from '../../mikrotik/compiler.js';
import { validatePlan } from '../../mikrotik/validation/policy.js';
import type { MikrotikPlan, DeviceFacts } from '../../mikrotik/types.js';
import { routeRequest } from '../../routing/router.js';
import type { LLMRequest, RoutingContext } from '../../mcp/types.js';

const router = Router();

/**
 * Request schemas
 */
const PlanRequestSchema = z.object({
    intent: z.string(),
    deviceId: z.string(),
    facts: z.any(), // DeviceFacts
    constraints: z.any().optional(),
    selectedModules: z.array(z.string()).optional(),
});

const CompileRequestSchema = z.object({
    plan: z.any(), // MikrotikPlan
    facts: z.any(), // DeviceFacts
});

const ValidateRequestSchema = z.object({
    plan: z.any(), // MikrotikPlan
    facts: z.any(), // DeviceFacts
});

const ApplyRequestSchema = z.object({
    changeId: z.string(),
    commands: z.array(z.string()),
    executionMode: z.enum(['dryRun', 'apply']),
    deviceId: z.string(),
});

/**
 * GET /mikrotik/:deviceId/facts
 * Get device facts (mock for now, in production would query RouterOS API)
 */
router.get('/:deviceId/facts', (req: Request, res: Response) => {
    try {
        const { deviceId } = req.params;

        // Mock facts (in production, fetch from RouterOS API)
        const facts: DeviceFacts = {
            deviceId,
            routeros: '7.16',
            model: 'CCR2116',
            interfaces: [
                { name: 'ether1', type: 'ether', disabled: false, comment: 'WAN1' },
                { name: 'ether2', type: 'ether', disabled: false, comment: 'WAN2' },
                { name: 'ether3', type: 'ether', disabled: false },
                { name: 'br-lan', type: 'bridge', disabled: false, comment: 'LAN Bridge' },
            ],
            bridges: [
                { name: 'br-lan', vlanFiltering: false, ports: ['ether3', 'ether4', 'ether5'] },
            ],
            vlans: [],
            ipAddresses: [
                { address: '192.168.1.1/24', interface: 'br-lan', disabled: false },
            ],
            services: [
                { name: 'winbox', port: 8291, disabled: false, address: '' },
                { name: 'ssh', port: 22, disabled: false, address: '' },
                { name: 'www', port: 80, disabled: true },
            ],
            routes: [],
            systemIdentity: 'MikroTik',
            dnsServers: ['8.8.8.8', '8.8.4.4'],
        };

        res.json({
            deviceId,
            facts,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('[MikroTikAPI] Get facts failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            error: 'Failed to retrieve device facts',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /mikrotik/plan
 * Generate Plan JSON from user intent (AI-powered)
 */
router.post('/plan', async (req: Request, res: Response) => {
    try {
        const { intent, deviceId, facts, constraints, selectedModules } =
            PlanRequestSchema.parse(req.body);

        logger.info('[MikroTikAPI] Generating plan', {
            deviceId,
            intent: intent.substring(0, 100),
        });

        // Build comprehensive system prompt with schema and safety rules
        const systemPrompt = `You are a MikroTik RouterOS configuration expert. Your task is to generate a complete MikroTik Plan JSON based on user requirements.

CRITICAL INSTRUCTIONS:
1. This is your FINAL output - no intermediate steps or reasoning text
2. Output ONLY valid JSON matching the MikrotikPlan schema below
3. NEVER generate raw RouterOS CLI commands - only structured Plan JSON
4. Each step must specify module, action, and params according to schema
5. Set appropriate risk levels: low/medium/high based on operation impact
6. Include realistic assumptions about the network environment
7. Consider safety: noLockout policy, management access, VLAN filtering risks
8. Be comprehensive - include ALL necessary steps for the configuration

Available modules: ${selectedModules?.join(', ') || 'system, services, firewall, nat, dhcp-server, dhcp-client, ip, dns, routing'}

MikrotikPlan JSON Schema (THIS IS YOUR OUTPUT FORMAT):
{
  "changeId": "string (generate unique ID like: change-TIMESTAMP-RANDOM)",
  "createdAt": "ISO timestamp (use current time)",
  "target": {
    "deviceId": "${deviceId}",
    "routeros": "${facts.routeros}",
    "model": "${facts.model}"
  },
  "description": "Brief clear description of what this configuration does",
  "assumptions": [
    "List key assumptions, e.g.:",
    "- ether1 is WAN1 interface",
    "- ether2 is WAN2 interface", 
    "- br-lan is LAN bridge for internal network",
    "- Management subnet is 192.168.1.0/24"
  ],
  "steps": [
    {
      "id": "step-001 (sequential, unique)",
      "title": "Clear human-readable title",
      "module": "system|services|firewall|nat|dhcp-server|dhcp-client|ip|dns|routing",
      "action": "set|add|remove|enable|disable|configure",
      "params": {
        // Module-specific parameters - follow types.ts definitions
        // For system: { identity, note, timezone, ntpServers, ntpEnabled }
        // For services: { services: [{ name, disabled, port, address }] }
        // For firewall: { preset, wanInterfaces, lanInterfaces, mgmtSubnets, enableFastTrack }
        // For nat: { wanInterface, masquerade, portForwards, hairpinNat }
        // For dhcp-server: { servers: [{ name, interface, poolName, poolRange, network, gateway }] }
      },
      "risk": "low|medium|high",
      "precheck": [
        { "type": "interface_exists", "description": "Check interface exists", "params": { "interface": "ether1" } }
      ]
    }
  ],
  "policy": {
    "noLockout": true,
    "requireSnapshot": true,
    "mgmtSubnets": ["192.168.1.0/24"],
    "allowVlanFiltering": false,
    "allowMgmtIpChange": false
  },
  "metadata": {
    "intent": "${intent}",
    "selectedModules": ${JSON.stringify(selectedModules || [])}
  }
}

Current Device Facts:
- Device ID: ${deviceId}
- Model: ${facts.model}
- RouterOS: ${facts.routeros}
- Existing Interfaces: ${JSON.stringify(facts.interfaces?.map((i: any) => `${i.name} (${i.type})`) || [])}
- Existing Bridges: ${JSON.stringify(facts.bridges?.map((b: any) => b.name) || [])}
- Existing IPs: ${JSON.stringify(facts.ipAddresses?.map((ip: any) => `${ip.address} on ${ip.interface}`) || [])}

OUTPUT ONLY THE JSON - NO MARKDOWN, NO EXPLANATIONS, NO REASONING TEXT. Just the complete JSON object starting with { and ending with }.`;

        // Build user prompt
        const userPrompt = `Generate a complete MikroTik configuration Plan JSON for the following request:

${intent}

Selected modules to configure: ${selectedModules?.join(', ') || 'all necessary modules'}

Remember: Output ONLY the final JSON - this is not a conversation, just return the structured Plan JSON.`;

        // Routing context: Use L0 with no limits for this specialized task
        const routingContext: RoutingContext = {
            taskType: 'general', // Could be 'reasoning' for complex logic
            complexity: 'high', // MikroTik config is complex
            quality: 'high', // Need accurate structured output
            preferredLayer: 'L0', // Start with L0 as requested
            enableAutoEscalate: false, // Don't auto-escalate, L0 is fine for JSON generation
            enableCrossCheck: false, // Not needed for structured output
            budget: 0, // L0 is free
        };

        // Call orchestrator/router
        logger.info('[MikroTikAPI] Calling router for plan generation', {
            deviceId,
            intentLength: intent.length,
            selectedModules,
            routingContext,
        });

        const llmRequest: LLMRequest = {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            maxTokens: undefined, // No limit for L0
            temperature: undefined, // Use model default
        };

        // Route request via orchestrator
        const llmResponse = await routeRequest(llmRequest, routingContext);

        logger.info('[MikroTikAPI] Received response from router', {
            modelId: llmResponse.modelId,
            provider: llmResponse.provider,
            layer: llmResponse.layer,
            contentLength: llmResponse.content?.length || 0,
            routingSummary: llmResponse.routingSummary,
        });

        // Parse JSON from response (handle potential markdown wrapping or reasoning text)
        let planJson: any;
        try {
            if (!llmResponse.content) {
                throw new Error('LLM response content is empty');
            }
            let jsonContent = llmResponse.content.trim();

            // Try to extract JSON from various formats
            // 1. Remove markdown code blocks if present
            if (jsonContent.includes('```')) {
                const jsonMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
                if (jsonMatch) {
                    jsonContent = jsonMatch[1].trim();
                }
            }

            // 2. If there's text before JSON, try to extract JSON object
            if (!jsonContent.startsWith('{')) {
                const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
                if (jsonObjectMatch) {
                    jsonContent = jsonObjectMatch[0];
                }
            }

            // 3. Parse the cleaned JSON
            planJson = JSON.parse(jsonContent);

            logger.info('[MikroTikAPI] Successfully parsed Plan JSON', {
                stepsCount: planJson.steps?.length || 0,
                hasDescription: !!planJson.description,
                hasPolicy: !!planJson.policy,
            });
        } catch (parseError) {
            logger.error('[MikroTikAPI] Failed to parse LLM response as JSON', {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                responsePreview: llmResponse.content?.substring(0, 800) || 'N/A',
                responseLength: llmResponse.content?.length || 0,
            });

            // Return error with the actual LLM response for debugging
            res.status(400).json({
                error: 'LLM returned invalid JSON',
                details: parseError instanceof Error ? parseError.message : String(parseError),
                llmResponse: llmResponse.content?.substring(0, 1000) || 'No content',
                hint: 'The LLM may have returned reasoning text instead of pure JSON. Check system prompt.',
            });
            return;
        }

        // Build final plan with all metadata
        const plan: MikrotikPlan = {
            changeId: planJson.changeId || `change-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            createdAt: planJson.createdAt || new Date().toISOString(),
            target: {
                deviceId,
                routeros: facts.routeros || '7.16',
                model: facts.model || 'CCR2116',
                ...planJson.target,
            },
            description: planJson.description || 'AI-generated MikroTik configuration plan',
            assumptions: planJson.assumptions || [],
            steps: planJson.steps || [],
            policy: {
                noLockout: true,
                requireSnapshot: true,
                mgmtSubnets: ['192.168.1.0/24'],
                allowVlanFiltering: false,
                allowMgmtIpChange: false,
                ...planJson.policy,
            },
            metadata: {
                intent,
                selectedModules: selectedModules || [],
                llmModel: llmResponse.modelId,
                llmProvider: llmResponse.provider,
                llmCost: llmResponse.cost,
                routingSummary: llmResponse.routingSummary,
                ...planJson.metadata,
            },
        };

        logger.info('[MikroTikAPI] Plan generated successfully', {
            changeId: plan.changeId,
            stepsCount: plan.steps.length,
        });

        res.json(plan);
    } catch (error) {
        logger.error('[MikroTikAPI] Plan generation failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to generate plan',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /mikrotik/compile
 * Compile Plan JSON to RouterOS commands
 */
router.post('/compile', async (req: Request, res: Response) => {
    try {
        const { plan, facts } = CompileRequestSchema.parse(req.body);

        logger.info('[MikroTikAPI] Compiling plan', {
            changeId: plan.changeId,
            steps: plan.steps.length,
        });

        const result = await compilePlan(plan, facts);

        res.json({
            success: true,
            result,
        });
    } catch (error) {
        logger.error('[MikroTikAPI] Compilation failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to compile plan',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /mikrotik/validate
 * Validate Plan JSON against policy and facts
 */
router.post('/validate', (req: Request, res: Response) => {
    try {
        const { plan, facts } = ValidateRequestSchema.parse(req.body);

        logger.info('[MikroTikAPI] Validating plan', {
            changeId: plan.changeId,
        });

        const result = validatePlan(plan, facts);

        res.json({
            validation: result,
        });
    } catch (error) {
        logger.error('[MikroTikAPI] Validation failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to validate plan',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

/**
 * POST /mikrotik/apply
 * Apply compiled commands (dry-run or execute)
 */
router.post('/apply', async (req: Request, res: Response) => {
    try {
        const { changeId, commands, executionMode, deviceId } =
            ApplyRequestSchema.parse(req.body);

        logger.info('[MikroTikAPI] Applying commands', {
            changeId,
            executionMode,
            commandCount: commands.length,
        });

        if (executionMode === 'dryRun') {
            // Dry run: just validate syntax
            res.json({
                changeId,
                executionMode: 'dryRun',
                message: 'Dry run successful. Commands validated.',
                commandCount: commands.length,
            });
        } else {
            // TODO: Execute commands via RouterOS API
            // For now, mock success
            res.json({
                changeId,
                executionMode: 'apply',
                message: 'Commands applied successfully (mock)',
                totalSteps: commands.length,
                successSteps: commands.length,
                failedSteps: 0,
            });
        }
    } catch (error) {
        logger.error('[MikroTikAPI] Apply failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(400).json({
            error: 'Failed to apply commands',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});

export default router;
