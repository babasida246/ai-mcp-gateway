/**
 * @file Deployment Integration Tests
 * @description Tests for chat-based infrastructure deployment workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ChatDeploymentHandler, {
    buildDeploymentChatResponse,
} from '../chatDeploymentHandler.js';
import {
    validateCommands,
    formatCommandsForDisplay,
    CommandGenerationResponse,
} from '../commandGeneration.js';
import {
    CommandExecutionManager,
    formatExecutionResults,
} from '../commandExecution.js';

describe('Chat Deployment Integration', () => {
    let handler: ChatDeploymentHandler;
    let executionManager: CommandExecutionManager;

    beforeEach(() => {
        handler = new ChatDeploymentHandler();
        executionManager = new CommandExecutionManager();
    });

    describe('Deployment Detection', () => {
        it('should detect DHCP deployment requests', async () => {
            const message = 'Deploy DHCP on 172.251.96.200 with pool 100-200';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(true);
            expect(detection.taskType).toBe('dhcp');
            expect(detection.confidence).toBeGreaterThan(0.7);
        });

        it('should detect DNS configuration requests', async () => {
            const message = 'Setup DNS records for example.com pointing to 10.0.0.1';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(true);
            expect(detection.taskType).toBe('dns');
            expect(detection.confidence).toBeGreaterThan(0.7);
        });

        it('should detect firewall rule requests', async () => {
            const message = 'Configure firewall rules to block port 22 from external';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(true);
            expect(detection.taskType).toBe('firewall');
            expect(detection.confidence).toBeGreaterThan(0.6);
        });

        it('should detect VLAN configuration requests', async () => {
            const message = 'Create VLAN 100 on switch for management network';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(true);
            expect(detection.taskType).toBe('vlan');
            expect(detection.confidence).toBeGreaterThan(0.6);
        });

        it('should detect routing configuration requests', async () => {
            const message = 'Setup BGP routing with AS 65000';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(true);
            expect(detection.taskType).toBe('routing');
            expect(detection.confidence).toBeGreaterThan(0.6);
        });

        it('should reject non-deployment requests', async () => {
            const message = 'Tell me about the weather today';
            const detection = await handler.detectDeploymentRequest(message);

            expect(detection.isDeploymentRequest).toBe(false);
            expect(detection.confidence).toBeLessThan(0.5);
        });

        it('should extract device IP from message', async () => {
            const message = 'Configure 172.251.96.200 for DHCP';
            const context = handler.extractDeviceContext(message);

            expect(context.targetDevice).toBe('172.251.96.200');
        });

        it('should detect MikroTik device type', () => {
            const message = 'Deploy on MikroTik RouterOS';
            const context = handler.extractDeviceContext(message);

            expect(context.deviceType).toBe('mikrotik');
        });

        it('should detect Linux device type', () => {
            const message = 'Configure Ubuntu 20.04 DHCP server';
            const context = handler.extractDeviceContext(message);

            expect(context.deviceType).toBe('linux');
        });
    });

    describe('Command Generation', () => {
        it('should generate DHCP deployment commands', async () => {
            const message = 'Deploy DHCP with pool 172.251.96.100-200';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                targetDevice: '172.251.96.200',
                confidence: 0.95,
            };

            const { generationId, response } = await handler.generateDeploymentCommands(
                message,
                deployment
            );

            expect(generationId).toMatch(/^gen_/);
            expect(response.taskDescription).toContain('DHCP');
            expect(response.commands.length).toBeGreaterThan(0);
            expect(response.commands[0].command).toBeTruthy();
            expect(response.commands[0].riskLevel).toMatch(/^(low|medium|high|critical)$/);
        });

        it('should include risk assessment in commands', async () => {
            const message = 'Deploy DHCP';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                confidence: 0.9,
            };

            const { response } = await handler.generateDeploymentCommands(message, deployment);

            response.commands.forEach(cmd => {
                expect(['low', 'medium', 'high', 'critical']).toContain(cmd.riskLevel);
            });
        });

        it('should include warnings for high-risk operations', async () => {
            const message = 'Deploy DHCP';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                confidence: 0.9,
            };

            const { response } = await handler.generateDeploymentCommands(message, deployment);

            expect(response.warnings).toBeDefined();
            expect(response.warnings?.length).toBeGreaterThan(0);
        });

        it('should include affected services in response', async () => {
            const message = 'Deploy DHCP';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                confidence: 0.9,
            };

            const { response } = await handler.generateDeploymentCommands(message, deployment);

            expect(response.affectedServices).toBeDefined();
            expect(response.affectedServices?.length).toBeGreaterThan(0);
        });

        it('should provide step-by-step explanation', async () => {
            const message = 'Deploy DHCP';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                confidence: 0.9,
            };

            const { response } = await handler.generateDeploymentCommands(message, deployment);

            expect(response.explanation).toBeTruthy();
            expect(response.explanation.length).toBeGreaterThan(50);
        });

        it('should estimate deployment duration', async () => {
            const message = 'Deploy DHCP';
            const deployment = {
                isDeploymentRequest: true,
                taskType: 'dhcp' as const,
                confidence: 0.9,
            };

            const { response } = await handler.generateDeploymentCommands(message, deployment);

            expect(response.estimatedDuration).toBeDefined();
            expect(response.estimatedDuration).toBeGreaterThan(0);
        });
    });

    describe('Command Validation', () => {
        it('should validate command structure', () => {
            const commands = [
                {
                    id: 'cmd_001',
                    command: '/ip/pool/add name=default',
                    description: 'Create pool',
                    category: 'config' as const,
                    riskLevel: 'medium' as const,
                },
            ];

            const validation = validateCommands(commands);

            expect(validation.valid).toBe(true);
            expect(validation.errors.length).toBe(0);
        });

        it('should reject empty command list', () => {
            const validation = validateCommands([]);

            expect(validation.valid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        it('should flag missing rollback for critical operations', () => {
            const commands = [
                {
                    id: 'cmd_001',
                    command: 'rm -rf /etc',
                    description: 'Critical operation',
                    category: 'system' as const,
                    riskLevel: 'critical' as const,
                },
            ];

            const validation = validateCommands(commands);

            expect(validation.valid).toBe(false);
            expect(validation.errors.some(e => e.includes('rollback'))).toBe(true);
        });

        it('should detect suspicious command patterns', () => {
            const commands = [
                {
                    id: 'cmd_001',
                    command: 'rm -rf /',
                    description: 'Dangerous',
                    category: 'system' as const,
                    riskLevel: 'critical' as const,
                    rollbackCommand: 'echo error',
                },
            ];

            const validation = validateCommands(commands);

            expect(validation.valid).toBe(false);
            expect(validation.errors.some(e => e.includes('Suspicious'))).toBe(true);
        });
    });

    describe('Execution Workflow', () => {
        it('should create execution session', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
                'cmd_002',
            ]);

            expect(session.sessionId).toMatch(/^exec_/);
            expect(session.status).toBe('pending');
            expect(session.commandIds.length).toBe(2);
        });

        it('should retrieve session', () => {
            const created = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);
            const retrieved = executionManager.getSession(created.sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved?.sessionId).toBe(created.sessionId);
        });

        it('should approve execution', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
                'cmd_002',
            ]);

            const approved = executionManager.approveExecution(session.sessionId);

            expect(approved).toBe(true);

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.status).toBe('confirmed');
        });

        it('should filter commands on approval', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
                'cmd_002',
                'cmd_003',
            ]);

            executionManager.approveExecution(session.sessionId, ['cmd_001', 'cmd_003']);

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.commandIds).toEqual(['cmd_001', 'cmd_003']);
        });

        it('should cancel execution', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);

            const cancelled = executionManager.cancelExecution(session.sessionId, 'User rejected');

            expect(cancelled).toBe(true);

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.status).toBe('cancelled');
        });

        it('should record command results', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);

            const recorded = executionManager.recordResult(session.sessionId, 'cmd_001', {
                success: true,
                stdout: 'Pool created',
                exitCode: 0,
                duration: 125,
            });

            expect(recorded).toBe(true);

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.results?.length).toBe(1);
            expect(updated?.results?.[0]).toMatchObject({
                commandId: 'cmd_001',
                success: true,
            });
        });

        it('should complete session with success', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);

            executionManager.completeSession(session.sessionId, true);

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.status).toBe('completed');
            expect(updated?.endTime).toBeDefined();
        });

        it('should complete session with error', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);

            executionManager.completeSession(session.sessionId, false, 'Connection timeout');

            const updated = executionManager.getSession(session.sessionId);
            expect(updated?.status).toBe('failed');
            expect(updated?.errorMessage).toBe('Connection timeout');
        });
    });

    describe('User Confirmation Handling', () => {
        it('should handle approval', async () => {
            const message = 'Deploy DHCP';
            await handler.detectDeploymentRequest(message);
            await handler.generateDeploymentCommands(message, {
                isDeploymentRequest: true,
                taskType: 'dhcp',
                confidence: 0.9,
            });

            const displayInfo = handler.getGenerationDisplay('test_gen_id');
            if (!displayInfo?.sessionId) {
                throw new Error('No session ID');
            }

            const result = await handler.handleUserConfirmation(displayInfo.sessionId, true);

            expect(result.approved).toBe(true);
            expect(result.session.status).toBe('confirmed');
        });

        it('should handle rejection', async () => {
            const message = 'Deploy DHCP';
            await handler.generateDeploymentCommands(message, {
                isDeploymentRequest: true,
                taskType: 'dhcp',
                confidence: 0.9,
            });

            const displayInfo = handler.getGenerationDisplay('test_gen_id');
            if (!displayInfo?.sessionId) {
                throw new Error('No session ID');
            }

            const result = await handler.handleUserConfirmation(displayInfo.sessionId, false);

            expect(result.approved).toBe(false);
            expect(result.session.status).toBe('cancelled');
        });
    });

    describe('Display Formatting', () => {
        it('should format commands for display', () => {
            const response: CommandGenerationResponse = {
                taskDescription: 'Deploy DHCP',
                commands: [
                    {
                        id: 'cmd_001',
                        command: '/ip/pool/add name=default',
                        description: 'Create pool',
                        category: 'config',
                        riskLevel: 'medium',
                    },
                ],
                explanation: 'This will create a DHCP pool',
                estimatedDuration: 5,
                warnings: ['Existing config will be replaced'],
            };

            const display = formatCommandsForDisplay(response);

            expect(display).toContain('Deploy DHCP');
            expect(display).toContain('cmd_001');
            expect(display).toContain('Create pool');
            expect(display).toContain('Estimated Duration');
        });

        it('should include risk levels in display', () => {
            const response: CommandGenerationResponse = {
                taskDescription: 'Deploy',
                commands: [
                    {
                        id: 'cmd_001',
                        command: 'test',
                        description: 'Test',
                        category: 'config',
                        riskLevel: 'high',
                    },
                ],
                explanation: 'Test',
            };

            const display = formatCommandsForDisplay(response);

            expect(display).toContain('HIGH');
        });

        it('should format execution results', () => {
            const session = executionManager.createSession('user123', '172.251.96.200', [
                'cmd_001',
            ]);

            executionManager.recordResult(session.sessionId, 'cmd_001', {
                success: true,
                stdout: 'Success',
                exitCode: 0,
                duration: 100,
            });

            executionManager.completeSession(session.sessionId, true);

            const updated = executionManager.getSession(session.sessionId);
            if (!updated) throw new Error('Session not found');

            const display = formatExecutionResults(updated);

            expect(display).toContain('EXECUTION RESULTS');
            expect(display).toContain('COMPLETED');
            expect(display).toContain('✅');
        });
    });

    describe('Chat Response Building', () => {
        it('should build detection response', () => {
            const response = buildDeploymentChatResponse('detection', {});

            expect(response).toContain('Deployment Request Detected');
        });

        it('should build generation response', () => {
            const response = buildDeploymentChatResponse('generation', { display: 'Test' });

            expect(response).toContain('Commands Generated');
        });

        it('should build confirmation response', () => {
            const response = buildDeploymentChatResponse('confirmation', { sessionId: 'test' });

            expect(response).toContain('Awaiting Your Confirmation');
            expect(response).toContain('test');
        });

        it('should build completion response', () => {
            const response = buildDeploymentChatResponse('completed', { results: 'All ok' });

            expect(response).toContain('Deployment Completed');
        });

        it('should build error response', () => {
            const response = buildDeploymentChatResponse('error', { error: 'Test error' });

            expect(response).toContain('Deployment Failed');
            expect(response).toContain('Test error');
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });
});
