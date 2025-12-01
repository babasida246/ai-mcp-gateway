/**
 * Code Agent - Repository Mapping
 * AST-based repository structure analysis and context extraction
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { callLLM } from '../llm/index.js';
import { getModelsByLayer } from '../../config/models.js';
import { logger } from '../../logging/logger.js';

export interface RepoMap {
    rootPath: string;
    structure: FileNode;
    modules: ModuleInfo[];
    dependencies: DependencyGraph;
    entryPoints: string[];
    statistics: RepoStatistics;
}

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    language?: string;
    children?: FileNode[];
    exports?: string[];
    imports?: string[];
}

export interface ModuleInfo {
    filePath: string;
    name: string;
    exports: ExportInfo[];
    imports: ImportInfo[];
    functions: FunctionInfo[];
    classes: ClassInfo[];
    complexity: number;
}

export interface ExportInfo {
    name: string;
    type: 'function' | 'class' | 'const' | 'type' | 'interface';
    isDefault: boolean;
}

export interface ImportInfo {
    source: string;
    imports: string[];
    isExternal: boolean;
}

export interface FunctionInfo {
    name: string;
    parameters: string[];
    returnType?: string;
    async: boolean;
    lineCount: number;
}

export interface ClassInfo {
    name: string;
    methods: string[];
    properties: string[];
    extends?: string;
}

export interface DependencyGraph {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; type: string }>;
}

export interface RepoStatistics {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
    avgComplexity: number;
    largestFiles: Array<{ path: string; lines: number }>;
}

/**
 * Generate comprehensive repository map
 */
export async function generateRepoMap(
    rootPath: string,
    options: {
        excludePatterns?: string[];
        maxDepth?: number;
        includeNodeModules?: boolean;
    } = {},
): Promise<RepoMap> {
    logger.info('Generating repository map', { rootPath });

    const excludePatterns = options.excludePatterns || [
        'node_modules',
        'dist',
        'build',
        '.git',
        'coverage',
    ];

    // Step 1: Build file tree
    const structure = await buildFileTree(rootPath, excludePatterns, 0, options.maxDepth || 10);

    // Step 2: Analyze modules
    const modules = await analyzeModules(structure);

    // Step 3: Build dependency graph
    const dependencies = buildDependencyGraph(modules);

    // Step 4: Identify entry points
    const entryPoints = identifyEntryPoints(structure, modules);

    // Step 5: Calculate statistics
    const statistics = calculateStatistics(structure, modules);

    return {
        rootPath,
        structure,
        modules,
        dependencies,
        entryPoints,
        statistics,
    };
}

/**
 * Build file tree recursively
 */
async function buildFileTree(
    dirPath: string,
    excludePatterns: string[],
    depth: number,
    maxDepth: number,
): Promise<FileNode> {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);

    if (excludePatterns.some((pattern) => name.includes(pattern))) {
        return {
            name,
            path: dirPath,
            type: 'directory',
            children: [],
        };
    }

    if (stats.isFile()) {
        const ext = path.extname(name);
        const language = getLanguageFromExtension(ext);

        return {
            name,
            path: dirPath,
            type: 'file',
            size: stats.size,
            language,
        };
    }

    if (depth >= maxDepth) {
        return {
            name,
            path: dirPath,
            type: 'directory',
            children: [],
        };
    }

    const entries = await fs.readdir(dirPath);
    const children: FileNode[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        try {
            const child = await buildFileTree(fullPath, excludePatterns, depth + 1, maxDepth);
            children.push(child);
        } catch (error) {
            // Skip inaccessible files
            logger.debug(`Skipping ${fullPath}: ${error}`);
        }
    }

    return {
        name,
        path: dirPath,
        type: 'directory',
        children,
    };
}

/**
 * Analyze TypeScript/JavaScript modules
 */
async function analyzeModules(structure: FileNode): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    async function processNode(node: FileNode) {
        if (node.type === 'file' && (node.language === 'typescript' || node.language === 'javascript')) {
            try {
                const content = await fs.readFile(node.path, 'utf-8');
                const moduleInfo = await analyzeModuleContent(node.path, content);
                modules.push(moduleInfo);
            } catch (error) {
                logger.debug(`Failed to analyze ${node.path}: ${error}`);
            }
        }

        if (node.children) {
            for (const child of node.children) {
                await processNode(child);
            }
        }
    }

    await processNode(structure);
    return modules;
}

/**
 * Analyze module content with LLM
 */
async function analyzeModuleContent(filePath: string, content: string): Promise<ModuleInfo> {
    // Simple regex-based analysis for performance
    const exports = extractExports(content);
    const imports = extractImports(content);
    const functions = extractFunctions(content);
    const classes = extractClasses(content);

    return {
        filePath,
        name: path.basename(filePath),
        exports,
        imports,
        functions,
        classes,
        complexity: calculateComplexity(content),
    };
}

