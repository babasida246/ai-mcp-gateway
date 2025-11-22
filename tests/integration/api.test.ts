import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiServer } from '../../src/api/server.js';
import { db } from '../../src/db/postgres.js';
import { redisCache } from '../../src/cache/redis.js';

const BASE_URL = 'http://localhost:3000';

describe('HTTP API Server', () => {
    beforeAll(async () => {
        // Start API server
        await apiServer.start();
        // Wait for server to be ready
        await new Promise((resolve) => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        // Stop server and cleanup
        await apiServer.stop();
        await redisCache.close();
        await db.close();
    });

    describe('Health Check', () => {
        it('should return 200 on health check endpoint', async () => {
            const response = await fetch(`${BASE_URL}/health`);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('status');
            expect(data.status).toBe('ok');
        });
    });

    describe('POST /route', () => {
        it('should route a simple request', async () => {
            const response = await fetch(`${BASE_URL}/route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userInput: 'What is 2 + 2?',
                    conversationId: 'test-conv-route',
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('response');
            expect(data).toHaveProperty('layer');
            expect(['fast', 'balanced', 'deep']).toContain(data.layer);
        });

        it('should handle missing userInput', async () => {
            const response = await fetch(`${BASE_URL}/route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: 'test-conv-route',
                }),
            });

            expect(response.status).toBe(400);
        });

        it('should handle complex queries', async () => {
            const response = await fetch(`${BASE_URL}/route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userInput:
                        'Implement a binary search algorithm in TypeScript with comprehensive unit tests',
                    conversationId: 'test-conv-complex',
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('response');
            // Complex tasks should likely go to balanced or deep
            expect(['balanced', 'deep']).toContain(data.layer);
        });
    });

    describe('POST /code-agent', () => {
        it('should handle code generation request', async () => {
            const response = await fetch(`${BASE_URL}/code-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: 'Write a simple hello world function in TypeScript',
                    conversationId: 'test-conv-code',
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('result');
            expect(data.result).toBeTruthy();
        });

        it('should handle missing task parameter', async () => {
            const response = await fetch(`${BASE_URL}/code-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: 'test-conv-code',
                }),
            });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /chat', () => {
        it('should handle simple chat message', async () => {
            const response = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Hello, how are you?',
                    conversationId: 'test-conv-chat',
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('reply');
            expect(typeof data.reply).toBe('string');
            expect(data.reply.length).toBeGreaterThan(0);
        });

        it('should maintain conversation context', async () => {
            const convId = 'test-conv-context';

            // First message
            const response1 = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'My favorite color is blue',
                    conversationId: convId,
                }),
            });

            expect(response1.status).toBe(200);

            // Second message referencing first
            const response2 = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'What is my favorite color?',
                    conversationId: convId,
                }),
            });

            expect(response2.status).toBe(200);

            const data2 = await response2.json();
            // Response should reference the previous context
            expect(data2.reply.toLowerCase()).toContain('blue');
        });

        it('should handle missing message parameter', async () => {
            const response = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: 'test-conv-chat',
                }),
            });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /context/:conversationId', () => {
        it('should retrieve conversation context', async () => {
            const convId = 'test-conv-get-context';

            // First create some context
            await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Test message for context',
                    conversationId: convId,
                }),
            });

            // Now retrieve context
            const response = await fetch(`${BASE_URL}/context/${convId}`);

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('conversationId');
            expect(data.conversationId).toBe(convId);
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('recentMessages');
        });

        it('should handle non-existent conversation', async () => {
            const response = await fetch(
                `${BASE_URL}/context/nonexistent-conv-id`
            );

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.summary).toBeNull();
            expect(data.recentMessages).toEqual([]);
        });
    });

    describe('PUT /context/:conversationId', () => {
        it('should update conversation context', async () => {
            const convId = 'test-conv-update-context';
            const newSummary = 'Updated conversation summary';

            const response = await fetch(`${BASE_URL}/context/${convId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: newSummary,
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty('success');
            expect(data.success).toBe(true);

            // Verify the update
            const getResponse = await fetch(`${BASE_URL}/context/${convId}`);
            const getData = await getResponse.json();
            expect(getData.summary.content).toBe(newSummary);
        });

        it('should handle missing summary in update', async () => {
            const convId = 'test-conv-update-invalid';

            const response = await fetch(`${BASE_URL}/context/${convId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            expect(response.status).toBe(400);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for unknown routes', async () => {
            const response = await fetch(`${BASE_URL}/unknown-route`);
            expect(response.status).toBe(404);
        });

        it('should return 405 for unsupported methods', async () => {
            const response = await fetch(`${BASE_URL}/route`, {
                method: 'GET',
            });
            expect(response.status).toBe(405);
        });

        it('should handle malformed JSON', async () => {
            const response = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json{',
            });

            expect(response.status).toBe(400);
        });

        it('should handle large payloads', async () => {
            const largeMessage = 'a'.repeat(100000); // 100KB message

            const response = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: largeMessage,
                    conversationId: 'test-conv-large',
                }),
            });

            // Should either succeed or return 413 (Payload Too Large)
            expect([200, 413]).toContain(response.status);
        });
    });

    describe('CORS', () => {
        it('should include CORS headers', async () => {
            const response = await fetch(`${BASE_URL}/health`, {
                headers: {
                    Origin: 'http://example.com',
                },
            });

            const corsHeader = response.headers.get('Access-Control-Allow-Origin');
            expect(corsHeader).toBeTruthy();
            expect(corsHeader).toBe('*');
        });

        it('should handle OPTIONS preflight requests', async () => {
            const response = await fetch(`${BASE_URL}/route`, {
                method: 'OPTIONS',
                headers: {
                    Origin: 'http://example.com',
                    'Access-Control-Request-Method': 'POST',
                },
            });

            expect(response.status).toBe(204);
            expect(
                response.headers.get('Access-Control-Allow-Methods')
            ).toBeTruthy();
        });
    });

    describe('Performance', () => {
        it('should handle concurrent requests', async () => {
            const promises = Array.from({ length: 10 }, (_, i) =>
                fetch(`${BASE_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: `Concurrent message ${i}`,
                        conversationId: `test-conv-concurrent-${i}`,
                    }),
                })
            );

            const responses = await Promise.all(promises);

            // All should succeed
            for (const response of responses) {
                expect(response.status).toBe(200);
            }
        });

        it('should respond quickly to simple requests', async () => {
            const startTime = Date.now();

            await fetch(`${BASE_URL}/health`);

            const duration = Date.now() - startTime;

            // Health check should be very fast (< 100ms)
            expect(duration).toBeLessThan(100);
        });
    });
});
