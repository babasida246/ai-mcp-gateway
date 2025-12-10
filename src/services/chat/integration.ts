/**
 * Chat Context Integration
 * 
 * Provides integration between the ChatContextBuilder and the API/router layers.
 * This module handles the conversion between API request formats and internal types.
 * 
 * @module services/chat/integration
 */

import {
    chatContextBuilder,
    ChatContextConfig,
    ContextMessage,
    BuildContextResult,
    resolveChatContextConfig,
    DEFAULT_CHAT_CONTEXT_CONFIG,
} from './ChatContextBuilder.js';
import { estimateTokensSync } from './TokenEstimator.js';
import { logger } from '../../logging/logger.js';
import { db } from '../../db/postgres.js';
import { orchestrator } from './Orchestrator.js';

/**
 * Feature flag for multi-pass orchestration
 * Set via environment variable ENABLE_ORCHESTRATOR=true
 */
const ENABLE_ORCHESTRATOR = process.env.ENABLE_ORCHESTRATOR === 'true';
const ORCHESTRATOR_STRATEGY = (process.env.ORCHESTRATOR_STRATEGY || 'two-pass') as 'two-pass' | 'three-pass';
const ORCHESTRATOR_INCLUDE_REFINEMENT = process.env.ORCHESTRATOR_INCLUDE_REFINEMENT === 'true';

// ============================================================================
// Types
// ============================================================================

/**
 * OpenAI-compatible message format
 */
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
    content: string;
    name?: string;
    function_call?: Record<string, unknown>;
    tool_calls?: Array<Record<string, unknown>>;
}

/**
 * Request parameters for context building
 */
export interface ContextBuildRequest {
    /** Conversation ID (optional - if not provided, creates stateless context) */
    conversationId?: string;

    /** Raw messages from API request */
    messages: OpenAIMessage[];

    /** Model ID for token estimation */
    model?: string;

    /** Layer for model selection */
    layer?: string;

    /** Project ID for config resolution */
    projectId?: string;

    /** Tool ID for config resolution */
    toolId?: string;

    /** Override strategy */
    contextStrategy?: 'full' | 'last-n' | 'summary+recent' | 'span-retrieval';

    /** Override max tokens */
    maxContextTokens?: number;
}

/**
 * Result of context building for API consumption
 */
export interface ContextBuildResponse {
    /** Optimized messages ready for LLM */
    messages: OpenAIMessage[];

    /** Combined prompt string (legacy format) */
    prompt: string;

    /** Token statistics */
    tokenStats: {
        total: number;
        system: number;
        context: number;
        currentMessage: number;
        budget: number;
        saved: number;
    };

    /** Build metadata */
    metadata: BuildContextResult['metadata'];

    /** Strategy used */
    strategy: string;
}

// ============================================================================
// Main Integration Function
// ============================================================================

/**
 * Build optimized context from API request
 * 
 * This is the main entry point for integrating ChatContextBuilder
 * with the existing API endpoints.
 */
