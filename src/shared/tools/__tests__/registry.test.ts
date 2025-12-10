/**
 * @file Unified Tools Tests
 * @description Unit tests for unified tool system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    UnifiedToolDefinition,
    UnifiedToolRegistry,
    ToolContext,
    ToolResult,
} from '../base.js';

describe('Unified Tool System', () => {
    let registry: UnifiedToolRegistry;

    beforeEach(() => {
        registry = new UnifiedToolRegistry();
    });

    describe('Tool Registration', () => {
        it('should register a tool successfully', () => {
            const tool: UnifiedToolDefinition = {
                name: 'test.tool',
                description: 'Test tool',
                category: 'system',
                inputSchema: z.object({ input: z.string() }),
                handler: async (input) => ({
                    success: true,
                    data: { output: input.input },
                }),
            };

            registry.register(tool);
            const retrieved = registry.get('test.tool');

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('test.tool');
        });

        it('should list tools by category', () => {
            const aiTool: UnifiedToolDefinition = {
                name: 'ai.test',
                description: 'AI test',
                category: 'ai',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
            };

            const dbTool: UnifiedToolDefinition = {
                name: 'db.test',
                description: 'DB test',
                category: 'database',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
            };

            registry.register(aiTool);
            registry.register(dbTool);

            const aiTools = registry.list({ category: 'ai' });
            expect(aiTools).toHaveLength(1);
            expect(aiTools[0].name).toBe('ai.test');

            const dbTools = registry.list({ category: 'database' });
            expect(dbTools).toHaveLength(1);
            expect(dbTools[0].name).toBe('db.test');
        });

        it('should unregister a tool', () => {
            const tool: UnifiedToolDefinition = {
                name: 'test.remove',
                description: 'Test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
            };

            registry.register(tool);
            expect(registry.get('test.remove')).toBeDefined();

            const removed = registry.unregister('test.remove');
            expect(removed).toBe(true);
            expect(registry.get('test.remove')).toBeUndefined();
        });
    });

    describe('Tool Execution', () => {
        it('should execute a tool successfully', async () => {
            const tool: UnifiedToolDefinition<{ name: string }, { greeting: string }> = {
                name: 'test.greet',
                description: 'Greeting tool',
                category: 'system',
                inputSchema: z.object({
                    name: z.string(),
                }),
                handler: async (input) => ({
                    success: true,
                    data: { greeting: `Hello, ${input.name}!` },
                }),
            };

            registry.register(tool);

            const context: ToolContext = {
                executionId: 'test-1',
            };

            const result = await registry.execute('test.greet', { name: 'World' }, context);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ greeting: 'Hello, World!' });
            expect(result.metadata?.duration).toBeGreaterThan(0);
        });

        it('should validate input with Zod schema', async () => {
            const tool: UnifiedToolDefinition = {
                name: 'test.validate',
                description: 'Validation test',
                category: 'system',
                inputSchema: z.object({
                    email: z.string().email(),
                    age: z.number().min(0).max(150),
                }),
                handler: async (input) => ({
                    success: true,
                    data: input,
                }),
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-2' };

            // Valid input
            const validResult = await registry.execute(
                'test.validate',
                { email: 'test@example.com', age: 25 },
                context
            );
            expect(validResult.success).toBe(true);

            // Invalid input
            const invalidResult = await registry.execute(
                'test.validate',
                { email: 'invalid-email', age: 25 },
                context
            );
            expect(invalidResult.success).toBe(false);
            expect(invalidResult.error?.code).toBeTruthy();
        });

        it('should handle tool errors gracefully', async () => {
            const tool: UnifiedToolDefinition = {
                name: 'test.error',
                description: 'Error test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => {
                    throw new Error('Test error');
                },
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-3' };
            const result = await registry.execute('test.error', {}, context);

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Test error');
        });

        it('should track tool statistics', async () => {
            const tool: UnifiedToolDefinition = {
                name: 'test.stats',
                description: 'Stats test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => ({
                    success: true,
                    data: {},
                }),
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-4' };

            // Execute 3 times
            await registry.execute('test.stats', {}, context);
            await registry.execute('test.stats', {}, context);
            await registry.execute('test.stats', {}, context);

            const stats = registry.getStats('test.stats');

            expect(stats).toBeDefined();
            expect(stats?.callCount).toBe(3);
            expect(stats?.errorCount).toBe(0);
            expect(stats?.avgDuration).toBeGreaterThan(0);
        });
    });

    describe('Middleware', () => {
        it('should run before middleware', async () => {
            const calls: string[] = [];

            registry.use({
                before: async (tool, input, context) => {
                    calls.push(`before:${tool.name}`);
                },
            });

            const tool: UnifiedToolDefinition = {
                name: 'test.middleware',
                description: 'Middleware test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => {
                    calls.push('handler');
                    return { success: true, data: {} };
                },
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-5' };
            await registry.execute('test.middleware', {}, context);

            expect(calls).toEqual(['before:test.middleware', 'handler']);
        });

        it('should run after middleware', async () => {
            const calls: string[] = [];

            registry.use({
                after: async (tool, input, result, context) => {
                    calls.push(`after:${tool.name}:${result.success}`);
                },
            });

            const tool: UnifiedToolDefinition = {
                name: 'test.after',
                description: 'After test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => {
                    calls.push('handler');
                    return { success: true, data: {} };
                },
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-6' };
            await registry.execute('test.after', {}, context);

            expect(calls).toEqual(['handler', 'after:test.after:true']);
        });

        it('should run error middleware on failures', async () => {
            let errorCaught = false;

            registry.use({
                onError: async (tool, input, error, context) => {
                    errorCaught = true;
                },
            });

            const tool: UnifiedToolDefinition = {
                name: 'test.error.mw',
                description: 'Error middleware test',
                category: 'system',
                inputSchema: z.object({}),
                handler: async () => {
                    throw new Error('Test error');
                },
            };

            registry.register(tool);

            const context: ToolContext = { executionId: 'test-7' };
            await registry.execute('test.error.mw', {}, context);

            expect(errorCaught).toBe(true);
        });
    });

    describe('Tool Filtering', () => {
        beforeEach(() => {
            registry.register({
                name: 'ai.chat',
                description: 'Chat',
                category: 'ai',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
                metadata: { tags: ['chat', 'llm'] },
            });

            registry.register({
                name: 'ai.code',
                description: 'Code',
                category: 'ai',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
                metadata: { tags: ['code', 'generation'] },
            });

            registry.register({
                name: 'db.query',
                description: 'Query',
                category: 'database',
                inputSchema: z.object({}),
                handler: async () => ({ success: true, data: {} }),
                metadata: { tags: ['query', 'sql'] },
            });
        });

        it('should filter by tags', () => {
            const chatTools = registry.list({ tags: ['chat'] });
            expect(chatTools).toHaveLength(1);
            expect(chatTools[0].name).toBe('ai.chat');

            const codeTools = registry.list({ tags: ['code'] });
            expect(codeTools).toHaveLength(1);
            expect(codeTools[0].name).toBe('ai.code');
        });

        it('should combine category and tag filters', () => {
            const aiChatTools = registry.list({
                category: 'ai',
                tags: ['chat'],
            });
            expect(aiChatTools).toHaveLength(1);
            expect(aiChatTools[0].name).toBe('ai.chat');
        });
    });
});
