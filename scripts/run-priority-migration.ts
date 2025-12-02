/**
 * Run only the priority migration
 */

import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPriorityMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_mcp_gateway',
    });

    try {
        console.log('🔄 Running priority migration...\n');

        // Create migrations tracking table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Check if migration already applied
        const appliedResult = await pool.query(
            'SELECT 1 FROM schema_migrations WHERE version = $1',
            ['006_add_model_priority.sql']
        );

        if (appliedResult.rows.length > 0) {
            console.log('⏭️  Priority migration already applied, skipping...');
            return;
        }

        // Read and execute the migration
        const migrationPath = path.join(__dirname, '..', 'migrations', '006_add_model_priority.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('📝 Applying 006_add_model_priority.sql...');
        await pool.query(migrationSQL);

        // Record migration as applied
        await pool.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            ['006_add_model_priority.sql']
        );

        console.log('✅ Priority migration completed successfully!');

    } catch (error) {
        console.error('❌ Priority migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runPriorityMigration();