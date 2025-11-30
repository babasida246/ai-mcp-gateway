/**
 * Code Command - Send file or code for AI analysis/review
 * GitHub Copilot-style code analysis with context awareness
 */

import chalk from 'chalk';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { MCPClient } from '../client.js';
import { basename, extname, dirname, join, relative } from 'path';
import { execSync } from 'child_process';
import { displayEscalation } from '../utils/escalation.js';

interface CodeContext {
    relatedFiles: string[];
    imports: string[];
    dependencies: string[];
    gitContext: string;
    projectType: string;
}

export async function codeCommand(
    filePath: string,
    options: {
        prompt?: string;
        endpoint?: string;
        apiKey?: string;
        stdin?: boolean;
        context?: boolean; // Enable deep context analysis
        related?: boolean; // Include related files
        create?: boolean; // Create new code
        output?: string; // Output file for generated code
    }
): Promise<void> {
    const client = new MCPClient(options.endpoint, options.apiKey);

    let fileContent: string;
    let fileName: string;
    let language: string;
    let codeContext: CodeContext | undefined;

    if (options.create || (!existsSync(filePath) && !options.stdin && filePath !== '-')) {
        // Create new code mode (auto-detect if file doesn't exist)
        options.create = true;
        fileContent = '';
        fileName = options.output || 'generated';
        language = options.output ? detectLanguage(options.output) : 'typescript'; // default
        codeContext = undefined;
        // filePath is the prompt
        options.prompt = filePath;
    } else if (options.stdin || filePath === '-') {
        // Read from stdin
        console.log(chalk.dim('📖 Reading from stdin...'));
        fileContent = await readStdin();
        fileName = 'stdin';
        language = 'text';
    } else {
        // Read from file
        try {
            fileContent = readFileSync(filePath, 'utf-8');
            fileName = basename(filePath);
            language = detectLanguage(filePath);

            // Analyze code context (like GitHub Copilot)
            if (options.context !== false) { // Default to true
                console.log(chalk.dim('🔍 Analyzing code context...'));
                codeContext = await analyzeCodeContext(filePath, fileContent, language);
            }

            console.log(chalk.dim(`📖 Read file: ${fileName} (${language})\n`));
        } catch (error) {
            console.error(chalk.red(`❌ Cannot read file: ${filePath}`));
            console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    }

    const prompt = options.prompt || (options.create ? 'Please generate code based on the following description.' : 'Please review this code and provide suggestions for improvement.');

    console.log(chalk.dim('⏳ Sending to MCP server with context...\n'));

    const context = client.getCurrentContext();
    // Add file info to context
    if (context.context) {
        context.context.filename = fileName;
        context.context.language = language;
    }

    // Build enhanced message with context (GitHub Copilot style)
    let fullMessage = buildEnhancedPrompt(prompt, fileName, language, fileContent, codeContext, options.create);

    try {
        const response = await client.send({
            mode: 'code',
            message: fullMessage,
            ...context,
        });

        printResponse(response, codeContext, options.create, options.output);
    } catch (error) {
        process.exit(1);
    }
}

/**
 * Analyze code context like GitHub Copilot
 */
async function analyzeCodeContext(
    filePath: string,
    fileContent: string,
    language: string
): Promise<CodeContext> {
    const context: CodeContext = {
        relatedFiles: [],
        imports: [],
        dependencies: [],
        gitContext: '',
        projectType: 'unknown',
    };

    const dir = dirname(filePath);

    // 1. Extract imports/dependencies
    context.imports = extractImports(fileContent, language);

    // 2. Find related files based on imports
    context.relatedFiles = findRelatedFiles(dir, context.imports, language);

    // 3. Detect project type
    context.projectType = detectProjectType(dir);

    // 4. Get git context
    try {
        const gitStatus = execSync('git status --short', { cwd: dir, encoding: 'utf-8' });
        const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
        context.gitContext = `Branch: ${gitBranch}\n${gitStatus}`;
    } catch {
        // Not a git repo or git not available
    }

    // 5. Read package dependencies if available
    const packageJsonPath = findPackageJson(dir);
    if (packageJsonPath) {
        try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            context.dependencies = [
                ...Object.keys(packageJson.dependencies || {}),
                ...Object.keys(packageJson.devDependencies || {}),
            ].slice(0, 10); // Top 10 dependencies
        } catch {
            // Ignore errors
        }
    }

    return context;
}

/**
 * Extract imports from code based on language
 */
function extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    switch (language) {
        case 'typescript':
        case 'javascript':
            // import { something } from 'module'
            // import something from 'module'
            // require('module')
            const tsImportRegex = /(?:import.*from\s+['"]([^'"]+)['"]|require\s*\(['"]([^'"]+)['"]\))/g;
            let match;
            while ((match = tsImportRegex.exec(content)) !== null) {
                imports.push(match[1] || match[2]);
            }
            break;

        case 'python':
            // import module
            // from module import something
            const pyImportRegex = /(?:^import\s+(\S+)|^from\s+(\S+)\s+import)/gm;
            while ((match = pyImportRegex.exec(content)) !== null) {
                imports.push(match[1] || match[2]);
            }
            break;

        case 'java':
            // import package.Class;
            const javaImportRegex = /^import\s+([\w.]+);/gm;
            while ((match = javaImportRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
            break;

        case 'go':
            // import "package"
            const goImportRegex = /import\s+(?:"([^"]+)"|(\w+)\s+"([^"]+)")/g;
            while ((match = goImportRegex.exec(content)) !== null) {
                imports.push(match[1] || match[3]);
            }
            break;
    }

    return [...new Set(imports)]; // Remove duplicates
}

/**
 * Find related files based on imports
 */
function findRelatedFiles(dir: string, imports: string[], language: string): string[] {
    const relatedFiles: string[] = [];
    const extensions = getLanguageExtensions(language);

    for (const imp of imports) {
        // Skip node_modules and external packages
        if (imp.startsWith('.') || imp.startsWith('/')) {
            for (const ext of extensions) {
                const possiblePath = join(dir, imp + ext);
                if (existsSync(possiblePath)) {
                    relatedFiles.push(possiblePath);
                    break;
                }
            }
        }
    }

    return relatedFiles.slice(0, 5); // Limit to 5 related files
}

/**
 * Get file extensions for a language
 */
function getLanguageExtensions(language: string): string[] {
    const extMap: Record<string, string[]> = {
        'typescript': ['.ts', '.tsx', '.d.ts'],
        'javascript': ['.js', '.jsx', '.mjs'],
        'python': ['.py', '.pyi'],
        'java': ['.java'],
        'go': ['.go'],
        'rust': ['.rs'],
    };
    return extMap[language] || [''];
}

/**
 * Detect project type from directory
 */
function detectProjectType(dir: string): string {
    let currentDir = dir;
    let depth = 0;

    // Walk up to find project root (max 5 levels)
    while (depth < 5) {
        if (existsSync(join(currentDir, 'package.json'))) {
            const pkg = JSON.parse(readFileSync(join(currentDir, 'package.json'), 'utf-8'));
            if (pkg.dependencies?.['react']) return 'React';
            if (pkg.dependencies?.['next']) return 'Next.js';
            if (pkg.dependencies?.['vue']) return 'Vue.js';
            if (pkg.dependencies?.['express']) return 'Express.js';
            if (pkg.dependencies?.['@nestjs/core']) return 'NestJS';
            return 'Node.js';
        }
        if (existsSync(join(currentDir, 'requirements.txt'))) return 'Python';
        if (existsSync(join(currentDir, 'Cargo.toml'))) return 'Rust';
        if (existsSync(join(currentDir, 'go.mod'))) return 'Go';
        if (existsSync(join(currentDir, 'pom.xml'))) return 'Java (Maven)';
        if (existsSync(join(currentDir, 'build.gradle'))) return 'Java (Gradle)';

        const parent = dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
        depth++;
    }

    return 'Unknown';
}

/**
 * Find package.json in directory or parent directories
 */
function findPackageJson(dir: string): string | null {
    let currentDir = dir;
    let depth = 0;

    while (depth < 5) {
        const pkgPath = join(currentDir, 'package.json');
        if (existsSync(pkgPath)) return pkgPath;

        const parent = dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
        depth++;
    }

    return null;
}

/**
 * Build enhanced prompt with context (GitHub Copilot style)
 */
function buildEnhancedPrompt(
    userPrompt: string,
    fileName: string,
    language: string,
    fileContent: string,
    codeContext?: CodeContext,
    isCreate?: boolean
): string {
    let prompt = `${userPrompt}\n\n`;

    if (isCreate) {
        // For code generation
        prompt += `Please generate complete, runnable code for the following request.\n`;
        prompt += `Provide only the code without additional explanations unless asked.\n`;
        prompt += `Use ${language} as the primary language.\n`;
        if (codeContext?.projectType) {
            prompt += `Consider this is for a ${codeContext.projectType} project.\n`;
        }
        return prompt;
    }

    // Add project context
    if (codeContext) {
        prompt += `**Project Context:**\n`;
        prompt += `- Type: ${codeContext.projectType}\n`;
        prompt += `- Language: ${language}\n`;

        if (codeContext.dependencies.length > 0) {
            prompt += `- Dependencies: ${codeContext.dependencies.slice(0, 5).join(', ')}\n`;
        }

        if (codeContext.imports.length > 0) {
            prompt += `- Imports: ${codeContext.imports.slice(0, 8).join(', ')}\n`;
        }

        if (codeContext.gitContext) {
            prompt += `\n**Git Context:**\n${codeContext.gitContext}\n`;
        }

        if (codeContext.relatedFiles.length > 0) {
            prompt += `\n**Related Files:**\n${codeContext.relatedFiles.map(f => `- ${basename(f)}`).join('\n')}\n`;
        }

        prompt += `\n`;
    }

    // Add the code
    prompt += `**File: ${fileName}**\n\n`;
    prompt += `\`\`\`${language}\n${fileContent}\n\`\`\`\n\n`;

    // Add analysis instructions
    prompt += `Please analyze this code and provide:\n`;
    prompt += `1. **Code Quality Assessment** - Overall quality rating and key issues\n`;
    prompt += `2. **Best Practices** - Violations and recommendations\n`;
    prompt += `3. **Bugs & Issues** - Potential bugs, edge cases, error handling\n`;
    prompt += `4. **Performance** - Optimization opportunities\n`;
    prompt += `5. **Security** - Security vulnerabilities if any\n`;
    prompt += `6. **Suggestions** - Concrete improvement suggestions with code examples\n`;

    return prompt;
}

/**
 * Read content from stdin
 */
function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];

        process.stdin.on('data', (chunk) => {
            chunks.push(chunk);
        });

        process.stdin.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
        });

        // If no data after 100ms and stdin is not a TTY, assume empty
        setTimeout(() => {
            if (chunks.length === 0 && !process.stdin.isTTY) {
                resolve('');
            }
        }, 100);
    });
}

