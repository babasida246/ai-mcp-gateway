#!/usr/bin/env tsx
/**
 * Bootstrap Configuration Script
 * 
 * First-time setup for AI MCP Gateway without .env file
 * Prompts for essential configuration and stores in database
 */

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { Client } from 'pg';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BootstrapConfig {
    // Database
    dbHost: string;
    dbPort: number;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    dbSsl: boolean;

    // Encryption
    encryptionKey: string;

    // Essential providers
    openrouterKey?: string;
    openaiKey?: string;
    anthropicKey?: string;

    // Server
    apiPort: number;
    apiHost: string;
}

const rl = createInterface({ input, output });

function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('base64').substring(0, 32);
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
    const def = defaultValue ? ` (default: ${defaultValue})` : '';
    const answer = await rl.question(`${question}${def}: `);
    return answer.trim() || defaultValue || '';
}

async function promptPassword(question: string): Promise<string> {
    // Note: In production, use a proper password input library
    return await prompt(question);
}

async function promptBoolean(question: string, defaultValue: boolean = false): Promise<boolean> {
    const answer = await prompt(`${question} (y/n)`, defaultValue ? 'y' : 'n');
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function promptNumber(question: string, defaultValue: number): Promise<number> {
    const answer = await prompt(question, defaultValue.toString());
    return parseInt(answer, 10) || defaultValue;
}

async function collectConfig(): Promise<BootstrapConfig> {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║   AI MCP Gateway - Initial Configuration Setup          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('📊 Database Configuration\n');
    const dbHost = await prompt('PostgreSQL host', 'localhost');
    const dbPort = await promptNumber('PostgreSQL port', 5432);
    const dbName = await prompt('Database name', 'ai_mcp_gateway');
    const dbUser = await prompt('Database user', 'postgres');
    const dbPassword = await promptPassword('Database password');
    const dbSsl = await promptBoolean('Use SSL for database connection', false);

    console.log('\n🔐 Security Configuration\n');
    const useGeneratedKey = await promptBoolean('Generate encryption key automatically', true);
    const encryptionKey = useGeneratedKey
        ? generateEncryptionKey()
        : await prompt('Encryption key (32 characters)');

    if (useGeneratedKey) {
        console.log(`\n⚠️  SAVE THIS ENCRYPTION KEY SECURELY:\n   ${encryptionKey}\n`);
    }

    console.log('\n🤖 LLM Provider API Keys (at least one required)\n');
    const openrouterKey = await prompt('OpenRouter API key (recommended)', '');
    const openaiKey = await prompt('OpenAI API key (optional)', '');
    const anthropicKey = await prompt('Anthropic API key (optional)', '');

    if (!openrouterKey && !openaiKey && !anthropicKey) {
        console.log('\n⚠️  WARNING: No provider keys configured. You can add them later via web UI.');
    }

    console.log('\n🌐 Server Configuration\n');
    const apiPort = await promptNumber('API server port', 3000);
    const apiHost = await prompt('API server host', '0.0.0.0');

    return {
        dbHost, dbPort, dbName, dbUser, dbPassword, dbSsl,
        encryptionKey,
        openrouterKey, openaiKey, anthropicKey,
        apiPort, apiHost
    };
}

async function testDbConnection(config: BootstrapConfig): Promise<Client> {
    console.log('\n🔌 Testing database connection...');

    const client = new Client({
        host: config.dbHost,
        port: config.dbPort,
        database: config.dbName,
        user: config.dbUser,
        password: config.dbPassword,
        ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined
    });

    try {
        await client.connect();
        console.log('✅ Database connection successful\n');
        return client;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

async function runMigrations(client: Client): Promise<void> {
    console.log('📦 Running database migrations...\n');

    const migrationsDir = join(__dirname, '../migrations');
    const migrationFiles = [
        '001_phase1_tracing_multitenant.sql',
        '002_phase1_analytics_quotas.sql',
        '003_phase1_security_roles.sql',
        '005_provider_management.sql',
        '006_add_model_priority.sql',
        '007_chat_context_optimization.sql',
        '008_chat_context_minimal.sql',
        '009_system_configuration.sql'
    ];

    for (const file of migrationFiles) {
        const filePath = join(migrationsDir, file);
        if (!existsSync(filePath)) {
            console.log(`⚠️  Migration file not found: ${file}`);
            continue;
        }

        console.log(`   Running ${file}...`);
        const sql = readFileSync(filePath, 'utf8');

        try {
            await client.query(sql);
            console.log(`   ✅ ${file} completed`);
        } catch (error: any) {
            // Ignore "already exists" errors
            if (error.code === '42P07' || error.code === '42710') {
                console.log(`   ℹ️  ${file} already applied`);
            } else {
                console.error(`   ❌ ${file} failed:`, error.message);
                throw error;
            }
        }
    }

    console.log('\n✅ All migrations completed\n');
}

function encryptValue(text: string, key: string): string {
    const keyBuffer = Buffer.from(crypto.createHash('sha256').update(key).digest('base64').substring(0, 32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

async function saveConfiguration(client: Client, config: BootstrapConfig): Promise<void> {
    console.log('💾 Saving configuration to database...\n');

    // Store encryption key in a secure config table (encrypted with itself initially)
    await client.query(
        `INSERT INTO system_config (key, value, value_type, category, description, is_required)
         VALUES ($1, $2, 'string', 'security', 'Master encryption key for sensitive data', true)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        ['ENCRYPTION_KEY', encryptValue(config.encryptionKey, config.encryptionKey)]
    );

    // Save database connection info (for future reference, not used at runtime)
    await client.query(
        `INSERT INTO system_config (key, value, value_type, category)
         VALUES 
         ('DB_HOST', $1, 'string', 'database'),
         ('DB_PORT', $2, 'number', 'database'),
         ('DB_NAME', $3, 'string', 'database'),
         ('DB_USER', $4, 'string', 'database')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [config.dbHost, config.dbPort.toString(), config.dbName, config.dbUser]
    );

    // Save server config
    await client.query(
        `UPDATE system_config SET value = $1 WHERE key = 'API_PORT'`,
        [config.apiPort.toString()]
    );
    await client.query(
        `UPDATE system_config SET value = $1 WHERE key = 'API_HOST'`,
        [config.apiHost]
    );

    // Save provider credentials (encrypted)
    if (config.openrouterKey) {
        console.log('   Saving OpenRouter credentials...');
        await client.query(
            `UPDATE provider_credentials 
             SET api_key_encrypted = $1, enabled = true 
             WHERE provider = 'openrouter'`,
            [encryptValue(config.openrouterKey, config.encryptionKey)]
        );
    }

    if (config.openaiKey) {
        console.log('   Saving OpenAI credentials...');
        await client.query(
            `UPDATE provider_credentials 
             SET api_key_encrypted = $1, enabled = true 
             WHERE provider = 'openai'`,
            [encryptValue(config.openaiKey, config.encryptionKey)]
        );
    }

    if (config.anthropicKey) {
        console.log('   Saving Anthropic credentials...');
        await client.query(
            `UPDATE provider_credentials 
             SET api_key_encrypted = $1, enabled = true 
             WHERE provider = 'anthropic'`,
            [encryptValue(config.anthropicKey, config.encryptionKey)]
        );
    }

    console.log('\n✅ Configuration saved successfully\n');
}

async function createBootstrapFile(config: BootstrapConfig): Promise<void> {
    const fs = await import('fs/promises');

    // Create minimal bootstrap file with DB connection and encryption key only
    const bootstrapContent = `# AI MCP Gateway Bootstrap Configuration
# This file is ONLY used for initial database connection
# All other configuration is stored in the database

# Database Connection (required for startup)
DB_HOST=${config.dbHost}
DB_PORT=${config.dbPort}
DB_NAME=${config.dbName}
DB_USER=${config.dbUser}
DB_PASSWORD=${config.dbPassword}
DB_SSL=${config.dbSsl}

# Encryption Key (required for decrypting config from DB)
CONFIG_ENCRYPTION_KEY=${config.encryptionKey}

# Note: DO NOT add other configuration here
# Use the web UI at http://localhost:${config.apiPort}/admin to manage all other settings
`;

    await fs.writeFile(join(__dirname, '../.env.bootstrap'), bootstrapContent, 'utf8');
    console.log('📝 Created .env.bootstrap file (minimal bootstrap config)\n');
    console.log('⚠️  IMPORTANT: Keep .env.bootstrap file secure and backed up!\n');
}

async function main() {
    try {
        const config = await collectConfig();

        const proceed = await promptBoolean('\nProceed with these settings', true);
        if (!proceed) {
            console.log('Setup cancelled.');
            process.exit(0);
        }

        const client = await testDbConnection(config);

        await runMigrations(client);
        await saveConfiguration(client, config);
        await createBootstrapFile(config);

        await client.end();

        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║              Setup Complete! 🎉                          ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
        console.log('Next steps:\n');
        console.log('1. Start the server:');
        console.log('   npm run build && npm start\n');
        console.log(`2. Access admin dashboard:`);
        console.log(`   http://localhost:${config.apiPort}/admin\n`);
        console.log('3. Configure additional settings via web UI\n');

        rl.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        rl.close();
        process.exit(1);
    }
}

main();
