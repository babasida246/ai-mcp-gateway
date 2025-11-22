import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/db/postgres.js';

describe('PostgreSQL Database', () => {
    beforeAll(async () => {
        // Ensure database is connected and schema is initialized
        await db.initSchema();
        await new Promise((resolve) => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        // Clean up test data
        try {
            await db.delete('conversations', { project_id: 'test-project' });
            await db.delete('llm_calls', { project_id: 'test-project' });
            await db.delete('routing_rules', { pattern: 'test-pattern' });
        } catch {
            // Ignore cleanup errors
        }
        await db.close();
    });

    describe('Schema Initialization', () => {
        it('should initialize all required tables', async () => {
            const tables = [
                'conversations',
                'messages',
                'context_summaries',
                'llm_calls',
                'routing_rules',
                'todo_lists',
            ];

            for (const table of tables) {
                const result = await db.query(
                    `SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = $1
                    )`,
                    [table]
                );

                expect(result?.rows[0]?.exists).toBe(true);
            }
        });
    });

    describe('Basic Operations', () => {
        it('should insert and query a conversation', async () => {
            const conversationData = {
                conversation_id: 'test-conv-1',
                project_id: 'test-project',
                created_at: new Date(),
            };

            await db.insert('conversations', conversationData);

            const result = await db.query(
                'SELECT * FROM conversations WHERE conversation_id = $1',
                ['test-conv-1']
            );

            expect(result?.rows).toHaveLength(1);
            expect(result?.rows[0].conversation_id).toBe('test-conv-1');
            expect(result?.rows[0].project_id).toBe('test-project');

            // Cleanup
            await db.delete('conversations', {
                conversation_id: 'test-conv-1',
            });
        });

        it('should update a record', async () => {
            // Insert
            await db.insert('routing_rules', {
                pattern: 'test-pattern',
                preferred_layer: 'fast',
                priority: 1,
                active: true,
            });

            // Update
            await db.update(
                'routing_rules',
                { pattern: 'test-pattern' },
                { preferred_layer: 'balanced', priority: 5 }
            );

            // Verify
            const result = await db.query(
                'SELECT * FROM routing_rules WHERE pattern = $1',
                ['test-pattern']
            );

            expect(result?.rows[0].preferred_layer).toBe('balanced');
            expect(result?.rows[0].priority).toBe(5);

            // Cleanup
            await db.delete('routing_rules', { pattern: 'test-pattern' });
        });

        it('should delete a record', async () => {
            // Insert
            await db.insert('routing_rules', {
                pattern: 'test-delete',
                preferred_layer: 'fast',
                priority: 1,
                active: true,
            });

            // Delete
            await db.delete('routing_rules', { pattern: 'test-delete' });

            // Verify
            const result = await db.query(
                'SELECT * FROM routing_rules WHERE pattern = $1',
                ['test-delete']
            );

            expect(result?.rows).toHaveLength(0);
        });
    });

    describe('Complex Queries', () => {
        it('should handle JSONB metadata', async () => {
            const metadata = {
                tags: ['test', 'example'],
                settings: { theme: 'dark' },
            };

            await db.insert('conversations', {
                conversation_id: 'test-conv-json',
                project_id: 'test-project',
                metadata: JSON.stringify(metadata),
                created_at: new Date(),
            });

            const result = await db.query<{
                metadata: typeof metadata;
            }>(
                'SELECT metadata FROM conversations WHERE conversation_id = $1',
                ['test-conv-json']
            );

            expect(result?.rows[0].metadata).toEqual(metadata);

            // Cleanup
            await db.delete('conversations', {
                conversation_id: 'test-conv-json',
            });
        });

        it('should handle multiple inserts with transaction-like behavior', async () => {
            const convId = 'test-conv-multi';

            // Insert conversation
            await db.insert('conversations', {
                conversation_id: convId,
                project_id: 'test-project',
                created_at: new Date(),
            });

            // Insert multiple messages
            for (let i = 0; i < 3; i++) {
                await db.insert('messages', {
                    conversation_id: convId,
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}`,
                    created_at: new Date(),
                });
            }

            // Verify
            const messagesResult = await db.query(
                'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1',
                [convId]
            );

            expect(parseInt(messagesResult?.rows[0].count)).toBe(3);

            // Cleanup
            await db.delete('messages', { conversation_id: convId });
            await db.delete('conversations', { conversation_id: convId });
        });

        it('should query with WHERE clause containing multiple conditions', async () => {
            // Insert test data
            await db.insert('llm_calls', {
                conversation_id: 'conv-1',
                project_id: 'test-project',
                model_id: 'gpt-4',
                prompt: 'test prompt',
                completion: 'test response',
                latency_ms: 150,
                created_at: new Date(),
            });

            await db.insert('llm_calls', {
                conversation_id: 'conv-2',
                project_id: 'test-project',
                model_id: 'claude-3',
                prompt: 'test prompt 2',
                completion: 'test response 2',
                latency_ms: 200,
                created_at: new Date(),
            });

            // Query with multiple conditions
            const result = await db.query(
                `SELECT * FROM llm_calls 
                 WHERE project_id = $1 AND model_id = $2 
                 ORDER BY created_at DESC`,
                ['test-project', 'gpt-4']
            );

            expect(result?.rows).toHaveLength(1);
            expect(result?.rows[0].model_id).toBe('gpt-4');

            // Cleanup
            await db.delete('llm_calls', { project_id: 'test-project' });
        });
    });

    describe('Error Handling', () => {
        it('should handle constraint violations gracefully', async () => {
            const routingRule = {
                pattern: 'unique-pattern-test',
                preferred_layer: 'fast',
                priority: 1,
                active: true,
            };

            // First insert should succeed
            await db.insert('routing_rules', routingRule);

            // Second insert with same pattern should fail (unique constraint)
            await expect(
                db.insert('routing_rules', routingRule)
            ).rejects.toThrow();

            // Cleanup
            await db.delete('routing_rules', {
                pattern: 'unique-pattern-test',
            });
        });

        it('should handle invalid table name', async () => {
            await expect(
                db.query('SELECT * FROM nonexistent_table')
            ).rejects.toThrow();
        });

        it('should handle connection unavailability', async () => {
            // Close connection
            await db.close();

            // Operations should fail gracefully
            const result = await db.query('SELECT 1');
            expect(result).toBeNull();
        });
    });

    describe('Performance', () => {
        it('should handle bulk inserts efficiently', async () => {
            const convId = 'test-conv-bulk';
            await db.insert('conversations', {
                conversation_id: convId,
                project_id: 'test-project',
                created_at: new Date(),
            });

            const startTime = Date.now();
            const messageCount = 100;

            for (let i = 0; i < messageCount; i++) {
                await db.insert('messages', {
                    conversation_id: convId,
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Bulk message ${i}`,
                    created_at: new Date(),
                });
            }

            const duration = Date.now() - startTime;

            // Verify all inserted
            const result = await db.query(
                'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1',
                [convId]
            );
            expect(parseInt(result?.rows[0].count)).toBe(messageCount);

            // Should complete in reasonable time (< 5 seconds for 100 inserts)
            expect(duration).toBeLessThan(5000);

            // Cleanup
            await db.delete('messages', { conversation_id: convId });
            await db.delete('conversations', { conversation_id: convId });
        });
    });
});
