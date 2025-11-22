import { redisCache, CacheKeys } from '../cache/redis.js';
import { db } from '../db/postgres.js';
import { logger } from '../logging/logger.js';

/**
 * TODO item interface
 */
export interface TodoItem {
    id: number;
    title: string;
    description: string;
    status: 'not-started' | 'in-progress' | 'completed';
}

/**
 * TODO list manager with persistence
 */
export class TodoListManager {
    /**
     * Get TODO list for a conversation
     */
    async getTodoList(conversationId: string): Promise<TodoItem[]> {
        // Try Redis first (hot layer)
        const cached = await redisCache.get<TodoItem[]>(
            CacheKeys.todoList(conversationId)
        );

        if (cached) {
            logger.debug('TODO list loaded from Redis', { conversationId });
            return cached;
        }

        // Fallback to DB (cold layer)
        const result = await db.query<{
            todo_data: TodoItem[];
        }>(
            `SELECT todo_data FROM todo_lists 
             WHERE conversation_id = $1 
             ORDER BY updated_at DESC LIMIT 1`,
            [conversationId]
        );

        if (result && result.rows.length > 0) {
            const todos = result.rows[0].todo_data;
            // Cache in Redis
            await redisCache.set(
                CacheKeys.todoList(conversationId),
                todos,
                1800 // 30 minutes TTL
            );
            logger.debug('TODO list loaded from DB and cached', {
                conversationId,
            });
            return todos;
        }

        logger.debug('No TODO list found', { conversationId });
        return [];
    }

    /**
     * Save TODO list for a conversation
     */
    async saveTodoList(
        conversationId: string,
        todos: TodoItem[]
    ): Promise<void> {
        // Update Redis (hot layer)
        await redisCache.set(
            CacheKeys.todoList(conversationId),
            todos,
            1800 // 30 minutes TTL
        );

        // Update DB (cold layer)
        try {
            // Check if exists
            const exists = await db.query(
                `SELECT id FROM todo_lists WHERE conversation_id = $1`,
                [conversationId]
            );

            if (exists && exists.rows.length > 0) {
                // Update existing
                await db.update(
                    'todo_lists',
                    { conversation_id: conversationId },
                    {
                        todo_data: JSON.stringify(todos),
                        updated_at: new Date(),
                    }
                );
            } else {
                // Insert new
                await db.insert('todo_lists', {
                    conversation_id: conversationId,
                    todo_data: JSON.stringify(todos),
                });
            }

            logger.debug('TODO list saved', { conversationId, count: todos.length });
        } catch (error) {
            logger.error('Failed to save TODO list to DB', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    /**
     * Add a TODO item
     */
    async addTodo(
        conversationId: string,
        todo: Omit<TodoItem, 'id'>
    ): Promise<TodoItem[]> {
        const todos = await this.getTodoList(conversationId);
        const newId = todos.length > 0 ? Math.max(...todos.map((t) => t.id)) + 1 : 1;
        const newTodo: TodoItem = {
            id: newId,
            ...todo,
        };

        todos.push(newTodo);
        await this.saveTodoList(conversationId, todos);
        return todos;
    }

    /**
     * Update TODO item status
     */
    async updateTodoStatus(
        conversationId: string,
        todoId: number,
        status: TodoItem['status']
    ): Promise<TodoItem[]> {
        const todos = await this.getTodoList(conversationId);
        const todo = todos.find((t) => t.id === todoId);

        if (todo) {
            todo.status = status;
            await this.saveTodoList(conversationId, todos);
        }

        return todos;
    }

    /**
     * Generate TODO list from task description
     */
    generateTodoList(task: string): TodoItem[] {
        // Simple heuristic-based TODO generation
        const todos: TodoItem[] = [];

        // Check for common patterns
        const hasImplementation = /implement|create|build|add/i.test(task);
        const hasTesting = /test|verify|check/i.test(task);
        const hasDoc = /document|readme|docs/i.test(task);
        const hasRefactor = /refactor|improve|optimize/i.test(task);

        let id = 1;

        if (hasImplementation) {
            todos.push({
                id: id++,
                title: 'Analyze requirements',
                description: 'Understand the task and identify key components',
                status: 'not-started',
            });

            todos.push({
                id: id++,
                title: 'Design solution',
                description: 'Plan the implementation approach',
                status: 'not-started',
            });

            todos.push({
                id: id++,
                title: 'Implement core functionality',
                description: 'Write the main implementation code',
                status: 'not-started',
            });
        }

        if (hasRefactor) {
            todos.push({
                id: id++,
                title: 'Code refactoring',
                description: 'Improve code structure and quality',
                status: 'not-started',
            });
        }

        if (hasTesting) {
            todos.push({
                id: id++,
                title: 'Write tests',
                description: 'Create unit and integration tests',
                status: 'not-started',
            });

            todos.push({
                id: id++,
                title: 'Run tests',
                description: 'Execute tests and verify results',
                status: 'not-started',
            });
        }

        if (hasDoc) {
            todos.push({
                id: id++,
                title: 'Update documentation',
                description: 'Add/update README and code comments',
                status: 'not-started',
            });
        }

        // Always add review step
        todos.push({
            id: id++,
            title: 'Review and validate',
            description: 'Final review of all changes',
            status: 'not-started',
        });

        return todos;
    }

    /**
     * Format TODO list as markdown
     */
    formatTodoList(todos: TodoItem[]): string {
        const lines = ['## TODO List\n'];

        todos.forEach((todo) => {
            const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
            const statusIcon =
                todo.status === 'in-progress'
                    ? '🔄'
                    : todo.status === 'completed'
                        ? '✅'
                        : '⏳';

            lines.push(
                `${checkbox} ${statusIcon} **${todo.title}** (ID: ${todo.id})`
            );
            lines.push(`   ${todo.description}`);
            lines.push('');
        });

        return lines.join('\n');
    }
}

// Singleton instance
export const todoManager = new TodoListManager();
