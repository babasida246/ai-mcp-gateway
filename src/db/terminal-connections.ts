import { Pool } from 'pg';
import { logger } from '../logging/logger.js';
import crypto from 'crypto';

export interface TerminalConnection {
    id: string;
    name: string;
    type: 'ssh' | 'telnet' | 'local';
    host?: string;
    port?: number;
    username?: string;
    authType: 'password' | 'private_key' | 'agent' | 'none';
    encryptedCredentials?: string;
    isDefault: boolean;
    notes?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTerminalConnectionInput {
    name: string;
    type: 'ssh' | 'telnet' | 'local';
    host?: string;
    port?: number;
    username?: string;
    authType?: 'password' | 'private_key' | 'agent' | 'none';
    password?: string;
    privateKey?: string;
    isDefault?: boolean;
    notes?: string;
    metadata?: Record<string, unknown>;
}

export interface UpdateTerminalConnectionInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    authType?: 'password' | 'private_key' | 'agent' | 'none';
    password?: string;
    privateKey?: string;
    isDefault?: boolean;
    notes?: string;
    metadata?: Record<string, unknown>;
}

// Simple encryption key - in production, use a proper secret management
const ENCRYPTION_KEY = process.env.TERMINAL_ENCRYPTION_KEY || 'ai-mcp-gateway-terminal-key-32b';

/**
 * Encrypt credentials (password or private key)
 */
