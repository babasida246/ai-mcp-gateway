/**
 * ReAct Agent Implementation
 * Reasoning + Acting pattern for multi-step task execution
 *
 * Based on: "ReAct: Synergizing Reasoning and Acting in Language Models"
 * The agent follows a Thought → Action → Observation loop until task completion
 */

import { logger } from '../logging/logger.js';
import { metrics } from '../logging/metrics.js';
import type {
    ReActStep,
    ReActConfig,
    AgentResult,
    ActionType,
} from './types.js';

/**
 * Simple LLM interface for agents
 */
export interface AgentLLM {
    chat(options: {
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
        maxTokens?: number;
        temperature?: number;
    }): Promise<{ content: string; usage?: { totalTokens?: number } }>;
}

/**
 * Default ReAct configuration
 */
const DEFAULT_CONFIG: ReActConfig = {
    maxIterations: 10,
    maxThinkingTokens: 2000,
    tools: [],
    verbose: false,
};

/**
 * Tool definition for ReAct agent
 */
export interface ReActTool {
    name: string;
    description: string;
    parameters: Record<string, { type: string; description: string; required?: boolean }>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * ReAct Agent
 * Implements the Reasoning + Acting pattern for autonomous task completion
 */
export class ReActAgent {
    private config: ReActConfig;
    private tools: Map<string, ReActTool>;
    private llmClient: AgentLLM;
    private steps: ReActStep[] = [];
    private conversationId: string;

    constructor(
        llmClient: AgentLLM,
        tools: ReActTool[],
        config: Partial<ReActConfig> = {},
        conversationId?: string
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.llmClient = llmClient;
        this.tools = new Map(tools.map((t) => [t.name, t]));
        this.conversationId = conversationId || `react-${Date.now()}`;
    }

    /**
     * Build the system prompt for ReAct agent
     */
    private buildSystemPrompt(): string {
        const toolDescriptions = Array.from(this.tools.values())
            .map((tool) => {
                const params = Object.entries(tool.parameters)
                    .map(([name, spec]) => `  - ${name} (${spec.type}): ${spec.description}`)
                    .join('\n');
                return `- ${tool.name}: ${tool.description}\n${params}`;
            })
            .join('\n\n');

        return `You are an intelligent agent that solves problems through reasoning and acting.

IMPORTANT: You MUST follow this exact format for each step:

Thought: [Your reasoning about what to do next]
Action: [tool_name]
Action Input: [JSON arguments for the tool]

OR when you have the final answer:

Thought: [Your reasoning about the final answer]
Final Answer: [Your complete answer to the user's question]

Available tools:
${toolDescriptions}

Rules:
1. Always start with a Thought explaining your reasoning
2. Use exactly one tool per Action step
3. Wait for Observation before next Thought
4. When you have enough information, provide Final Answer
5. Be concise but thorough in your reasoning
6. If a tool fails, think about alternatives
7. Maximum ${this.config.maxIterations} iterations allowed`;
    }

    /**
     * Parse LLM response to extract action components
     */
    private parseResponse(response: string): {
        thought: string;
        action?: string;
        actionInput?: Record<string, unknown>;
        finalAnswer?: string;
    } {
        const lines = response.split('\n');
        let thought = '';
        let action: string | undefined;
        let actionInput: Record<string, unknown> | undefined;
        let finalAnswer: string | undefined;

        let currentSection = '';
        let currentContent: string[] = [];

        for (const line of lines) {
            if (line.startsWith('Thought:')) {
                if (currentSection === 'thought') {
                    thought = currentContent.join('\n').trim();
                }
                currentSection = 'thought';
                currentContent = [line.substring('Thought:'.length).trim()];
            } else if (line.startsWith('Action:')) {
                if (currentSection === 'thought') {
                    thought = currentContent.join('\n').trim();
                }
                currentSection = 'action';
                action = line.substring('Action:'.length).trim();
            } else if (line.startsWith('Action Input:')) {
                currentSection = 'action_input';
                currentContent = [line.substring('Action Input:'.length).trim()];
            } else if (line.startsWith('Final Answer:')) {
                if (currentSection === 'thought') {
                    thought = currentContent.join('\n').trim();
                }
                currentSection = 'final_answer';
                currentContent = [line.substring('Final Answer:'.length).trim()];
            } else if (currentSection) {
                currentContent.push(line);
            }
        }

        // Finalize last section
        if (currentSection === 'thought') {
            thought = currentContent.join('\n').trim();
        } else if (currentSection === 'action_input') {
            try {
                const inputStr = currentContent.join('\n').trim();
                actionInput = JSON.parse(inputStr);
            } catch {
                // Try to extract JSON from the content
                const jsonMatch = currentContent.join('\n').match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        actionInput = JSON.parse(jsonMatch[0]);
                    } catch {
                        actionInput = { raw: currentContent.join('\n').trim() };
                    }
                }
            }
        } else if (currentSection === 'final_answer') {
            finalAnswer = currentContent.join('\n').trim();
        }

