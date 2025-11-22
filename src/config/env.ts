import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

/**
 * Environment configuration schema using Zod for validation
 */
const envSchema = z.object({
    // MCP Server
    MCP_SERVER_NAME: z.string().default('ai-mcp-gateway'),
    MCP_SERVER_VERSION: z.string().default('0.1.0'),

    // API Keys
    OPENROUTER_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    // OSS/Local Model
    OSS_MODEL_ENDPOINT: z.string().default('http://localhost:11434'),
    OSS_MODEL_ENABLED: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),

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
        .transform((val) => val === 'true')
        .default('false'),

    // HTTP API
    API_PORT: z.string().default('3000'),
    API_HOST: z.string().default('0.0.0.0'),
    API_CORS_ORIGIN: z.string().default('*'),

    // Logging
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LOG_FILE: z.string().default('logs/ai-mcp-gateway.log'),

    // Routing
    DEFAULT_LAYER: z.string().default('L0'),
    ENABLE_CROSS_CHECK: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    ENABLE_AUTO_ESCALATE: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    MAX_ESCALATION_LAYER: z.string().default('L2'),

    // Cost Tracking
    ENABLE_COST_TRACKING: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    COST_ALERT_THRESHOLD: z
        .string()
        .transform((val) => parseFloat(val))
        .default('1.00'),
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
            error.errors.forEach((err) => {
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
