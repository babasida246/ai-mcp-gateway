/**
 * @file Chat-based Deployment Handler
 * @description Integrates command generation and execution into the chat system
 * allowing users to deploy infrastructure through conversational requests.
 * 
 * Usage Flow:
 * 1. User: "Deploy DHCP on 172.251.96.200"
 * 2. System: Detects deployment request → Generates commands → Sends for confirmation
 * 3. User: Approves/rejects commands
 * 4. System: Executes approved commands → Reports results
 */

import { z } from 'zod';
import { logger } from '../../logging/logger.js';
import {
    generateCommands,
    validateCommands,
    formatCommandsForDisplay,
    CommandGenerationContext,
    type CommandGenerationResponse,
} from './commandGeneration.js';
import {
    CommandExecutionManager,
    formatExecutionResults,
    type ExecutionSession,
} from './commandExecution.js';

/**
 * Deployment request detected from user message
 */
export const DeploymentRequestSchema = z.object({
    isDeploymentRequest: z.boolean(),
    taskType: z.enum(['dhcp', 'dns', 'firewall', 'routing', 'vlan', 'other']).optional(),
    targetDevice: z.string().optional(),
    connectionId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
});

export type DeploymentRequest = z.infer<typeof DeploymentRequestSchema>;

/**
 * Chat deployment handler
 */
export class ChatDeploymentHandler {
    private executionManager: CommandExecutionManager;
    private pendingGenerations: Map<string, CommandGenerationResponse> = new Map();

    constructor() {
        this.executionManager = new CommandExecutionManager();
    }

    /**
     * Detect if user message is a deployment request
     */
    async detectDeploymentRequest(
        message: string,
        llmClient?: { generateCompletion(messages: any[]): Promise<string> }
    ): Promise<DeploymentRequest> {
        try {
            if (!llmClient) {
                // Rule-based detection for common deployment patterns
                return this.detectDeploymentPatterns(message);
            }

            const response = await llmClient.generateCompletion([
                {
                    role: 'system',
                    content: `Analyze if the user message is requesting infrastructure deployment.
          
Return JSON with:
{
  "isDeploymentRequest": boolean,
  "taskType": "dhcp|dns|firewall|routing|vlan|other",
  "targetDevice": "IP or hostname if specified",
  "confidence": 0-1,
  "reasoning": "Why you think this is/isn't a deployment request"
}

Common patterns:
- "Deploy DHCP on 172.251.96.200"
- "Setup DNS records for domain.com"
- "Configure firewall rules"
- "Add VLAN 100"
- "Setup routing for subnet"`,
                },
                {
                    role: 'user',
                    content: message,
                },
            ]);

            const parsed = JSON.parse(response);
            return DeploymentRequestSchema.parse(parsed);
        } catch (error) {
            logger.warn('[ChatDeploymentHandler] Failed to detect deployment request', {
                error: error instanceof Error ? error.message : String(error),
            });
            return this.detectDeploymentPatterns(message);
        }
    }

    /**
     * Rule-based deployment pattern detection
     */
    private detectDeploymentPatterns(message: string): DeploymentRequest {
        const lower = message.toLowerCase();

        // DHCP patterns
        if (/dhcp|address\s+pool|lease/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                taskType: 'dhcp',
                confidence: 0.8,
                reasoning: 'Contains DHCP-related keywords',
            };
        }

