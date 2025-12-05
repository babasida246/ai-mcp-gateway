/**
 * Document Synthesizer Agent
 * Combines multiple source documents (text, extracted PDF text, guides)
 * into a single developer guide in Markdown format.
 *
 * Features:
 * - Multi-format output (md, mdx, html)
 * - Chunking for large documents
 * - Summary extraction
 * - Source validation
 * - n8n webhook compatible responses
 */

import type { AgentLLM } from './react.js';
import { logger } from '../logging/logger.js';

export interface DocumentSource {
    name: string;
    content: string;
    type?: string; // e.g., 'pdf', 'md', 'html', 'txt', 'json'
    url?: string; // Original URL if fetched
    metadata?: Record<string, unknown>;
}

export interface SynthOptions {
    title?: string;
    includeTOC?: boolean;
    targetFormat?: 'md' | 'mdx' | 'html';
    maxChunkSize?: number; // Max chars per chunk for large docs
    outputStyle?: 'technical' | 'tutorial' | 'reference' | 'quickstart';
    language?: string; // Output language
    includeSourceLinks?: boolean;
}

export interface SynthResult {
    success: boolean;
    content: string;
    format: string;
    sections: string[];
    sourceCount: number;
    totalChars: number;
    processingTime: number;
    metadata?: Record<string, unknown>;
}

export interface DocumentSummary {
    name: string;
    type: string;
    charCount: number;
    keyTopics: string[];
    summary: string;
}

/**
 * Document Synthesizer Agent
 * Intelligently combines and transforms documentation
 */
export class DocumentSynthesizer {
    private llm: AgentLLM;
    private maxChunkSize: number;

    constructor(llm: AgentLLM, maxChunkSize = 8000) {
        this.llm = llm;
        this.maxChunkSize = maxChunkSize;
    }

    /**
     * Validate and normalize document sources
     */
    private validateSources(docs: DocumentSource[]): DocumentSource[] {
        return docs
            .filter((d) => d && (d.content || d.name))
            .map((d, i) => ({
                name: d.name || `source-${i + 1}`,
                content: (d.content ?? '').trim(),
                type: d.type || this.detectType(d.name, d.content),
                url: d.url,
                metadata: d.metadata || {},
            }));
    }

    /**
     * Detect document type from name or content
     */
    private detectType(name: string, content: string): string {
        const ext = name.split('.').pop()?.toLowerCase();
        if (ext && ['md', 'mdx', 'txt', 'html', 'json', 'yaml', 'yml', 'pdf'].includes(ext)) {
            return ext;
        }
        if (content.startsWith('{') || content.startsWith('[')) return 'json';
        if (content.startsWith('<!DOCTYPE') || content.startsWith('<html')) return 'html';
        if (content.includes('# ') || content.includes('## ')) return 'md';
        return 'txt';
    }

    /**
     * Chunk large content into manageable pieces
     */
    private chunkContent(content: string, maxSize: number): string[] {
        if (content.length <= maxSize) return [content];

        const chunks: string[] = [];
        let remaining = content;

        while (remaining.length > 0) {
            if (remaining.length <= maxSize) {
                chunks.push(remaining);
                break;
            }

            // Try to split at paragraph or sentence boundary
            let splitPoint = remaining.lastIndexOf('\n\n', maxSize);
            if (splitPoint < maxSize * 0.5) {
                splitPoint = remaining.lastIndexOf('. ', maxSize);
            }
            if (splitPoint < maxSize * 0.3) {
                splitPoint = maxSize;
            }

            chunks.push(remaining.slice(0, splitPoint));
            remaining = remaining.slice(splitPoint).trim();
        }

        return chunks;
    }

