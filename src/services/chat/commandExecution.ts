/**
 * @file Command Execution Service
 * @description Handles execution of generated commands on target devices
 * with confirmation workflow and result tracking.
 */

import { z } from 'zod';
import { logger } from '../../logging/logger.js';

/**
 * Command execution session
 */
export const ExecutionSessionSchema = z.object({
    sessionId: z.string().describe('Unique session ID'),
    userId: z.string().describe('User who initiated execution'),
    targetDevice: z.string().describe('Target device IP/hostname'),
    connectionId: z.string().optional().describe('Saved connection ID'),
    startTime: z.string().describe('ISO timestamp'),
    endTime: z.string().optional().describe('ISO timestamp when completed'),
    status: z.enum(['pending', 'confirmed', 'executing', 'completed', 'failed', 'cancelled']),
    commandIds: z.array(z.string()),
    results: z.array(z.unknown()).optional(),
    errorMessage: z.string().optional(),
});

export type ExecutionSession = z.infer<typeof ExecutionSessionSchema>;

/**
 * Command execution request to send to terminal
 */
export const ExecutionRequestSchema = z.object({
    sessionId: z.string(),
    commandId: z.string(),
    command: z.string(),
    timeout: z.number().optional(),
    expectedOutput: z.string().optional(),
    rollbackCommand: z.string().optional(),
});

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

/**
 * Execution queue manager for handling multiple commands
 */
export class CommandExecutionManager {
    private sessions: Map<string, ExecutionSession> = new Map();
    private confirmationCallbacks: Map<string, (approved: boolean) => void> = new Map();

    /**
     * Create a new execution session
     */
    createSession(
        userId: string,
        targetDevice: string,
        commandIds: string[],
        connectionId?: string
    ): ExecutionSession {
        const sessionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const session: ExecutionSession = {
            sessionId,
            userId,
            targetDevice,
            connectionId,
            commandIds,
            status: 'pending',
            startTime: new Date().toISOString(),
            results: [],
        };

        this.sessions.set(sessionId, session);

        logger.info('[CommandExecutionManager] Created execution session', {
            sessionId,
            userId,
            targetDevice,
            commandCount: commandIds.length,
        });

        return session;
    }

    /**
     * Get execution session
     */
    getSession(sessionId: string): ExecutionSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Approve/confirm execution
     */
    approveExecution(sessionId: string, selectedCommandIds?: string[]): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn('[CommandExecutionManager] Session not found', { sessionId });
            return false;
        }

        if (selectedCommandIds && selectedCommandIds.length > 0) {
            session.commandIds = selectedCommandIds;
        }

        session.status = 'confirmed';
        this.sessions.set(sessionId, session);

        logger.info('[CommandExecutionManager] Execution approved', {
            sessionId,
            commandCount: session.commandIds.length,
        });

        // Notify callback if registered
        const callback = this.confirmationCallbacks.get(sessionId);
        if (callback) {
            callback(true);
        }

        return true;
    }

    /**
     * Cancel execution
     */
    cancelExecution(sessionId: string, reason?: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn('[CommandExecutionManager] Session not found', { sessionId });
            return false;
        }

        session.status = 'cancelled';
        logger.info('[CommandExecutionManager] Execution cancelled', { sessionId, reason });

        // Notify callback
        const callback = this.confirmationCallbacks.get(sessionId);
        if (callback) {
            callback(false);
        }

        return true;
    }

    /**
     * Register confirmation callback
     */
    onConfirmation(
        sessionId: string,
        callback: (approved: boolean) => void
    ): () => void {
        this.confirmationCallbacks.set(sessionId, callback);

        // Return unsubscribe function
        return () => {
            this.confirmationCallbacks.delete(sessionId);
        };
    }

    /**
     * Record command result
     */
    recordResult(
        sessionId: string,
        commandId: string,
        result: {
            success: boolean;
            stdout?: string;
            stderr?: string;
            exitCode: number;
            duration: number;
        }
    ): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn('[CommandExecutionManager] Session not found', { sessionId });
            return false;
        }

        if (!session.results) {
            session.results = [];
        }

        session.results.push({
            commandId,
            ...result,
            timestamp: new Date().toISOString(),
        });

        this.sessions.set(sessionId, session);

        logger.info('[CommandExecutionManager] Command result recorded', {
            sessionId,
            commandId,
            success: result.success,
            exitCode: result.exitCode,
        });

        return true;
    }

    /**
     * Mark session as completed
     */
    completeSession(sessionId: string, success: boolean, error?: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn('[CommandExecutionManager] Session not found', { sessionId });
            return false;
        }

        session.status = success ? 'completed' : 'failed';
        session.endTime = new Date().toISOString();
        if (error) {
            session.errorMessage = error;
        }

        this.sessions.set(sessionId, session);

        logger.info('[CommandExecutionManager] Session completed', {
            sessionId,
            success,
            error,
            duration: session.endTime ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime() : 0,
        });

        return true;
    }

    /**
     * Get all sessions for user
     */
    getSessionsForUser(userId: string): ExecutionSession[] {
        return Array.from(this.sessions.values()).filter(s => s.userId === userId);
    }

    /**
     * Clean up old sessions (older than 24 hours)
     */
    cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [sessionId, session] of this.sessions) {
            const sessionAge = now - new Date(session.startTime).getTime();
            if (sessionAge > maxAgeMs) {
                this.sessions.delete(sessionId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info('[CommandExecutionManager] Cleaned up old sessions', { cleaned });
        }

        return cleaned;
    }
}

