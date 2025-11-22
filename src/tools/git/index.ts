import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../logging/logger.js';

const execAsync = promisify(exec);

/**
 * Git diff tool
 */
export const gitDiffTool = {
    name: 'git_diff',
    description: 'Get git diff for current changes',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Specific file path (optional)',
            },
            staged: {
                type: 'boolean',
                description: 'Show staged changes only',
                default: false,
            },
        },
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const path = (args.path as string) || '';
            const staged = (args.staged as boolean) || false;

            logger.debug('Getting git diff', { path, staged });

            const command = staged
                ? `git diff --staged ${path}`
                : `git diff ${path}`;

            const { stdout } = await execAsync(command);

            return {
                success: true,
                data: {
                    diff: stdout,
                    path,
                    staged,
                },
            };
        } catch (error) {
            logger.error('Git diff error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Git status tool
 */
export const gitStatusTool = {
    name: 'git_status',
    description: 'Get git status',
    inputSchema: {
        type: 'object',
        properties: {},
    },
    handler: async () => {
        try {
            logger.debug('Getting git status');

            const { stdout } = await execAsync('git status --porcelain');

            // Parse status
            const lines = stdout.trim().split('\n').filter(Boolean);
            const files = lines.map((line) => {
                const status = line.substring(0, 2);
                const file = line.substring(3);
                return { status, file };
            });

            return {
                success: true,
                data: {
                    files,
                    count: files.length,
                    raw: stdout,
                },
            };
        } catch (error) {
            logger.error('Git status error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};
