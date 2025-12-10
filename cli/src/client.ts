/**
 * HTTP Client for MCP Gateway API
 * 
 * Environment Variables:
 * - MCP_ENDPOINT: API endpoint URL (default: http://localhost:3000)
 * - MCP_API_KEY: Optional API key for authentication
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { execSync } from 'child_process';

export interface MCPRequest {
    mode: 'chat' | 'code' | 'diff';
    message: string;
    budget?: number; // Budget limit for request (0 = free tier only)
    context?: {
        cwd?: string;
        files?: string[];
        gitStatus?: string;
        filename?: string;
        language?: string;
    };
}

export interface MCPResponse {
    message: string;
    patch?: string;
    model?: string;
    tokens?: {
        input: number;
        output: number;
        total: number;
    };
    cost?: number;
    metadata?: {
        tokens: number;
        model: string;
        cost?: number;
        layer?: string;
        complexity?: string;
    };
    escalation?: {
        required: boolean;
        currentLayer: string;
        suggestedLayer: string;
        reason: string;
        message: string;
        optimizedPrompt?: string;
    };
    requiresEscalationConfirm?: boolean;
    suggestedLayer?: string;
    escalationReason?: string;
    optimizedPrompt?: string;
}

export class MCPClient {
    private client: AxiosInstance;
    private endpoint: string;
    private token: string | null = null;
    private username?: string;
    private password?: string;

    constructor(endpoint?: string, apiKey?: string, username?: string, password?: string) {
        // Get configuration from environment or parameters
        this.endpoint = endpoint
            || process.env.MCP_ENDPOINT
            || 'http://localhost:3000';

        const key = apiKey || process.env.MCP_API_KEY;
        const user = username || process.env.MCP_USERNAME;
        const pass = password || process.env.MCP_PASSWORD;

        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.endpoint,
            timeout: 1800000, // 30 minute timeout for complex prompts
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // If API key provided, use it directly
        if (key) {
            this.token = key;
            this.client.defaults.headers.common['Authorization'] = `Bearer ${key}`;
        }
        // Otherwise, try to login if credentials provided
        else if (user && pass) {
            // Login will be done lazily in send() method
            this.username = user;
            this.password = pass;
        }
    }

    /**
     * Login to get authentication token
     */
    private async login(username: string, password: string): Promise<void> {
        try {
            console.log(`🔐 Logging in as ${username}...`);
            const response = await this.client.post('/v1/auth/login', {
                username,
                password,
            });

            if (response.data.token) {
                this.token = response.data.token;
                this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
                console.log('✅ Login successful');
            } else {
                throw new Error('Login failed: No token received');
            }
        } catch (error) {
            console.error('❌ Login failed:', error);
            throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if the MCP Gateway server is healthy
     */
    async checkHealth(): Promise<{ healthy: boolean; message: string; details?: any }> {
        try {
            const response = await this.client.get('/health', { timeout: 5000 });
            return { healthy: true, message: 'Server is healthy', details: response.data };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    return { healthy: false, message: 'Cannot connect to MCP Gateway server' };
                }
                if (error.response) {
                    return { healthy: false, message: `Server error: ${error.response.status}`, details: error.response.data };
                }
            }
            return { healthy: false, message: `Unknown error: ${error}` };
        }
    }

    /**
     * Send request to MCP Gateway
     */
    async send(request: MCPRequest): Promise<MCPResponse> {
        // Login if we have credentials but no token yet
        // TEMPORARILY DISABLED FOR TESTING
        // if (!this.token && this.username && this.password) {
        //     console.log('🔑 No token, attempting login...');
        //     await this.login(this.username, this.password);
        // }

        console.log('📤 Sending request to MCP...');
        try {
            const response = await this.client.post<MCPResponse>('/v1/mcp-cli', request);
            console.log('✅ Request successful');
            return response.data;
        } catch (error) {
            this.handleError(error);
            throw error; // Re-throw for caller to handle
        }
    }

    /**
     * Get current working directory context
     */
    getCurrentContext(): Pick<MCPRequest, 'context'> {
        const cwd = process.cwd();

        // Get list of files in directory (cross-platform)
        const files: string[] = [];
        try {
            const fs = require('fs');
            const items = fs.readdirSync(cwd, { withFileTypes: true })
                .filter((dirent: any) => !dirent.name.startsWith('.'))
                .map((dirent: any) => dirent.name)
                .slice(0, 20); // Max 20 files
            files.push(...items);
        } catch (error) {
            // Fallback to shell command
            try {
                const isWindows = process.platform === 'win32';
                const command = isWindows ? 'dir /B' : 'ls -1';
                const items = execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
                    .trim()
                    .split(isWindows ? '\r\n' : '\n')
                    .filter(f => f && !f.startsWith('.'));
                files.push(...items.slice(0, 20));
            } catch {
                console.warn('Warning: Could not scan directory files');
            }
        }

        // Try to get git status if in a git repo
        let gitStatus: string | undefined;
        try {
            gitStatus = execSync('git status --short', {
                cwd,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
            }).trim();
        } catch {
            // Not a git repo or git not available
            gitStatus = undefined;
        }

        return {
            context: {
                cwd,
                files,
                ...(gitStatus ? { gitStatus } : {}),
            },
        };
    }

    /**
     * Handle API errors with user-friendly messages
     */
    private handleError(error: unknown): void {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            if (axiosError.response) {
                // Server responded with error status
                console.error(`\n❌ MCP Server Error (${axiosError.response.status}):`);
                console.error(JSON.stringify(axiosError.response.data, null, 2));
            } else if (axiosError.request) {
                // Request made but no response
                console.error('\n❌ Cannot connect to MCP server');
                console.error(`Endpoint: ${this.endpoint}`);
                console.error('Please check:');
                console.error('  1. Server is running');
                console.error('  2. MCP_ENDPOINT is correct');
                console.error('  3. Network connectivity');
            } else {
                // Something else went wrong
                console.error('\n❌ Request Error:', axiosError.message);
            }
        } else {
            console.error('\n❌ Unexpected Error:', error);
        }
    }
}
