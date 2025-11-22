import { exec } from 'child_process';
import { promisify } from 'util';
import { TestRunnerRequestSchema } from '../../mcp/types.js';
import { logger } from '../../logging/logger.js';

const execAsync = promisify(exec);

/**
 * Vitest test runner tool
 */
export const vitestTool = {
    name: 'run_vitest',
    description:
        'Run Vitest unit/integration tests. Can run all tests or specific test files.',
    inputSchema: {
        type: 'object',
        properties: {
            testPath: {
                type: 'string',
                description: 'Specific test file or pattern (optional)',
            },
            watch: {
                type: 'boolean',
                description: 'Run in watch mode',
                default: false,
            },
        },
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const request = TestRunnerRequestSchema.parse({
                ...args,
                testType: 'vitest',
            });

            logger.info('Running Vitest', {
                testPath: request.testPath,
                watch: request.watch,
            });

            const command = request.watch
                ? `pnpm vitest ${request.testPath || ''}`
                : `pnpm vitest run ${request.testPath || ''}`;

            const { stdout, stderr } = await execAsync(command, {
                timeout: 60000, // 60 second timeout
            });

            const output = stdout + (stderr ? `\n${stderr}` : '');

            // Parse test results (basic)
            const passedMatch = output.match(/(\d+) passed/);
            const failedMatch = output.match(/(\d+) failed/);
            const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

            return {
                success: failed === 0,
                data: {
                    testType: 'vitest',
                    passed,
                    failed,
                    total: passed + failed,
                    output: output.substring(0, 5000), // Limit output size
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Vitest execution error', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                data: {
                    output: error && typeof error === 'object' && 'stderr' in error ? (error as { stderr: string }).stderr : errorMessage,
                },
            };
        }
    },
};

/**
 * Playwright test runner tool
 */
export const playwrightTool = {
    name: 'run_playwright',
    description:
        'Run Playwright E2E tests. Can run all tests or specific test files.',
    inputSchema: {
        type: 'object',
        properties: {
            testPath: {
                type: 'string',
                description: 'Specific test file or pattern (optional)',
            },
        },
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const request = TestRunnerRequestSchema.parse({
                ...args,
                testType: 'playwright',
            });

            logger.info('Running Playwright', {
                testPath: request.testPath,
            });

            const command = `pnpm playwright test ${request.testPath || ''}`;

            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000, // 2 minute timeout for E2E
            });

            const output = stdout + (stderr ? `\n${stderr}` : '');

            // Parse test results (basic)
            const passedMatch = output.match(/(\d+) passed/);
            const failedMatch = output.match(/(\d+) failed/);
            const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

            return {
                success: failed === 0,
                data: {
                    testType: 'playwright',
                    passed,
                    failed,
                    total: passed + failed,
                    output: output.substring(0, 5000), // Limit output size
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Playwright execution error', { error: errorMessage });

            return {
                success: false,
                error: errorMessage,
                data: {
                    output: error && typeof error === 'object' && 'stderr' in error ? (error as { stderr: string }).stderr : errorMessage,
                },
            };
        }
    },
};
