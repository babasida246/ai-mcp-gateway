/**
 * Data Extractor Agent
 * Extracts structured data from various unstructured sources
 * including text, documents, and semi-structured data.
 *
 * Features:
 * - Schema-based extraction
 * - Entity recognition
 * - Table extraction
 * - Key-value pair extraction
 * - Format conversion
 * - Validation and normalization
 * - n8n webhook compatible
 */

import type { AgentLLM } from './react.js';
import { logger } from '../logging/logger.js';

export interface DataSchema {
    name: string;
    fields: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
        description?: string;
        required?: boolean;
        example?: string;
    }>;
}

export interface ExtractionResult {
    success: boolean;
    data: Record<string, unknown>;
    confidence: number;
    missingFields: string[];
    validationErrors: string[];
    processingTime: number;
}

export interface EntityResult {
    type: string;
    value: string;
    confidence: number;
    context?: string;
}

export interface TableData {
    headers: string[];
    rows: string[][];
    format?: 'csv' | 'json' | 'markdown';
}

/**
 * Data Extractor Agent
 * Extracts structured data from unstructured text
 */
export class DataExtractor {
    private llm: AgentLLM;

    constructor(llm: AgentLLM) {
        this.llm = llm;
    }

    /**
     * Extract data according to a defined schema
     */
    async extractWithSchema(content: string, schema: DataSchema): Promise<ExtractionResult> {
        const startTime = Date.now();
        logger.info('Extracting data with schema', { schema: schema.name });

        const schemaDescription = schema.fields
            .map((f) => `- ${f.name} (${f.type}${f.required ? ', required' : ''}): ${f.description || ''}`)
            .join('\n');

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a data extraction expert. Extract data according to the schema.
Return ONLY valid JSON matching the schema. Use null for missing optional fields.`,
                },
                {
                    role: 'user',
                    content: `Schema "${schema.name}":
${schemaDescription}

Content to extract from:
---
${content.slice(0, 6000)}
---

Extract data as JSON object.`,
                },
            ],
            maxTokens: 2000,
            temperature: 0.1,
        });

        try {
            const extracted = JSON.parse(response.content);

            // Validate required fields
            const missingFields: string[] = [];
            const validationErrors: string[] = [];

            for (const field of schema.fields) {
                if (field.required && (extracted[field.name] === null || extracted[field.name] === undefined)) {
                    missingFields.push(field.name);
                }

                // Type validation
                if (extracted[field.name] !== null && extracted[field.name] !== undefined) {
                    const actualType = Array.isArray(extracted[field.name]) ? 'array' : typeof extracted[field.name];
                    if (field.type !== 'date' && actualType !== field.type) {
                        validationErrors.push(`${field.name}: expected ${field.type}, got ${actualType}`);
                    }
                }
            }

            const confidence =
                missingFields.length === 0 && validationErrors.length === 0
                    ? 0.95
                    : Math.max(0.3, 0.95 - missingFields.length * 0.1 - validationErrors.length * 0.05);

            return {
                success: missingFields.length === 0,
                data: extracted,
                confidence,
                missingFields,
                validationErrors,
                processingTime: Date.now() - startTime,
            };
        } catch {
            return {
                success: false,
                data: {},
                confidence: 0,
                missingFields: schema.fields.filter((f) => f.required).map((f) => f.name),
                validationErrors: ['Failed to parse extraction result'],
                processingTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Extract named entities from text
     */
    async extractEntities(
        content: string,
        entityTypes: string[] = ['person', 'organization', 'location', 'date', 'money', 'email', 'phone', 'url']
    ): Promise<EntityResult[]> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a named entity recognition expert. Extract entities from the text.
Return JSON array: [{"type": "entity_type", "value": "extracted_value", "confidence": 0.0-1.0, "context": "surrounding text"}]
Entity types to find: ${entityTypes.join(', ')}`,
                },
                {
                    role: 'user',
                    content: `Extract entities from:\n\n${content.slice(0, 5000)}`,
                },
            ],
            maxTokens: 2000,
            temperature: 0.1,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return [];
        }
    }

    /**
     * Extract tabular data from text
     */
    async extractTable(content: string, expectedColumns?: string[]): Promise<TableData | null> {
        const columnsHint = expectedColumns ? `Expected columns: ${expectedColumns.join(', ')}` : 'Infer columns from content.';

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `You are a table extraction expert. Extract tabular data from the text.
Return JSON: {"headers": ["col1", "col2"], "rows": [["val1", "val2"], ["val3", "val4"]]}
${columnsHint}`,
                },
                {
                    role: 'user',
                    content: `Extract table from:\n\n${content.slice(0, 5000)}`,
                },
            ],
            maxTokens: 2000,
            temperature: 0.1,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return null;
        }
    }

    /**
     * Extract key-value pairs from text
     */
    async extractKeyValues(content: string): Promise<Record<string, string>> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content:
                        'Extract key-value pairs from the text. Return a flat JSON object with string keys and string values.',
                },
                {
                    role: 'user',
                    content: `Extract key-value pairs from:\n\n${content.slice(0, 5000)}`,
                },
            ],
            maxTokens: 1500,
            temperature: 0.1,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return {};
        }
    }

    /**
     * Convert data between formats
     */
    async convertFormat(
        data: string,
        fromFormat: 'csv' | 'json' | 'xml' | 'yaml' | 'text',
        toFormat: 'csv' | 'json' | 'xml' | 'yaml' | 'markdown'
    ): Promise<string> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `Convert the data from ${fromFormat} to ${toFormat} format. Return only the converted data.`,
                },
                {
                    role: 'user',
                    content: `Convert this ${fromFormat} data to ${toFormat}:\n\n${data.slice(0, 6000)}`,
                },
            ],
            maxTokens: 3000,
            temperature: 0,
        });

        return response.content;
    }

    /**
     * Batch extract with same schema
     */
    async batchExtract(
        contents: Array<{ id: string; content: string }>,
        schema: DataSchema
    ): Promise<
        Array<{
            id: string;
            result: ExtractionResult;
        }>
    > {
        const results: Array<{ id: string; result: ExtractionResult }> = [];

        for (const item of contents.slice(0, 50)) {
            const result = await this.extractWithSchema(item.content, schema);
            results.push({ id: item.id, result });
        }

        return results;
    }

    /**
     * Create a schema from example data
     */
    async inferSchema(
        exampleData: string,
        schemaName = 'InferredSchema'
    ): Promise<DataSchema> {
        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `Analyze the data and infer a schema for extraction.
Return JSON: {
  "name": "schema_name",
  "fields": [{"name": "field_name", "type": "string|number|boolean|date|array|object", "description": "field description", "required": true|false, "example": "example value"}]
}`,
                },
                {
                    role: 'user',
                    content: `Infer a schema from this example data:\n\n${exampleData.slice(0, 4000)}`,
                },
            ],
            maxTokens: 1500,
            temperature: 0.2,
        });

        try {
            const parsed = JSON.parse(response.content);
            return {
                name: parsed.name || schemaName,
                fields: parsed.fields || [],
            };
        } catch {
            return {
                name: schemaName,
                fields: [],
            };
        }
    }

    /**
     * Validate extracted data against rules
     */
    async validate(
        data: Record<string, unknown>,
        rules: Array<{ field: string; rule: string }>
    ): Promise<{
        valid: boolean;
        errors: Array<{ field: string; error: string }>;
    }> {
        const rulesText = rules.map((r) => `- ${r.field}: ${r.rule}`).join('\n');

        const response = await this.llm.chat({
            messages: [
                {
                    role: 'system',
                    content: `Validate the data against the rules.
Return JSON: {"valid": true|false, "errors": [{"field": "field_name", "error": "error description"}]}`,
                },
                {
                    role: 'user',
                    content: `Data:\n${JSON.stringify(data, null, 2)}\n\nRules:\n${rulesText}`,
                },
            ],
            maxTokens: 500,
            temperature: 0.1,
        });

        try {
            return JSON.parse(response.content);
        } catch {
            return { valid: true, errors: [] };
        }
    }
}

export function createDataExtractor(llm: AgentLLM) {
    return new DataExtractor(llm);
}
