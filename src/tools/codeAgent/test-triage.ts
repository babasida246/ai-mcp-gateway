/**
 * Code Agent - Test Auto-Triage
 * Automatically categorize and prioritize test failures
 */

import { callLLM } from '../llm/index.js';
import { getModelsByLayer } from '../../config/models.js';
import { logger } from '../../logging/logger.js';

export interface TestFailure {
    testName: string;
    errorMessage: string;
    stackTrace?: string;
    file: string;
    line?: number;
}

export interface TriageResult {
    category: TestFailureCategory;
    severity: 'critical' | 'high' | 'medium' | 'low';
    rootCause: string;
    suggestedFix: string;
    affectedArea: string;
    confidence: number;
    relatedFailures?: string[];
}

export type TestFailureCategory =
    | 'assertion-failure'
    | 'runtime-error'
    | 'timeout'
    | 'setup-teardown'
    | 'dependency-issue'
    | 'race-condition'
    | 'environment'
    | 'flaky-test';

/**
 * Analyze and categorize test failure
 */
export async function triageTestFailure(
    failure: TestFailure,
    codeContext?: string,
): Promise<TriageResult> {
    logger.info('Triaging test failure', {
        testName: failure.testName,
        file: failure.file,
    });

    const models = getModelsByLayer('L1');
    if (models.length === 0) {
        throw new Error('No L1 models available for test triage');
    }

    const prompt = `Analyze this test failure and provide diagnosis.

TEST NAME: ${failure.testName}
FILE: ${failure.file}${failure.line ? ` (line ${failure.line})` : ''}

ERROR MESSAGE:
${failure.errorMessage}

${failure.stackTrace ? `STACK TRACE:\n${failure.stackTrace}\n` : ''}
${codeContext ? `CODE CONTEXT:\n\`\`\`\n${codeContext}\n\`\`\`\n` : ''}

Analyze and provide:
1. Category of failure
2. Severity level (critical/high/medium/low)
3. Root cause analysis
4. Suggested fix with code examples
5. Affected area (component/module)
6. Confidence in diagnosis (0-100)

Categories: assertion-failure, runtime-error, timeout, setup-teardown, dependency-issue, race-condition, environment, flaky-test

Format as JSON:
{
  "category": "assertion-failure",
  "severity": "high",
  "rootCause": "Expected value mismatch due to...",
  "suggestedFix": "Change line 42 to...",
  "affectedArea": "UserService.login()",
  "confidence": 85,
  "relatedFailures": ["test-2", "test-3"]
}`;

    const response = await callLLM(
        {
            prompt,
            maxTokens: 1500,
            temperature: 0.2,
        },
        models[0],
    );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse triage response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
        category: result.category || 'runtime-error',
        severity: result.severity || 'medium',
        rootCause: result.rootCause || 'Unknown',
        suggestedFix: result.suggestedFix || 'No fix suggested',
        affectedArea: result.affectedArea || 'Unknown',
        confidence: result.confidence || 0,
        relatedFailures: result.relatedFailures || [],
    };
}

/**
 * Batch triage multiple test failures
 */
export async function triageBatchFailures(
    failures: TestFailure[],
    codeBase?: Map<string, string>,
): Promise<Map<string, TriageResult>> {
    const results = new Map<string, TriageResult>();

    logger.info(`Triaging ${failures.length} test failures`);

    for (const failure of failures) {
        const codeContext = codeBase?.get(failure.file);
        const result = await triageTestFailure(failure, codeContext);
        results.set(failure.testName, result);
    }

    // Group related failures
    const grouped = groupRelatedFailures(results);
    logger.info(`Grouped into ${grouped.size} failure clusters`);

    return results;
}

/**
 * Group related test failures
 */
function groupRelatedFailures(
    results: Map<string, TriageResult>,
): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const [testName, result] of results.entries()) {
        const key = `${result.category}-${result.affectedArea}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(testName);
    }

    return groups;
}

/**
 * Prioritize test failures by severity and impact
 */
export function prioritizeFailures(
    results: Map<string, TriageResult>,
): Array<{ testName: string; result: TriageResult; priority: number }> {
    const prioritized: Array<{ testName: string; result: TriageResult; priority: number }> =
        [];

    const severityScores = {
        critical: 100,
        high: 75,
        medium: 50,
        low: 25,
    };

    for (const [testName, result] of results.entries()) {
        let priority = severityScores[result.severity];

        // Boost priority for high-confidence diagnoses
        priority += result.confidence * 0.2;

        // Boost priority for failures affecting multiple tests
        if (result.relatedFailures && result.relatedFailures.length > 0) {
            priority += result.relatedFailures.length * 5;
        }

        prioritized.push({ testName, result, priority });
    }

    // Sort by priority descending
    return prioritized.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate fix suggestions for test failures
 */
export async function generateFixForFailure(
    failure: TestFailure,
    triageResult: TriageResult,
    sourceCode: string,
): Promise<{
    originalCode: string;
    fixedCode: string;
    explanation: string;
}> {
    const models = getModelsByLayer('L2');
    if (models.length === 0) {
        throw new Error('No L2 models available');
    }

    const prompt = `Generate a code fix for this test failure.

TEST FAILURE:
- Name: ${failure.testName}
- Error: ${failure.errorMessage}

TRIAGE ANALYSIS:
- Category: ${triageResult.category}
- Root Cause: ${triageResult.rootCause}
- Suggested Fix: ${triageResult.suggestedFix}

SOURCE CODE:
\`\`\`typescript
${sourceCode}
\`\`\`

Provide:
1. Fixed code (complete file)
2. Explanation of changes
3. Verification steps

Format as JSON:
{
  "fixedCode": "complete fixed code...",
  "explanation": "Changed line X because...",
  "verificationSteps": ["Run test again", "Check edge cases"]
}`;

    const response = await callLLM(
        {
            prompt,
            maxTokens: 2000,
            temperature: 0.3,
        },
        models[0],
    );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse fix response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
        originalCode: sourceCode,
        fixedCode: result.fixedCode || sourceCode,
        explanation: result.explanation || 'No explanation provided',
    };
}

/**
 * Auto-fix test failures (with user confirmation)
 */
export async function autoFixFailures(
    failures: TestFailure[],
    triageResults: Map<string, TriageResult>,
    codeBase: Map<string, string>,
    confidenceThreshold = 80,
): Promise<
    Array<{
        testName: string;
        fixed: boolean;
        newCode?: string;
        reason: string;
    }>
> {
    const results: Array<{
        testName: string;
        fixed: boolean;
        newCode?: string;
        reason: string;
    }> = [];

    for (const failure of failures) {
        const triage = triageResults.get(failure.testName);
        if (!triage) {
            results.push({
                testName: failure.testName,
                fixed: false,
                reason: 'No triage result available',
            });
            continue;
        }

        // Only auto-fix high-confidence issues
        if (triage.confidence < confidenceThreshold) {
            results.push({
                testName: failure.testName,
                fixed: false,
                reason: `Confidence too low: ${triage.confidence}%`,
            });
            continue;
        }

        const sourceCode = codeBase.get(failure.file);
        if (!sourceCode) {
            results.push({
                testName: failure.testName,
                fixed: false,
                reason: 'Source code not found',
            });
            continue;
        }

        try {
            const fix = await generateFixForFailure(failure, triage, sourceCode);
            results.push({
                testName: failure.testName,
                fixed: true,
                newCode: fix.fixedCode,
                reason: fix.explanation,
            });
        } catch (error) {
            results.push({
                testName: failure.testName,
                fixed: false,
                reason:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error',
            });
        }
    }

    return results;
}
