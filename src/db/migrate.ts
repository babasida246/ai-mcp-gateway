#!/usr/bin/env node

/**
 * Database migration script
 * Runs the schema.sql file to set up the database
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    console.log('🚀 Starting database migration...\n');

    // Create database connection
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'ai_mcp_gateway',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
    });

    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful\n');

        // Read schema file
        const schemaPath = join(__dirname, 'schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');

        console.log('📄 Running schema.sql...\n');

        // Execute schema
        await pool.query(schema);

        console.log('✅ Database schema created successfully!\n');

        // Show tables
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);

        console.log('📊 Created tables:');
        tablesResult.rows.forEach((row: { table_name: string }) => {
            console.log(`   - ${row.table_name}`);
        });

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:');
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration
runMigration().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