export async function buildContextForRequest(
    request: ContextBuildRequest
): Promise<ContextBuildResponse> {
    const startTime = Date.now();

    logger.debug('[ContextIntegration] Building context for request', {
        conversationId: request.conversationId,
        messageCount: request.messages.length,
        strategy: request.contextStrategy,
    });

    // If no conversationId, use stateless mode (just return messages as-is with basic optimization)
    if (!request.conversationId) {
        logger.debug('[ContextIntegration] Using stateless mode (no conversation ID)');
        return buildStatelessContext(request);
    }

    // Use multi-pass orchestrator if enabled
    if (ENABLE_ORCHESTRATOR && orchestrator) {
        logger.info('[ContextIntegration] Using multi-pass orchestrator', {
            conversationId: request.conversationId,
            strategy: ORCHESTRATOR_STRATEGY,
        });
        try {
            const orchestratorResult = await orchestrator.handle({
                conversationId: request.conversationId,
                messages: request.messages,
                model: request.model,
                projectId: request.projectId,
                toolId: request.toolId,
                strategy: {
                    enabled: true,
                    passes: ORCHESTRATOR_STRATEGY as any,
                    include_analysis: true,
                    include_refinement: ORCHESTRATOR_INCLUDE_REFINEMENT,
                    max_total_tokens: 8000,
                    timeout_ms: 30000,
                },
            });

            // Save the orchestrator response
            await saveAssistantResponse(
                request.conversationId,
                orchestratorResult.final_response,
                request.model
            );

            // Return in ContextBuildResponse format
            return {
                messages: [{ role: 'assistant', content: orchestratorResult.final_response }],
                prompt: orchestratorResult.final_response,
                tokenStats: {
                    total: orchestratorResult.token_usage.total_tokens,
                    system: 0,
                    context: orchestratorResult.token_usage.analysis_tokens,
                    currentMessage: orchestratorResult.token_usage.generation_tokens,
                    budget: 8000,
                    saved: 0,
                },
                metadata: {
                    recentMessagesIncluded: request.messages.length,
                    spansRetrieved: 0,
                    summaryIncluded: false,
                    tokenBudget: 8000,
                    tokenUsed: orchestratorResult.token_usage.total_tokens,
                },
                strategy: `orchestrator-${ORCHESTRATOR_STRATEGY}`,
            };
        } catch (error) {
            logger.warn('[ContextIntegration] Orchestrator failed, falling back to standard flow', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Fall through to standard flow
        }
    }

    try {
        // Resolve config based on project/tool/model
        const baseConfig = await resolveChatContextConfig(
            request.projectId,
            request.toolId,
            request.model
        );

        // Apply request-level overrides
        const config: ChatContextConfig = {
            ...baseConfig,
            ...(request.contextStrategy && { strategy: request.contextStrategy }),
            ...(request.maxContextTokens && { maxPromptTokens: request.maxContextTokens }),
        };

        // Extract system prompt and current user message
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const nonSystemMessages = request.messages.filter(m => m.role !== 'system');
        const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

        if (!lastMessage || lastMessage.role !== 'user') {
            throw new Error('Last message must be from user');
        }

        // Build system prompt
        const systemPrompt = systemMessages.length > 0
            ? systemMessages.map(m => m.content).join('\n')
            : undefined;

        logger.debug('[ContextIntegration] Message breakdown', {
            conversationId: request.conversationId,
            systemMessages: systemMessages.length,
            historyMessages: nonSystemMessages.length - 1,
            currentMessage: lastMessage.content.substring(0, 100),
        });

        // Persist ALL messages (including history and current) to DB for context tracking
        await persistMessagesToDb(request.conversationId, nonSystemMessages);

        // Build optimized context
        const result = await chatContextBuilder.buildContext({
            conversationId: request.conversationId,
            currentUserMessage: lastMessage.content,
            modelId: request.model,
            projectId: request.projectId,
            toolId: request.toolId,
            configOverrides: {
                ...config,
                systemPrompt,
            },
        });

        // Convert to OpenAI format
        const optimizedMessages = convertToOpenAIFormat(result.messages);

        // Calculate token savings
        const originalTokens = estimateOriginalTokens(request.messages, request.model);
        const savedTokens = Math.max(0, originalTokens - result.totalTokens);

        // Build legacy prompt format
        const prompt = buildLegacyPrompt(result.messages);

        const duration = Date.now() - startTime;
        logger.info('[ContextIntegration] Context built for request', {
            conversationId: request.conversationId,
            strategy: result.strategyUsed,
            originalTokens,
            optimizedTokens: result.totalTokens,
            savedTokens,
            durationMs: duration,
        });

        // Log the final prompt that will be sent to the model
        const promptPreview = buildLegacyPrompt(result.messages);
        logger.info('[ContextIntegration] Final prompt preview', {
            conversationId: request.conversationId,
            promptLength: promptPreview.length,
            promptPreview: promptPreview.substring(0, 800) + (promptPreview.length > 800 ? '\n\n... [truncated]' : ''),
        });

        return {
            messages: optimizedMessages,
            prompt,
            tokenStats: {
                total: result.totalTokens,
                system: result.messages.filter(m => m.role === 'system')
                    .reduce((sum, m) => sum + (m.tokenEstimate || 0), 0),
                context: result.totalTokens - (result.messages[result.messages.length - 1]?.tokenEstimate || 0),
                currentMessage: result.messages[result.messages.length - 1]?.tokenEstimate || 0,
                budget: result.metadata.tokenBudget,
                saved: savedTokens,
            },
            metadata: result.metadata,
            strategy: result.strategyUsed,
        };

    } catch (error) {
        logger.error('[ContextIntegration] Failed to build context, using fallback', {
            conversationId: request.conversationId,
            error: error instanceof Error ? error.message : String(error),
        });

        // Fallback to stateless mode
        return buildStatelessContext(request);
    }
}

// ============================================================================
// Stateless Mode (No Conversation ID)
// ============================================================================

/**
 * Build context without conversation history (stateless mode)
 */
function buildStatelessContext(request: ContextBuildRequest): ContextBuildResponse {
    const model = request.model;

    // Calculate token estimates
    let totalTokens = 0;
    let systemTokens = 0;

    const messages = request.messages.map(msg => {
        const tokens = estimateTokensSync(msg.content, model);
        totalTokens += tokens;
        if (msg.role === 'system') {
            systemTokens += tokens;
        }
        return msg;
    });

    // Build legacy prompt
    const prompt = buildLegacyPromptFromOpenAI(messages);

    const currentMessageTokens = messages[messages.length - 1]
        ? estimateTokensSync(messages[messages.length - 1].content, model)
        : 0;

    return {
        messages,
        prompt,
        tokenStats: {
            total: totalTokens,
            system: systemTokens,
            context: totalTokens - currentMessageTokens,
            currentMessage: currentMessageTokens,
            budget: DEFAULT_CHAT_CONTEXT_CONFIG.maxPromptTokens,
            saved: 0,
        },
        metadata: {
            recentMessagesIncluded: messages.length,
            spansRetrieved: 0,
            summaryIncluded: false,
            tokenBudget: DEFAULT_CHAT_CONTEXT_CONFIG.maxPromptTokens,
            tokenUsed: totalTokens,
        },
        strategy: 'stateless',
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Persist messages to database for history tracking
 */
async function persistMessagesToDb(
    conversationId: string,
    messages: OpenAIMessage[]
): Promise<void> {
    try {
        // Ensure conversation exists
        const conversationExists = await db.query(
            'SELECT id FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (!conversationExists || conversationExists.rows.length === 0) {
            await db.insert('conversations', {
                id: conversationId,
            });
            logger.info('[ContextIntegration] Created new conversation', { conversationId });
        }

        // Insert messages that don't already exist
        let persistedCount = 0;
        for (const msg of messages) {
            if (msg.role === 'system') continue; // Don't persist system messages

            const tokens = estimateTokensSync(msg.content);

            // Insert message if it doesn't exist (check by content hash and role)
            // Using a more robust check to avoid duplicates
            const result = await db.query(
                `INSERT INTO messages (conversation_id, role, content, token_estimate)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM messages 
           WHERE conversation_id = $1 
             AND content = $3 
             AND role = $2
             AND created_at > NOW() - INTERVAL '1 minute'
         )
         RETURNING id`,
                [conversationId, msg.role, msg.content, tokens]
            );

            if (result && result.rows && result.rows.length > 0) {
                persistedCount++;
                logger.debug('[ContextIntegration] Persisted message', {
                    conversationId,
                    messageId: result.rows[0].id,
                    role: msg.role,
                });
            }
        }

        if (persistedCount > 0) {
            logger.info('[ContextIntegration] Persisted messages to DB', {
                conversationId,
                persistedCount,
                totalMessages: messages.length,
            });
        }
    } catch (error) {
        logger.warn('[ContextIntegration] Failed to persist messages', {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
        });
        // Non-critical, don't throw
    }
}

/**
 * Convert internal ContextMessage format to OpenAI format
 */
function convertToOpenAIFormat(messages: ContextMessage[]): OpenAIMessage[] {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name && { name: msg.name }),
    }));
}

