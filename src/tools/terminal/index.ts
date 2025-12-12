/**
 * Terminal Tools - SSH, Telnet, and Local Shell support
 * Provides web-based terminal functionality
 */

import { spawn, ChildProcess } from 'child_process';
import { Client as SSHClient, type ConnectConfig } from 'ssh2';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { logger } from '../../logging/logger.js';

// Types
export interface TerminalSession {
    id: string;
    type: 'local' | 'ssh' | 'telnet';
    createdAt: Date;
    lastActivity: Date;
    connected: boolean;
    host?: string;
    port?: number;
    username?: string;
}

export interface SSHConnectionOptions {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

export interface TelnetConnectionOptions {
    host: string;
    port?: number;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

// Session management
class TerminalSessionManager extends EventEmitter {
    private sessions: Map<string, {
        session: TerminalSession;
        process?: ChildProcess;
        sshClient?: SSHClient;
        sshStream?: NodeJS.ReadWriteStream;
        telnetSocket?: Socket;
        outputBuffer: string[];
    }> = new Map();

    private generateSessionId(): string {
        return `term-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Create a local shell session
     */
    async createLocalSession(): Promise<TerminalSession> {
        const sessionId = this.generateSessionId();
        const session: TerminalSession = {
            id: sessionId,
            type: 'local',
            createdAt: new Date(),
            lastActivity: new Date(),
            connected: true,
        };

        this.sessions.set(sessionId, {
            session,
            outputBuffer: [],
        });

        logger.info(`Local terminal session created: ${sessionId}`);
        return session;
    }

    /**
     * Execute command in local session
     */
    async executeLocalCommand(sessionId: string, command: string): Promise<CommandResult> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.session.type !== 'local') {
            throw new Error('Invalid local session');
        }

        sessionData.session.lastActivity = new Date();

        return new Promise((resolve, reject) => {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'powershell.exe' : '/bin/sh';
            const args = isWindows ? ['-Command', command] : ['-c', command];

            let stdout = '';
            let stderr = '';

            const proc = spawn(shell, args, {
                cwd: process.cwd(),
                env: process.env,
            });

            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
                sessionData.outputBuffer.push(data.toString());
            });

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
                sessionData.outputBuffer.push(data.toString());
            });

            proc.on('close', (code) => {
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code,
                });
            });

            proc.on('error', (error) => {
                reject(error);
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                proc.kill();
                reject(new Error('Command timeout'));
            }, 30000);
        });
    }

    /**
     * Create SSH session with interactive shell (PTY)
     */
    async createSSHSession(options: SSHConnectionOptions): Promise<TerminalSession> {
        const sessionId = this.generateSessionId();

        return new Promise((resolve, reject) => {
            const client = new SSHClient();
            const session: TerminalSession = {
                id: sessionId,
                type: 'ssh',
                createdAt: new Date(),
                lastActivity: new Date(),
                connected: false,
                host: options.host,
                port: options.port || 22,
                username: options.username,
            };

            client.on('ready', () => {
                // Request a PTY (pseudo-terminal) for interactive shell
                client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
                    if (err) {
                        logger.error(`SSH shell error: ${err.message}`);
                        reject(err);
                        return;
                    }

                    session.connected = true;

                    const outputBuffer: string[] = [];

                    // Handle incoming data from shell
                    stream.on('data', (data: Buffer) => {
                        const text = data.toString();
                        logger.info(`[SSH ${sessionId}] Received data:`, { length: text.length, preview: text.substring(0, 100), bufferSizeBefore: outputBuffer.length });
                        outputBuffer.push(text);
                        logger.info(`[SSH ${sessionId}] Buffer after push:`, { bufferSize: outputBuffer.length });
                        this.emit(`data:${sessionId}`, text);
                    });

                    stream.stderr?.on('data', (data: Buffer) => {
                        const text = data.toString();
                        logger.info(`[SSH ${sessionId}] Received stderr:`, { length: text.length, preview: text.substring(0, 100) });
                        outputBuffer.push(text);
                        this.emit(`data:${sessionId}`, text);
                    });

                    stream.on('close', () => {
                        const sessionData = this.sessions.get(sessionId);
                        if (sessionData) {
                            sessionData.session.connected = false;
                        }
                        this.emit(`close:${sessionId}`);
                    });

                    this.sessions.set(sessionId, {
                        session,
                        sshClient: client,
                        sshStream: stream,
                        outputBuffer,
                    });

                    logger.info(`SSH interactive session created: ${sessionId} -> ${options.host}`);
                    resolve(session);
                });
            });

            client.on('error', (err) => {
                logger.error(`SSH connection error: ${err.message}`);
                reject(err);
            });

            client.on('close', () => {
                const sessionData = this.sessions.get(sessionId);
                if (sessionData) {
                    sessionData.session.connected = false;
                }
            });

            // Connect
            const connectConfig: ConnectConfig = {
                host: options.host,
                port: options.port || 22,
                username: options.username,
            };

            if (options.password) {
                connectConfig.password = options.password;
            }
            if (options.privateKey) {
                connectConfig.privateKey = options.privateKey;
                if (options.passphrase) {
                    connectConfig.passphrase = options.passphrase;
                }
            }

            client.connect(connectConfig);
        });
    }

    /**
     * Execute command in SSH session (send to interactive shell)
     */
    async executeSSHCommand(sessionId: string, command: string): Promise<CommandResult> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.session.type !== 'ssh') {
            throw new Error('Invalid SSH session');
        }

        if (!sessionData.session.connected) {
            throw new Error('SSH session disconnected');
        }

        sessionData.session.lastActivity = new Date();

        // For interactive shell, write the command directly
        if (sessionData.sshStream) {
            sessionData.sshStream.write(command + '\n');

            // Wait a bit for output and return what we have
            await new Promise(resolve => setTimeout(resolve, 500));

            const output = sessionData.outputBuffer.slice(-50).join('');

            return {
                stdout: output,
                stderr: '',
                exitCode: null,
            };
        }

        throw new Error('SSH stream not available');
    }

    /**
     * Send raw data to SSH session (for password input, etc.)
     */
    async sendSSHData(sessionId: string, data: string): Promise<void> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.session.type !== 'ssh' || !sessionData.sshStream) {
            throw new Error('Invalid SSH session');
        }

        if (!sessionData.session.connected) {
            throw new Error('SSH session disconnected');
        }

        sessionData.session.lastActivity = new Date();
        sessionData.sshStream.write(data);
    }

    /**
     * Create Telnet session
     */
    async createTelnetSession(options: TelnetConnectionOptions): Promise<TerminalSession> {
        const sessionId = this.generateSessionId();
        const port = options.port || 23;

        return new Promise((resolve, reject) => {
            const socket = new Socket();
            const session: TerminalSession = {
                id: sessionId,
                type: 'telnet',
                createdAt: new Date(),
                lastActivity: new Date(),
                connected: false,
                host: options.host,
                port,
            };

            const outputBuffer: string[] = [];

            socket.on('connect', () => {
                session.connected = true;
                this.sessions.set(sessionId, {
                    session,
                    telnetSocket: socket,
                    outputBuffer,
                });
                logger.info(`Telnet session created: ${sessionId} -> ${options.host}:${port}`);
                resolve(session);
            });

            socket.on('data', (data) => {
                outputBuffer.push(data.toString());
                this.emit(`data:${sessionId}`, data.toString());
            });

            socket.on('error', (err) => {
                logger.error(`Telnet connection error: ${err.message}`);
                reject(err);
            });

            socket.on('close', () => {
                const sessionData = this.sessions.get(sessionId);
                if (sessionData) {
                    sessionData.session.connected = false;
                }
            });

            // Connect with timeout
            socket.setTimeout(10000);
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });

            socket.connect(port, options.host);
        });
    }

    /**
     * Send data to Telnet session
     */
    async sendTelnetData(sessionId: string, data: string): Promise<void> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.session.type !== 'telnet' || !sessionData.telnetSocket) {
            throw new Error('Invalid Telnet session');
        }

        if (!sessionData.session.connected) {
            throw new Error('Telnet session disconnected');
        }

        sessionData.session.lastActivity = new Date();
        sessionData.telnetSocket.write(data);
    }

    /**
     * Send data to SSH session (for interactive PTY)
     */
    async sendToSSH(sessionId: string, data: string): Promise<void> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.session.type !== 'ssh' || !sessionData.sshStream) {
            throw new Error('Invalid SSH session');
        }

        if (!sessionData.session.connected) {
            throw new Error('SSH session disconnected');
        }

        sessionData.session.lastActivity = new Date();
        sessionData.sshStream.write(data);
    }

    /**
     * Get session output buffer
     */
    getSessionOutput(sessionId: string): string[] {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            return [];
        }
        const output = [...sessionData.outputBuffer];
        if (output.length > 0) {
            logger.info(`[Terminal] getSessionOutput ${sessionId}:`, {
                count: output.length,
                totalLength: output.join('').length,
                bufferRef: sessionData.outputBuffer.length // Check if same reference
            });
        }
        return output;
    }

    /**
     * Clear session output buffer
     */
    clearSessionOutput(sessionId: string): void {
        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
            const beforeSize = sessionData.outputBuffer.length;
            // Clear array in-place to preserve reference for stream.on('data') callback
            sessionData.outputBuffer.length = 0;
            if (beforeSize > 0) {
                logger.info(`[Terminal] clearSessionOutput ${sessionId}: cleared ${beforeSize} items`);
            }
        }
    }

    /**
     * Get session info
     */
    getSession(sessionId: string): TerminalSession | undefined {
        return this.sessions.get(sessionId)?.session;
    }

    /**
     * Get all sessions
     */
    getAllSessions(): TerminalSession[] {
        return Array.from(this.sessions.values()).map(s => s.session);
    }

    /**
     * Close session
     */
    async closeSession(sessionId: string): Promise<void> {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) return;

        try {
            if (sessionData.process) {
                sessionData.process.kill();
            }
            if (sessionData.sshClient) {
                sessionData.sshClient.end();
            }
            if (sessionData.telnetSocket) {
                sessionData.telnetSocket.destroy();
            }
        } catch (error) {
            logger.error(`Error closing session ${sessionId}:`, { error });
        }

        this.sessions.delete(sessionId);
        logger.info(`Terminal session closed: ${sessionId}`);
    }

    /**
     * Cleanup inactive sessions (older than 30 minutes)
     */
    cleanupInactiveSessions(): void {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        for (const [sessionId, sessionData] of this.sessions) {
            if (sessionData.session.lastActivity < thirtyMinutesAgo) {
                this.closeSession(sessionId);
            }
        }
    }
}

export const terminalManager = new TerminalSessionManager();

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
    terminalManager.cleanupInactiveSessions();
}, 5 * 60 * 1000);
