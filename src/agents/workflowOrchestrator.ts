/**
 * Workflow Orchestrator Agent
 * Coordinates complex multi-step workflows and integrates
 * with external systems like n8n.
 *
 * Features:
 * - Workflow definition and execution
 * - Step sequencing and parallel execution
 * - Conditional branching
 * - n8n webhook integration
 * - Event-driven triggers
 * - State management
 * - Error handling and retry logic
 */

import type { AgentLLM } from './react.js';
import { logger } from '../logging/logger.js';

export interface WorkflowStep {
    id: string;
    name: string;
    type: 'agent' | 'http' | 'transform' | 'condition' | 'wait';
    config: Record<string, unknown>;
    dependsOn?: string[];
    retryConfig?: {
        maxRetries: number;
        backoffMs: number;
    };
}

export interface WorkflowDefinition {
    id: string;
    name: string;
    description?: string;
    steps: WorkflowStep[];
    triggers?: WorkflowTrigger[];
    variables?: Record<string, unknown>;
}

export interface WorkflowTrigger {
    type: 'webhook' | 'schedule' | 'event';
    config: Record<string, unknown>;
}

export interface WorkflowExecution {
    id: string;
    workflowId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: number;
    completedAt?: number;
    stepResults: Record<string, StepResult>;
    variables: Record<string, unknown>;
    error?: string;
}

export interface StepResult {
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: number;
    completedAt?: number;
    output?: unknown;
    error?: string;
}

export interface N8nWebhook {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    authentication?: {
        type: 'basic' | 'bearer' | 'api-key';
        credentials: Record<string, string>;
    };
}

/**
 * Workflow Orchestrator Agent
 * Manages complex multi-step workflows
 */
export class WorkflowOrchestrator {
    private llm: AgentLLM;
    private workflows: Map<string, WorkflowDefinition> = new Map();
    private executions: Map<string, WorkflowExecution> = new Map();
    private webhooks: Map<string, N8nWebhook> = new Map();

    constructor(llm: AgentLLM) {
        this.llm = llm;
    }

    /**
     * Register a workflow definition
     */
    registerWorkflow(workflow: WorkflowDefinition): void {
        this.workflows.set(workflow.id, workflow);
        logger.info('Registered workflow', { id: workflow.id, name: workflow.name });
    }

    /**
     * Get a registered workflow
     */
    getWorkflow(workflowId: string): WorkflowDefinition | undefined {
        return this.workflows.get(workflowId);
    }

    /**
     * List all registered workflows
     */
    listWorkflows(): WorkflowDefinition[] {
        return Array.from(this.workflows.values());
    }

    /**
     * Register an n8n webhook endpoint
     */
    registerWebhook(name: string, webhook: N8nWebhook): void {
        this.webhooks.set(name, webhook);
        logger.info('Registered n8n webhook', { name, url: webhook.url });
    }

    /**
     * Execute a workflow
     */
    async executeWorkflow(
        workflowId: string,
        input: Record<string, unknown> = {}
    ): Promise<WorkflowExecution> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const execution: WorkflowExecution = {
            id: executionId,
            workflowId,
            status: 'running',
            startedAt: Date.now(),
            stepResults: {},
            variables: { ...workflow.variables, ...input },
        };

        this.executions.set(executionId, execution);
        logger.info('Starting workflow execution', { executionId, workflowId });

        try {
            // Sort steps by dependencies
            const sortedSteps = this.topologicalSort(workflow.steps);

            // Execute steps
            for (const step of sortedSteps) {
                // Check if dependencies are met
                if (step.dependsOn) {
                    const canExecute = step.dependsOn.every(
                        (depId) => execution.stepResults[depId]?.status === 'completed'
                    );
                    if (!canExecute) {
                        execution.stepResults[step.id] = {
                            stepId: step.id,
                            status: 'skipped',
                            error: 'Dependencies not met',
                        };
                        continue;
                    }
                }

                // Execute step
                const result = await this.executeStep(step, execution);
                execution.stepResults[step.id] = result;

                // Check for failure
                if (result.status === 'failed' && !step.retryConfig) {
                    execution.status = 'failed';
                    execution.error = result.error;
                    break;
                }
            }

            if (execution.status !== 'failed') {
                execution.status = 'completed';
            }
        } catch (error) {
            execution.status = 'failed';
            execution.error = error instanceof Error ? error.message : 'Unknown error';
        }

