import { ContextSummary } from '../context/manager.js';

/**
 * Handoff package structure for inter-layer communication
 */
export interface HandoffPackage {
    contextSummary: string;
    currentTask: string;
    attemptsSoFar: AttemptInfo[];
    knownIssues: string[];
    openQuestions: string[];
    requestToHigherLayer: string;
    relevantFiles?: string[];
    testResults?: TestResult[];
}

/**
 * Attempt information
 */
interface AttemptInfo {
    layer: string;
    model: string;
    approach: string;
    result: string;
    success: boolean;
}

/**
 * Test result information
 */
interface TestResult {
    testType: string;
    passed: number;
    failed: number;
    errorLog?: string;
}

/**
 * Handoff Package Builder
 * Creates optimized packages for escalation between layers
 */
export class HandoffBuilder {
    private package: Partial<HandoffPackage> = {};

    /**
     * Set context summary
     */
    withContextSummary(summary: ContextSummary): this {
        const lines: string[] = [];

        lines.push('## Project Context');
        if (summary.stack && summary.stack.length > 0) {
            lines.push(`**Stack:** ${summary.stack.join(', ')}`);
        }
        if (summary.architecture) {
            lines.push(`**Architecture:** ${summary.architecture}`);
        }
        if (summary.modules && summary.modules.length > 0) {
            lines.push(`**Modules:** ${summary.modules.join(', ')}`);
        }
        if (summary.mainFiles && summary.mainFiles.length > 0) {
            lines.push(`**Main Files:** ${summary.mainFiles.join(', ')}`);
        }
        if (summary.decisions && summary.decisions.length > 0) {
            lines.push('\n**Key Decisions:**');
            summary.decisions.forEach((d) => lines.push(`- ${d}`));
        }

        this.package.contextSummary = lines.join('\n');
        return this;
    }

    /**
     * Set current task
     */
    withCurrentTask(
        task: string,
        relevantFiles?: string[],
        relatedFunctions?: string[]
    ): this {
        const lines: string[] = [];
        lines.push('## Current Task');
        lines.push(task);

        if (relevantFiles && relevantFiles.length > 0) {
            lines.push('\n**Relevant Files:**');
            relevantFiles.forEach((f) => lines.push(`- ${f}`));
        }

        if (relatedFunctions && relatedFunctions.length > 0) {
            lines.push('\n**Related Functions/Modules:**');
            relatedFunctions.forEach((f) => lines.push(`- ${f}`));
        }

        this.package.currentTask = lines.join('\n');
        this.package.relevantFiles = relevantFiles;
        return this;
    }

    /**
     * Add attempt information
     */
    addAttempt(
        layer: string,
        model: string,
        approach: string,
        result: string,
        success: boolean
    ): this {
        if (!this.package.attemptsSoFar) {
            this.package.attemptsSoFar = [];
        }

        this.package.attemptsSoFar.push({
            layer,
            model,
            approach,
            result: this.truncateText(result, 500),
            success,
        });

        return this;
    }

    /**
     * Add known issues
     */
    withKnownIssues(issues: string[]): this {
        this.package.knownIssues = issues;
        return this;
    }

    /**
     * Add open questions
     */
    withOpenQuestions(questions: string[]): this {
        this.package.openQuestions = questions;
        return this;
    }

    /**
     * Set request to higher layer
     */
    withRequest(request: string): this {
        this.package.requestToHigherLayer = request;
        return this;
    }

    /**
     * Add test results
     */
    withTestResults(results: TestResult[]): this {
        this.package.testResults = results;
        return this;
    }

    /**
     * Build the handoff package as formatted text
     */
    build(): string {
        const sections: string[] = [];

        // Context Summary
        if (this.package.contextSummary) {
            sections.push('[CONTEXT-SUMMARY]');
            sections.push(this.package.contextSummary);
            sections.push('');
        }

        // Current Task
        if (this.package.currentTask) {
            sections.push('[CURRENT-TASK]');
            sections.push(this.package.currentTask);
            sections.push('');
        }

        // Attempts So Far
        if (
            this.package.attemptsSoFar &&
            this.package.attemptsSoFar.length > 0
        ) {
            sections.push('[ATTEMPTS-SO-FAR]');
            this.package.attemptsSoFar.forEach((attempt, idx) => {
                sections.push(
                    `\n### Attempt ${idx + 1} (${attempt.layer} - ${attempt.model})`
                );
                sections.push(`**Approach:** ${attempt.approach}`);
                sections.push(
                    `**Result:** ${attempt.result.substring(0, 300)}...`
                );
                sections.push(`**Success:** ${attempt.success ? '✓' : '✗'}`);
            });
            sections.push('');
        }

        // Test Results
        if (this.package.testResults && this.package.testResults.length > 0) {
            sections.push('[TEST-RESULTS]');
            this.package.testResults.forEach((test) => {
                sections.push(
                    `- ${test.testType}: ${test.passed} passed, ${test.failed} failed`
                );
                if (test.errorLog) {
                    sections.push(
                        `  Error: ${this.truncateText(test.errorLog, 200)}`
                    );
                }
            });
            sections.push('');
        }

        // Known Issues
        if (this.package.knownIssues && this.package.knownIssues.length > 0) {
            sections.push('[KNOWN-ISSUES-AND-OPEN-QUESTIONS]');
            sections.push('**Known Issues:**');
            this.package.knownIssues.forEach((issue) =>
                sections.push(`- ${issue}`)
            );
            sections.push('');
        }

        // Open Questions
        if (
            this.package.openQuestions &&
            this.package.openQuestions.length > 0
        ) {
            sections.push('**Open Questions:**');
            this.package.openQuestions.forEach((q) => sections.push(`- ${q}`));
            sections.push('');
        }

        // Request
        if (this.package.requestToHigherLayer) {
            sections.push('[WHAT-I-WANT-FROM-HIGHER-LAYER]');
            sections.push(this.package.requestToHigherLayer);
        }

        return sections.join('\n');
    }

    /**
     * Build as JSON object
     */
    buildJSON(): HandoffPackage {
        return this.package as HandoffPackage;
    }

    /**
     * Truncate text to specified length
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

/**
 * Create a new handoff builder
 */
export function createHandoffPackage(): HandoffBuilder {
    return new HandoffBuilder();
}
