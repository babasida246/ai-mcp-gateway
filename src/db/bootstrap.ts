import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseDotenv } from 'dotenv';

/**
 * Bootstrap Database Connection
 * 
 * Reads minimal config from .env.bootstrap file for initial DB connection
 * This is the ONLY service that reads from file - all others use ConfigService
 */

interface BootstrapConfig {
    DB_HOST: string;
    DB_PORT: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DB_SSL?: string;
    CONFIG_ENCRYPTION_KEY: string;
}

class BootstrapDB {
    private pool: Pool | null = null;
    private config: BootstrapConfig | null = null;

    /**
     * Load bootstrap configuration from environment variables or .env.bootstrap file
     * Priority: environment variables > .env.bootstrap file
     * This supports both Docker containers (using env vars) and local development (using file)
     */
    private loadBootstrapConfig(): BootstrapConfig {
        const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CONFIG_ENCRYPTION_KEY'];

        // Try loading from environment variables first (for Docker containers)
        const fromEnv: Partial<BootstrapConfig> = {
            DB_HOST: process.env.DB_HOST,
            DB_PORT: process.env.DB_PORT,
            DB_NAME: process.env.DB_NAME,
            DB_USER: process.env.DB_USER,
            DB_PASSWORD: process.env.DB_PASSWORD,
            DB_SSL: process.env.DB_SSL,
            CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
        };

        // Check if all required fields are available from environment
        const allFromEnv = required.every(field => fromEnv[field as keyof BootstrapConfig] !== undefined);
        if (allFromEnv) {
            return fromEnv as BootstrapConfig;
        }

        // Fallback: try loading from .env.bootstrap file
        const bootstrapPath = join(process.cwd(), '.env.bootstrap');
        if (!existsSync(bootstrapPath)) {
            // Debug information for troubleshooting
            const envStatus = {
                DB_HOST: !!process.env.DB_HOST,
                DB_PORT: !!process.env.DB_PORT,
                DB_NAME: !!process.env.DB_NAME,
                DB_USER: !!process.env.DB_USER,
                DB_PASSWORD: !!process.env.DB_PASSWORD,
                CONFIG_ENCRYPTION_KEY: !!process.env.CONFIG_ENCRYPTION_KEY,
                bootstrapFileExists: false,
                cwd: process.cwd(),
            };
            throw new Error(
                'Bootstrap configuration not found.\n' +
                'Environment status: ' + JSON.stringify(envStatus, null, 2) + '\n' +
                'Please provide either:\n' +
                '1. Environment variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, CONFIG_ENCRYPTION_KEY\n' +
                '2. Or .env.bootstrap file by running: npm run setup:config'
            );
        }

        const bootstrapContent = readFileSync(bootstrapPath, 'utf8');
        const parsed = parseDotenv(bootstrapContent) as any;

        // Validate required fields in file
        for (const field of required) {
            if (!parsed[field]) {
                throw new Error(`Missing required field in .env.bootstrap: ${field}`);
            }
        }

        return parsed as BootstrapConfig;
    }

    /**
     * Initialize database pool with bootstrap config
     */
    async initialize(): Promise<void> {
        console.log('🔄 Starting BootstrapDB initialization...');

        if (this.pool) {
            console.log('✓ BootstrapDB already initialized');
            return; // Already initialized
        }

        this.config = this.loadBootstrapConfig();

        this.pool = new Pool({
            host: this.config.DB_HOST,
            port: parseInt(this.config.DB_PORT, 10),
            database: this.config.DB_NAME,
            user: this.config.DB_USER,
            password: this.config.DB_PASSWORD,
            ssl: this.config.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        // Test connection
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            console.log('✅ Database connection established');
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    /**
     * Get database pool (must call initialize() first)
     */
    getPool(): Pool {
        if (!this.pool) {
            throw new Error('BootstrapDB not initialized. Call initialize() first.');
        }
        return this.pool;
    }

    /**
     * Get encryption key from bootstrap config
     */
    getEncryptionKey(): string {
        if (!this.config) {
            throw new Error('BootstrapDB not initialized.');
        }
        return this.config.CONFIG_ENCRYPTION_KEY;
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

// Singleton instance
export const bootstrapDB = new BootstrapDB();

// Re-export getPool for backward compatibility with existing code
export async function getPool(): Promise<Pool> {
    if (!bootstrapDB.getPool) {
        await bootstrapDB.initialize();
    }
    return bootstrapDB.getPool();
}
