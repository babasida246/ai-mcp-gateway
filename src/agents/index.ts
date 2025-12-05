/**
 * AI Agents Module
 * Exports all agent components for the MCP Gateway
 */

// Types
export * from './types.js';

// Core agents
export { ReActAgent, createReActAgent, type ReActTool, type AgentLLM } from './react.js';
export { AgentMemory, createAgentMemory, type MemoryConfig } from './memory.js';
export { TaskDecomposer, createTaskDecomposer, type TaskQueueConfig } from './taskQueue.js';
export { AdaptiveToolSelector, toolSelector, type ToolExecutionResult, type ToolRecommendation } from './toolSelector.js';
export {
    GroupChat,
    createGroupChat,
    createCodeReviewGroup,
    createPlanningGroup,
    AGENT_ROLES,
    type GroupChatConfig,
} from './groupChat.js';
export { DocumentSynthesizer, createDocumentSynthesizer, type DocumentSource, type SynthOptions } from './documentSynthesizer.js';

// New specialized agents
export { WebResearcher, createWebResearcher, type WebSource, type ResearchQuery, type ResearchResult, type FactCheckResult } from './webResearcher.js';
export { CodeAnalyzer, createCodeAnalyzer, type CodeFile, type CodeIssue, type CodeAnalysisResult, type RefactorSuggestion, type DocumentationResult } from './codeAnalyzer.js';
export { DataExtractor, createDataExtractor, type DataSchema, type ExtractionResult, type EntityResult, type TableData } from './dataExtractor.js';
export { WorkflowOrchestrator, createWorkflowOrchestrator, type WorkflowStep, type WorkflowDefinition, type WorkflowExecution, type N8nWebhook } from './workflowOrchestrator.js';

/**
 * Initialize all agent tables in database
 */
export async function initializeAgentTables(): Promise<void> {
    const { AgentMemory } = await import('./memory.js');
    const { AdaptiveToolSelector } = await import('./toolSelector.js');

    await AgentMemory.initializeTables();
    await AdaptiveToolSelector.initializeTables();
}
