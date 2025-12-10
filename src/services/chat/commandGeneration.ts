/**
 * @file Command Generation Service
 * @description Handles LLM-based command generation for infrastructure tasks
 * with user confirmation workflow.
 * 
 * Flow:
 * 1. User sends deployment request via chat
 * 2. LLM generates commands with explanation
 * 3. User receives command preview and accepts/rejects
 * 4. Accepted commands sent to terminal for execution
 */

import { z } from 'zod';
import { logger } from '../../logging/logger.js';

/**
 * Generated command for infrastructure task
 */
export const CommandSchema = z.object({
    id: z.string().describe('Unique command ID'),
    command: z.string().describe('Shell command to execute'),
    description: z.string().describe('Human-readable description'),
    category: z.enum(['network', 'system', 'service', 'config']).describe('Command category'),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('Risk assessment'),
    prerequisites: z.array(z.string()).optional().describe('Commands to run first'),
    expectedOutput: z.string().optional().describe('Expected command output'),
    rollbackCommand: z.string().optional().describe('Command to rollback this action'),
});

export type Command = z.infer<typeof CommandSchema>;

/**
 * Command generation request from LLM
 */
export const CommandGenerationResponseSchema = z.object({
    taskDescription: z.string().describe('Overall task description'),
    commands: z.array(CommandSchema).describe('Generated commands'),
    explanation: z.string().describe('Explanation of the deployment process'),
    estimatedDuration: z.number().optional().describe('Estimated execution time in seconds'),
    warnings: z.array(z.string()).optional().describe('Important warnings'),
    affectedServices: z.array(z.string()).optional().describe('Services that may be affected'),
});

export type CommandGenerationResponse = z.infer<typeof CommandGenerationResponseSchema>;

/**
 * User confirmation for command execution
 */
export const CommandConfirmationSchema = z.object({
    commandIds: z.array(z.string()).describe('IDs of commands to execute'),
    executeAll: z.boolean().describe('Execute all commands in sequence'),
    timeout: z.number().optional().describe('Timeout per command in milliseconds'),
});

export type CommandConfirmation = z.infer<typeof CommandConfirmationSchema>;

/**
 * Command execution result
 */
export const CommandExecutionResultSchema = z.object({
    commandId: z.string(),
    command: z.string(),
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number(),
    duration: z.number(),
    timestamp: z.string(),
});

export type CommandExecutionResult = z.infer<typeof CommandExecutionResultSchema>;

/**
 * Context for command generation (device info, connection, etc)
 */
export const CommandGenerationContextSchema = z.object({
    targetDevice: z.string().describe('Target device IP or hostname'),
    deviceType: z.enum(['mikrotik', 'linux', 'windows', 'generic']).describe('Device OS type'),
    connectionType: z.enum(['ssh', 'telnet', 'local']).describe('Connection method'),
    connectionId: z.string().optional().describe('Saved connection ID'),
    taskType: z.enum(['dhcp', 'dns', 'firewall', 'routing', 'vlan', 'other']).describe('Infrastructure task type'),
    details: z.record(z.unknown()).optional().describe('Task-specific details'),
});

export type CommandGenerationContext = z.infer<typeof CommandGenerationContextSchema>;

/**
 * Generate commands using LLM (stub for integration with chat/orchestrator)
 */
