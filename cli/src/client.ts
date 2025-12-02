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

    constructor(endpoint?: string, apiKey?: string) {
        // Get configuration from environment or parameters
        this.endpoint = endpoint
            || process.env.MCP_ENDPOINT
            || 'http://localhost:3000';

        const key = apiKey || process.env.MCP_API_KEY;

        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.endpoint,
            timeout: 1800000, // 30 minute timeout for complex prompts
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
            },
        });
    }

    /**
     * Send request to MCP Gateway
     */
    async send(request: MCPRequest): Promise<MCPResponse> {
        try {
            const response = await this.client.post<MCPResponse>('/v1/mcp-cli', request);
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

        // Get list of files in directory
        const files: string[] = [];
        try {
            const items = execSync('ls -1', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
                .trim()
                .split('\n')
                .filter(f => f && !f.startsWith('.'));
            files.push(...items.slice(0, 20)); // Max 20 files
        } catch {
            // ls not available or error
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
