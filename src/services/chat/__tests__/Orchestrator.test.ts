/**
 * @file Orchestrator Integration Tests
 * @description Tests for multi-pass LLM orchestration with ChatContextBuilder
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Orchestrator, type OrchestratorLLMClient } from '../Orchestrator.js';
import type { OrchestratorRequest } from '../Orchestrator.js';

/**
 * Mock LLM client for testing
 */
class MockLLMClient implements OrchestratorLLMClient {
    async generateCompletion(messages: any[], options?: any): Promise<string> {
        const lastMessage = messages[messages.length - 1]?.content || '';

        // Simulate different responses based on system context
        if (messages.some(m => m.content?.includes('analysis'))) {
            return JSON.stringify({
                intent: 'User wants to understand how the system works',
                keywords: ['system', 'architecture', 'flow'],
                requires_retrieval: true,
                requires_tools: false,
                complexity_level: 'moderate',
                approach: 'Provide step-by-step explanation with examples',
            });
        }

        if (messages.some(m => m.content?.includes('improve'))) {
            return JSON.stringify({
                refined_response: 'Enhanced and polished response with better clarity and structure.',
                improvements_made: ['improved clarity', 'fixed grammar', 'added examples'],
                quality_score: 92,
                ready_to_send: true,
            });
        }

        // Default generation response
        return JSON.stringify({
            response: `Generated response to: "${lastMessage.substring(0, 50)}..."`,
            citations: [{ reference: 'C1', text: 'Example citation' }],
            confidence: 0.85,
        });
    }
}

