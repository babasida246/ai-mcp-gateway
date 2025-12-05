/**
 * Multi-Agent Group Chat
 * Enables multiple specialized agents to collaborate on complex tasks
 *
 * Inspired by Microsoft AutoGen's conversable agent pattern
 * - Define specialized roles
 * - Turn-based conversation
 * - Consensus building
 */

import { logger } from '../logging/logger.js';
import type { AgentRole, AgentMessage, GroupConversation } from './types.js';
import type { AgentLLM } from './react.js';

/**
 * Predefined agent roles
 */
export const AGENT_ROLES: Record<string, AgentRole> = {
    planner: {
        id: 'planner',
        name: 'Planner',
        description: 'Breaks down complex problems into actionable steps',
        expertise: ['planning', 'decomposition', 'prioritization'],
        tools: [],
        systemPrompt: `You are a planning expert. Your role is to:
1. Analyze complex problems and break them into steps
2. Identify dependencies between tasks
3. Suggest optimal execution order
4. Consider edge cases and potential blockers
Be concise and structured in your planning.`,
        temperature: 0.3,
        maxTokens: 1500,
    },
    coder: {
        id: 'coder',
        name: 'Coder',
        description: 'Writes and reviews code implementations',
        expertise: ['coding', 'implementation', 'debugging', 'refactoring'],
        tools: ['fs_read', 'fs_write', 'git_diff'],
        systemPrompt: `You are an expert programmer. Your role is to:
1. Write clean, efficient, and maintainable code
2. Follow best practices and design patterns
3. Consider edge cases and error handling
4. Explain your implementation decisions briefly
Use modern patterns and be pragmatic.`,
        temperature: 0.2,
        maxTokens: 2000,
    },
    reviewer: {
        id: 'reviewer',
        name: 'Reviewer',
        description: 'Reviews code and suggestions for quality and correctness',
        expertise: ['code review', 'quality assurance', 'security', 'performance'],
        tools: ['fs_read'],
        systemPrompt: `You are a code reviewer. Your role is to:
1. Identify bugs, security issues, and performance problems
2. Suggest improvements for code quality
3. Verify correctness of implementations
4. Check for edge cases and error handling
Be constructive and specific in your feedback.`,
        temperature: 0.1,
        maxTokens: 1500,
    },
    researcher: {
        id: 'researcher',
        name: 'Researcher',
        description: 'Gathers information and analyzes requirements',
        expertise: ['research', 'analysis', 'documentation'],
        tools: ['fs_read', 'web_search'],
        systemPrompt: `You are a research analyst. Your role is to:
1. Gather relevant information for the task
2. Analyze requirements and constraints
3. Identify relevant patterns and best practices
4. Summarize findings clearly
Be thorough but concise.`,
        temperature: 0.4,
        maxTokens: 1500,
    },
    tester: {
        id: 'tester',
        name: 'Tester',
        description: 'Creates tests and validates implementations',
        expertise: ['testing', 'validation', 'edge cases'],
        tools: ['vitest', 'playwright'],
        systemPrompt: `You are a QA engineer. Your role is to:
1. Design comprehensive test cases
2. Identify edge cases and failure scenarios
3. Validate implementation correctness
4. Suggest test improvements
Focus on both happy path and error scenarios.`,
        temperature: 0.2,
        maxTokens: 1500,
    },
};

/**
 * Group chat configuration
 */
export interface GroupChatConfig {
    maxTurns: number;
    turnTimeout: number;
    requireConsensus: boolean;
    moderatorModel?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: GroupChatConfig = {
    maxTurns: 10,
    turnTimeout: 30000,
    requireConsensus: false,
};

/**
 * Multi-Agent Group Chat Orchestrator
 */
export class GroupChat {
    private config: GroupChatConfig;
    private llmClient: AgentLLM;
    private conversation: GroupConversation;
    private participants: AgentRole[];

    constructor(
        llmClient: AgentLLM,
        participants: AgentRole[],
        topic: string,
        config: Partial<GroupChatConfig> = {}
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.llmClient = llmClient;
        this.participants = participants;
        this.conversation = {
            id: `group-${Date.now()}`,
            topic,
            participants,
            messages: [],
            status: 'active',
            metadata: {
                startedAt: Date.now(),
                turnCount: 0,
                maxTurns: this.config.maxTurns,
            },
        };
    }

    /**
     * Start the group conversation
     */
    async start(): Promise<GroupConversation> {
        logger.info('Starting group chat', {
            topic: this.conversation.topic,
            participants: this.participants.map((p) => p.name),
        });

        // Initial prompt to all agents
        const initialPrompt = this.buildInitialPrompt();
        this.addMessage('system', 'Moderator', initialPrompt);

        // Run conversation turns
        while (
            this.conversation.status === 'active' &&
            this.conversation.metadata.turnCount < this.config.maxTurns
        ) {
            // Select next speaker
            const nextSpeaker = await this.selectNextSpeaker();
            if (!nextSpeaker) {
                break;
            }

            // Get agent's response
            const response = await this.getAgentResponse(nextSpeaker);
            this.addMessage(nextSpeaker.id, nextSpeaker.name, response);

            this.conversation.metadata.turnCount++;

            // Check for conclusion
            if (this.checkForConclusion(response)) {
                break;
            }
        }

        // Generate final summary
        this.conversation.conclusion = await this.generateConclusion();
        this.conversation.status = 'concluded';
        this.conversation.metadata.endedAt = Date.now();

        logger.info('Group chat concluded', {
            id: this.conversation.id,
            turns: this.conversation.metadata.turnCount,
        });

        return this.conversation;
    }