        return { thought, action, actionInput, finalAnswer };
    }

    /**
     * Execute a single tool
     */
    private async executeTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<{ success: boolean; result: unknown; error?: string }> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return {
                success: false,
                result: null,
                error: `Unknown tool: ${toolName}. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
            };
        }

        const startTime = Date.now();
        try {
            const result = await tool.execute(args);
            const duration = Date.now() - startTime;

            logger.debug('Tool executed successfully', {
                tool: toolName,
                duration,
                conversationId: this.conversationId,
            });

            return { success: true, result };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Tool execution failed', {
                tool: toolName,
                error: errorMessage,
                conversationId: this.conversationId,
            });

            return { success: false, result: null, error: errorMessage };
        }
    }

    /**
     * Add a step to history
     */
    private addStep(
        type: ActionType,
        content: string,
        toolName?: string,
        toolArgs?: Record<string, unknown>,
        toolResult?: unknown
    ): void {
        this.steps.push({
            type,
            content,
            toolName,
            toolArgs,
            toolResult,
            timestamp: Date.now(),
        });

        if (this.config.verbose) {
            logger.info(`[ReAct ${type}]`, { content, toolName });
        }
    }

    /**
     * Build conversation history for LLM
     */
    private buildMessages(userGoal: string): Array<{ role: string; content: string }> {
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: this.buildSystemPrompt() },
            { role: 'user', content: userGoal },
        ];

        // Add previous steps to conversation
        for (const step of this.steps) {
            if (step.type === 'thought' || step.type === 'action') {
                let content = '';
                if (step.type === 'thought') {
                    content = `Thought: ${step.content}`;
                }
                if (step.toolName) {
                    content += `\nAction: ${step.toolName}`;
                    content += `\nAction Input: ${JSON.stringify(step.toolArgs || {})}`;
                }
                messages.push({ role: 'assistant', content });
            } else if (step.type === 'observation') {
                messages.push({
                    role: 'user',
                    content: `Observation: ${step.content}`,
                });
            }
        }

        return messages;
    }

    /**
     * Execute the ReAct loop
     */
    async execute(goal: string): Promise<AgentResult> {
        const startTime = Date.now();
        this.steps = [];
        let iterations = 0;
        let totalTokens = 0;
        const toolsUsed: Set<string> = new Set();

        logger.info('Starting ReAct agent execution', {
            goal: goal.substring(0, 100),
            conversationId: this.conversationId,
            maxIterations: this.config.maxIterations,
        });

        metrics.recordRequest();

        while (iterations < this.config.maxIterations) {
            iterations++;

            // Get next action from LLM
            const messages = this.buildMessages(goal);
            const response = await this.llmClient.chat({
                messages: messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
                maxTokens: this.config.maxThinkingTokens,
                temperature: 0.2,
            });

            totalTokens += response.usage?.totalTokens || 0;

            // Parse the response
            const parsed = this.parseResponse(response.content);

            // Record thought
            if (parsed.thought) {
                this.addStep('thought', parsed.thought);
            }

            // Check for final answer
            if (parsed.finalAnswer) {
                this.addStep('final_answer', parsed.finalAnswer);

                const duration = Date.now() - startTime;
                logger.info('ReAct agent completed', {
                    iterations,
                    duration,
                    toolsUsed: Array.from(toolsUsed),
                    conversationId: this.conversationId,
                });

                return {
                    success: true,
                    answer: parsed.finalAnswer,
                    steps: this.steps,
                    toolsUsed: Array.from(toolsUsed),
                    iterations,
                    totalTokens,
                    duration,
                };
            }

            // Execute action if present
            if (parsed.action && parsed.actionInput) {
                this.addStep('action', '', parsed.action, parsed.actionInput);
                toolsUsed.add(parsed.action);

                const { success, result, error } = await this.executeTool(
                    parsed.action,
                    parsed.actionInput
                );

                const observation = success
                    ? JSON.stringify(result, null, 2)
                    : `Error: ${error}`;

                this.addStep('observation', observation, parsed.action, undefined, result);
            } else if (!parsed.finalAnswer) {
                // No action and no final answer - ask for clarification
                this.addStep(
                    'observation',
                    'Please provide a valid Action with Action Input, or a Final Answer.'
                );
            }
        }

        // Max iterations reached
        const duration = Date.now() - startTime;
        logger.warn('ReAct agent reached max iterations', {
            iterations,
            conversationId: this.conversationId,
        });

        return {
            success: false,
            answer: `Could not complete the task within ${this.config.maxIterations} iterations. Last progress: ${this.steps[this.steps.length - 1]?.content || 'none'}`,
            steps: this.steps,
            toolsUsed: Array.from(toolsUsed),
            iterations,
            totalTokens,
            duration,
        };
    }

    /**
     * Get execution history
     */
    getHistory(): ReActStep[] {
        return [...this.steps];
    }

    /**
     * Clear execution history
     */
    clearHistory(): void {
        this.steps = [];
    }
}

/**
 * Create a ReAct agent with default configuration
 */
export function createReActAgent(
    llmClient: AgentLLM,
    tools: ReActTool[],
    config?: Partial<ReActConfig>
): ReActAgent {
    return new ReActAgent(llmClient, tools, config);
}
