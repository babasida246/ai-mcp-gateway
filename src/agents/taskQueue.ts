/**
 * Task Decomposition Engine
 * Breaks complex goals into subtasks using BabyAGI pattern
 *
 * Inspired by BabyAGI: Task-driven autonomous agent
 * - Decomposes goals into prioritized subtasks
 * - Executes tasks in order
 * - Re-evaluates and reprioritizes dynamically
 */

import { logger } from '../logging/logger.js';
import type { Task } from './types.js';
import type { AgentLLM } from './react.js';

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
    maxTasks: number;
    maxRetries: number;
    autoDecompose: boolean;
    priorityDecay: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TaskQueueConfig = {
    maxTasks: 50,
    maxRetries: 3,
    autoDecompose: true,
    priorityDecay: 0.1,
};

/**
 * Task Decomposition Engine
 */
export class TaskDecomposer {
    private config: TaskQueueConfig;
    private llmClient: AgentLLM;
    private tasks: Map<string, Task> = new Map();
    private completedTasks: Task[] = [];
    private goalContext: string = '';

    constructor(llmClient: AgentLLM, config: Partial<TaskQueueConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.llmClient = llmClient;
    }

    /**
     * System prompt for task decomposition
     */
    private getDecompositionPrompt(): string {
        return `You are a task decomposition expert. Your job is to break down complex goals into smaller, actionable subtasks.

Rules:
1. Each subtask should be atomic and independently executable
2. Subtasks should be in logical order (dependencies first)
3. Estimate complexity: low (<5 min), medium (5-15 min), high (>15 min)
4. Be specific and actionable

Output format (JSON array):
[
  {
    "title": "Brief task title",
    "description": "Detailed description of what to do",
    "estimatedComplexity": "low|medium|high",
    "dependencies": ["task_id"] // IDs of tasks that must complete first
  }
]`;
    }

    /**
     * Decompose a goal into subtasks
     */
    async decompose(goal: string, context?: string): Promise<Task[]> {
        this.goalContext = goal;
        const contextInfo = context ? `\nContext: ${context}` : '';

        const response = await this.llmClient.chat({
            messages: [
                { role: 'system', content: this.getDecompositionPrompt() },
                { role: 'user', content: `Goal: ${goal}${contextInfo}\n\nDecompose this into subtasks:` },
            ],
            maxTokens: 2000,
            temperature: 0.3,
        });

        // Parse response
        const subtasks = this.parseTaskList(response.content);

        // Create task objects
        const createdTasks: Task[] = [];
        for (let i = 0; i < subtasks.length; i++) {
            const subtask = subtasks[i];
            const task = this.createTask(
                subtask.title,
                subtask.description,
                subtask.estimatedComplexity || 'medium',
                subtask.dependencies || []
            );
            task.priority = subtasks.length - i; // First tasks have higher priority
            createdTasks.push(task);
        }

        logger.info('Goal decomposed into tasks', {
            goal: goal.substring(0, 50),
            taskCount: createdTasks.length,
        });

        return createdTasks;
    }

    /**
     * Parse task list from LLM response
     */
    private parseTaskList(response: string): Array<{
        title: string;
        description: string;
        estimatedComplexity?: 'low' | 'medium' | 'high';
        dependencies?: string[];
    }> {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch {
            logger.warn('Failed to parse task list, using fallback');
        }

        // Fallback: parse numbered list
        const tasks: Array<{ title: string; description: string }> = [];
        const lines = response.split('\n');
        let currentTask: { title: string; description: string } | null = null;

        for (const line of lines) {
            const numbered = line.match(/^\d+\.\s*(.+)/);
            if (numbered) {
                if (currentTask) tasks.push(currentTask);
                currentTask = { title: numbered[1], description: numbered[1] };
            } else if (currentTask && line.trim()) {
                currentTask.description += ' ' + line.trim();
            }
        }
        if (currentTask) tasks.push(currentTask);

        return tasks;
    }

    /**
     * Create a new task
     */
    createTask(
        title: string,
        description: string,
        complexity: 'low' | 'medium' | 'high' = 'medium',
        dependencies: string[] = [],
        parentId?: string
    ): Task {
        const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        const task: Task = {
            id,
            parentId,
            title,
            description,
            status: 'pending',
            priority: 5,
            dependencies,
            subtasks: [],
            metadata: {
                createdAt: Date.now(),
                estimatedComplexity: complexity,
                retryCount: 0,
                maxRetries: this.config.maxRetries,
            },
        };

        this.tasks.set(id, task);

        // Update parent's subtasks
        if (parentId) {
            const parent = this.tasks.get(parentId);
            if (parent) {
                parent.subtasks.push(id);
            }
        }

        return task;
    }

