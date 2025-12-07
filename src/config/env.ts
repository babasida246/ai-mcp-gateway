import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

/**
 * Environment configuration schema using Zod for validation
 */
const envSchema = z.object({
    // MCP Server
    MCP_SERVER_NAME: z.string().default('mcp-gateway'),
    MCP_SERVER_VERSION: z.string().default('0.1.0'),

    // API Keys
    OPENROUTER_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    // OpenRouter Configuration
    OPENROUTER_FALLBACK_MODELS: z.string().default('x-ai/grok-beta,qwen/qwen-2.5-coder-32b-instruct,meta-llama/llama-3.1-8b-instruct:free'),
    // Map OpenRouter models to replace OpenAI/Claude models
    OPENROUTER_REPLACE_OPENAI: z.string().default('openai/gpt-4o-mini'),
    OPENROUTER_REPLACE_CLAUDE: z.string().default('anthropic/claude-3.5-sonnet'),

    // OSS/Local Model
    OSS_MODEL_ENDPOINT: z.string().default('http://localhost:11434'),
    OSS_MODEL_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('false'),
    OSS_MODEL_NAME: z.string().default('llama3:8b'),

    // Redis
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().default('6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.string().default('0'),

    // Database (PostgreSQL)
    DATABASE_URL: z.string().optional(),
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.string().default('5432'),
    DB_NAME: z.string().default('ai_mcp_gateway'),
    DB_USER: z.string().default('postgres'),
    DB_PASSWORD: z.string().optional(),
    DB_SSL: z
        .string()
        .transform((val: string) => val === 'true')
        .default('false'),

    // HTTP API
    API_PORT: z.string().default('3000'),
    API_HOST: z.string().default('0.0.0.0'),
    API_CORS_ORIGIN: z.string().default('*'),

    // Logging
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LOG_FILE: z.string().default('logs/mcp-gateway.log'),

    // Routing
    DEFAULT_LAYER: z.string().default('L0'),
    ENABLE_CROSS_CHECK: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    ENABLE_AUTO_ESCALATE: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    MAX_ESCALATION_LAYER: z.string().default('L2'),

    // Layer Enable/Disable Control
    LAYER_L0_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    LAYER_L1_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    LAYER_L2_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    LAYER_L3_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),

    // Task-specific model preferences
    CHAT_MODELS: z.string().optional(),
    CODE_MODELS: z.string().optional(),
    ANALYZE_MODELS: z.string().optional(),
    CREATE_PROJECT_MODELS: z.string().optional(),

    // Cost Tracking
    ENABLE_COST_TRACKING: z
        .string()
        .transform((val: string) => val === 'true')
        .default('true'),
    COST_ALERT_THRESHOLD: z
        .string()
        .transform((val: string) => parseFloat(val))
        .default('1.00'),

    // Admin Dashboard Authentication
    ADMIN_AUTH_ENABLED: z
        .string()
        .transform((val: string) => val === 'true')
        .default('false'),
    ADMIN_JWT_SECRET: z.string().default('change-me-in-production-very-secret-key-32chars'),
    ADMIN_SESSION_EXPIRY: z.string().default('24h'),
    // Default admin credentials (should be changed in production)
    ADMIN_DEFAULT_USERNAME: z.string().default('admin'),
    ADMIN_DEFAULT_PASSWORD: z.string().default('admin123'),
    // Terminal encryption key (32 bytes for AES-256)
    TERMINAL_ENCRYPTION_KEY: z.string().default('terminal-encryption-key-32bytes!'),

    // Embedding Service Configuration
    EMBEDDING_PROVIDER: z.enum(['openai', 'openrouter', 'ollama', 'local']).default('openai'),
    EMBEDDING_MODEL_ID: z.string().default('text-embedding-3-small'),
    OLLAMA_HOST: z.string().default('http://localhost:11434'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 */
export function loadEnv(): Env {
    try {
        return envSchema.parse(process.env);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ Environment validation failed:');
            error.errors.forEach((err: z.ZodIssue) => {
                console.error(`  - ${err.path.join('.')}: ${err.message}`);
            });
            throw new Error('Invalid environment configuration');
        }
        throw error;
    }
}

/**
 * Global environment configuration
 */
export const env = loadEnv();
