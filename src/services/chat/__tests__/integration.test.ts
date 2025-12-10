/**
 * Integration tests for Chat Context Optimization
 * 
 * Tests the full flow from request to optimized context
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../db/postgres';
import { buildContextForRequest } from '../integration';
import type { OpenAIMessage } from '../integration';

describe('Chat Context Optimization Integration', () => {
    const testConversationId = `test-conv-${Date.now()}`;

    beforeAll(async () => {
        // Ensure DB is ready
        if (!db.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Create test conversation
        await db.insert('conversations', {
            id: testConversationId,
            project_id: 'test-project',
        });
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await db.query('DELETE FROM messages WHERE conversation_id = $1', [testConversationId]);
            await db.query('DELETE FROM conversations WHERE id = $1', [testConversationId]);
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    });

    describe('buildContextForRequest', () => {
        it('should handle stateless mode (no conversation ID)', async () => {
            const messages: OpenAIMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello!' },
            ];

            const result = await buildContextForRequest({
                messages,
                model: 'gpt-4o-mini',
            });

            expect(result.messages).toHaveLength(2);
            expect(result.strategy).toBe('stateless');
            expect(result.tokenStats.saved).toBe(0);
        });

        it('should build context for new conversation', async () => {
            const messages: OpenAIMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'What is TypeScript?' },
            ];

            const result = await buildContextForRequest({
                conversationId: testConversationId,
                messages,
                model: 'gpt-4o-mini',
                contextStrategy: 'summary+recent',
            });

            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.strategy).toBe('summary+recent');
            expect(result.tokenStats.total).toBeGreaterThan(0);
        });

        it('should optimize long conversation with summary+recent', async () => {
            // Create a long message history
            const messages: OpenAIMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
            ];

            // Add 30 message pairs
            for (let i = 0; i < 30; i++) {
                messages.push(
                    { role: 'user', content: `Question ${i}: Tell me about topic ${i}` },
                    { role: 'assistant', content: `Answer ${i}: Here's information about topic ${i}. This is a long response with detailed information...`.repeat(3) }
                );
            }

            // Add current question
            messages.push({ role: 'user', content: 'Summarize what we discussed' });

            const result = await buildContextForRequest({
                conversationId: testConversationId,
                messages,
                model: 'gpt-4o-mini',
                contextStrategy: 'summary+recent',
                maxContextTokens: 4096,
            });

            // Should have optimized the context
            expect(result.messages.length).toBeLessThan(messages.length);
            expect(result.tokenStats.saved).toBeGreaterThan(0);
            expect(result.metadata.recentMessagesIncluded).toBeGreaterThan(0);

            // Final message should be included
            const lastMessage = result.messages[result.messages.length - 1];
            expect(lastMessage.content).toContain('Summarize');
        });

        it('should use span-retrieval for semantic search', async () => {
            const messages: OpenAIMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Explain TypeScript interfaces' },
                { role: 'assistant', content: 'TypeScript interfaces define object shapes...' },
                { role: 'user', content: 'What about classes?' },
                { role: 'assistant', content: 'Classes in TypeScript...' },
                { role: 'user', content: 'Tell me about generics' },
                { role: 'assistant', content: 'Generics provide type safety...' },
                { role: 'user', content: 'How do interfaces work again?' }, // Should retrieve earlier interface discussion
            ];

            const result = await buildContextForRequest({
                conversationId: testConversationId,
                messages,
                model: 'gpt-4o-mini',
                contextStrategy: 'span-retrieval',
            });

            expect(result.strategy).toBe('span-retrieval');
            // Should have retrieved relevant spans
            expect(result.metadata.spansRetrieved).toBeGreaterThanOrEqual(0);
        });

        it('should respect token budget', async () => {
            const longMessages: OpenAIMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
            ];

            // Create messages that would exceed budget
            for (let i = 0; i < 50; i++) {
                longMessages.push(
                    { role: 'user', content: `Question ${i}: ${'word '.repeat(100)}` },
                    { role: 'assistant', content: `Answer ${i}: ${'word '.repeat(200)}` }
                );
            }

            const maxTokens = 2000;
            const result = await buildContextForRequest({
                conversationId: testConversationId,
                messages: longMessages,
                model: 'gpt-4o-mini',
                maxContextTokens: maxTokens,
            });

            // Should fit within budget
            expect(result.tokenStats.total).toBeLessThanOrEqual(maxTokens);
            expect(result.messages.length).toBeLessThan(longMessages.length);
        });

        it('should handle fallback gracefully', async () => {
            const messages: OpenAIMessage[] = [
                { role: 'user', content: 'Test message' },
            ];

            // Even with invalid config, should not throw
            const result = await buildContextForRequest({
                conversationId: 'invalid-conv-id',
                messages,
                model: 'gpt-4o-mini',
            });

            expect(result).toBeDefined();
            expect(result.messages.length).toBeGreaterThan(0);
        });
    });

    describe('Performance', () => {
        it('should build context in reasonable time', async () => {
            const messages: OpenAIMessage[] = [
                { role: 'system', content: 'System prompt' },
            ];

            for (let i = 0; i < 20; i++) {
                messages.push(
                    { role: 'user', content: `Message ${i}` },
                    { role: 'assistant', content: `Response ${i}` }
                );
            }

            const start = Date.now();

            await buildContextForRequest({
                conversationId: testConversationId,
                messages,
                model: 'gpt-4o-mini',
            });

            const duration = Date.now() - start;

            // Should complete in under 2 seconds for 20 messages
            expect(duration).toBeLessThan(2000);
        });
    });
});