    /**
     * Get next task to execute
     */
    getNextTask(): Task | null {
        const pending = Array.from(this.tasks.values())
            .filter((t) => t.status === 'pending')
            .filter((t) => this.areDependenciesMet(t))
            .sort((a, b) => b.priority - a.priority);

        return pending[0] || null;
    }

    /**
     * Check if all dependencies are completed
     */
    private areDependenciesMet(task: Task): boolean {
        for (const depId of task.dependencies) {
            const dep = this.tasks.get(depId);
            if (!dep || dep.status !== 'completed') {
                return false;
            }
        }
        return true;
    }

    /**
     * Start a task
     */
    startTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        if (!this.areDependenciesMet(task)) {
            task.status = 'blocked';
            return false;
        }

        task.status = 'in-progress';
        task.metadata.startedAt = Date.now();

        logger.debug('Task started', { taskId, title: task.title });
        return true;
    }

    /**
     * Complete a task
     */
    completeTask(taskId: string, result?: unknown): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        task.status = 'completed';
        task.result = result;
        task.metadata.completedAt = Date.now();

        this.completedTasks.push(task);
        this.tasks.delete(taskId);

        // Check if any blocked tasks can now proceed
        for (const t of this.tasks.values()) {
            if (t.status === 'blocked' && this.areDependenciesMet(t)) {
                t.status = 'pending';
            }
        }

        logger.info('Task completed', {
            taskId,
            title: task.title,
            duration: task.metadata.completedAt - (task.metadata.startedAt || task.metadata.createdAt),
        });

        return true;
    }

    /**
     * Fail a task
     */
    failTask(taskId: string, error: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        task.metadata.retryCount++;

        if (task.metadata.retryCount < task.metadata.maxRetries) {
            // Retry
            task.status = 'pending';
            logger.warn('Task failed, will retry', {
                taskId,
                retryCount: task.metadata.retryCount,
                error,
            });
            return true;
        }

        // Final failure
        task.status = 'failed';
        task.error = error;

        // Mark dependent tasks as blocked
        for (const t of this.tasks.values()) {
            if (t.dependencies.includes(taskId)) {
                t.status = 'blocked';
            }
        }

        logger.error('Task failed permanently', { taskId, title: task.title, error });
        return false;
    }

    /**
     * Reprioritize tasks based on context
     */
    async reprioritize(context: string): Promise<void> {
        const pendingTasks = Array.from(this.tasks.values())
            .filter((t) => t.status === 'pending');

        if (pendingTasks.length === 0) return;

        const prompt = `Given the current context and these pending tasks, reprioritize them.
Context: ${context}

Tasks:
${pendingTasks.map((t) => `- ${t.id}: ${t.title}`).join('\n')}

Return JSON array of task IDs in order of priority (highest first):
["task-id-1", "task-id-2", ...]`;

        const response = await this.llmClient.chat({
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 500,
            temperature: 0.2,
        });

        try {
            const match = response.content.match(/\[[\s\S]*\]/);
            if (match) {
                const orderedIds: string[] = JSON.parse(match[0]);

                // Update priorities
                orderedIds.forEach((id, index) => {
                    const task = this.tasks.get(id);
                    if (task) {
                        task.priority = orderedIds.length - index;
                    }
                });

                logger.info('Tasks reprioritized', { taskCount: orderedIds.length });
            }
        } catch {
            logger.warn('Failed to reprioritize tasks');
        }
    }

    /**
     * Add a subtask to an existing task
     */
    async addSubtask(
        parentId: string,
        title: string,
        description: string
    ): Promise<Task | null> {
        const parent = this.tasks.get(parentId);
        if (!parent) return null;

        const subtask = this.createTask(title, description, 'low', [], parentId);

        // Inherit priority from parent
        subtask.priority = parent.priority - 0.1;

        return subtask;
    }

    /**
     * Get task by ID
     */
    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * Get all tasks
     */
    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    /**
     * Get completed tasks
     */
    getCompletedTasks(): Task[] {
        return [...this.completedTasks];
    }

    /**
     * Get progress summary
     */
    getProgress(): {
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
        failed: number;
        blocked: number;
    } {
        const tasks = Array.from(this.tasks.values());
        return {
            total: tasks.length + this.completedTasks.length,
            pending: tasks.filter((t) => t.status === 'pending').length,
            inProgress: tasks.filter((t) => t.status === 'in-progress').length,
            completed: this.completedTasks.length,
            failed: tasks.filter((t) => t.status === 'failed').length,
            blocked: tasks.filter((t) => t.status === 'blocked').length,
        };
    }

    /**
     * Clear all tasks
     */
    clear(): void {
        this.tasks.clear();
        this.completedTasks = [];
        this.goalContext = '';
    }
}

/**
 * Create a task decomposer
 */
export function createTaskDecomposer(
    llmClient: AgentLLM,
    config?: Partial<TaskQueueConfig>
): TaskDecomposer {
    return new TaskDecomposer(llmClient, config);
}
