import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

/**
 * Database client singleton for PostgreSQL
 */
class Database {
    private pool: Pool | null = null;
    private isConnected = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        try {
            const config = env.DATABASE_URL
                ? { connectionString: env.DATABASE_URL }
                : {
                    host: env.DB_HOST,
                    port: parseInt(env.DB_PORT),
                    database: env.DB_NAME,
                    user: env.DB_USER,
                    password: env.DB_PASSWORD,
                    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
                };

            this.pool = new Pool({
                ...config,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            this.pool.on('connect', () => {
                this.isConnected = true;
                logger.info('Database connected successfully');
            });

            this.pool.on('error', (error) => {
                this.isConnected = false;
                logger.error('Database connection error', {
                    error: error.message,
                });
            });

            // Test connection
            this.testConnection();
        } catch (error) {
            logger.error('Failed to initialize database', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    private async testConnection() {
        try {
            const client = await this.pool?.connect();
            if (client) {
                await client.query('SELECT NOW()');
                client.release();
                this.isConnected = true;
                logger.info('Database connection test successful');
            }
        } catch (error) {
            this.isConnected = false;
            logger.warn('Database connection test failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Execute a SQL query
     */
    async query<T extends QueryResultRow = QueryResultRow>(
        sql: string,
        params?: unknown[]
    ): Promise<QueryResult<T> | null> {
        if (!this.pool || !this.isConnected) {
            logger.debug('Database not available for query');
            return null;
        }

        try {
            const result = await this.pool.query<T>(sql, params);
            return result;
        } catch (error) {
            logger.error('Database query error', {
                error: error instanceof Error ? error.message : 'Unknown',
                sql: sql.substring(0, 100),
            });
            return null;
        }
    }

    /**
     * Insert data into a table
     */
    async insert<T extends QueryResultRow = QueryResultRow>(
        table: string,
        data: Record<string, unknown>
    ): Promise<T | null> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;

        const result = await this.query<T>(sql, values);
        return result?.rows[0] ?? null;
    }

    /**
     * Update data in a table
     */
    async update<T extends QueryResultRow = QueryResultRow>(
        table: string,
        where: Record<string, unknown>,
        data: Record<string, unknown>
    ): Promise<T[] | null> {
        const dataKeys = Object.keys(data);
        const dataValues = Object.values(data);
        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);

        const setClause = dataKeys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
        const whereClause = whereKeys
            .map((key, i) => `${key} = $${dataValues.length + i + 1}`)
            .join(' AND ');

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
        const result = await this.query<T>(sql, [...dataValues, ...whereValues]);
        return result?.rows ?? null;
    }

    /**
     * Delete data from a table
     */
    async delete(
        table: string,
        where: Record<string, unknown>
    ): Promise<boolean> {
        const keys = Object.keys(where);
        const values = Object.values(where);
        const whereClause = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(' AND ');

        const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
        const result = await this.query(sql, values);
        return (result?.rowCount ?? 0) > 0;
    }

    /**
     * Initialize database schema
     */
    async initSchema(): Promise<void> {
        if (!this.pool || !this.isConnected) {
            logger.warn('Database not available for schema initialization');
            return;
        }

        try {
            // Conversations table
            await this.query(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    project_id TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // Messages table
            await this.query(`
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Context summaries table
            await this.query(`
                CREATE TABLE IF NOT EXISTS context_summaries (
                    id SERIAL PRIMARY KEY,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                    summary TEXT NOT NULL,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // LLM calls log table
            await this.query(`
                CREATE TABLE IF NOT EXISTS llm_calls (
                    id SERIAL PRIMARY KEY,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                    model_id TEXT NOT NULL,
                    layer TEXT NOT NULL,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    estimated_cost DECIMAL(10, 6) DEFAULT 0,
                    duration_ms INTEGER,
                    success BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // Routing rules table
            await this.query(`
                CREATE TABLE IF NOT EXISTS routing_rules (
                    id SERIAL PRIMARY KEY,
                    pattern TEXT NOT NULL,
                    preferred_layer TEXT,
                    preferred_model TEXT,
                    priority INTEGER DEFAULT 0,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // TODO lists table
            await this.query(`
                CREATE TABLE IF NOT EXISTS todo_lists (
                    id SERIAL PRIMARY KEY,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                    todo_data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Create indexes
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON context_summaries(conversation_id)`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_llm_calls_conversation ON llm_calls(conversation_id)`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON llm_calls(created_at)`
            );

            logger.info('Database schema initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database schema', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database connection closed');
        }
    }

    /**
     * Check if database is connected
     */
    isReady(): boolean {
        return this.isConnected;
    }
}

// Singleton instance
export const db = new Database();