/**
 * Estimate tokens for original messages (before optimization)
 */
function estimateOriginalTokens(messages: OpenAIMessage[], model?: string): number {
    return messages.reduce((sum, msg) => {
        return sum + estimateTokensSync(msg.content, model);
    }, 0);
}

/**
 * Build legacy prompt string from ContextMessage array
 */
function buildLegacyPrompt(messages: ContextMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            parts.push(`System: ${msg.content}`);
        } else if (msg.role === 'user') {
            parts.push(`User: ${msg.content}`);
        } else if (msg.role === 'assistant') {
            parts.push(`Assistant: ${msg.content}`);
        }
    }

    return parts.join('\n\n');
}

/**
 * Build legacy prompt string from OpenAI messages
 */
function buildLegacyPromptFromOpenAI(messages: OpenAIMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
        const prefix = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        parts.push(`${prefix}: ${msg.content}`);
    }

    return parts.join('\n\n');
}

// ============================================================================
// Utility: Generate embedding for new user message
// ============================================================================

/**
 * Queue embedding generation for a new message (non-blocking)
 */
export async function queueMessageEmbedding(
    conversationId: string,
    messageContent: string
): Promise<void> {
    // Run in background without blocking
    setImmediate(async () => {
        try {
            // Find the message ID
            const result = await db.query<{ id: string }>(
                `SELECT id FROM messages 
         WHERE conversation_id = $1 AND content = $2 
         ORDER BY created_at DESC LIMIT 1`,
                [conversationId, messageContent]
            );

            if (result && result.rows.length > 0) {
                await chatContextBuilder.generateMessageEmbedding(
                    result.rows[0].id,
                    messageContent
                );
            }
        } catch (error) {
            logger.warn('[ContextIntegration] Failed to generate message embedding', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}

/**
 * Save assistant response to database for conversation history
 */
export async function saveAssistantResponse(
    conversationId: string,
    assistantContent: string,
    modelId?: string
): Promise<void> {
    try {
        const tokens = estimateTokensSync(assistantContent, modelId);

        // Insert assistant message
        const result = await db.query(
            `INSERT INTO messages (conversation_id, role, content, token_estimate)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [conversationId, 'assistant', assistantContent, tokens]
        );

        if (result && result.rows && result.rows.length > 0) {
            logger.info('[ContextIntegration] Saved assistant response', {
                conversationId,
                messageId: result.rows[0].id,
                responseLength: assistantContent.length,
                tokens,
            });

            // Queue embedding generation for assistant response
            queueMessageEmbedding(conversationId, assistantContent);
        }
    } catch (error) {
        logger.error('[ContextIntegration] Failed to save assistant response', {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - this is non-critical for the response
    }
}

// ============================================================================
// Utility: Generate embedding for new user message (Deprecated)
// ============================================================================

/**
 * Queue embedding generation for a new message (non-blocking)
 * @deprecated Use the public queueMessageEmbedding instead
 */
async function queueMessageEmbeddingDeprecated(
    conversationId: string,
    messageContent: string
): Promise<void> {
    // Run in background without blocking
    setImmediate(async () => {
        try {
            // Find the message ID
            const result = await db.query<{ id: string }>(
                `SELECT id FROM messages 
         WHERE conversation_id = $1 AND content = $2 
         ORDER BY created_at DESC LIMIT 1`,
                [conversationId, messageContent]
            );

            if (result && result.rows.length > 0) {
                await chatContextBuilder.generateMessageEmbedding(
                    result.rows[0].id,
                    messageContent
                );
            }
        } catch (error) {
            logger.warn('[ContextIntegration] Failed to generate message embedding', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}

// ============================================================================
// Utility: Backfill embeddings for conversation
// ============================================================================

/**
 * Trigger embedding backfill for a conversation
 */
export async function backfillConversationEmbeddings(
    conversationId: string,
    batchSize: number = 10
): Promise<{ processed: number }> {
    const processed = await chatContextBuilder.backfillEmbeddings(
        conversationId,
        batchSize
    );
    return { processed };
}