function encryptCredentials(data: string): string {
    try {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        // Format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        logger.error('Failed to encrypt credentials', { error });
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypt credentials
 */
function decryptCredentials(encryptedData: string): string {
    try {
        const algorithm = 'aes-256-gcm';
        const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        logger.error('Failed to decrypt credentials', { error });
        throw new Error('Decryption failed');
    }
}

/**
 * Service for managing terminal connection profiles
 */
export class TerminalConnectionService {
    private pool: Pool;
    private initialized = false;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS terminal_connections (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(255) NOT NULL,
                    type VARCHAR(20) NOT NULL CHECK (type IN ('ssh', 'telnet', 'local')),
                    host VARCHAR(255),
                    port INTEGER DEFAULT 22,
                    username VARCHAR(255),
                    auth_type VARCHAR(20) DEFAULT 'password' CHECK (auth_type IN ('password', 'private_key', 'agent', 'none')),
                    encrypted_credentials TEXT,
                    is_default BOOLEAN DEFAULT false,
                    notes TEXT,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_terminal_connections_type 
                ON terminal_connections(type)
            `);

            this.initialized = true;
            logger.info('Terminal connections table initialized');
        } catch (error) {
            logger.error('Failed to initialize terminal connections table', { error });
            throw error;
        }
    }

    /**
     * Get all terminal connections
     */
    async getAll(): Promise<TerminalConnection[]> {
        const result = await this.pool.query(`
            SELECT 
                id, name, type, host, port, username, 
                auth_type as "authType", 
                encrypted_credentials as "encryptedCredentials",
                is_default as "isDefault", notes, metadata,
                created_at as "createdAt", 
                updated_at as "updatedAt"
            FROM terminal_connections
            ORDER BY is_default DESC, name ASC
        `);

        return result.rows.map(row => ({
            ...row,
            // Don't expose encrypted credentials in list
            encryptedCredentials: row.encryptedCredentials ? '***' : undefined,
        }));
    }

    /**
     * Get a terminal connection by ID
     */
    async getById(id: string): Promise<TerminalConnection | null> {
        const result = await this.pool.query(`
            SELECT 
                id, name, type, host, port, username, 
                auth_type as "authType", 
                encrypted_credentials as "encryptedCredentials",
                is_default as "isDefault", notes, metadata,
                created_at as "createdAt", 
                updated_at as "updatedAt"
            FROM terminal_connections
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    /**
     * Get decrypted credentials for a connection
     */
    async getCredentials(id: string): Promise<{ password?: string; privateKey?: string } | null> {
        const connection = await this.getById(id);
        if (!connection || !connection.encryptedCredentials) {
            return null;
        }

        try {
            const decrypted = decryptCredentials(connection.encryptedCredentials);
            const data = JSON.parse(decrypted);
            return data;
        } catch (error) {
            logger.error('Failed to get credentials', { id, error });
            return null;
        }
    }

    /**
     * Create a new terminal connection
     */
    async create(input: CreateTerminalConnectionInput): Promise<TerminalConnection> {
        // Encrypt credentials if provided
        let encryptedCredentials: string | null = null;
        if (input.password || input.privateKey) {
            const credentials = {
                password: input.password,
                privateKey: input.privateKey,
            };
            encryptedCredentials = encryptCredentials(JSON.stringify(credentials));
        }

        // If this is set as default, unset other defaults of same type
        if (input.isDefault) {
            await this.pool.query(`
                UPDATE terminal_connections 
                SET is_default = false 
                WHERE type = $1 AND is_default = true
            `, [input.type]);
        }

        const result = await this.pool.query(`
            INSERT INTO terminal_connections 
                (name, type, host, port, username, auth_type, encrypted_credentials, is_default, notes, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING 
                id, name, type, host, port, username, 
                auth_type as "authType",
                is_default as "isDefault", notes, metadata,
                created_at as "createdAt", 
                updated_at as "updatedAt"
        `, [
            input.name,
            input.type,
            input.host || null,
            input.port || (input.type === 'ssh' ? 22 : input.type === 'telnet' ? 23 : null),
            input.username || null,
            input.authType || 'password',
            encryptedCredentials,
            input.isDefault || false,
            input.notes || null,
            JSON.stringify(input.metadata || {}),
        ]);

        logger.info('Created terminal connection', { id: result.rows[0].id, name: input.name });
        return result.rows[0];
    }

    /**
     * Update a terminal connection
     */
    async update(id: string, input: UpdateTerminalConnectionInput): Promise<TerminalConnection | null> {
        const existing = await this.getById(id);
        if (!existing) {
            return null;
        }

        // Handle credentials update
        let encryptedCredentials = existing.encryptedCredentials;
        if (input.password !== undefined || input.privateKey !== undefined) {
            if (input.password || input.privateKey) {
                const credentials = {
                    password: input.password,
                    privateKey: input.privateKey,
                };
                encryptedCredentials = encryptCredentials(JSON.stringify(credentials));
            } else {
                encryptedCredentials = undefined;
            }
        }

        // If this is set as default, unset other defaults of same type
        if (input.isDefault) {
            await this.pool.query(`
                UPDATE terminal_connections 
                SET is_default = false 
                WHERE type = $1 AND is_default = true AND id != $2
            `, [existing.type, id]);
        }

        const result = await this.pool.query(`
            UPDATE terminal_connections
            SET 
                name = COALESCE($1, name),
                host = COALESCE($2, host),
                port = COALESCE($3, port),
                username = COALESCE($4, username),
                auth_type = COALESCE($5, auth_type),
                encrypted_credentials = $6,
                is_default = COALESCE($7, is_default),
                notes = COALESCE($8, notes),
                metadata = COALESCE($9, metadata),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING 
                id, name, type, host, port, username, 
                auth_type as "authType",
                is_default as "isDefault", notes, metadata,
                created_at as "createdAt", 
                updated_at as "updatedAt"
        `, [
            input.name,
            input.host,
            input.port,
            input.username,
            input.authType,
            encryptedCredentials,
            input.isDefault,
            input.notes,
            input.metadata ? JSON.stringify(input.metadata) : null,
            id,
        ]);

        logger.info('Updated terminal connection', { id });
        return result.rows[0];
    }

    /**
     * Delete a terminal connection
     */
    async delete(id: string): Promise<boolean> {
        const result = await this.pool.query(`
            DELETE FROM terminal_connections WHERE id = $1
        `, [id]);

        if (result.rowCount && result.rowCount > 0) {
            logger.info('Deleted terminal connection', { id });
            return true;
        }
        return false;
    }

    /**
     * Get default connection for a type
     */
    async getDefault(type: 'ssh' | 'telnet' | 'local'): Promise<TerminalConnection | null> {
        const result = await this.pool.query(`
            SELECT 
                id, name, type, host, port, username, 
                auth_type as "authType",
                encrypted_credentials as "encryptedCredentials",
                is_default as "isDefault", notes, metadata,
                created_at as "createdAt", 
                updated_at as "updatedAt"
            FROM terminal_connections
            WHERE type = $1 AND is_default = true
            LIMIT 1
        `, [type]);

        return result.rows[0] || null;
    }
}
