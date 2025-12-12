import { Client, ConnectConfig } from 'ssh2';

export type MikrotikConnection = {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string | Buffer;
    timeoutMs?: number;
};

export type ExecResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string | null;
    durationMs?: number;
};

/**
 * Promise-based SSH wrapper using ssh2.
 * Designed for running MikroTik RouterOS commands over SSH.
 */
export class MikrotikSSH {
    private conn: Client | null = null;
    private connected = false;

    async connect(opts: MikrotikConnection): Promise<void> {
        if (this.connected) return;

        this.conn = new Client();
        const cfg: ConnectConfig = {
            host: opts.host,
            port: opts.port ?? 22,
            username: opts.username,
            readyTimeout: opts.timeoutMs ?? 20000,
        } as ConnectConfig;

        if (opts.privateKey) cfg.privateKey = opts.privateKey;
        if (opts.password) cfg.password = opts.password;

        await new Promise<void>((resolve, reject) => {
            const connection = this.conn;
            if (!connection) return reject(new Error('SSH client not initialized'));

            connection.on('ready', () => {
                this.connected = true;
                resolve();
            });

            connection.on('error', (err) => {
                this.connected = false;
                reject(err);
            });

            connection.on('end', () => (this.connected = false));
            connection.on('close', () => (this.connected = false));

            connection.connect(cfg);
        });
    }

    async disconnect(): Promise<void> {
        if (!this.conn) return;
        try {
            this.conn.end();
        } finally {
            this.connected = false;
            this.conn = null;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Execute a single command and return result with stdout/stderr/exit code.
     */
    async exec(command: string, timeoutMs = 30000): Promise<ExecResult> {
        if (!this.conn || !this.connected) throw new Error('Not connected to MikroTik device');

        const connection = this.conn;
        const start = Date.now();
        return new Promise<ExecResult>((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let exitCode: number | null = null;
            let signal: string | null = null;

            const timer = setTimeout(() => {
                reject(new Error(`Command timeout after ${timeoutMs}ms: ${command}`));
            }, timeoutMs);

            connection.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    return reject(err);
                }

                stream.on('close', (code: number, sig: string) => {
                    clearTimeout(timer);
                    exitCode = code;
                    signal = sig;
                    resolve({
                        stdout,
                        stderr,
                        exitCode,
                        signal,
                        durationMs: Date.now() - start
                    });
                });

                stream.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });
            });
        });
    }

    /**
     * Execute multiple commands sequentially and return results.
     * Stops on first error by default.
     */
    async execMulti(
        commands: string[],
        opts?: { perCommandTimeoutMs?: number; stopOnError?: boolean }
    ): Promise<Record<string, ExecResult>> {
        const perCommandTimeoutMs = opts?.perCommandTimeoutMs ?? 30000;
        const stopOnError = opts?.stopOnError !== false;

        const results: Record<string, ExecResult> = {};

        for (const cmd of commands) {
            try {
                results[cmd] = await this.exec(cmd, perCommandTimeoutMs);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                results[cmd] = {
                    stdout: '',
                    stderr: message,
                    exitCode: 1,
                    durationMs: 0
                };
                if (stopOnError) break;
            }
        }

        return results;
    }

    /**
     * Execute commands in parallel (non-blocking) and return results.
     * Useful for independent operations.
     */
    async execParallel(
        commands: string[],
        timeoutMs = 30000
    ): Promise<Record<string, ExecResult>> {
        const promises = commands.map(cmd =>
            this.exec(cmd, timeoutMs)
                .catch((err: unknown) => ({
                    stdout: '',
                    stderr: err instanceof Error ? err.message : String(err),
                    exitCode: 1,
                    durationMs: 0
                }))
        );

        const results = await Promise.all(promises);
        return Object.fromEntries(
            commands.map((cmd, i) => [cmd, results[i]])
        );
    }
}

export default MikrotikSSH;
