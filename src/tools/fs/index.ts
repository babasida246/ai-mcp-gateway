import {
    readFileSync,
    writeFileSync,
    readdirSync,
    statSync,
    mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { FileOperationRequestSchema } from '../../mcp/types.js';
import { logger } from '../../logging/logger.js';

/**
 * File system read tool
 */
export const fsReadTool = {
    name: 'fs_read',
    description: 'Read a file from the filesystem',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'File path to read',
            },
        },
        required: ['path'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const request = FileOperationRequestSchema.parse({
                ...args,
                operation: 'read',
            });

            logger.debug('Reading file', { path: request.path });

            const content = readFileSync(request.path, 'utf-8');

            return {
                success: true,
                data: {
                    path: request.path,
                    content,
                    size: content.length,
                },
            };
        } catch (error) {
            logger.error('File read error', {
                path: args.path,
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
 * File system write tool
 */
export const fsWriteTool = {
    name: 'fs_write',
    description: 'Write content to a file',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'File path to write',
            },
            content: {
                type: 'string',
                description: 'Content to write',
            },
        },
        required: ['path', 'content'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const request = FileOperationRequestSchema.parse({
                ...args,
                operation: 'write',
            });

            logger.debug('Writing file', {
                path: request.path,
                size: request.content?.length,
            });

            // Create directory if it doesn't exist
            const dir = dirname(request.path);
            mkdirSync(dir, { recursive: true });

            writeFileSync(request.path, request.content || '', 'utf-8');

            return {
                success: true,
                data: {
                    path: request.path,
                    size: request.content?.length || 0,
                },
            };
        } catch (error) {
            logger.error('File write error', {
                path: args.path,
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
 * File system list tool
 */
export const fsListTool = {
    name: 'fs_list',
    description: 'List files in a directory',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Directory path to list',
            },
        },
        required: ['path'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const request = FileOperationRequestSchema.parse({
                ...args,
                operation: 'list',
            });

            logger.debug('Listing directory', { path: request.path });

            const entries = readdirSync(request.path);
            const files = entries.map((entry) => {
                const fullPath = join(request.path, entry);
                const stats = statSync(fullPath);
                return {
                    name: entry,
                    path: fullPath,
                    isDirectory: stats.isDirectory(),
                    size: stats.size,
                };
            });

            return {
                success: true,
                data: {
                    path: request.path,
                    files,
                    count: files.length,
                },
            };
        } catch (error) {
            logger.error('Directory list error', {
                path: args.path,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};
