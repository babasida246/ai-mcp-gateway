/**
 * Database Setup Script
 * Runs the base schema before migrations
 */

import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_mcp_gateway',
    });

    try {
        console.log('🔄 Setting up database schema...\n');

        // Read and execute schema.sql
        const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
        const schemaSQL = await fs.readFile(schemaPath, 'utf8');

        await pool.query(schemaSQL);
        console.log('✅ Base schema created successfully\n');

    } catch (error) {
        console.error('❌ Schema setup failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run setup
setupDatabase().catch(process.exit(1));