export async function generateCommands(
    prompt: string,
    context: CommandGenerationContext,
    llmClient?: { generateCompletion(messages: any[]): Promise<string> }
): Promise<CommandGenerationResponse> {
    try {
        logger.info('[CommandGeneration] Generating commands', {
            taskType: context.taskType,
            device: context.targetDevice,
        });

        if (!llmClient) {
            // Return mock response for testing
            return getMockCommandResponse(context, prompt);
        }

        // Build LLM prompt for command generation
        const systemPrompt = buildSystemPrompt(context);
        const userPrompt = buildUserPrompt(prompt, context);

        const response = await llmClient.generateCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ]);

        // Parse JSON response
        const parsed = JSON.parse(response);
        return CommandGenerationResponseSchema.parse(parsed);
    } catch (error) {
        logger.error('[CommandGeneration] Failed to generate commands', {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Build system prompt for LLM
 */
function buildSystemPrompt(context: CommandGenerationContext): string {
    const deviceInfo = {
        mikrotik: 'RouterOS command syntax - use /ip/address/print, /interface/print, etc.',
        linux: 'Linux/bash command syntax - use standard utilities',
        windows: 'Windows PowerShell or CMD commands',
        generic: 'Standard shell commands',
    }[context.deviceType];

    return `You are an expert infrastructure automation assistant specializing in command generation for network and system deployments.

Target Device: ${context.targetDevice} (${context.deviceType})
Connection: ${context.connectionType}
Task Type: ${context.taskType}

${deviceInfo}

IMPORTANT REQUIREMENTS:
1. Generate commands in JSON format matching this structure:
{
  "taskDescription": "Brief description of overall task",
  "commands": [
    {
      "id": "cmd_001",
      "command": "actual shell command",
      "description": "What this command does",
      "category": "network|system|service|config",
      "riskLevel": "low|medium|high|critical",
      "prerequisites": ["cmd_ids that must run first"],
      "expectedOutput": "What successful execution looks like",
      "rollbackCommand": "Optional: how to undo this change"
    }
  ],
  "explanation": "Step-by-step explanation of the deployment process",
  "estimatedDuration": 30,
  "warnings": ["Important warnings about the deployment"],
  "affectedServices": ["Services that may be restarted or affected"]
}

2. Always assess risk level based on impact:
   - low: Read-only or non-disruptive changes
   - medium: Configuration changes, may require restart
   - high: Service restart, temporary downtime expected
   - critical: Data-affecting, multi-service impact

3. Include rollback commands for destructive operations
4. Order commands logically (dependencies first)
5. Include prerequisites for complex tasks
6. Be explicit about expected outcomes
7. Warn about service interruptions or data risks

Never execute destructive commands without explicit confirmation.
Always provide clear explanations for each step.`;
}

/**
 * Build user prompt for LLM
 */
function buildUserPrompt(userRequest: string, context: CommandGenerationContext): string {
    const taskDetails = context.details ? JSON.stringify(context.details, null, 2) : '';

    return `Task Request: ${userRequest}

Device Details:
- IP/Hostname: ${context.targetDevice}
- Device Type: ${context.deviceType}
- Connection: ${context.connectionType}

${taskDetails ? `Additional Details:\n${taskDetails}\n` : ''}

Generate the commands needed to complete this deployment. Include all necessary steps with proper error handling and rollback procedures.`;
}

/**
 * Mock command response for DHCP deployment
 */
function getMockCommandResponse(
    context: CommandGenerationContext,
    _prompt: string
): CommandGenerationResponse {
    if (context.taskType === 'dhcp') {
        return {
            taskDescription: `Deploy DHCP on ${context.targetDevice}`,
            commands: [
                {
                    id: 'cmd_001',
                    command: '/ip/pool/add name=default-pool ranges=172.251.96.100-172.251.96.200',
                    description: 'Create DHCP pool for address range',
                    category: 'config',
                    riskLevel: 'medium',
                    expectedOutput: 'IP pool "default-pool" added successfully',
                },
                {
                    id: 'cmd_002',
                    command: '/ip/dhcp-server/network/add address=172.251.96.0/24 gateway=172.251.96.1 dns-server=8.8.8.8,1.1.1.1',
                    description: 'Configure DHCP network with gateway and DNS',
                    category: 'config',
                    riskLevel: 'medium',
                    prerequisites: ['cmd_001'],
                    expectedOutput: 'DHCP network configuration added',
                },
                {
                    id: 'cmd_003',
                    command: '/ip/dhcp-server/add interface=ether1 address-pool=default-pool disabled=no',
                    description: 'Enable DHCP server on interface',
                    category: 'service',
                    riskLevel: 'high',
                    prerequisites: ['cmd_001', 'cmd_002'],
                    expectedOutput: 'DHCP server started and listening',
                    rollbackCommand: '/ip/dhcp-server/disable [find]',
                },
            ],
            explanation: `This deployment will:
1. Create a DHCP address pool (172.251.96.100-172.251.96.200)
2. Configure the DHCP network with subnet 172.251.96.0/24
3. Enable DHCP server on the primary interface

After completion, clients on the network will receive dynamic IP addresses from the configured pool.`,
            estimatedDuration: 5,
            warnings: [
                'Existing DHCP configuration will be replaced',
                'All clients will need to renew their leases',
                'Gateway must be reachable for DHCP to function',
            ],
            affectedServices: ['DHCP', 'Network connectivity'],
        };
    }

    return {
        taskDescription: `Execute ${context.taskType} task on ${context.targetDevice}`,
        commands: [
            {
                id: 'cmd_001',
                command: 'echo "Sample command for testing"',
                description: 'Placeholder command',
                category: 'system',
                riskLevel: 'low',
                expectedOutput: 'Sample command for testing',
            },
        ],
        explanation: 'This is a sample command. Replace with actual deployment logic.',
        estimatedDuration: 1,
    };
}

/**
 * Validate commands before execution
 */
export function validateCommands(commands: Command[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (commands.length === 0) {
        errors.push('No commands provided');
    }

    commands.forEach((cmd, idx) => {
        if (!cmd.command || cmd.command.trim().length === 0) {
            errors.push(`Command ${idx + 1}: Empty command`);
        }

        if (cmd.riskLevel === 'critical' && !cmd.rollbackCommand) {
            errors.push(
                `Command ${idx + 1}: Critical risk operations require rollback commands`
            );
        }

        // Check for dangerous commands
        if (isSuspiciousCommand(cmd.command)) {
            errors.push(
                `Command ${idx + 1}: Suspicious command pattern detected - requires manual review`
            );
        }
    });

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Check for potentially dangerous command patterns
 */
function isSuspiciousCommand(command: string): boolean {
    const dangerousPatterns = [
        /rm\s+(-rf|-r)\s+\//,  // rm -rf /
        /dd\s+if=\/dev\/zero/,  // DD overwrite
        /:\(\)\{.*\}/,  // Fork bomb
        /\|\s*xargs\s+rm/,  // Pipe to rm
    ];

    return dangerousPatterns.some(pattern => pattern.test(command));
}

/**
 * Format commands for user display/confirmation
 */
export function formatCommandsForDisplay(response: CommandGenerationResponse): string {
    let output = `\n${'='.repeat(60)}\n`;
    output += `📋 DEPLOYMENT PLAN: ${response.taskDescription}\n`;
    output += `${'='.repeat(60)}\n\n`;

    output += `📝 EXPLANATION:\n${response.explanation}\n\n`;

    if (response.warnings && response.warnings.length > 0) {
        output += `⚠️  WARNINGS:\n`;
        response.warnings.forEach(w => (output += `  - ${w}\n`));
        output += '\n';
    }

    if (response.affectedServices && response.affectedServices.length > 0) {
        output += `🔧 AFFECTED SERVICES:\n`;
        response.affectedServices.forEach(s => (output += `  - ${s}\n`));
        output += '\n';
    }

    output += `📊 COMMANDS (${response.commands.length} total):\n`;
    output += `${'─'.repeat(60)}\n\n`;

    response.commands.forEach((cmd, idx) => {
        output += `${idx + 1}. [${cmd.riskLevel.toUpperCase()}] ${cmd.description}\n`;
        output += `   ID: ${cmd.id}\n`;
        output += `   Command: ${cmd.command}\n`;

        if (cmd.prerequisites && cmd.prerequisites.length > 0) {
            output += `   Prerequisites: ${cmd.prerequisites.join(', ')}\n`;
        }

        if (cmd.expectedOutput) {
            output += `   Expected: ${cmd.expectedOutput}\n`;
        }

        if (cmd.rollbackCommand) {
            output += `   Rollback: ${cmd.rollbackCommand}\n`;
        }

        output += '\n';
    });

    output += `${'─'.repeat(60)}\n`;
    if (response.estimatedDuration) {
        output += `⏱️  Estimated Duration: ${response.estimatedDuration}s\n`;
    }

    return output;
}

export default {
    generateCommands,
    validateCommands,
    formatCommandsForDisplay,
};
