/**
 * Code Agent - Refactor Mode
 * Analyzes code and suggests/applies improvements automatically
 */

import { callLLM } from '../llm/index.js';
import { getModelsByLayer } from '../../config/models.js';
import { logger } from '../../logging/logger.js';

export interface RefactorOptions {
    targetFile: string;
    refactorType?: 'extract-function' | 'rename' | 'simplify' | 'optimize' | 'auto';
    applyChanges?: boolean;
    maxIterations?: number;
}

export interface RefactorResult {
    original: string;
    refactored: string;
    changes: RefactorChange[];
    reasoning: string;
    confidence: number;
    warnings?: string[];
}

export interface RefactorChange {
    type: string;
    description: string;
    before: { start: number; end: number; code: string };
    after: { code: string };
    impact: 'low' | 'medium' | 'high';
}

/**
 * Analyze code and suggest refactoring improvements
 */
export async function analyzeForRefactoring(
    code: string,
    filePath: string,
    options: RefactorOptions = {} as RefactorOptions,
): Promise<RefactorResult> {
    logger.info('Analyzing code for refactoring', {
        filePath,
        refactorType: options.refactorType || 'auto',
    });

    const models = getModelsByLayer('L2'); // Use mid-tier for code analysis
    if (models.length === 0) {
        throw new Error('No L2 models available for refactoring analysis');
    }

    const model = models[0];

    const prompt = `You are an expert code refactoring assistant. Analyze the following code and suggest improvements.

FILE: ${filePath}
REFACTOR TYPE: ${options.refactorType || 'auto'}

CODE:
\`\`\`
${code}
\`\`\`

Please analyze and provide:
1. Identified code smells or anti-patterns
2. Suggested refactorings with before/after examples
3. Impact assessment (low/medium/high risk)
4. Reasoning for each suggestion
5. Overall confidence score (0-100)

Format your response as JSON:
{
  "changes": [
    {
      "type": "extract-function",
      "description": "Extract repeated logic into reusable function",
      "before": { "start": 10, "end": 25, "code": "..." },
      "after": { "code": "..." },
      "impact": "low"
    }
  ],
  "reasoning": "Overall analysis...",
  "confidence": 85,
  "warnings": ["Warning 1", "Warning 2"]
}`;

    const response = await callLLM(
        {
            prompt,
            maxTokens: 2000,
            temperature: 0.3,
        },
        model,
    );

    // Parse JSON response
    try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const analysis = JSON.parse(jsonMatch[0]);

        // Apply changes if requested
        let refactoredCode = code;
        if (options.applyChanges && analysis.changes) {
            refactoredCode = applyRefactorChanges(code, analysis.changes);
        }

        return {
            original: code,
            refactored: refactoredCode,
            changes: analysis.changes || [],
            reasoning: analysis.reasoning || 'No reasoning provided',
            confidence: analysis.confidence || 0,
            warnings: analysis.warnings || [],
        };
    } catch (error) {
        logger.error('Failed to parse refactoring analysis', {
            error: error instanceof Error ? error.message : 'Unknown',
        });

        // Return minimal result
        return {
            original: code,
            refactored: code,
            changes: [],
            reasoning: 'Failed to analyze code',
            confidence: 0,
            warnings: ['Analysis parsing failed'],
        };
    }
}

/**
 * Apply refactor changes to code
 */
function applyRefactorChanges(code: string, changes: RefactorChange[]): string {
    let result = code;
    const lines = code.split('\n');

    // Sort changes by line number (descending) to avoid offset issues
    const sortedChanges = [...changes].sort((a, b) => b.before.start - a.before.start);

    for (const change of sortedChanges) {
        // Simple line-based replacement
        const beforeLines = lines.slice(change.before.start, change.before.end + 1);
        const afterLines = change.after.code.split('\n');

        lines.splice(change.before.start, beforeLines.length, ...afterLines);
    }

    return lines.join('\n');
}

/**
 * Iterative refactoring with quality checks
 */
export async function refactorIteratively(
    code: string,
    filePath: string,
    maxIterations = 3,
): Promise<RefactorResult[]> {
    const iterations: RefactorResult[] = [];
    let currentCode = code;

    for (let i = 0; i < maxIterations; i++) {
        logger.info(`Refactoring iteration ${i + 1}/${maxIterations}`);

        const result = await analyzeForRefactoring(currentCode, filePath, {
            targetFile: filePath,
            applyChanges: true,
        });

        iterations.push(result);

        // Stop if confidence is low or no changes suggested
        if (result.confidence < 50 || result.changes.length === 0) {
            logger.info('Stopping iterations: low confidence or no changes');
            break;
        }

        currentCode = result.refactored;
    }

    return iterations;
}

/**
 * Extract function refactoring
 */
export async function extractFunction(
    code: string,
    startLine: number,
    endLine: number,
    functionName: string,
): Promise<string> {
    const models = getModelsByLayer('L2');
    if (models.length === 0) {
        throw new Error('No L2 models available');
    }

    const lines = code.split('\n');
    const selectedCode = lines.slice(startLine, endLine + 1).join('\n');

    const prompt = `Extract the following code into a function named "${functionName}":

\`\`\`
${selectedCode}
\`\`\`

Return the:
1. Extracted function definition
2. Function call to replace the original code
3. Any parameter declarations needed

Format as JSON:
{
  "functionDef": "function code...",
  "functionCall": "call code...",
  "params": ["param1", "param2"]
}`;

    const response = await callLLM(
        { prompt, maxTokens: 1000, temperature: 0.2 },
        models[0],
    );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to extract function');
    }

    const extraction = JSON.parse(jsonMatch[0]);

    // Replace selected lines with function call
    lines.splice(startLine, endLine - startLine + 1, extraction.functionCall);

    // Insert function definition at the top
    lines.unshift(extraction.functionDef, '');

    return lines.join('\n');
}