    /**
     * Build initial conversation prompt
     */
    private buildInitialPrompt(): string {
        const participantList = this.participants
            .map((p) => `- ${p.name}: ${p.description}`)
            .join('\n');

        return `You are participating in a collaborative discussion.

Topic: ${this.conversation.topic}

Participants:
${participantList}

Rules:
1. Focus on your area of expertise
2. Build on others' contributions
3. Be concise and actionable
4. If you agree with a conclusion, say "I agree with this approach"
5. If you have concerns, explain them briefly

Let's begin the discussion.`;
    }

    /**
     * Select next speaker based on conversation flow
     */
    private async selectNextSpeaker(): Promise<AgentRole | null> {
        // Simple round-robin with some intelligence
        const lastSpeakers = this.conversation.messages
            .slice(-3)
            .map((m) => m.agentId)
            .filter((id) => id !== 'system');

        // Find agents who haven't spoken recently
        const candidates = this.participants.filter(
            (p) => !lastSpeakers.includes(p.id)
        );

        if (candidates.length === 0) {
            // All have spoken, restart cycle
            return this.participants[0];
        }

        // Use LLM to pick the most relevant next speaker
        const lastMessage = this.conversation.messages[this.conversation.messages.length - 1];

        const prompt = `Given the last message in a discussion:
"${lastMessage.content.substring(0, 200)}..."

Which expert should respond next?
${candidates.map((c) => `- ${c.name}: ${c.expertise.join(', ')}`).join('\n')}

Reply with just the expert name.`;

        try {
            const response = await this.llmClient.chat({
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 50,
                temperature: 0.1,
            });

            const selectedName = response.content.trim();
            const selected = candidates.find(
                (c) => c.name.toLowerCase() === selectedName.toLowerCase()
            );

            return selected || candidates[0];
        } catch {
            return candidates[0];
        }
    }

    /**
     * Get response from an agent
     */
    private async getAgentResponse(agent: AgentRole): Promise<string> {
        const conversationContext = this.conversation.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n\n');

        const prompt = `${conversationContext}

You are ${agent.name}. Respond based on your expertise in: ${agent.expertise.join(', ')}

Your response:`;

        try {
            const response = await this.llmClient.chat({
                messages: [
                    { role: 'system', content: agent.systemPrompt },
                    { role: 'user', content: prompt },
                ],
                maxTokens: agent.maxTokens,
                temperature: agent.temperature,
            });

            return response.content;
        } catch (error) {
            logger.error('Agent response failed', {
                agent: agent.name,
                error,
            });
            return `[${agent.name} could not respond]`;
        }
    }

    /**
     * Add message to conversation
     */
    private addMessage(agentId: string, role: string, content: string): void {
        this.conversation.messages.push({
            agentId,
            role,
            content,
            timestamp: Date.now(),
        });
    }

    /**
     * Check if conversation has reached conclusion
     */
    private checkForConclusion(response: string): boolean {
        const conclusionPhrases = [
            'i agree with this approach',
            'we have consensus',
            'the solution is complete',
            'this concludes our discussion',
            'all points have been addressed',
        ];

        const lower = response.toLowerCase();
        return conclusionPhrases.some((phrase) => lower.includes(phrase));
    }

    /**
     * Generate final conclusion from the discussion
     */
    private async generateConclusion(): Promise<string> {
        const discussionSummary = this.conversation.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n\n');

        const prompt = `Summarize the key decisions and action items from this discussion:

${discussionSummary}

Provide:
1. Key decisions made
2. Action items (if any)
3. Open questions (if any)`;

        try {
            const response = await this.llmClient.chat({
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 1000,
                temperature: 0.2,
            });

            return response.content;
        } catch {
            return 'Discussion concluded. See messages for details.';
        }
    }

    /**
     * Get conversation history
     */
    getConversation(): GroupConversation {
        return { ...this.conversation };
    }

    /**
     * Get messages
     */
    getMessages(): AgentMessage[] {
        return [...this.conversation.messages];
    }

    /**
     * Terminate conversation early
     */
    terminate(reason: string): void {
        this.conversation.status = 'terminated';
        this.conversation.conclusion = `Terminated: ${reason}`;
        this.conversation.metadata.endedAt = Date.now();
    }
}

/**
 * Create a group chat with predefined roles
 */
export function createGroupChat(
    llmClient: AgentLLM,
    topic: string,
    roleIds: string[],
    config?: Partial<GroupChatConfig>
): GroupChat {
    const participants = roleIds
        .map((id) => AGENT_ROLES[id])
        .filter((role): role is AgentRole => !!role);

    if (participants.length === 0) {
        throw new Error('No valid roles specified');
    }

    return new GroupChat(llmClient, participants, topic, config);
}

/**
 * Create a code review group
 */
export function createCodeReviewGroup(
    llmClient: AgentLLM,
    codeToReview: string,
    config?: Partial<GroupChatConfig>
): GroupChat {
    return createGroupChat(
        llmClient,
        `Review this code:\n\`\`\`\n${codeToReview}\n\`\`\``,
        ['coder', 'reviewer', 'tester'],
        config
    );
}

/**
 * Create a planning group
 */
export function createPlanningGroup(
    llmClient: AgentLLM,
    goal: string,
    config?: Partial<GroupChatConfig>
): GroupChat {
    return createGroupChat(
        llmClient,
        `Plan how to: ${goal}`,
        ['planner', 'researcher', 'coder'],
        config
    );
}
