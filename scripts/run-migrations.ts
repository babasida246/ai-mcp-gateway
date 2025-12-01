/**
 * Database Migration Runner
 * Executes all SQL migrations in order
 */

import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_mcp_gateway',
    });

    try {
        console.log('🔄 Starting database setup and migrations...\n');

        // First, check if base schema is already set up
        const schemaCheck = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'conversations'
            )
        `);

        if (!schemaCheck.rows[0].exists) {
            // Run the base schema
            console.log('📋 Setting up base schema...');
            const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
            const schemaSQL = await fs.readFile(schemaPath, 'utf8');
            await pool.query(schemaSQL);
            console.log('✅ Base schema created successfully\n');
        } else {
            console.log('📋 Base schema already exists, skipping...\n');
        }

        // Create migrations tracking table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Get applied migrations
        const appliedResult = await pool.query(
            'SELECT version FROM schema_migrations ORDER BY version'
        );
        const appliedVersions = new Set(appliedResult.rows.map(r => r.version));

        // Get migration files
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files
            .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
            .sort();

        console.log(`Found ${sqlFiles.length} migration files`);
        console.log(`Already applied: ${appliedVersions.size} migrations\n`);

        // Run each migration
        for (const file of sqlFiles) {
            const version = file.replace('.sql', '');

            if (appliedVersions.has(version)) {
                console.log(`⏭️  Skipping ${file} (already applied)`);
                continue;
            }

            console.log(`📝 Applying ${file}...`);

            const filePath = path.join(migrationsDir, file);
            const sql = await fs.readFile(filePath, 'utf-8');

            await pool.query('BEGIN');
            try {
                await pool.query(sql);
                await pool.query(
                    'INSERT INTO schema_migrations (version) VALUES ($1)',
                    [version]
                );
                await pool.query('COMMIT');
                console.log(`✅ Applied ${file}\n`);
            } catch (error) {
                await pool.query('ROLLBACK');
                console.error(`❌ Failed to apply ${file}:`);
                console.error(error);
                throw error;
            }
        }

        console.log('✅ All migrations completed successfully!');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