        execution.completedAt = Date.now();
        return execution;
    }

    /**
     * Execute a single step
     */
    private async executeStep(step: WorkflowStep, execution: WorkflowExecution): Promise<StepResult> {
        const result: StepResult = {
            stepId: step.id,
            status: 'running',
            startedAt: Date.now(),
        };

        let retries = 0;
        const maxRetries = step.retryConfig?.maxRetries || 0;

        while (retries <= maxRetries) {
            try {
                switch (step.type) {
                    case 'agent':
                        result.output = await this.executeAgentStep(step, execution);
                        break;
                    case 'http':
                        result.output = await this.executeHttpStep(step, execution);
                        break;
                    case 'transform':
                        result.output = await this.executeTransformStep(step, execution);
                        break;
                    case 'condition':
                        result.output = await this.executeConditionStep(step, execution);
                        break;
                    case 'wait':
                        await this.executeWaitStep(step);
                        result.output = { waited: true };
                        break;
                }

                result.status = 'completed';
                result.completedAt = Date.now();
                return result;
            } catch (error) {
                retries++;
                if (retries > maxRetries) {
                    result.status = 'failed';
                    result.error = error instanceof Error ? error.message : 'Step execution failed';
                    result.completedAt = Date.now();
                    return result;
                }

                // Wait before retry
                const backoffMs = step.retryConfig?.backoffMs || 1000;
                await new Promise((resolve) => setTimeout(resolve, backoffMs * retries));
            }
        }

        return result;
    }

    /**
     * Execute an agent step
     */
    private async executeAgentStep(
        step: WorkflowStep,
        execution: WorkflowExecution
    ): Promise<unknown> {
        const prompt = this.interpolateVariables(
            step.config.prompt as string,
            execution.variables
        );

        const response = await this.llm.chat({
            messages: [
                { role: 'system', content: (step.config.systemPrompt as string) || 'You are a helpful assistant.' },
                { role: 'user', content: prompt },
            ],
            maxTokens: (step.config.maxTokens as number) || 1000,
            temperature: (step.config.temperature as number) || 0.3,
        });

        // Store output in variables
        if (step.config.outputVariable) {
            execution.variables[step.config.outputVariable as string] = response.content;
        }

        return response.content;
    }

    /**
     * Execute an HTTP step (for n8n webhooks)
     */
    private async executeHttpStep(
        step: WorkflowStep,
        execution: WorkflowExecution
    ): Promise<unknown> {
        const url = this.interpolateVariables(
            step.config.url as string,
            execution.variables
        );

        const body = step.config.body
            ? JSON.parse(
                this.interpolateVariables(
                    JSON.stringify(step.config.body),
                    execution.variables
                )
            )
            : undefined;

        // Get webhook config if named
        const webhookConfig = step.config.webhookName
            ? this.webhooks.get(step.config.webhookName as string)
            : null;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(webhookConfig?.headers || {}),
            ...(step.config.headers as Record<string, string>) || {},
        };

        // Add authentication
        if (webhookConfig?.authentication) {
            switch (webhookConfig.authentication.type) {
                case 'bearer':
                    headers['Authorization'] = `Bearer ${webhookConfig.authentication.credentials.token}`;
                    break;
                case 'api-key':
                    headers[webhookConfig.authentication.credentials.headerName || 'X-API-Key'] =
                        webhookConfig.authentication.credentials.key;
                    break;
            }
        }

        const response = await fetch(url, {
            method: (step.config.method as string) || 'POST',
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        const responseData = await response.json().catch(() => response.text());

        if (step.config.outputVariable) {
            execution.variables[step.config.outputVariable as string] = responseData;
        }

        return responseData;
    }

    /**
     * Execute a transform step
     */
    private async executeTransformStep(
        step: WorkflowStep,
        execution: WorkflowExecution
    ): Promise<unknown> {
        const inputData = step.config.input
            ? execution.variables[step.config.input as string]
            : execution.variables;

        const transformType = step.config.transformType as string;

        let output: unknown;

        switch (transformType) {
            case 'json-parse':
                output = typeof inputData === 'string' ? JSON.parse(inputData) : inputData;
                break;
            case 'json-stringify':
                output = JSON.stringify(inputData, null, 2);
                break;
            case 'extract':
                output = this.extractPath(inputData, step.config.path as string);
                break;
            case 'merge':
                const sources = (step.config.sources as string[]).map((s) => execution.variables[s]);
                output = Object.assign({}, ...sources);
                break;
            case 'template':
                output = this.interpolateVariables(
                    step.config.template as string,
                    execution.variables
                );
                break;
            default:
                output = inputData;
        }

        if (step.config.outputVariable) {
            execution.variables[step.config.outputVariable as string] = output;
        }

        return output;
    }

    /**
     * Execute a condition step
     */
    private async executeConditionStep(
        step: WorkflowStep,
        execution: WorkflowExecution
    ): Promise<boolean> {
        const value = execution.variables[step.config.variable as string];
        const operator = step.config.operator as string;
        const compareValue = step.config.value;

        let result = false;

        switch (operator) {
            case 'equals':
                result = value === compareValue;
                break;
            case 'notEquals':
                result = value !== compareValue;
                break;
            case 'contains':
                result = String(value).includes(String(compareValue));
                break;
            case 'greaterThan':
                result = Number(value) > Number(compareValue);
                break;
            case 'lessThan':
                result = Number(value) < Number(compareValue);
                break;
            case 'exists':
                result = value !== null && value !== undefined;
                break;
            case 'truthy':
                result = Boolean(value);
                break;
        }

        if (step.config.outputVariable) {
            execution.variables[step.config.outputVariable as string] = result;
        }

        return result;
    }

    /**
     * Execute a wait step
     */
    private async executeWaitStep(step: WorkflowStep): Promise<void> {
        const duration = (step.config.duration as number) || 1000;
        await new Promise((resolve) => setTimeout(resolve, duration));
    }

    /**
     * Call an n8n webhook
     */
    async callN8nWebhook(
        webhookName: string,
        data: Record<string, unknown>
    ): Promise<unknown> {
        const webhook = this.webhooks.get(webhookName);
        if (!webhook) {
            throw new Error(`Webhook not found: ${webhookName}`);
        }

        logger.info('Calling n8n webhook', { webhookName, url: webhook.url });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...webhook.headers,
        };

        if (webhook.authentication) {
            switch (webhook.authentication.type) {
                case 'bearer':
                    headers['Authorization'] = `Bearer ${webhook.authentication.credentials.token}`;
                    break;
                case 'api-key':
                    headers[webhook.authentication.credentials.headerName || 'X-API-Key'] =
                        webhook.authentication.credentials.key;
                    break;
                case 'basic':
                    const auth = Buffer.from(
                        `${webhook.authentication.credentials.username}:${webhook.authentication.credentials.password}`
                    ).toString('base64');
                    headers['Authorization'] = `Basic ${auth}`;
                    break;
            }
        }

        const response = await fetch(webhook.url, {
            method: webhook.method,
            headers,
            body: JSON.stringify(data),
        });

        return response.json().catch(() => response.text());
    }

    /**
     * Generate a workflow from natural language description
     */
    async generateWorkflow(description: string): Promise<WorkflowDefinition> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a workflow designer. Create a workflow definition from the description.
