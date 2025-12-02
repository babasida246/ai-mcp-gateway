/**
 * Database Management Routes
 * Read-only access to PostgreSQL tables and Redis data
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/postgres.js';
import { redisCache } from '../cache/redis.js';
import { logger } from '../logging/logger.js';

export function createDatabaseRoutes(): Router {
    const router = Router();

    /**
     * GET /v1/database/tables
     * List all tables in the database
     */
    router.get('/tables', async (req: Request, res: Response) => {
        try {
            const client = await db.getClient();

            const result = await client.query(`
            SELECT 
                table_name,
                pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

            client.release();

            res.json({
                success: true,
                tables: result.rows
            });
        } catch (error) {
            logger.error('Failed to list tables', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/database/table/:tableName
     * Get table schema and data
     */
    router.get('/table/:tableName', async (req: Request, res: Response) => {
        try {
            const { tableName } = req.params;
            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;

            // Validate table name (prevent SQL injection)
            if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid table name'
                });
            }

            const client = await db.getClient();

            // Get schema
            const schemaResult = await client.query(`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);

            // Get row count
            const countResult = await client.query(`
            SELECT COUNT(*) as total FROM ${tableName}
        `);

            // Get data
            const dataResult = await client.query(`
            SELECT * FROM ${tableName}
            ORDER BY (
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 
                LIMIT 1
            )
            LIMIT $2 OFFSET $3
        `, [tableName, limit, offset]);

            client.release();

            res.json({
                success: true,
                table: tableName,
                schema: schemaResult.rows,
                total: parseInt(countResult.rows[0].total),
                limit,
                offset,
                data: dataResult.rows
            });
        } catch (error) {
            logger.error('Failed to query table', { error, table: req.params.tableName });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/redis/info
     * Get Redis server info and statistics
     */
    router.get('/key/:key', async (req: Request, res: Response) => {
        try {
            const client = redisCache.getClient(); nt(); nt();

            // Get info
            const info = await client.info();
            const dbSize = await client.dbSize();
            const memory = await client.info('memory');

            // Parse info string into object
            const parseInfo = (infoStr: string) => {
                const lines = infoStr.split('\r\n');
                const result: Record<string, string> = {};

                for (const line of lines) {
                    if (line && !line.startsWith('#')) {
                        const [key, value] = line.split(':');
                        if (key && value) {
                            result[key] = value;
                        }
                    }
                }
                return result;
            };

            const infoObj = parseInfo(info);
            const memoryObj = parseInfo(memory);

            res.json({
                success: true,
                info: {
                    version: infoObj.redis_version,
                    mode: infoObj.redis_mode,
                    os: infoObj.os,
                    uptime_seconds: parseInt(infoObj.uptime_in_seconds || '0'),
                    connected_clients: parseInt(infoObj.connected_clients || '0'),
                    total_keys: dbSize,
                    used_memory: memoryObj.used_memory_human,
                    used_memory_peak: memoryObj.used_memory_peak_human,
                }
            });
        } catch (error) {
            logger.error('Failed to get Redis info', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/redis/keys
     * List keys in Redis (with pattern support)
     */
    router.get('/redis/keys', async (req: Request, res: Response) => {
        try {
            const pattern = (req.query.pattern as string) || '*';
            const limit = parseInt(req.query.limit as string) || 100;

            const client = redis.getClient();

            // Use SCAN instead of KEYS for better performance
            let cursor = 0;
            const keys: string[] = [];

            do {
                const [newCursor, foundKeys] = await client.scan(
                    cursor,
                    'MATCH', pattern,
                    'COUNT', 100
                );

                cursor = parseInt(newCursor);
                keys.push(...foundKeys);

                if (keys.length >= limit) break;
            } while (cursor !== 0);

            res.json({
                success: true,
                pattern,
                total: keys.length,
                keys: keys.slice(0, limit)
            });
        } catch (error) {
            logger.error('Failed to list Redis keys', { error });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/redis/key/:key
     * Get value of a specific key
     */
    router.get('/redis/key/:key', async (req: Request, res: Response) => {
        try {
            const { key } = req.params;
            const client = redis.getClient();

            // Get key type
            const type = await client.type(key);

            if (type === 'none') {
                return res.status(404).json({
                    success: false,
                    error: 'Key not found'
                });
            }

            let value: unknown;
            let ttl: number | null = null;

            // Get TTL
            const ttlResult = await client.ttl(key);
            if (ttlResult > 0) {
                ttl = ttlResult;
            }

            // Get value based on type
            switch (type) {
                case 'string':
                    value = await client.get(key);
                    break;
                case 'list':
                    value = await client.lRange(key, 0, -1);
                    break;
                case 'set':
                    value = await client.sMembers(key);
                    break;
                case 'zset':
                    value = await client.zRange(key, 0, -1, { withScores: true });
                    break;
                case 'hash':
                    value = await client.hGetAll(key);
                    break;
                default:
                    value = null;
            }

            res.json({
                success: true,
                key,
                type,
                ttl,
                value
            });
        } catch (error) {
            logger.error('Failed to get Redis key', { error, key: req.params.key });
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    return router;
}

export default createDatabaseRoutes();
