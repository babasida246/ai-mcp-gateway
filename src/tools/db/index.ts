import { db } from '../../db/postgres.js';
import { logger } from '../../logging/logger.js';

/**
 * Database QUERY tool
 */
export const dbQueryTool = {
    name: 'db_query',
    description: 'Execute a SQL query on the database',
    inputSchema: {
        type: 'object',
        properties: {
            sql: {
                type: 'string',
                description: 'The SQL query to execute',
            },
            params: {
                type: 'array',
                description: 'Query parameters (optional)',
                items: {},
            },
        },
        required: ['sql'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const sql = args.sql as string;
            const params = args.params as unknown[] | undefined;

            const result = await db.query(sql, params);

            return {
                success: true,
                data: {
                    rows: result?.rows || [],
                    rowCount: result?.rowCount || 0,
                },
            };
        } catch (error) {
            logger.error('Database QUERY error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Database INSERT tool
 */
export const dbInsertTool = {
    name: 'db_insert',
    description: 'Insert a row into a database table',
    inputSchema: {
        type: 'object',
        properties: {
            table: {
                type: 'string',
                description: 'The table name',
            },
            data: {
                type: 'object',
                description: 'The data to insert as key-value pairs',
            },
        },
        required: ['table', 'data'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const table = args.table as string;
            const data = args.data as Record<string, unknown>;

            const result = await db.insert(table, data);

            return {
                success: true,
                data: {
                    inserted: result,
                },
            };
        } catch (error) {
            logger.error('Database INSERT error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Database UPDATE tool
 */
export const dbUpdateTool = {
    name: 'db_update',
    description: 'Update rows in a database table',
    inputSchema: {
        type: 'object',
        properties: {
            table: {
                type: 'string',
                description: 'The table name',
            },
            where: {
                type: 'object',
                description: 'WHERE clause as key-value pairs',
            },
            data: {
                type: 'object',
                description: 'The data to update as key-value pairs',
            },
        },
        required: ['table', 'where', 'data'],
    },
    handler: async (args: Record<string, unknown>) => {
        try {
            const table = args.table as string;
            const where = args.where as Record<string, unknown>;
            const data = args.data as Record<string, unknown>;

            const result = await db.update(table, where, data);

            return {
                success: true,
                data: {
                    updated: result,
                    count: result?.length || 0,
                },
            };
        } catch (error) {
            logger.error('Database UPDATE error', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};
