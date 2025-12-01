/**
 * Code Agent - Spec-First TDD Mode
 * Generate tests before implementation based on specifications
 */

import { callLLM } from '../llm/index.js';
import { getModelsByLayer } from '../../config/models.js';
import { logger } from '../../logging/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SpecFirstOptions {
    specFile?: string;
    testFramework?: 'vitest' | 'jest' | 'mocha';
    coverageTarget?: number;
    generateImpl?: boolean;
}

export interface SpecFirstResult {
    specification: string;
    testCode: string;
    implementation?: string;
    coverageEstimate: number;
    testCases: TestCase[];
}

export interface TestCase {
    name: string;
    description: string;
    input: unknown;
    expectedOutput: unknown;
    category: 'unit' | 'integration' | 'edge-case';
}

/**
 * Generate tests from specification (TDD approach)
 */
export async function generateTestsFromSpec(
    specification: string,
    options: SpecFirstOptions = {},
): Promise<SpecFirstResult> {
    const framework = options.testFramework || 'vitest';
    const coverageTarget = options.coverageTarget || 80;

    logger.info('Generating tests from specification', {
        framework,
        coverageTarget,
    });

    const models = getModelsByLayer('L2');
    if (models.length === 0) {
        throw new Error('No L2 models available for test generation');
    }

    const prompt = `You are a TDD expert. Generate comprehensive test cases from the following specification.

SPECIFICATION:
${specification}

REQUIREMENTS:
- Test framework: ${framework}
- Target coverage: ${coverageTarget}%
- Include unit tests, integration tests, and edge cases
- Follow TDD best practices

Generate:
1. Test file code (${framework} format)
2. List of test cases with descriptions
3. Coverage estimate

Format as JSON:
{
  "testCode": "import { describe, it, expect } from '${framework}';\\n\\ndescribe('...', () => { ... });",
  "testCases": [
    {
      "name": "should handle valid input",
      "description": "Tests normal case with valid data",
      "input": { "x": 5 },
      "expectedOutput": 10,
      "category": "unit"
    }
  ],
  "coverageEstimate": 85
}`;

    const response = await callLLM(
        {
            prompt,
            maxTokens: 3000,
            temperature: 0.4,
        },
        models[0],
    );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse test generation response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Generate implementation if requested
    let implementation: string | undefined;
    if (options.generateImpl) {
        implementation = await generateImplementationFromTests(
            result.testCode,
            specification,
        );
    }

    return {
        specification,
        testCode: result.testCode || '',
        implementation,
        coverageEstimate: result.coverageEstimate || 0,
        testCases: result.testCases || [],
    };
}

/**
 * Generate implementation that passes the tests
 */
async function generateImplementationFromTests(
    testCode: string,
    specification: string,
): Promise<string> {
    const models = getModelsByLayer('L2');

    const prompt = `Generate implementation code that will pass these tests.

SPECIFICATION:
${specification}

TESTS:
\`\`\`typescript
${testCode}
\`\`\`

Provide clean, well-documented implementation code that:
1. Passes all tests
2. Follows TypeScript best practices
3. Includes JSDoc comments
4. Handles edge cases

Return only the implementation code (no tests).`;

    const response = await callLLM(
        {
            prompt,
            maxTokens: 2000,
            temperature: 0.3,
        },
        models[0],
    );

    // Extract code block
    const codeMatch = response.content.match(/```(?:typescript|ts)?\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : response.content;
}

/**
 * TDD workflow: spec → tests → implementation → verify
 */
export async function tddWorkflow(
    specification: string,
    outputDir: string,
    options: SpecFirstOptions = {},
): Promise<{
    specFile: string;
    testFile: string;
    implFile: string;
    result: SpecFirstResult;
}> {
    logger.info('Starting TDD workflow', { outputDir });

    // Step 1: Generate tests from spec
    const result = await generateTestsFromSpec(specification, {
        ...options,
        generateImpl: true,
    });

    // Step 2: Write spec file
    const specFile = path.join(outputDir, 'spec.md');
    await fs.writeFile(specFile, `# Specification\n\n${specification}`, 'utf-8');

    // Step 3: Write test file
    const testFile = path.join(outputDir, 'index.test.ts');
    await fs.writeFile(testFile, result.testCode, 'utf-8');

    // Step 4: Write implementation file
    const implFile = path.join(outputDir, 'index.ts');
    await fs.writeFile(implFile, result.implementation || '', 'utf-8');

    logger.info('TDD workflow completed', {
        specFile,
        testFile,
        implFile,
    });

    return {
        specFile,
        testFile,
        implFile,
        result,
    };
}

/**
 * Analyze test coverage gaps
 */
export async function analyzeTestGaps(
    testCode: string,
    implCode: string,
): Promise<{
    missingTests: string[];
    uncoveredEdgeCases: string[];
    suggestions: string[];
}> {
    const models = getModelsByLayer('L1');
    if (models.length === 0) {
        throw new Error('No L1 models available');
    }

    const prompt = `Analyze test coverage and identify gaps.

IMPLEMENTATION:
\`\`\`typescript
${implCode}
\`\`\`

TESTS:
\`\`\`typescript
${testCode}
\`\`\`

Identify:
1. Missing test cases
2. Uncovered edge cases
3. Suggestions for improvement

Format as JSON:
{
  "missingTests": ["Test for null input", "Test for large numbers"],
  "uncoveredEdgeCases": ["Empty array", "Negative numbers"],
  "suggestions": ["Add error handling tests", "Test async behavior"]
}`;

    const response = await callLLM(
        { prompt, maxTokens: 1000, temperature: 0.3 },
        models[0],
    );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return {
            missingTests: [],
            uncoveredEdgeCases: [],
            suggestions: [],
        };
    }

    return JSON.parse(jsonMatch[0]);
}

/**
 * Generate additional tests for uncovered code paths
 */
export async function generateMissingTests(
    implCode: string,
    existingTests: string,
    gaps: { missingTests: string[]; uncoveredEdgeCases: string[] },
    framework: 'vitest' | 'jest' = 'vitest',
): Promise<string> {
    const models = getModelsByLayer('L1');

    const prompt = `Generate additional tests to cover missing cases.

IMPLEMENTATION:
\`\`\`typescript
${implCode}
\`\`\`

EXISTING TESTS:
\`\`\`typescript
${existingTests}
\`\`\`

MISSING COVERAGE:
${gaps.missingTests.map((t) => `- ${t}`).join('\n')}

EDGE CASES:
${gaps.uncoveredEdgeCases.map((e) => `- ${e}`).join('\n')}

Generate additional test cases using ${framework} that cover these gaps.
Return only the new test code (not the entire test suite).`;

    const response = await callLLM(
        { prompt, maxTokens: 1500, temperature: 0.3 },
        models[0],
    );

    const codeMatch = response.content.match(/```(?:typescript|ts)?\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : response.content;
}