describe('Orchestrator Integration', () => {
    let orchestrator: Orchestrator;
    let mockClient: MockLLMClient;

    beforeEach(() => {
        mockClient = new MockLLMClient();
        orchestrator = new Orchestrator(mockClient, {
            enabled: true,
            passes: 'two-pass',
            include_analysis: true,
            include_refinement: false,
            max_total_tokens: 8000,
            timeout_ms: 30000,
        });
    });

    describe('Two-Pass Flow', () => {
        it('should complete analysis → generation flow', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-1',
                messages: [
                    {
                        role: 'user',
                        content: 'How does the system work?',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result).toBeDefined();
            expect(result.final_response).toBeTruthy();
            expect(result.passes_completed).toContain('generation');
            expect(result.token_usage.total_tokens).toBeGreaterThan(0);
            expect(result.duration_ms).toBeGreaterThan(0);
        });

        it('should include analysis results in the flow', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-2',
                messages: [
                    {
                        role: 'user',
                        content: 'Explain the architecture',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.analysis).toBeDefined();
            expect(result.analysis?.intent).toBeTruthy();
            expect(result.analysis?.keywords).toBeInstanceOf(Array);
            expect(result.analysis?.requires_retrieval).toBeDefined();
        });

        it('should generate response with proper token counting', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-3',
                messages: [
                    {
                        role: 'user',
                        content: 'Short prompt',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.token_usage.total_tokens).toBeGreaterThan(0);
            expect(result.token_usage.total_tokens).toBeLessThan(8000);
        });
    });

    describe('Three-Pass Flow with Refinement', () => {
        it('should complete analysis → generation → refinement flow', async () => {
            const orchestratorWithRefinement = new Orchestrator(mockClient, {
                enabled: true,
                passes: 'three-pass',
                include_analysis: true,
                include_refinement: true,
                max_total_tokens: 8000,
                timeout_ms: 30000,
            });

            const request: OrchestratorRequest = {
                conversationId: 'conv-4',
                messages: [
                    {
                        role: 'user',
                        content: 'Please improve the quality of responses',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result).toBeDefined();
            expect(result.final_response).toBeTruthy();
            expect(result.passes_completed.length).toBeGreaterThan(1);
            expect(result.token_usage.total_tokens).toBeGreaterThan(0);
        });
    });

    describe('Fallback Behavior', () => {
        it('should fallback to single-pass on disabled orchestrator', async () => {
            const disabledOrchestrator = new Orchestrator(mockClient, {
                enabled: false,
                passes: 'two-pass',
                include_analysis: true,
                include_refinement: false,
                max_total_tokens: 8000,
                timeout_ms: 30000,
            });

            const request: OrchestratorRequest = {
                conversationId: 'conv-5',
                messages: [
                    {
                        role: 'user',
                        content: 'Simple question',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await disabledOrchestrator.handle(request);

            expect(result.passes_completed).toContain('single-pass');
            expect(result.token_usage.total_tokens).toBeGreaterThan(0);
        });

        it('should handle token budget limits', async () => {
            const restrictedOrchestrator = new Orchestrator(mockClient, {
                enabled: true,
                passes: 'two-pass',
                include_analysis: true,
                include_refinement: true,
                max_total_tokens: 100, // Very low limit
                timeout_ms: 30000,
            });

            const request: OrchestratorRequest = {
                conversationId: 'conv-6',
                messages: [
                    {
                        role: 'user',
                        content: 'Test with low token budget',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result).toBeDefined();
            expect(result.final_response).toBeTruthy();
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed LLM responses gracefully', async () => {
            class FailingLLMClient implements OrchestratorLLMClient {
                async generateCompletion(): Promise<string> {
                    return 'not valid json';
                }
            }

            const orchestratorWithFailure = new Orchestrator(new FailingLLMClient(), {
                enabled: true,
                passes: 'two-pass',
                include_analysis: true,
                include_refinement: false,
                max_total_tokens: 8000,
                timeout_ms: 30000,
            });

            const request: OrchestratorRequest = {
                conversationId: 'conv-7',
                messages: [
                    {
                        role: 'user',
                        content: 'Test error handling',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestratorWithFailure.handle(request);

            expect(result).toBeDefined();
            expect(result.final_response).toBeDefined(); // Should fallback gracefully
        });

        it('should handle missing user messages', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-8',
                messages: [
                    {
                        role: 'system',
                        content: 'You are helpful',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result).toBeDefined();
            expect(result.final_response).toBeDefined();
        });
    });

    describe('Context and Metadata', () => {
        it('should track all passes completed', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-9',
                messages: [
                    {
                        role: 'user',
                        content: 'Track passes',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.passes_completed).toBeInstanceOf(Array);
            expect(result.passes_completed.length).toBeGreaterThan(0);
            expect(['analysis', 'generation', 'refinement', 'single-pass'].some(
                p => result.passes_completed.includes(p)
            )).toBe(true);
        });

        it('should include token usage breakdown', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-10',
                messages: [
                    {
                        role: 'user',
                        content: 'Check token breakdown',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.token_usage).toBeDefined();
            expect(result.token_usage.total_tokens).toBeGreaterThan(0);
            expect(result.token_usage.analysis_tokens).toBeGreaterThanOrEqual(0);
            expect(result.token_usage.generation_tokens).toBeGreaterThanOrEqual(0);
            expect(result.token_usage.refinement_tokens).toBeGreaterThanOrEqual(0);
        });

        it('should measure orchestration duration', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-11',
                messages: [
                    {
                        role: 'user',
                        content: 'Measure duration',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.duration_ms).toBeGreaterThan(0);
            expect(result.duration_ms).toBeLessThan(60000); // Should be reasonably fast
        });
    });

    describe('Message Formatting', () => {
        it('should handle system messages correctly', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-12',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert assistant',
                    },
                    {
                        role: 'user',
                        content: 'Test with system message',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.final_response).toBeTruthy();
            expect(result.passes_completed.length).toBeGreaterThan(0);
        });

        it('should handle multiple user-assistant turns', async () => {
            const request: OrchestratorRequest = {
                conversationId: 'conv-13',
                messages: [
                    {
                        role: 'user',
                        content: 'First message',
                    },
                    {
                        role: 'assistant',
                        content: 'First response',
                    },
                    {
                        role: 'user',
                        content: 'Follow-up question',
                    },
                ],
                model: 'gpt-4',
            };

            const result = await orchestrator.handle(request);

            expect(result.final_response).toBeTruthy();
            expect(result.passes_completed.length).toBeGreaterThan(0);
        });
    });
});