/**
 * Extract exports from code
 */
function extractExports(code: string): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Export default
    const defaultExport = /export\s+default\s+(function|class|const|interface|type)\s+(\w+)/g.exec(
        code,
    );
    if (defaultExport) {
        exports.push({
            name: defaultExport[2],
            type: defaultExport[1] as ExportInfo['type'],
            isDefault: true,
        });
    }

    // Named exports
    const namedExports = code.matchAll(
        /export\s+(function|class|const|interface|type)\s+(\w+)/g,
    );
    for (const match of namedExports) {
        exports.push({
            name: match[2],
            type: match[1] as ExportInfo['type'],
            isDefault: false,
        });
    }

    return exports;
}

/**
 * Extract imports from code
 */
function extractImports(code: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const importStatements = code.matchAll(/import\s+.*?\s+from\s+['"](.+?)['"]/g);
    for (const match of importStatements) {
        const source = match[1];
        const isExternal = !source.startsWith('.') && !source.startsWith('/');

        // Extract imported names
        const importedNames = match[0].match(/import\s+\{(.+?)\}/);
        const names = importedNames
            ? importedNames[1].split(',').map((n) => n.trim())
            : [];

        imports.push({
            source,
            imports: names,
            isExternal,
        });
    }

    return imports;
}

/**
 * Extract functions from code
 */
function extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    const functionMatches = code.matchAll(
        /(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    );
    for (const match of functionMatches) {
        const isAsync = !!match[1];
        const name = match[2];
        const params = match[3]
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p);

        functions.push({
            name,
            parameters: params,
            async: isAsync,
            lineCount: 0, // TODO: Calculate actual line count
        });
    }

    return functions;
}

/**
 * Extract classes from code
 */
function extractClasses(code: string): ClassInfo[] {
    const classes: ClassInfo[] = [];

    const classMatches = code.matchAll(/class\s+(\w+)(?:\s+extends\s+(\w+))?/g);
    for (const match of classMatches) {
        classes.push({
            name: match[1],
            methods: [],
            properties: [],
            extends: match[2],
        });
    }

    return classes;
}

/**
 * Calculate cyclomatic complexity (simplified)
 */
function calculateComplexity(code: string): number {
    const keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', '&&', '||'];
    let complexity = 1;

    for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = code.match(regex);
        if (matches) {
            complexity += matches.length;
        }
    }

    return complexity;
}

/**
 * Build dependency graph
 */
function buildDependencyGraph(modules: ModuleInfo[]): DependencyGraph {
    const nodes: DependencyGraph['nodes'] = [];
    const edges: DependencyGraph['edges'] = [];

    for (const module of modules) {
        nodes.push({
            id: module.filePath,
            label: module.name,
            type: 'module',
        });

        for (const imp of module.imports) {
            if (!imp.isExternal) {
                edges.push({
                    from: module.filePath,
                    to: imp.source,
                    type: 'import',
                });
            }
        }
    }

    return { nodes, edges };
}

/**
 * Identify entry points (main files)
 */
function identifyEntryPoints(structure: FileNode, modules: ModuleInfo[]): string[] {
    const entryPoints: string[] = [];

    // Common entry point names
    const entryNames = ['index.ts', 'main.ts', 'app.ts', 'server.ts'];

    function findEntries(node: FileNode) {
        if (node.type === 'file' && entryNames.includes(node.name)) {
            entryPoints.push(node.path);
        }
        if (node.children) {
            node.children.forEach(findEntries);
        }
    }

    findEntries(structure);
    return entryPoints;
}

/**
 * Calculate repository statistics
 */
function calculateStatistics(structure: FileNode, modules: ModuleInfo[]): RepoStatistics {
    let totalFiles = 0;
    let totalLines = 0;
    const languages: Record<string, number> = {};
    const largestFiles: Array<{ path: string; lines: number }> = [];

    function countStats(node: FileNode) {
        if (node.type === 'file') {
            totalFiles++;
            if (node.language) {
                languages[node.language] = (languages[node.language] || 0) + 1;
            }
        }
        if (node.children) {
            node.children.forEach(countStats);
        }
    }

    countStats(structure);

    const avgComplexity =
        modules.reduce((sum, m) => sum + m.complexity, 0) / Math.max(modules.length, 1);

    return {
        totalFiles,
        totalLines,
        languages,
        avgComplexity,
        largestFiles,
    };
}

/**
 * Get programming language from file extension
 */
function getLanguageFromExtension(ext: string): string | undefined {
    const mapping: Record<string, string> = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.rs': 'rust',
        '.cpp': 'cpp',
        '.c': 'c',
    };

    return mapping[ext.toLowerCase()];
}