        // DNS patterns
        if (/dns|domain|dns\s+record|a\s+record|mx\s+record/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                taskType: 'dns',
                confidence: 0.8,
                reasoning: 'Contains DNS-related keywords',
            };
        }

        // Firewall patterns
        if (/firewall|iptables|ufw|rules|nat|port\s+forward/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                taskType: 'firewall',
                confidence: 0.75,
                reasoning: 'Contains firewall configuration keywords',
            };
        }

        // Routing patterns
        if (/routing|route|gateway|bgp|ospf|rip/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                taskType: 'routing',
                confidence: 0.75,
                reasoning: 'Contains routing configuration keywords',
            };
        }

        // VLAN patterns
        if (/vlan|virtual\s+lan|tagged|untagged|trunk/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                taskType: 'vlan',
                confidence: 0.75,
                reasoning: 'Contains VLAN configuration keywords',
            };
        }

        // Generic deployment patterns
        if (/deploy|setup|configure|enable|install|provision|create/i.test(lower)) {
            return {
                isDeploymentRequest: true,
                confidence: 0.4,
                reasoning: 'Contains generic deployment keywords',
            };
        }

        return {
            isDeploymentRequest: false,
            confidence: 0,
            reasoning: 'No deployment keywords detected',
        };
    }

    /**
     * Extract device information from message or configuration
     */
    extractDeviceContext(message: string, _context?: any): Partial<CommandGenerationContext> {
        // Extract IP addresses
        const ipMatch = message.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
        const targetDevice = ipMatch ? ipMatch[1] : undefined;

        // Detect device type
        let deviceType: 'mikrotik' | 'linux' | 'windows' | 'generic' = 'generic';
        if (/mikrotik|routeros|ros/i.test(message)) deviceType = 'mikrotik';
        if (/linux|ubuntu|debian|centos/i.test(message)) deviceType = 'linux';
        if (/windows|powershell|winrm/i.test(message)) deviceType = 'windows';

        // Detect connection type
        let connectionType: 'ssh' | 'telnet' | 'local' = 'ssh';
        if (/telnet/i.test(message)) connectionType = 'telnet';
        if (/local|localhost|127\.0\.0\.1/i.test(message)) connectionType = 'local';

        return {
            targetDevice,
            deviceType,
            connectionType,
        };
    }

    /**
     * Generate deployment commands from user request
     */
    async generateDeploymentCommands(
        userMessage: string,
        deployment: DeploymentRequest,
        llmClient?: { generateCompletion(messages: any[]): Promise<string> }
    ): Promise<{ generationId: string; response: CommandGenerationResponse }> {
        try {
            const context: CommandGenerationContext = {
                targetDevice: deployment.targetDevice || '172.251.96.200',
                deviceType: 'mikrotik',
                connectionType: 'ssh',
                taskType: deployment.taskType || 'other',
                details: {
                    userRequest: userMessage,
                    detectionConfidence: deployment.confidence,
                },
            };

            logger.info('[ChatDeploymentHandler] Generating deployment commands', {
                taskType: context.taskType,
                device: context.targetDevice,
            });

            const response = await generateCommands(userMessage, context, llmClient);

            // Validate commands
            const validation = validateCommands(response.commands);
            if (!validation.valid) {
                logger.warn('[ChatDeploymentHandler] Command validation failed', {
                    errors: validation.errors,
                });
            }

            // Store for later reference
            const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.pendingGenerations.set(generationId, response);

            return { generationId, response };
        } catch (error) {
            logger.error('[ChatDeploymentHandler] Failed to generate commands', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Get generated commands for display
     */
    getGenerationDisplay(generationId: string): { display: string; sessionId?: string } | null {
        const response = this.pendingGenerations.get(generationId);
        if (!response) return null;

        const display = formatCommandsForDisplay(response);

        // Create execution session for confirmation
        const session = this.executionManager.createSession(
            'web-user',
            response.commands[0]?.command || 'unknown',
            response.commands.map(c => c.id)
        );

        return { display, sessionId: session.sessionId };
    }

    /**
     * Handle user confirmation or rejection
     */
    async handleUserConfirmation(
        sessionId: string,
        approved: boolean,
        selectedCommandIds?: string[]
    ): Promise<{ approved: boolean; session: ExecutionSession; message: string }> {
        if (!approved) {
            this.executionManager.cancelExecution(sessionId, 'User rejected execution');
            return {
                approved: false,
                session: this.executionManager.getSession(sessionId)!,
                message: '❌ Deployment cancelled by user',
            };
        }

        const approved_session = this.executionManager.approveExecution(sessionId, selectedCommandIds);

        return {
            approved: approved_session,
            session: this.executionManager.getSession(sessionId)!,
            message: `✅ Deployment approved. Executing ${selectedCommandIds?.length || 0} commands...`,
        };
    }

    /**
     * Get execution session details
     */
    getExecutionSession(sessionId: string): ExecutionSession | null {
        return this.executionManager.getSession(sessionId) || null;
    }

    /**
     * Record command execution result
     */
    recordExecutionResult(
        sessionId: string,
        commandId: string,
        result: {
            success: boolean;
            stdout?: string;
            stderr?: string;
            exitCode: number;
            duration: number;
        }
    ): boolean {
        return this.executionManager.recordResult(sessionId, commandId, result);
    }

    /**
     * Finalize execution session
     */
    finalizeExecution(sessionId: string, success: boolean, error?: string): ExecutionSession | null {
        this.executionManager.completeSession(sessionId, success, error);
        return this.executionManager.getSession(sessionId) || null;
    }

    /**
     * Get formatted results
     */
    getResultsDisplay(sessionId: string): string | null {
        const session = this.executionManager.getSession(sessionId);
        if (!session) return null;
        return formatExecutionResults(session);
    }

    /**
     * Cancel ongoing execution
     */
    cancelExecution(sessionId: string, reason?: string): boolean {
        return this.executionManager.cancelExecution(sessionId, reason);
    }
}

/**
 * Build chat response for deployment workflow
 */
export function buildDeploymentChatResponse(
    stage: 'detection' | 'generation' | 'confirmation' | 'executing' | 'completed' | 'error',
    data: any
): string {
    const responses: Record<string, string> = {
        detection: `🔍 **Deployment Request Detected**\n\nI detected a request to deploy infrastructure. Let me generate the necessary commands for you.`,

        generation: `📋 **Commands Generated**\n\nI've prepared the deployment commands. Please review them carefully before confirming execution:\n\n${data.display || ''}`,

        confirmation: `⏳ **Awaiting Your Confirmation**\n\nPlease approve or reject the deployment plan. You can:\n- ✅ Approve all commands\n- ❌ Reject deployment\n- ✏️ Edit command selection\n\nSession ID: \`${data.sessionId}\``,

        executing: `🚀 **Executing Deployment**\n\nStarting command execution on ${data.device}...\n\nCommands: ${data.commandCount}`,

        completed: `✅ **Deployment Completed**\n\n${data.results || 'Check the results above.'}`,

        error: `❌ **Deployment Failed**\n\nError: ${data.error || 'Unknown error occurred'}\n\nPlease check the logs and try again.`,
    };

    return responses[stage] || 'Unknown stage';
}

export default ChatDeploymentHandler;
