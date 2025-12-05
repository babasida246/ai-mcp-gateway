/**
 * Code Analyzer Agent
 * Analyzes source code for quality, patterns, issues,
 * and provides improvement suggestions.
 *
 * Features:
 * - Code quality analysis
 * - Bug detection
 * - Security vulnerability scanning
 * - Performance analysis
 * - Refactoring suggestions
 * - Documentation generation
 * - n8n webhook compatible
 */

import type { AgentLLM } from './react.js';
import { logger } from '../logging/logger.js';

export interface CodeFile {
    path: string;
    content: string;
    language?: string;
}

export interface CodeIssue {
    type: 'bug' | 'security' | 'performance' | 'style' | 'maintainability';
    severity: 'critical' | 'high' | 'medium' | 'low';
    line?: number;
    message: string;
    suggestion?: string;
}

export interface CodeAnalysisResult {
    success: boolean;
    file: string;
    language: string;
    issues: CodeIssue[];
    qualityScore: number; // 0-100
    metrics: {
        complexity: 'low' | 'medium' | 'high';
        maintainability: 'poor' | 'fair' | 'good' | 'excellent';
        testability: 'poor' | 'fair' | 'good' | 'excellent';
    };
    summary: string;
    processingTime: number;
}

export interface RefactorSuggestion {
    original: string;
    refactored: string;
    explanation: string;
    impact: 'breaking' | 'safe';
}

export interface DocumentationResult {
    file: string;
    documentation: string;
    format: 'jsdoc' | 'tsdoc' | 'markdown';
}

/**
 * Code Analyzer Agent
 * Analyzes code quality and provides recommendations
 */
export class CodeAnalyzer {
    private llm: AgentLLM;

    constructor(llm: AgentLLM) {
        this.llm = llm;
    }

    /**
     * Detect programming language from file extension or content
     */
    private detectLanguage(file: CodeFile): string {
        if (file.language) return file.language;

        const ext = file.path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            py: 'python',
            rs: 'rust',
            go: 'go',
            java: 'java',
            cpp: 'cpp',
            c: 'c',
            cs: 'csharp',
            rb: 'ruby',
            php: 'php',
            swift: 'swift',
            kt: 'kotlin',
            sql: 'sql',
            sh: 'bash',
            yml: 'yaml',
            yaml: 'yaml',
            json: 'json',
            md: 'markdown',
        };

