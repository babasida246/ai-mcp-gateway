/**
 * Chat Context Optimization Services
 * 
 * This module provides intelligent context management for chat conversations,
 * optimizing token usage while maintaining relevance and coherence.
 * 
 * @module services/chat
 */

// Core services
export { tokenEstimator, TokenEstimator, TokenEstimationStrategy } from './TokenEstimator.js';
export { embeddingService, EmbeddingService, EmbeddingProvider } from './EmbeddingService.js';
export { SpanRetriever, SpanRetrieverConfig, RetrievedSpan } from './SpanRetriever.js';

// Main builder
export {
    chatContextBuilder,
    ChatContextBuilder,
    resolveChatContextConfig,
    DEFAULT_CHAT_CONTEXT_CONFIG,
} from './ChatContextBuilder.js';

// Integration helpers
export {
    buildContextForRequest,
    queueMessageEmbedding,
    backfillConversationEmbeddings,
} from './integration.js';

// Types
export type {
    ChatContextStrategy,
    ChatContextConfig,
    ContextMessage,
    BuildContextParams,
    BuildContextResult,
} from './ChatContextBuilder.js';

export type {
    OpenAIMessage,
    ContextBuildRequest,
    ContextBuildResponse,
} from './integration.js';
