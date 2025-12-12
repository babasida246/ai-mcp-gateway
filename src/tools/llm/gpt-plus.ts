/**
 * GPT Plus Client
 * 
 * Enables using a ChatGPT Plus subscription as an LLM provider.
 * Uses browser session cookies to authenticate with ChatGPT.
 * 
 * IMPORTANT: This is for personal use only. Ensure compliance with OpenAI's Terms of Service.
 */

import { logger } from '../../logging/logger.js';
import { db } from '../../db/postgres.js';

// Session storage interface
interface GPTPlusSession {
    id: string;
    accessToken: string;
    refreshToken?: string;
    sessionToken?: string;
    expiresAt: Date;
    userEmail: string;
    isPremium: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// ChatGPT conversation interface
interface ChatGPTMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createTime?: number;
}

interface ChatGPTConversation {
    conversationId: string;
    messages: ChatGPTMessage[];
    model: string;
}

// Response from ChatGPT
interface ChatGPTResponse {
    message: {
        id: string;
        content: {
            parts: string[];
        };
        role: string;
    };
    conversationId: string;
    error?: string;
}

/**
 * GPT Plus Provider Client
 * Manages session authentication and API calls to ChatGPT
 */
class GPTPlusClient {
    private static instance: GPTPlusClient;
    private currentSession: GPTPlusSession | null = null;
    private baseUrl = 'https://chat.openai.com';
    private apiUrl = 'https://chat.openai.com/backend-api';

    private constructor() { }

    static getInstance(): GPTPlusClient {
        if (!GPTPlusClient.instance) {
            GPTPlusClient.instance = new GPTPlusClient();
        }
        return GPTPlusClient.instance;
    }

