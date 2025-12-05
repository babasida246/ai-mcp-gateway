/**
 * Admin Dashboard Authentication Service
 * 
 * Handles user authentication with JWT tokens.
 * Can be toggled on/off via ADMIN_AUTH_ENABLED environment variable.
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';

export interface AdminUser {
    id: string;
    username: string;
    email?: string;
    display_name?: string;
    role: 'admin' | 'viewer' | 'operator';
    is_active: boolean;
    last_login?: string;
    created_at: string;
    updated_at: string;
}

export interface JWTPayload {
    userId: string;
    username: string;
    role: string;
    iat: number;
    exp: number;
}

export interface AuthResult {
    success: boolean;
    user?: AdminUser;
    token?: string;
    error?: string;
}

class AuthService {
    private pool: Pool | null = null;
    private initialized = false;

    /**
     * Initialize with database pool
     */
    init(pool: Pool) {
        this.pool = pool;
        return this;
    }

    /**
     * Check if auth is enabled
     */
    isAuthEnabled(): boolean {
        return env.ADMIN_AUTH_ENABLED;
    }

    /**
     * Ensure admin_users table exists
     */
    async ensureTable(): Promise<void> {
        if (!this.pool) throw new Error('Database pool not initialized');

        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        display_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('admin', 'viewer', 'operator')),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Create default admin user if not exists
        await this.ensureDefaultAdmin();
        this.initialized = true;
    }

    /**
     * Create default admin user if none exist
     */
    private async ensureDefaultAdmin(): Promise<void> {
        if (!this.pool) throw new Error('Database pool not initialized');

        const result = await this.pool.query('SELECT COUNT(*) FROM admin_users');
        const count = parseInt(result.rows[0].count, 10);

        if (count === 0) {
            // Create default admin user
            const passwordHash = await bcrypt.hash(env.ADMIN_DEFAULT_PASSWORD, 10);
            await this.pool.query(
                `INSERT INTO admin_users (id, username, password_hash, display_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
                [uuidv4(), env.ADMIN_DEFAULT_USERNAME, passwordHash, 'Administrator', 'admin', true]
            );
            console.log(`[Auth] Default admin user created: ${env.ADMIN_DEFAULT_USERNAME}`);
        }
    }

    /**
     * Authenticate user with username and password
     */
    async login(username: string, password: string): Promise<AuthResult> {
        if (!this.pool) throw new Error('Database pool not initialized');
        if (!this.initialized) await this.ensureTable();

        try {
            // Find user
            const result = await this.pool.query(
                'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
                [username]
            );

            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid username or password' };
            }

            const user = result.rows[0];

            // Verify password
            const passwordValid = await bcrypt.compare(password, user.password_hash);
            if (!passwordValid) {
                return { success: false, error: 'Invalid username or password' };
            }

            // Update last login
            await this.pool.query(
                'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );

            // Generate JWT token
            const token = this.generateToken(user);

            // Return user without password hash
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { password_hash: _hash, ...userWithoutPassword } = user;

            return {
                success: true,
                user: userWithoutPassword as AdminUser,
                token,
            };
        } catch (error) {
            console.error('[Auth] Login error:', error);
            return { success: false, error: 'Authentication failed' };
        }
    }

    /**
     * Generate JWT token for user
     */
    private generateToken(user: { id: string; username: string; role: string }): string {
        const payload = {
            userId: user.id,
            username: user.username,
            role: user.role,
        };

        // Parse expiry time (e.g., '24h' -> seconds)
        const expiryMatch = env.ADMIN_SESSION_EXPIRY.match(/(\d+)([hmd])/);
        let expiresInSeconds = 86400; // default 24h
        if (expiryMatch) {
            const value = parseInt(expiryMatch[1], 10);
            const unit = expiryMatch[2];
            if (unit === 'h') expiresInSeconds = value * 3600;
            else if (unit === 'd') expiresInSeconds = value * 86400;
            else if (unit === 'm') expiresInSeconds = value * 60;
        }

        return jwt.sign(payload, env.ADMIN_JWT_SECRET, {
            expiresIn: expiresInSeconds,
        });
    }

    /**
     * Verify JWT token
     */
    verifyToken(token: string): JWTPayload | null {
        try {
            return jwt.verify(token, env.ADMIN_JWT_SECRET) as JWTPayload;
        } catch {
            return null;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<AdminUser | null> {
        if (!this.pool) throw new Error('Database pool not initialized');

        const result = await this.pool.query(
            'SELECT id, username, email, display_name, role, is_active, last_login, created_at, updated_at FROM admin_users WHERE id = $1',
            [userId]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Get all users
     */
    async getAllUsers(): Promise<AdminUser[]> {
        if (!this.pool) throw new Error('Database pool not initialized');

        const result = await this.pool.query(
            'SELECT id, username, email, display_name, role, is_active, last_login, created_at, updated_at FROM admin_users ORDER BY created_at DESC'
        );

        return result.rows;
    }

    /**
     * Create new user
     */
    async createUser(data: {
        username: string;
        password: string;
        email?: string;
        display_name?: string;
        role?: 'admin' | 'viewer' | 'operator';
    }): Promise<AuthResult> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            // Check if username exists
            const existing = await this.pool.query(
                'SELECT id FROM admin_users WHERE username = $1',
                [data.username]
            );

            if (existing.rows.length > 0) {
                return { success: false, error: 'Username already exists' };
            }

            // Hash password
            const passwordHash = await bcrypt.hash(data.password, 10);

            // Create user
            const result = await this.pool.query(
                `INSERT INTO admin_users (id, username, password_hash, email, display_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, username, email, display_name, role, is_active, created_at, updated_at`,
                [uuidv4(), data.username, passwordHash, data.email || null, data.display_name || data.username, data.role || 'admin']
            );

            return {
                success: true,
                user: result.rows[0],
            };
        } catch (error) {
            console.error('[Auth] Create user error:', error);
            return { success: false, error: 'Failed to create user' };
        }
    }

    /**
     * Update user password
     */
    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            const passwordHash = await bcrypt.hash(newPassword, 10);
            await this.pool.query(
                'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [passwordHash, userId]
            );
            return true;
        } catch (error) {
            console.error('[Auth] Update password error:', error);
            return false;
        }
    }

    /**
     * Deactivate user
     */
    async deactivateUser(userId: string): Promise<boolean> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            await this.pool.query(
                'UPDATE admin_users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [userId]
            );
            return true;
        } catch (error) {
            console.error('[Auth] Deactivate user error:', error);
            return false;
        }
    }

    /**
     * Delete user
     */
    async deleteUser(userId: string): Promise<boolean> {
        if (!this.pool) throw new Error('Database pool not initialized');

        try {
            await this.pool.query('DELETE FROM admin_users WHERE id = $1', [userId]);
            return true;
        } catch (error) {
            console.error('[Auth] Delete user error:', error);
            return false;
        }
    }
}

export const authService = new AuthService();