/**
 * Build confirmation prompt for user
 */
export function buildConfirmationPrompt(
    response: {
        taskDescription: string;
        commands: Array<{ id: string; command: string; description: string; riskLevel: string }>;
        explanation: string;
        warnings?: string[];
        affectedServices?: string[];
    },
    sessionId: string
): {
    title: string;
    message: string;
    commands: Array<{ id: string; label: string }>;
    actionButtons: Array<{ label: string; action: 'approve' | 'reject' | 'edit' }>;
} {
    const highRiskCount = response.commands.filter(
        c => c.riskLevel === 'high' || c.riskLevel === 'critical'
    ).length;

    let message = `🔍 Please review the deployment plan before confirming execution:\n\n`;
    message += `**Task:** ${response.taskDescription}\n`;
    message += `**Commands:** ${response.commands.length} total`;

    if (highRiskCount > 0) {
        message += ` (⚠️ ${highRiskCount} high-risk)`;
    }

    message += `\n\n**Explanation:**\n${response.explanation}`;

    if (response.warnings && response.warnings.length > 0) {
        message += `\n\n**⚠️  Important Warnings:**\n`;
        response.warnings.forEach(w => {
            message += `- ${w}\n`;
        });
    }

    if (response.affectedServices && response.affectedServices.length > 0) {
        message += `\n**Affected Services:** ${response.affectedServices.join(', ')}`;
    }

    message += `\n\n**Session ID:** \`${sessionId}\``;

    return {
        title: `Confirm Deployment: ${response.taskDescription}`,
        message,
        commands: response.commands.map(cmd => ({
            id: cmd.id,
            label: `${cmd.description} (${cmd.riskLevel})`,
        })),
        actionButtons: [
            { label: '✅ Approve All', action: 'approve' },
            { label: '❌ Reject', action: 'reject' },
            { label: '✏️  Edit Selection', action: 'edit' },
        ],
    };
}

/**
 * Format execution results for display
 */
export function formatExecutionResults(
    session: ExecutionSession
): string {
    let output = `\n${'='.repeat(60)}\n`;
    output += `📊 EXECUTION RESULTS: Session ${session.sessionId}\n`;
    output += `${'='.repeat(60)}\n\n`;

    output += `Status: ${session.status.toUpperCase()}\n`;
    output += `Device: ${session.targetDevice}\n`;
    output += `Start: ${session.startTime}\n`;

    if (session.endTime) {
        output += `End: ${session.endTime}\n`;
        const duration = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
        output += `Duration: ${(duration / 1000).toFixed(2)}s\n`;
    }

    if (session.errorMessage) {
        output += `\n❌ Error: ${session.errorMessage}\n`;
    }

    if (session.results && session.results.length > 0) {
        output += `\n${'─'.repeat(60)}\n`;
        output += `📋 COMMAND RESULTS:\n\n`;

        session.results.forEach((result: any, idx: number) => {
            const status = result.success ? '✅' : '❌';
            output += `${idx + 1}. ${status} ${result.commandId}\n`;
            output += `   Duration: ${result.duration}ms\n`;
            output += `   Exit Code: ${result.exitCode}\n`;

            if (result.stdout) {
                output += `   Output: ${result.stdout.substring(0, 100)}${result.stdout.length > 100 ? '...' : ''}\n`;
            }

            if (result.stderr) {
                output += `   Error: ${result.stderr.substring(0, 100)}${result.stderr.length > 100 ? '...' : ''}\n`;
            }

            output += '\n';
        });
    }

    output += `${'─'.repeat(60)}\n`;

    return output;
}

export default {
    CommandExecutionManager,
    buildConfirmationPrompt,
    formatExecutionResults,
};
