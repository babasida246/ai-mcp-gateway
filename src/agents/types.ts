/**
 * AI Agent Types
 * Core type definitions for agent system
 */

/**
 * Action types in ReAct pattern
 */
export type ActionType = 'thought' | 'action' | 'observation' | 'final_answer';

/**
 * Single step in ReAct loop
 */
export interface ReActStep {
    type: ActionType;
    content: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    timestamp: number;
}

/**
 * Memory entry for persistent storage
 */
export interface MemoryEntry {
    id: string;
    type: 'episodic' | 'semantic' | 'procedural';
    content: string;
    embedding?: number[];
    metadata: {
        conversationId?: string;
        taskId?: string;
        timestamp: number;
        importance: number;
        accessCount: number;
        lastAccessed: number;
        tags: string[];
    };
}

/**
 * Task for decomposition engine
 */
export interface Task {
    id: string;
    parentId?: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked';
    priority: number;
    dependencies: string[];
    subtasks: string[];
    result?: unknown;
    error?: string;
    metadata: {
        createdAt: number;
        startedAt?: number;
        completedAt?: number;
        estimatedComplexity: 'low' | 'medium' | 'high';
        retryCount: number;
        maxRetries: number;
    };
}

/**
 * Tool performance metrics
 */
export interface ToolPerformance {
    toolName: string;
    totalCalls: number;
    successCount: number;
    failureCount: number;
    avgDuration: number;
    lastUsed: number;
    successRate: number;
    contextPatterns: Map<string, number>;
}

/**
 * Agent role for multi-agent collaboration
 */
export interface AgentRole {
    id: string;
    name: string;
    description: string;
    expertise: string[];
    tools: string[];
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
}

/**
 * Agent message in group chat
 */
export interface AgentMessage {
    agentId: string;
    role: string;
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

/**
 * Conversation in multi-agent group
 */
export interface GroupConversation {
    id: string;
    topic: string;
    participants: AgentRole[];
    messages: AgentMessage[];
    status: 'active' | 'concluded' | 'terminated';
    conclusion?: string;
    metadata: {
        startedAt: number;
        endedAt?: number;
        turnCount: number;
        maxTurns: number;
    };
}

/**
 * Configuration for ReAct agent
 */
export interface ReActConfig {
    maxIterations: number;
    maxThinkingTokens: number;
    tools: string[];
    systemPrompt?: string;
    verbose: boolean;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
    success: boolean;
    answer: string;
    steps: ReActStep[];
    toolsUsed: string[];
    iterations: number;
    totalTokens: number;
    duration: number;
    metadata?: Record<string, unknown>;
}