/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath: string): string {
    const ext = extname(filePath).toLowerCase();

    const langMap: Record<string, string> = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.h': 'c',
        '.hpp': 'cpp',
        '.cs': 'csharp',
        '.go': 'go',
        '.rs': 'rust',
        '.rb': 'ruby',
        '.php': 'php',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.sh': 'bash',
        '.bash': 'bash',
        '.zsh': 'zsh',
        '.fish': 'fish',
        '.ps1': 'powershell',
        '.sql': 'sql',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.xml': 'xml',
        '.md': 'markdown',
        '.txt': 'text',
    };

    return langMap[ext] || 'text';
}

/**
 * Print code review/generation response with context info
 */
function printResponse(response: any, codeContext?: CodeContext, isCreate?: boolean, outputFile?: string): void {
    const title = isCreate ? 'MCP CODE GENERATION RESPONSE' : 'MCP CODE REVIEW RESPONSE';
    console.log(chalk.cyan('╔' + '═'.repeat(58) + '╗'));
    console.log(chalk.cyan('║') + chalk.bold(` ${title} `).padEnd(58) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(58) + '╝\n'));

    // Show context summary if available (only for review)
    if (codeContext && !isCreate) {
        console.log(chalk.blue('📋 Context Analysis:'));
        console.log(chalk.dim(`  Project: ${codeContext.projectType}`));
        if (codeContext.imports.length > 0) {
            console.log(chalk.dim(`  Imports: ${codeContext.imports.length} modules`));
        }
        if (codeContext.relatedFiles.length > 0) {
            console.log(chalk.dim(`  Related: ${codeContext.relatedFiles.length} files`));
        }
        console.log();
    }

    const content = response.message || JSON.stringify(response, null, 2);

    if (isCreate && outputFile) {
        // Write to file
        try {
            const { writeFileSync } = require('fs');
            writeFileSync(outputFile, content);
            console.log(chalk.green(`✅ Generated code saved to: ${outputFile}`));
            console.log(chalk.dim(`📄 File size: ${content.length} characters`));
        } catch (error) {
            console.error(chalk.red(`❌ Failed to save file: ${outputFile}`));
            console.log(content);
        }
    } else {
        console.log(chalk.white(content));
    }
    console.log();

    // Display escalation if present
    if (response.escalation?.required) {
        displayEscalation(response.escalation);
    }

    if (response.metadata) {
        const meta = response.metadata;
        const complexity = meta.complexity || 'unknown';
        const layer = meta.layer || 'unknown';
        const model = meta.model || response.model || 'unknown';
        const tokens = meta.tokens?.total || response.tokens?.total || 0;
        const cost = meta.cost || response.cost;

        console.log(chalk.dim(`📊 Complexity: ${complexity} | Layer: ${layer} | Model: ${model} | Tokens: ${tokens}${cost ? ` | Cost: $${cost.toFixed(4)}` : ''}`));
    } else if (response.model) {
        const tokens = response.tokens?.total || 0;
        const cost = response.cost ? `$${response.cost.toFixed(4)}` : '';
        console.log(chalk.dim(`📊 Model: ${response.model} | Tokens: ${tokens} ${cost ? `| Cost: ${cost}` : ''}`));
    }
    console.log();
}