Return JSON: {
  "id": "unique_id",
  "name": "workflow name",
  "description": "what it does",
  "steps": [
    {"id": "step1", "name": "Step Name", "type": "agent|http|transform|condition|wait", "config": {...}, "dependsOn": ["prev_step_id"]}
  ],
  "variables": {}
}
Step types:
- agent: LLM call with {prompt, systemPrompt, outputVariable}
- http: HTTP request with {url, method, body, outputVariable}
- transform: Data transform with {transformType: json-parse|extract|merge|template, ...}
- condition: Check condition with {variable, operator, value, outputVariable}
- wait: Delay with {duration}`,
                },
                {
                    role: 'user',
                    content: `Create a workflow for: ${description}`,
                },
            ],
            maxTokens: 2000,
            temperature: 0.3,
        });

        try {
            const workflow = JSON.parse(response.content);
            return workflow;
        } catch {
            return {
                id: `wf_${Date.now()}`,
                name: 'Generated Workflow',
                description,
                steps: [],
            };
        }
    }

    /**
     * Get execution status
     */
    getExecution(executionId: string): WorkflowExecution | undefined {
        return this.executions.get(executionId);
    }

    /**
     * List recent executions
     */
    listExecutions(workflowId?: string): WorkflowExecution[] {
        const executions = Array.from(this.executions.values());
        if (workflowId) {
            return executions.filter((e) => e.workflowId === workflowId);
        }
        return executions.sort((a, b) => b.startedAt - a.startedAt).slice(0, 100);
    }

    // Helper methods

    private topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
        const sorted: WorkflowStep[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (step: WorkflowStep) => {
            if (visited.has(step.id)) return;
            if (visiting.has(step.id)) {
                throw new Error(`Circular dependency detected at step: ${step.id}`);
            }

            visiting.add(step.id);

            if (step.dependsOn) {
                for (const depId of step.dependsOn) {
                    const depStep = steps.find((s) => s.id === depId);
                    if (depStep) visit(depStep);
                }
            }

            visiting.delete(step.id);
            visited.add(step.id);
            sorted.push(step);
        };

        for (const step of steps) {
            visit(step);
        }

        return sorted;
    }

    private interpolateVariables(template: string, variables: Record<string, unknown>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = variables[key];
            return value !== undefined ? String(value) : `{{${key}}}`;
        });
    }

    private extractPath(obj: unknown, path: string): unknown {
        const parts = path.split('.');
        let current: unknown = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = (current as Record<string, unknown>)[part];
        }

        return current;
    }
}

export function createWorkflowOrchestrator(llm: AgentLLM) {
    return new WorkflowOrchestrator(llm);
}
