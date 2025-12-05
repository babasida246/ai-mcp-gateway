/**
 * Web Researcher Agent
 * Performs web searches, extracts content from URLs,
 * and synthesizes research findings.
 *
 * Features:
 * - URL content extraction
 * - Search query generation
 * - Fact checking and source validation
 * - Research report generation
 * - n8n webhook compatible
 */

import type { AgentLLM } from './react.js';
import { logger } from '../logging/logger.js';

export interface WebSource {
    url: string;
    title?: string;
    content?: string;
    snippet?: string;
    fetchedAt?: number;
}

export interface ResearchQuery {
    topic: string;
    context?: string;
    maxSources?: number;
    focusAreas?: string[];
}

export interface ResearchResult {
    success: boolean;
    topic: string;
    summary: string;
    keyFindings: string[];
    sources: WebSource[];
    confidence: number;
    processingTime: number;
    suggestedQueries?: string[];
}

export interface FactCheckResult {
    claim: string;
    verdict: 'true' | 'false' | 'partially_true' | 'unverified';
    explanation: string;
    sources: string[];
    confidence: number;
}

/**
 * Web Researcher Agent
 * Conducts web research and synthesizes findings
 */
export class WebResearcher {
    private llm: AgentLLM;

    constructor(llm: AgentLLM) {
        this.llm = llm;
    }

    /**
     * Generate search queries for a research topic
     */
    async generateSearchQueries(topic: string, count = 3): Promise<string[]> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a research assistant. Generate effective search queries for the given topic. Return as JSON array of strings.',
                },
                {
                    role: 'user',
                    content: `Topic: ${topic}\n\nGenerate ${count} search queries that would help find comprehensive information about this topic. Return JSON array only.`,
                },
            ],
            maxTokens: 300,
            temperature: 0.3,
        });

        try {
            const queries = JSON.parse(response.content);
            return Array.isArray(queries) ? queries : [topic];
        } catch {
            return [topic];
        }
    }

    /**
     * Extract and summarize content from provided URLs/sources
     */
    async analyzeWebSources(sources: WebSource[]): Promise<{
        summaries: Array<{ url: string; title: string; summary: string; keyPoints: string[] }>;
        overallThemes: string[];
    }> {
        const summaries: Array<{ url: string; title: string; summary: string; keyPoints: string[] }> = [];
        const allKeyPoints: string[] = [];

        for (const source of sources.slice(0, 10)) {
            if (!source.content && !source.snippet) continue;

            const content = (source.content || source.snippet || '').slice(0, 3000);

            const response = await this.llm.chat({
                messages: [
                    {
                        role: 'system',
                        content:
                            'Analyze the web content and extract key information. Return JSON: {"summary": "brief summary", "keyPoints": ["point1", "point2"]}',
                    },
                    {
                        role: 'user',
                        content: `URL: ${source.url}\nTitle: ${source.title || 'Unknown'}\n\nContent:\n${content}`,
                    },
                ],
                maxTokens: 500,
                temperature: 0.1,
            });

            try {
                const parsed = JSON.parse(response.content);
                summaries.push({
                    url: source.url,
                    title: source.title || source.url,
                    summary: parsed.summary || '',
                    keyPoints: parsed.keyPoints || [],
                });
                allKeyPoints.push(...(parsed.keyPoints || []));
            } catch {
                summaries.push({
                    url: source.url,
                    title: source.title || source.url,
                    summary: response.content.slice(0, 200),
                    keyPoints: [],
                });
            }
        }

        // Extract overall themes
        const themesResponse = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: 'Identify common themes from these key points. Return JSON array of theme strings.',
                },
                {
                    role: 'user',
                    content: `Key points from multiple sources:\n${allKeyPoints.join('\n')}\n\nIdentify 3-5 main themes.`,
                },
            ],
            maxTokens: 200,
            temperature: 0.2,
        });

        let overallThemes: string[] = [];
        try {
            overallThemes = JSON.parse(themesResponse.content);
        } catch {
            overallThemes = [];
        }

        return { summaries, overallThemes };
    }

    /**
     * Conduct research on a topic using provided sources
     */
    async research(query: ResearchQuery, providedSources: WebSource[] = []): Promise<ResearchResult> {
        const startTime = Date.now();
        logger.info('Starting web research', { topic: query.topic });

        // Analyze provided sources
        const analysis =
            providedSources.length > 0
                ? await this.analyzeWebSources(providedSources)
                : { summaries: [], overallThemes: [] };

        // Generate research summary
        const summaryPrompt = `Research Topic: ${query.topic}
${query.context ? `Context: ${query.context}` : ''}
${query.focusAreas ? `Focus Areas: ${query.focusAreas.join(', ')}` : ''}

Source Summaries:
${analysis.summaries.map((s) => `- ${s.title}: ${s.summary}`).join('\n')}

Key Points Found:
${analysis.summaries.flatMap((s) => s.keyPoints).join('\n')}

Themes: ${analysis.overallThemes.join(', ')}

Task: Provide a comprehensive research summary with key findings.`;

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a research analyst. Synthesize the information into a clear research report. Return JSON: {"summary": "comprehensive summary", "keyFindings": ["finding1", "finding2"], "confidence": 0.0-1.0, "suggestedQueries": ["query for more info"]}`,
                },
                { role: 'user', content: summaryPrompt },
            ],
            maxTokens: 1500,
            temperature: 0.2,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                success: true,
                topic: query.topic,
                summary: parsed.summary || '',
                keyFindings: parsed.keyFindings || [],
                sources: providedSources,
                confidence: parsed.confidence || 0.5,
                processingTime: Date.now() - startTime,
                suggestedQueries: parsed.suggestedQueries || [],
            };
        } catch {
            return {
                success: true,
                topic: query.topic,
                summary: response.content,
                keyFindings: analysis.overallThemes,
                sources: providedSources,
                confidence: 0.5,
                processingTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Fact-check a claim against provided sources
     */
    async factCheck(claim: string, sources: WebSource[]): Promise<FactCheckResult> {
        const sourceContent = sources
            .slice(0, 5)
            .map((s) => `Source: ${s.url}\n${(s.content || s.snippet || '').slice(0, 1500)}`)
            .join('\n\n---\n\n');

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a fact-checker. Verify the claim against provided sources. Return JSON: {"verdict": "true|false|partially_true|unverified", "explanation": "why", "confidence": 0.0-1.0}`,
                },
                {
                    role: 'user',
                    content: `Claim to verify: "${claim}"\n\nSources:\n${sourceContent}`,
                },
            ],
            maxTokens: 500,
            temperature: 0.1,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                claim,
                verdict: parsed.verdict || 'unverified',
                explanation: parsed.explanation || '',
                sources: sources.map((s) => s.url),
                confidence: parsed.confidence || 0.5,
            };
        } catch {
            return {
                claim,
                verdict: 'unverified',
                explanation: response.content,
                sources: sources.map((s) => s.url),
                confidence: 0.3,
            };
        }
    }
}

export function createWebResearcher(llm: AgentLLM) {
    return new WebResearcher(llm);
}