    /**
     * Initialize - load session from database if available
     */
    async initialize(): Promise<void> {
        try {
            if (!db.isReady()) {
                logger.warn('Database not ready, GPT Plus session cannot be loaded');
                return;
            }

            const client = await db.getClient();
            try {
                const result = await client.query<{
                    id: string;
                    access_token: string;
                    refresh_token: string;
                    session_token: string;
                    expires_at: Date;
                    user_email: string;
                    is_premium: boolean;
                    created_at: Date;
                    updated_at: Date;
                }>(
                    'SELECT * FROM gpt_plus_sessions WHERE expires_at > NOW() ORDER BY updated_at DESC LIMIT 1'
                );

                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    this.currentSession = {
                        id: row.id,
                        accessToken: row.access_token,
                        refreshToken: row.refresh_token,
                        sessionToken: row.session_token,
                        expiresAt: row.expires_at,
                        userEmail: row.user_email,
                        isPremium: row.is_premium,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at,
                    };
                    logger.info('GPT Plus session loaded from database', {
                        email: this.currentSession.userEmail,
                        expiresAt: this.currentSession.expiresAt,
                    });
                }
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error('Failed to initialize GPT Plus client', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Check if GPT Plus is configured and session is valid
     */
    isAvailable(): boolean {
        if (!this.currentSession) return false;
        return new Date() < this.currentSession.expiresAt;
    }

    /**
     * Get current session info (without sensitive tokens)
     */
    getSessionInfo(): { email: string; isPremium: boolean; expiresAt: Date } | null {
        if (!this.currentSession) return null;
        return {
            email: this.currentSession.userEmail,
            isPremium: this.currentSession.isPremium,
            expiresAt: this.currentSession.expiresAt,
        };
    }

    /**
     * Login with access token from browser
     * Users need to get this from browser dev tools after logging into chat.openai.com
     */
    async loginWithAccessToken(
        accessToken: string,
        userEmail: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Verify the token by making a test request
            const response = await fetch(`${this.apiUrl}/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                return { success: false, error: 'Invalid access token' };
            }

            const userProfile = await response.json() as { email?: string; id?: string };
            const resolvedEmail = userProfile.email || userEmail;

            // Check if user has Plus subscription (this might need adjustment based on API response)
            const isPremium = true; // We assume Plus since user is logging in for this purpose

            // Calculate expiration (typically 2 weeks for ChatGPT sessions)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 14);

            // Save session to database
            const sessionId = `gptplus-${Date.now()}`;

            if (db.isReady()) {
                const client = await db.getClient();
                try {
                    // Delete old sessions for this email
                    await client.query(
                        'DELETE FROM gpt_plus_sessions WHERE user_email = $1',
                        [resolvedEmail]
                    );

                    // Insert new session
                    await client.query(
                        `INSERT INTO gpt_plus_sessions 
                        (id, access_token, user_email, is_premium, expires_at) 
                        VALUES ($1, $2, $3, $4, $5)`,
                        [sessionId, accessToken, resolvedEmail, isPremium, expiresAt]
                    );
                } finally {
                    client.release();
                }
            }

            // Update current session
            this.currentSession = {
                id: sessionId,
                accessToken,
                expiresAt,
                userEmail: resolvedEmail,
                isPremium,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            logger.info('GPT Plus login successful', {
                email: resolvedEmail,
                expiresAt,
            });

            return { success: true };
        } catch (error) {
            logger.error('GPT Plus login failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Login failed',
            };
        }
    }

    /**
     * Logout - clear session
     */
    async logout(): Promise<void> {
        if (!this.currentSession) return;

        if (db.isReady()) {
            const client = await db.getClient();
            try {
                await client.query(
                    'DELETE FROM gpt_plus_sessions WHERE id = $1',
                    [this.currentSession.id]
                );
            } finally {
                client.release();
            }
        }

        logger.info('GPT Plus logged out', { email: this.currentSession.userEmail });
        this.currentSession = null;
    }

    /**
     * Send a message to ChatGPT
     */
    async chat(
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        options?: {
            model?: string;
            conversationId?: string;
            parentMessageId?: string;
        }
    ): Promise<{
        content: string;
        conversationId: string;
        messageId: string;
        error?: string;
    }> {
        if (!this.isAvailable()) {
            throw new Error('GPT Plus session not available. Please login first.');
        }

        const model = options?.model || 'gpt-4';
        const conversationId = options?.conversationId;
        const parentMessageId = options?.parentMessageId || crypto.randomUUID();
        const accessToken = this.currentSession?.accessToken;
        if (!accessToken) {
            throw new Error('GPT Plus session missing access token');
        }

        try {
            // Format the last user message for ChatGPT API
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();
            if (!lastUserMessage) {
                throw new Error('No user message provided');
            }

            // Build system prompt if provided
            const systemMessage = messages.find(m => m.role === 'system');
            const prompt = systemMessage
                ? `${systemMessage.content}\n\n${lastUserMessage.content}`
                : lastUserMessage.content;

            const payload = {
                action: 'next',
                messages: [
                    {
                        id: crypto.randomUUID(),
                        author: { role: 'user' },
                        content: {
                            content_type: 'text',
                            parts: [prompt],
                        },
                    },
                ],
                model,
                parent_message_id: parentMessageId,
                ...(conversationId && { conversation_id: conversationId }),
            };

            const response = await fetch(`${this.apiUrl}/conversation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ChatGPT API error: ${response.status} - ${errorText}`);
            }

            // Parse SSE response
            const text = await response.text();
            const lines = text.split('\n').filter(line => line.startsWith('data: '));

            let lastMessage = '';
            let newConversationId = conversationId || '';
            let messageId = '';

            for (const line of lines) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]') break;

                try {
                    const parsed = JSON.parse(data) as {
                        message?: {
                            id: string;
                            content: { parts: string[] };
                        };
                        conversation_id?: string;
                    };

                    if (parsed.message?.content?.parts) {
                        lastMessage = parsed.message.content.parts.join('');
                        messageId = parsed.message.id;
                    }
                    if (parsed.conversation_id) {
                        newConversationId = parsed.conversation_id;
                    }
                } catch {
                    // Skip invalid JSON lines
                }
            }

            return {
                content: lastMessage,
                conversationId: newConversationId,
                messageId,
            };
        } catch (error) {
            logger.error('GPT Plus chat failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
        }
    }

    /**
     * Get available models for GPT Plus users
     */
    getAvailableModels(): Array<{ id: string; name: string; description: string }> {
        return [
            {
                id: 'gpt-4',
                name: 'GPT-4',
                description: 'Most capable model, great for complex tasks',
            },
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                description: 'Faster GPT-4 with 128k context',
            },
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                description: 'Latest GPT-4 with optimized performance',
            },
            {
                id: 'o1-preview',
                name: 'o1-preview',
                description: 'Advanced reasoning model',
            },
            {
                id: 'o1-mini',
                name: 'o1-mini',
                description: 'Smaller reasoning model',
            },
        ];
    }
}

// Export singleton instance
export const gptPlusClient = GPTPlusClient.getInstance();

// Export types
export type { GPTPlusSession, ChatGPTMessage, ChatGPTConversation, ChatGPTResponse };