    /**
     * Extract summary from a single document
     */
    async summarizeDocument(doc: DocumentSource): Promise<DocumentSummary> {
        const truncated = doc.content.slice(0, 4000);

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a document analyst. Extract key topics and provide a brief summary. Respond in JSON format: {"keyTopics": ["topic1", "topic2"], "summary": "Brief summary"}',
                },
                {
                    role: 'user',
                    content: `Document: ${doc.name}\nType: ${doc.type || 'unknown'}\n\nContent:\n${truncated}`,
                },
            ],
            maxTokens: 500,
            temperature: 0.1,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                name: doc.name,
                type: doc.type || 'unknown',
                charCount: doc.content.length,
                keyTopics: parsed.keyTopics || [],
                summary: parsed.summary || '',
            };
        } catch {
            return {
                name: doc.name,
                type: doc.type || 'unknown',
                charCount: doc.content.length,
                keyTopics: [],
                summary: response.content.slice(0, 200),
            };
        }
    }

    /**
     * Synthesize documents into a single guide
     */
    async synthesize(docs: DocumentSource[], options: SynthOptions = {}): Promise<SynthResult> {
        const startTime = Date.now();
        const validDocs = this.validateSources(docs);

        if (validDocs.length === 0) {
            return {
                success: false,
                content: '',
                format: options.targetFormat || 'md',
                sections: [],
                sourceCount: 0,
                totalChars: 0,
                processingTime: Date.now() - startTime,
            };
        }

        const title = options.title || 'Developer Guide';
        const includeTOC = options.includeTOC ?? true;
        const outputStyle = options.outputStyle || 'technical';
        const format = options.targetFormat || 'md';

        // Build source list
        const sourcesList = validDocs
            .map((d, i) => `${i + 1}. ${d.name}${d.type ? ` (${d.type})` : ''}${d.url ? ` - ${d.url}` : ''}`)
            .join('\n');

        // Process each document (chunk if needed)
        const processedDocs: string[] = [];
        for (const doc of validDocs) {
            const chunks = this.chunkContent(doc.content, this.maxChunkSize);
            // Use first chunk for synthesis (summarize others if too many)
            const excerpt = chunks[0].slice(0, 6000);
            processedDocs.push(`---\nSource: ${doc.name}\nType: ${doc.type}\n\n${excerpt}`);
        }

        const excerpts = processedDocs.join('\n\n');

        const styleGuide = {
            technical: 'Use precise technical language, include code examples, focus on implementation details.',
            tutorial: 'Use step-by-step instructions, explain concepts progressively, include screenshots placeholders.',
            reference: 'Use tabular format where possible, be concise, focus on API signatures and parameters.',
            quickstart: 'Be brief, focus on getting started fast, minimal explanation, copy-paste ready code.',
        };

        const systemPrompt = `You are a documentation engineer creating a ${outputStyle} developer guide.
${styleGuide[outputStyle]}
Produce a well-structured ${format.toUpperCase()} document with sections: Overview, Setup, Getting Started, Usage, API (if applicable), Examples, Troubleshooting, and References.
Use concise headings, bullet lists, and code blocks where appropriate.
${options.language ? `Write in ${options.language}.` : ''}`;

        const userPrompt = `Title: ${title}
Include Table of Contents: ${includeTOC}
Output Format: ${format}
Style: ${outputStyle}

Sources (${validDocs.length}):
${sourcesList}

Content:
${excerpts}

Task: Create a single ${format.toUpperCase()} developer guide combining the content above.${options.includeSourceLinks ? ' Include source references as footnotes.' : ''}`;

        logger.debug('Synthesizing documents', { sourceCount: validDocs.length, style: outputStyle });

        const response = await this.llm.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            maxTokens: 4000,
            temperature: 0.1,
        });

        // Extract section headers from result
        const sectionMatches = response.content.match(/^#{1,3}\s+.+$/gm) || [];
        const sections = sectionMatches.map((s) => s.replace(/^#+\s+/, ''));

        // Convert to HTML if requested
        let finalContent = response.content;
        if (format === 'html') {
            finalContent = this.markdownToHtml(response.content, title);
        }

        return {
            success: true,
            content: finalContent,
            format,
            sections,
            sourceCount: validDocs.length,
            totalChars: finalContent.length,
            processingTime: Date.now() - startTime,
            metadata: {
                title,
                style: outputStyle,
                sources: validDocs.map((d) => d.name),
            },
        };
    }

    /**
     * Simple markdown to HTML conversion
     */
    private markdownToHtml(md: string, title: string): string {
        let html = md
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^(.+)$/gm, '<p>$1</p>');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
        code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 1rem; border-radius: 5px; overflow-x: auto; }
        h1, h2, h3 { margin-top: 2rem; }
    </style>
</head>
<body>
${html}
</body>
</html>`;
    }

    /**
     * Create a quick summary of multiple documents (for n8n workflows)
     */
    async quickSummary(docs: DocumentSource[]): Promise<{
        success: boolean;
        summaries: DocumentSummary[];
        combinedTopics: string[];
    }> {
        const validDocs = this.validateSources(docs);
        const summaries: DocumentSummary[] = [];
        const allTopics: Set<string> = new Set();

        for (const doc of validDocs.slice(0, 10)) {
            // Limit to 10 docs
            const summary = await this.summarizeDocument(doc);
            summaries.push(summary);
            summary.keyTopics.forEach((t) => allTopics.add(t));
        }

        return {
            success: true,
            summaries,
            combinedTopics: Array.from(allTopics),
        };
    }
}

export function createDocumentSynthesizer(llm: AgentLLM, maxChunkSize?: number) {
    return new DocumentSynthesizer(llm, maxChunkSize);
}
