import winston from 'winston';
import { env } from '../config/env.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// Create logs directory if it doesn't exist
try {
    mkdirSync(dirname(env.LOG_FILE), { recursive: true });
} catch {
    // Directory might already exist
}/**
 * Winston logger instance
 */
export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
    ),
    defaultMeta: {
        service: env.MCP_SERVER_NAME,
        version: env.MCP_SERVER_VERSION,
    },
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(
                    ({ timestamp, level, message, service, ...meta }) => {
                        const metaStr = Object.keys(meta).length
                            ? `\n${JSON.stringify(meta, null, 2)}`
                            : '';
                        return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                    },
                ),
            ),
        }),
        // File output
        new winston.transports.File({
            filename: env.LOG_FILE,
            format: winston.format.json(),
        }),
    ],
});

/**
 * Log MCP request
 */
export function logRequest(
    toolName: string,
    params: Record<string, unknown>,
    requestId: string,
): void {
    logger.info('MCP Request', {
        requestId,
        toolName,
        params,
    });
}

/**
 * Log MCP response
 */
export function logResponse(
    toolName: string,
    success: boolean,
    duration: number,
    requestId: string,
    error?: string,
): void {
    if (success) {
        logger.info('MCP Response', {
            requestId,
            toolName,
            success,
            duration,
        });
    } else {
        logger.error('MCP Response Error', {
            requestId,
            toolName,
            success,
            duration,
            error,
        });
    }
}

/**
 * Log LLM call
 */
export function logLLMCall(
    modelId: string,
    provider: string,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    requestId: string,
): void {
    logger.debug('LLM Call', {
        requestId,
        modelId,
        provider,
        inputTokens,
        outputTokens,
        cost,
    });
}
