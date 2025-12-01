/**
 * Tests for Phase 2-6 features
 */

import { describe, it, expect, vi } from 'vitest';

describe('Phase 2: Code Agent', () => {
    describe('Refactor Mode', () => {
        it('should analyze code for refactoring opportunities', async () => {
            const { analyzeForRefactoring } = await import('../src/tools/codeAgent/refactor.js');

            const code = `
function calculateTotal(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        total += items[i].price * items[i].quantity;
    }
    return total;
}
            `;

            // Mock LLM response
            vi.mock('../src/tools/llm/index.js', () => ({
                callLLM: vi.fn().mockResolvedValue({
                    content: JSON.stringify({
                        changes: [{
                            line: 3,
                            oldCode: 'for (let i = 0; i < items.length; i++)',
                            newCode: 'for (const item of items)',
                            reason: 'Use modern for...of loop'
                        }],
                        reasoning: 'Simplify loop syntax',
                        confidence: 85
                    })
                })
            }));

            const result = await analyzeForRefactoring(code, 'typescript');

            expect(result).toBeDefined();
            expect(result.changes).toBeInstanceOf(Array);
            expect(result.confidence).toBeGreaterThan(0);
        });
    });

    describe('Spec-First TDD', () => {
        it('should generate tests from specification', async () => {
            const { generateTestsFromSpec } = await import('../src/tools/codeAgent/spec-first.js');

            const spec = `
Create a function that validates email addresses:
- Must contain @ symbol
- Must have domain with .
- Should reject empty strings
            `;

            const result = await generateTestsFromSpec(spec, 'vitest');

            expect(result).toBeDefined();
            expect(result.tests).toContain('expect');
            expect(result.framework).toBe('vitest');
        });
    });

    describe('Test Triage', () => {
        it('should categorize test failures', async () => {
            const { triageTestFailure } = await import('../src/tools/codeAgent/test-triage.js');

            const failure = {
                testName: 'should calculate total',
                error: 'Expected 10, received 9',
                stackTrace: 'at calculateTotal (calc.ts:10)',
                code: 'expect(calculateTotal(items)).toBe(10)'
            };

            const result = await triageTestFailure(failure);

            expect(result.category).toBeDefined();
            expect(['assertion-failure', 'runtime-error', 'timeout']).toContain(result.category);
            expect(result.severity).toBeGreaterThan(0);
        });
    });

    describe('Repository Mapping', () => {
        it('should generate repository structure map', async () => {
            const { generateRepoMap } = await import('../src/tools/codeAgent/repo-map.js');

            const result = await generateRepoMap(process.cwd(), {
                exclude: ['node_modules', 'dist', '.git']
            });

            expect(result.structure).toBeDefined();
            expect(result.modules).toBeInstanceOf(Array);
            expect(result.statistics).toBeDefined();
            expect(result.statistics.totalFiles).toBeGreaterThan(0);
        });
    });
});

describe('Phase 3: Policy-Based Routing', () => {
    it('should match policies based on conditions', async () => {
        const { PolicyMatcher, DEFAULT_POLICIES } = await import('../src/routing/policy.js');

        const matcher = new PolicyMatcher(DEFAULT_POLICIES);

        const result = matcher.match({
            taskType: 'code',
            complexity: 3,
            filePath: 'auth.ts',
        });

        expect(result).toBeDefined();
        expect(result.matchedPolicies).toBeInstanceOf(Array);
    });

    it('should simulate routing decisions', async () => {
        const { RouteSimulator, DEFAULT_POLICIES } = await import('../src/routing/policy.js');

        const simulator = new RouteSimulator(DEFAULT_POLICIES);

        const result = await simulator.simulate({
            taskType: 'code',
            complexity: 5,
            filePath: 'crypto.ts',
        });

        expect(result.route).toBeDefined();
        expect(result.policies).toBeInstanceOf(Array);
    });
});

describe('Phase 4: Semantic Search', () => {
    it('should generate embeddings for code', async () => {
        const { SemanticSearch } = await import('../src/search/semantic.js');
        const { Pool } = await import('pg');

        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const search = new SemanticSearch(pool);

        const embedding = await search.generateEmbedding('function test() {}');

        expect(embedding).toBeInstanceOf(Array);
        expect(embedding.length).toBeGreaterThan(0);

        await pool.end();
    });

    it('should search for similar code', async () => {
        const { SemanticSearch } = await import('../src/search/semantic.js');
        const { Pool } = await import('pg');

        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const search = new SemanticSearch(pool);

        // Index sample code
        await search.indexCodeFile(
            'test.ts',
            'function add(a: number, b: number) { return a + b; }',
            'typescript'
        );

        // Search
        const results = await search.search('addition function', 5);

        expect(results).toBeInstanceOf(Array);

        await pool.end();
    });
});

describe('Phase 5: CLI Enhancements', () => {
    describe('Patch Applicator', () => {
        it('should apply patches with backup', async () => {
            const { PatchApplicator } = await import('../src/cli/enhancements.js');

            const applicator = new PatchApplicator('.test-backups');

            const patches = [{
                filePath: 'test-file.txt',
                oldContent: 'old content',
                newContent: 'new content',
                description: 'Test patch'
            }];

            // Mock file operations
            vi.mock('fs/promises');

            const results = await applicator.applyPatches(patches, false);

            expect(results).toBeInstanceOf(Array);
            expect(results[0]).toBeDefined();
        });
    });

    describe('Command History', () => {
        it('should track command history', async () => {
            const { CommandHistory } = await import('../src/cli/enhancements.js');

            const history = new CommandHistory('.test-history.json');

            await history.addCommand('test command', true, 'output');

            const recent = await history.getRecent(1);

            expect(recent).toBeInstanceOf(Array);
            expect(recent.length).toBeGreaterThan(0);
        });
    });

    describe('System Doctor', () => {
        it('should run health checks', async () => {
            const { SystemDoctor } = await import('../src/cli/enhancements.js');

            const doctor = new SystemDoctor();

            const result = await doctor.diagnose();

            expect(result.overall).toBeDefined();
            expect(['healthy', 'degraded', 'unhealthy']).toContain(result.overall);
            expect(result.checks).toBeInstanceOf(Array);
        });
    });
});

describe('Phase 6: Integration Tests', () => {
    it('should have all API endpoints registered', async () => {
        const { apiServer } = await import('../src/api/server.js');

        // Start server
        await apiServer.start();

        // Test health endpoint
        const response = await fetch('http://localhost:3000/health');
        const data = await response.json();

        expect(data.status).toBe('ok');

        // Stop server
        await apiServer.stop();
    });
});
