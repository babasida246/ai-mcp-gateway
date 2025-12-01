/**
 * Phase 5: CLI Enhancement - Interactive Patch Application
 * Applies code changes with interactive review and confirmation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logging/logger.js';

export interface Patch {
    filePath: string;
    oldContent: string;
    newContent: string;
    description: string;
}

export interface PatchResult {
    filePath: string;
    success: boolean;
    error?: string;
    backup?: string;
}

/**
 * Interactive patch applicator with review and rollback
 */
export class PatchApplicator {
    private backupDir: string;

    constructor(backupDir = '.ai-mcp-backups') {
        this.backupDir = backupDir;
    }

    /**
     * Apply patches interactively (simulated for now)
     */
    async applyPatches(
        patches: Patch[],
        interactive = true,
    ): Promise<PatchResult[]> {
        const results: PatchResult[] = [];

        logger.info('Applying patches', {
            count: patches.length,
            interactive,
        });

        // Ensure backup directory exists
        await this.ensureBackupDir();

        for (const patch of patches) {
            try {
                // Backup original file
                const backupPath = await this.backupFile(patch.filePath);

                // In interactive mode, would show diff and ask for confirmation
                if (interactive) {
                    logger.info('Patch preview', {
                        file: patch.filePath,
                        description: patch.description,
                    });
                    // In real implementation, show diff and prompt user
                }

                // Apply patch
                await fs.writeFile(patch.filePath, patch.newContent, 'utf-8');

                results.push({
                    filePath: patch.filePath,
                    success: true,
                    backup: backupPath,
                });

                logger.info('Patch applied', {
                    file: patch.filePath,
                    backup: backupPath,
                });
            } catch (error) {
                results.push({
                    filePath: patch.filePath,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                logger.error('Patch failed', {
                    file: patch.filePath,
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }

        return results;
    }

    /**
     * Rollback patches using backups
     */
    async rollbackPatches(results: PatchResult[]): Promise<void> {
        logger.info('Rolling back patches', { count: results.length });

        for (const result of results) {
            if (result.success && result.backup) {
                try {
                    const backupContent = await fs.readFile(result.backup, 'utf-8');
                    await fs.writeFile(result.filePath, backupContent, 'utf-8');

                    logger.info('Rolled back', {
                        file: result.filePath,
                        backup: result.backup,
                    });
                } catch (error) {
                    logger.error('Rollback failed', {
                        file: result.filePath,
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                }
            }
        }
    }

    /**
     * Backup file before modification
     */
    private async backupFile(filePath: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const fileName = path.basename(filePath);
        const backupPath = path.join(
            this.backupDir,
            `${fileName}.${timestamp}.bak`,
        );

        const content = await fs.readFile(filePath, 'utf-8');
        await fs.writeFile(backupPath, content, 'utf-8');

        return backupPath;
    }

    /**
     * Ensure backup directory exists
     */
    private async ensureBackupDir(): Promise<void> {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            logger.warn('Failed to create backup directory', {
                dir: this.backupDir,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Generate unified diff for preview
     */
    generateDiff(oldContent: string, newContent: string): string {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');

        const diff: string[] = [];
        const maxLines = Math.max(oldLines.length, newLines.length);

        for (let i = 0; i < maxLines; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];

            if (oldLine !== newLine) {
                if (oldLine !== undefined) {
                    diff.push(`- ${oldLine}`);
                }
                if (newLine !== undefined) {
                    diff.push(`+ ${newLine}`);
                }
            } else if (oldLine !== undefined) {
                diff.push(`  ${oldLine}`);
            }
        }

        return diff.join('\n');
    }
}

/**
 * Command history manager
 */
export interface CommandHistoryEntry {
    id: string;
    command: string;
    timestamp: Date;
    success: boolean;
    output?: string;
    error?: string;
}

export class CommandHistory {
    private historyFile: string;
    private maxEntries: number;

    constructor(historyFile = '.ai-mcp-history.json', maxEntries = 1000) {
        this.historyFile = historyFile;
        this.maxEntries = maxEntries;
    }

    /**
     * Add command to history
     */
    async addCommand(
        command: string,
        success: boolean,
        output?: string,
        error?: string,
    ): Promise<void> {
        const entry: CommandHistoryEntry = {
            id: `cmd-${Date.now()}`,
            command,
            timestamp: new Date(),
            success,
            output,
            error,
        };

        const history = await this.loadHistory();
        history.push(entry);

        // Keep only last N entries
        if (history.length > this.maxEntries) {
            history.splice(0, history.length - this.maxEntries);
        }

        await this.saveHistory(history);
    }

    /**
     * Get recent commands
     */
    async getRecent(limit = 10): Promise<CommandHistoryEntry[]> {
        const history = await this.loadHistory();
        return history.slice(-limit).reverse();
    }

    /**
     * Search history by pattern
     */
    async search(pattern: string): Promise<CommandHistoryEntry[]> {
        const history = await this.loadHistory();
        const regex = new RegExp(pattern, 'i');

        return history.filter((entry) => regex.test(entry.command));
    }

    /**
     * Replay command by ID
     */
    async getCommand(id: string): Promise<CommandHistoryEntry | null> {
        const history = await this.loadHistory();
        return history.find((entry) => entry.id === id) || null;
    }

    /**
     * Load history from file
     */
    private async loadHistory(): Promise<CommandHistoryEntry[]> {
        try {
            const content = await fs.readFile(this.historyFile, 'utf-8');
            const data = JSON.parse(content);

            return data.map((entry: unknown) => ({
                ...(entry as CommandHistoryEntry),
                timestamp: new Date((entry as { timestamp: string }).timestamp),
            }));
        } catch (error) {
            // File doesn't exist or invalid JSON
            return [];
        }
    }

    /**
     * Save history to file
     */
    private async saveHistory(history: CommandHistoryEntry[]): Promise<void> {
        try {
            await fs.writeFile(
                this.historyFile,
                JSON.stringify(history, null, 2),
                'utf-8',
            );
        } catch (error) {
            logger.error('Failed to save command history', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }
}

/**
 * System health check and diagnostics
 */
export interface HealthCheckResult {
    component: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    details?: Record<string, unknown>;
}

export class SystemDoctor {
    /**
     * Run comprehensive health check
     */
    async diagnose(): Promise<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        checks: HealthCheckResult[];
    }> {
        const checks: HealthCheckResult[] = [];

        // Check database
        checks.push(await this.checkDatabase());

        // Check Redis
        checks.push(await this.checkRedis());

        // Check LLM providers
        checks.push(await this.checkProviders());

        // Check filesystem permissions
        checks.push(await this.checkFilesystem());

        // Check environment variables
        checks.push(await this.checkEnvironment());

        // Determine overall health
        const unhealthy = checks.filter((c) => c.status === 'unhealthy').length;
        const degraded = checks.filter((c) => c.status === 'degraded').length;

        let overall: 'healthy' | 'degraded' | 'unhealthy';
        if (unhealthy > 0) {
            overall = 'unhealthy';
        } else if (degraded > 0) {
            overall = 'degraded';
        } else {
            overall = 'healthy';
        }

        return { overall, checks };
    }

    private async checkDatabase(): Promise<HealthCheckResult> {
        try {
            const { db } = await import('../db/postgres.js');

            if (!db.isReady()) {
                return {
                    component: 'database',
                    status: 'unhealthy',
                    message: 'Database not connected',
                };
            }

            return {
                component: 'database',
                status: 'healthy',
                message: 'PostgreSQL connected',
            };
        } catch (error) {
            return {
                component: 'database',
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    private async checkRedis(): Promise<HealthCheckResult> {
        try {
            const { redisCache } = await import('../cache/redis.js');

            if (!redisCache.isReady()) {
                return {
                    component: 'redis',
                    status: 'unhealthy',
                    message: 'Redis not connected',
                };
            }

            return {
                component: 'redis',
                status: 'healthy',
                message: 'Redis connected',
            };
        } catch (error) {
            return {
                component: 'redis',
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    private async checkProviders(): Promise<HealthCheckResult> {
        try {
            const { providerHealth } = await import('../config/provider-health.js');
            const healthy = await providerHealth.getHealthyProviders();

            if (healthy.length === 0) {
                return {
                    component: 'providers',
                    status: 'unhealthy',
                    message: 'No LLM providers available',
                };
            }

            return {
                component: 'providers',
                status: 'healthy',
                message: `${healthy.length} provider(s) available`,
                details: { providers: healthy },
            };
        } catch (error) {
            return {
                component: 'providers',
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    private async checkFilesystem(): Promise<HealthCheckResult> {
        try {
            const testFile = '.ai-mcp-health-check';
            await fs.writeFile(testFile, 'test', 'utf-8');
            await fs.unlink(testFile);

            return {
                component: 'filesystem',
                status: 'healthy',
                message: 'Filesystem read/write OK',
            };
        } catch (error) {
            return {
                component: 'filesystem',
                status: 'degraded',
                message: 'Filesystem permission issues',
            };
        }
    }

    private async checkEnvironment(): Promise<HealthCheckResult> {
        const required = [
            'DATABASE_URL',
            'REDIS_URL',
        ];

        const missing = required.filter((key) => !process.env[key]);

        if (missing.length > 0) {
            return {
                component: 'environment',
                status: 'degraded',
                message: `Missing environment variables: ${missing.join(', ')}`,
            };
        }

        return {
            component: 'environment',
            status: 'healthy',
            message: 'All required environment variables set',
        };
    }
}