        return langMap[ext || ''] || 'unknown';
    }

    /**
     * Analyze code for issues and quality
     */
    async analyze(file: CodeFile): Promise<CodeAnalysisResult> {
        const startTime = Date.now();
        const language = this.detectLanguage(file);

        logger.info('Analyzing code', { path: file.path, language });

        const codeSnippet = file.content.slice(0, 8000);

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are an expert code reviewer for ${language}. Analyze the code thoroughly.
Return JSON: {
  "issues": [{"type": "bug|security|performance|style|maintainability", "severity": "critical|high|medium|low", "line": null, "message": "description", "suggestion": "how to fix"}],
  "qualityScore": 0-100,
  "metrics": {"complexity": "low|medium|high", "maintainability": "poor|fair|good|excellent", "testability": "poor|fair|good|excellent"},
  "summary": "brief overall assessment"
}`,
                },
                {
                    role: 'user',
                    content: `File: ${file.path}\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${codeSnippet}\n\`\`\``,
                },
            ],
            maxTokens: 2000,
            temperature: 0.1,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                success: true,
                file: file.path,
                language,
                issues: parsed.issues || [],
                qualityScore: parsed.qualityScore || 70,
                metrics: parsed.metrics || {
                    complexity: 'medium',
                    maintainability: 'fair',
                    testability: 'fair',
                },
                summary: parsed.summary || 'Analysis complete',
                processingTime: Date.now() - startTime,
            };
        } catch {
            return {
                success: false,
                file: file.path,
                language,
                issues: [],
                qualityScore: 0,
                metrics: {
                    complexity: 'medium',
                    maintainability: 'fair',
                    testability: 'fair',
                },
                summary: 'Failed to parse analysis results',
                processingTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Analyze multiple files and provide project-level insights
     */
    async analyzeProject(files: CodeFile[]): Promise<{
        success: boolean;
        results: CodeAnalysisResult[];
        projectSummary: {
            totalFiles: number;
            avgQualityScore: number;
            criticalIssues: number;
            topIssueTypes: Array<{ type: string; count: number }>;
            recommendations: string[];
        };
    }> {
        const results: CodeAnalysisResult[] = [];

        for (const file of files.slice(0, 20)) {
            const result = await this.analyze(file);
            results.push(result);
        }

        // Calculate aggregated metrics
        const totalQuality = results.reduce((sum, r) => sum + r.qualityScore, 0);
        const avgQualityScore = results.length > 0 ? Math.round(totalQuality / results.length) : 0;

        const allIssues = results.flatMap((r) => r.issues);
        const criticalIssues = allIssues.filter((i) => i.severity === 'critical').length;

        // Count issue types
        const issueTypeCounts: Record<string, number> = {};
        for (const issue of allIssues) {
            issueTypeCounts[issue.type] = (issueTypeCounts[issue.type] || 0) + 1;
        }
        const topIssueTypes = Object.entries(issueTypeCounts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Generate recommendations
        const recommendations = await this.generateRecommendations(results);

        return {
            success: true,
            results,
            projectSummary: {
                totalFiles: results.length,
                avgQualityScore,
                criticalIssues,
                topIssueTypes,
                recommendations,
            },
        };
    }

    /**
     * Generate project-level recommendations
     */
    private async generateRecommendations(results: CodeAnalysisResult[]): Promise<string[]> {
        const summaries = results.map((r) => `${r.file}: Score ${r.qualityScore}, Issues: ${r.issues.length}`);

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content:
                        'Based on code analysis results, provide actionable recommendations. Return JSON array of strings.',
                },
                {
                    role: 'user',
                    content: `Analysis results:\n${summaries.join('\n')}\n\nProvide 3-5 high-impact recommendations.`,
                },
            ],
            maxTokens: 500,
            temperature: 0.3,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return ['Review and address critical issues first', 'Add unit tests for low-testability files'];
        }
    }

    /**
     * Suggest refactoring for a code file
     */
    async suggestRefactoring(file: CodeFile): Promise<RefactorSuggestion[]> {
        const language = this.detectLanguage(file);
        const codeSnippet = file.content.slice(0, 6000);

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a refactoring expert. Suggest improvements for the code.
Return JSON array: [{"original": "code snippet", "refactored": "improved code", "explanation": "why", "impact": "safe|breaking"}]
Keep suggestions practical and focused on the most impactful changes.`,
                },
                {
                    role: 'user',
                    content: `File: ${file.path}\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${codeSnippet}\n\`\`\``,
                },
            ],
            maxTokens: 2500,
            temperature: 0.2,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return [];
        }
    }

    /**
     * Generate documentation for code
     */
    async generateDocumentation(
        file: CodeFile,
        format: 'jsdoc' | 'tsdoc' | 'markdown' = 'tsdoc'
    ): Promise<DocumentationResult> {
        const language = this.detectLanguage(file);
        const codeSnippet = file.content.slice(0, 6000);

        const formatInstructions: Record<string, string> = {
            jsdoc: 'Generate JSDoc comments for all functions and classes.',
            tsdoc: 'Generate TSDoc comments with proper @param, @returns, and @example tags.',
            markdown: 'Generate a markdown documentation file explaining the code structure and usage.',
        };

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a documentation expert. ${formatInstructions[format]}`,
                },
                {
                    role: 'user',
                    content: `File: ${file.path}\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${codeSnippet}\n\`\`\``,
                },
            ],
            maxTokens: 3000,
            temperature: 0.1,
        });

        return {
            file: file.path,
            documentation: response.content,
            format,
        };
    }

    /**
     * Quick security scan for common vulnerabilities
     */
    async securityScan(file: CodeFile): Promise<{
        file: string;
        vulnerabilities: CodeIssue[];
        riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    }> {
        const language = this.detectLanguage(file);
        const codeSnippet = file.content.slice(0, 8000);

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a security auditor. Scan the code for security vulnerabilities.
Return JSON: {
  "vulnerabilities": [{"type": "security", "severity": "critical|high|medium|low", "message": "description", "suggestion": "fix"}],
  "riskLevel": "none|low|medium|high|critical"
}
Focus on: SQL injection, XSS, CSRF, authentication issues, secrets exposure, path traversal, command injection.`,
                },
                {
                    role: 'user',
                    content: `File: ${file.path}\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${codeSnippet}\n\`\`\``,
                },
            ],
            maxTokens: 1500,
            temperature: 0.1,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                file: file.path,
                vulnerabilities: parsed.vulnerabilities || [],
                riskLevel: parsed.riskLevel || 'low',
            };
        } catch {
            return {
                file: file.path,
                vulnerabilities: [],
                riskLevel: 'low',
            };
        }
    }
}

export function createCodeAnalyzer(llm: AgentLLM) {
    return new CodeAnalyzer(llm);
}
