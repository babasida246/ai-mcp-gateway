/**
 * Agent Tools - Claude Code / GitHub Copilot-like capabilities
 * Provides file operations, command execution, and package management
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline';

export interface FileOperation {
    type: 'create' | 'edit' | 'delete' | 'read';
    path: string;
    content?: string;
    searchReplace?: { search: string; replace: string }[];
}

export interface CommandOperation {
    type: 'shell' | 'npm' | 'git';
    command: string;
    args?: string[];
    cwd?: string;
}

export interface AgentAction {
    type: 'file' | 'command' | 'package' | 'search';
    operation: FileOperation | CommandOperation | PackageOperation | SearchOperation;
    description: string;
    requiresConfirmation?: boolean;
}

export interface PackageOperation {
    type: 'install' | 'uninstall';
    packages: string[];
    dev?: boolean;
}

export interface SearchOperation {
    type: 'file' | 'content' | 'symbol';
    query: string;
    path?: string;
    extensions?: string[];
}

export interface ProjectAnalysis {
    projectType: string;
    framework: string;
    language: string;
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
    dependencies: string[];
    devDependencies: string[];
    structure: DirectoryTree;
    relevantFiles: RelevantFile[];
}

export interface DirectoryTree {
    name: string;
    type: 'file' | 'directory';
    children?: DirectoryTree[];
    path: string;
}

export interface RelevantFile {
    path: string;
    type: string;
    summary?: string;
    content?: string;
}

// ============= Project Analysis =============

/**
 * Analyze project structure and detect type
 */
export function analyzeProject(rootDir: string = process.cwd()): ProjectAnalysis {
    const analysis: ProjectAnalysis = {
        projectType: 'unknown',
        framework: 'none',
        language: 'unknown',
        packageManager: 'unknown',
        dependencies: [],
        devDependencies: [],
        structure: { name: path.basename(rootDir), type: 'directory', path: rootDir, children: [] },
        relevantFiles: []
    };

    // Detect package manager
    if (fs.existsSync(path.join(rootDir, 'bun.lockb'))) {
        analysis.packageManager = 'bun';
    } else if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
        analysis.packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
        analysis.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
        analysis.packageManager = 'npm';
    }

    // Read package.json
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            analysis.dependencies = Object.keys(pkg.dependencies || {});
            analysis.devDependencies = Object.keys(pkg.devDependencies || {});

            // Detect framework
            const allDeps = [...analysis.dependencies, ...analysis.devDependencies];
            if (allDeps.includes('svelte') || allDeps.includes('@sveltejs/kit')) {
                analysis.framework = 'SvelteKit';
                analysis.projectType = 'web';
            } else if (allDeps.includes('next')) {
                analysis.framework = 'Next.js';
                analysis.projectType = 'web';
            } else if (allDeps.includes('react')) {
                analysis.framework = 'React';
                analysis.projectType = 'web';
            } else if (allDeps.includes('vue')) {
                analysis.framework = 'Vue';
                analysis.projectType = 'web';
            } else if (allDeps.includes('express') || allDeps.includes('fastify')) {
                analysis.framework = allDeps.includes('express') ? 'Express' : 'Fastify';
                analysis.projectType = 'api';
            } else if (allDeps.includes('electron')) {
                analysis.framework = 'Electron';
                analysis.projectType = 'desktop';
            }

            // Detect language
            if (allDeps.includes('typescript') || fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
                analysis.language = 'TypeScript';
            } else {
                analysis.language = 'JavaScript';
            }
        } catch {
            console.log(chalk.yellow('⚠️ Could not parse package.json'));
        }
    }

    // Build directory structure
    analysis.structure = buildDirectoryTree(rootDir, 3);

    // Find relevant files
    analysis.relevantFiles = findRelevantFiles(rootDir);

    return analysis;
}

/**
 * Build directory tree with depth limit
 */
function buildDirectoryTree(dir: string, maxDepth: number, currentDepth: number = 0): DirectoryTree {
    const name = path.basename(dir);
    const tree: DirectoryTree = {
        name,
        type: 'directory',
        path: dir,
        children: []
    };

    if (currentDepth >= maxDepth) return tree;

    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.svelte-kit', '.next', 'coverage', '__pycache__', '.venv'];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (ignoreDirs.includes(entry.name)) continue;
            if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (tree.children) {
                    tree.children.push(buildDirectoryTree(fullPath, maxDepth, currentDepth + 1));
                }
            } else {
                if (tree.children) {
                    tree.children.push({
                        name: entry.name,
                        type: 'file',
                        path: fullPath
                    });
                }
            }
        }
    } catch {
        // Permission denied or other error
    }

    return tree;
}

/**
 * Find relevant files for context
 */
function findRelevantFiles(rootDir: string): RelevantFile[] {
    const relevantFiles: RelevantFile[] = [];
    const importantFiles = [
        'package.json', 'tsconfig.json', 'vite.config.ts', 'svelte.config.js',
        'README.md', '.env.example', 'docker-compose.yml', 'Dockerfile'
    ];

    // Find important config files
    for (const file of importantFiles) {
        const filePath = path.join(rootDir, file);
        if (fs.existsSync(filePath)) {
            relevantFiles.push({
                path: filePath,
                type: 'config',
                content: fs.readFileSync(filePath, 'utf-8').substring(0, 2000) // Limit content
            });
        }
    }

    // Find source files
    const srcDirs = ['src', 'lib', 'app', 'pages', 'components'];
    for (const srcDir of srcDirs) {
        const srcPath = path.join(rootDir, srcDir);
        if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
            scanSourceFiles(srcPath, relevantFiles, 10); // Limit to 10 files per dir
        }
    }

    return relevantFiles.slice(0, 30); // Max 30 files for context
}

/**
 * Scan source files recursively
 */
function scanSourceFiles(dir: string, files: RelevantFile[], limit: number, currentCount: number = 0): number {
    if (currentCount >= limit) return currentCount;

    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.svelte', '.vue', '.py', '.go', '.rs'];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (currentCount >= limit) break;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                currentCount = scanSourceFiles(fullPath, files, limit, currentCount);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (codeExtensions.includes(ext)) {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    files.push({
                        path: fullPath,
                        type: 'source',
                        summary: extractFileSummary(content, ext),
                        content: content.substring(0, 3000) // Limit content
                    });
                    currentCount++;
                }
            }
        }
    } catch {
        // Permission denied
    }

    return currentCount;
}

/**
 * Extract summary from file content
 */
function extractFileSummary(content: string, ext: string): string {
    const lines = content.split('\n');
    const summary: string[] = [];

    // Extract imports/exports for JS/TS
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        const imports = lines.filter(l => l.trim().startsWith('import ') || l.trim().startsWith('export '));
        summary.push(...imports.slice(0, 5));
    }

    // Extract function/class definitions
    const definitions = lines.filter(l =>
        l.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
        l.match(/^(export\s+)?class\s+\w+/) ||
        l.match(/^(export\s+)?interface\s+\w+/) ||
        l.match(/^(export\s+)?type\s+\w+/)
    );
    summary.push(...definitions.slice(0, 5));

    return summary.join('\n');
}

// ============= Search Operations =============

/**
 * Search for files by name pattern
 */
export function searchFiles(rootDir: string, pattern: string, extensions?: string[]): string[] {
    const results: string[] = [];
    const regex = new RegExp(pattern, 'i');

    function search(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    search(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions && !extensions.includes(ext)) continue;

                    if (regex.test(entry.name)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch {
            // Skip directories with permission issues
        }
    }

    search(rootDir);
    return results;
}

/**
 * Search for content in files
 */
export function searchContent(rootDir: string, query: string, extensions?: string[]): { file: string; line: number; content: string }[] {
    const results: { file: string; line: number; content: string }[] = [];
    const regex = new RegExp(query, 'gi');
    const defaultExtensions = ['.ts', '.tsx', '.js', '.jsx', '.svelte', '.vue', '.json', '.md'];
    const searchExtensions = extensions || defaultExtensions;

    function search(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    search(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (!searchExtensions.includes(ext)) continue;

                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');

                        lines.forEach((line, index) => {
                            if (regex.test(line)) {
                                results.push({
                                    file: fullPath,
                                    line: index + 1,
                                    content: line.trim().substring(0, 200)
                                });
                            }
                        });
                    } catch {
                        // Skip files that can't be read
                    }
                }
            }
        } catch {
            // Skip directories with permission issues
        }
    }

    search(rootDir);
    return results.slice(0, 50); // Limit results
}

// ============= File Operations =============

/**
 * Create or overwrite a file
 */
export function createFile(filePath: string, content: string): { success: boolean; error?: string } {
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Edit a file with search/replace
 */
export function editFile(filePath: string, searchReplace: { search: string; replace: string }[]): { success: boolean; error?: string; changes: number } {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found', changes: 0 };
        }

        let content = fs.readFileSync(filePath, 'utf-8');
        let changes = 0;

        for (const { search, replace } of searchReplace) {
            const regex = new RegExp(escapeRegex(search), 'g');
            const matches = content.match(regex);
            if (matches) {
                changes += matches.length;
                content = content.replace(regex, replace);
            }
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, changes };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), changes: 0 };
    }
}

/**
 * Delete a file
 */
export function deleteFile(filePath: string): { success: boolean; error?: string } {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

        fs.unlinkSync(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Read file content
 */
export function readFile(filePath: string): { success: boolean; content?: string; error?: string } {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ============= Command Execution =============

/**
 * Execute a shell command
 */
export function executeCommand(command: string, cwd?: string): { success: boolean; output?: string; error?: string } {
    try {
        const output = execSync(command, {
            cwd: cwd || process.cwd(),
            encoding: 'utf-8',
            timeout: 60000, // 60 second timeout
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return { success: true, output: output.trim() };
    } catch (error: unknown) {
        const err = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
        return {
            success: false,
            output: err.stdout?.toString() || '',
            error: err.stderr?.toString() || err.message || String(error)
        };
    }
}

/**
 * Install packages
 */
export function installPackages(packages: string[], dev: boolean = false, packageManager: string = 'npm'): { success: boolean; output?: string; error?: string } {
    let command: string;

    switch (packageManager) {
        case 'yarn':
            command = `yarn add ${dev ? '-D ' : ''}${packages.join(' ')}`;
            break;
        case 'pnpm':
            command = `pnpm add ${dev ? '-D ' : ''}${packages.join(' ')}`;
            break;
        case 'bun':
            command = `bun add ${dev ? '-d ' : ''}${packages.join(' ')}`;
            break;
        default:
            command = `npm install ${dev ? '--save-dev ' : ''}${packages.join(' ')}`;
    }

    console.log(chalk.dim(`📦 Running: ${command}`));
    return executeCommand(command);
}

// ============= User Confirmation =============

/**
 * Ask for user confirmation
 */
export async function confirmAction(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow(`⚠️ ${message} (y/N): `), (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

// ============= Action Parser =============

/**
 * Parse AI response for actions
 */
export function parseActionsFromResponse(response: string): AgentAction[] {
    const actions: AgentAction[] = [];

    // Parse FILE_CREATE blocks
    const createRegex = /```(?:FILE_CREATE|create)\s+([^\n]+)\n([\s\S]*?)```/g;
    let match;

    while ((match = createRegex.exec(response)) !== null) {
        actions.push({
            type: 'file',
            operation: {
                type: 'create',
                path: match[1].trim(),
                content: match[2].trim()
            } as FileOperation,
            description: `Create file: ${match[1].trim()}`,
            requiresConfirmation: true
        });
    }

    // Parse FILE_EDIT blocks
    const editRegex = /```(?:FILE_EDIT|edit)\s+([^\n]+)\n([\s\S]*?)```/g;

    while ((match = editRegex.exec(response)) !== null) {
        const content = match[2].trim();
        actions.push({
            type: 'file',
            operation: {
                type: 'edit',
                path: match[1].trim(),
                content: content
            } as FileOperation,
            description: `Edit file: ${match[1].trim()}`,
            requiresConfirmation: true
        });
    }

    // Parse COMMAND blocks
    const commandRegex = /```(?:COMMAND|shell|bash)\n([\s\S]*?)```/g;

    while ((match = commandRegex.exec(response)) !== null) {
        const commands = match[1].trim().split('\n').filter(c => c.trim() && !c.startsWith('#'));

        for (const cmd of commands) {
            actions.push({
                type: 'command',
                operation: {
                    type: 'shell',
                    command: cmd.trim()
                } as CommandOperation,
                description: `Run command: ${cmd.trim()}`,
                requiresConfirmation: true
            });
        }
    }

    // Parse INSTALL blocks
    const installRegex = /```(?:INSTALL|npm|yarn|pnpm)\n([\s\S]*?)```/g;

    while ((match = installRegex.exec(response)) !== null) {
        const packages = match[1].trim().split('\n')
            .filter(p => p.trim() && !p.startsWith('#'))
            .map(p => p.trim());

        if (packages.length > 0) {
            actions.push({
                type: 'package',
                operation: {
                    type: 'install',
                    packages: packages
                } as PackageOperation,
                description: `Install packages: ${packages.join(', ')}`,
                requiresConfirmation: true
            });
        }
    }

    return actions;
}

/**
 * Execute a single action
 */
export async function executeAction(action: AgentAction, projectAnalysis: ProjectAnalysis): Promise<{ success: boolean; message: string }> {
    switch (action.type) {
        case 'file': {
            const fileOp = action.operation as FileOperation;
            if (fileOp.type === 'create' || fileOp.type === 'edit') {
                const result = createFile(fileOp.path, fileOp.content || '');
                return {
                    success: result.success,
                    message: result.success ? `✅ ${fileOp.type === 'create' ? 'Created' : 'Updated'} ${fileOp.path}` : `❌ Failed: ${result.error}`
                };
            } else if (fileOp.type === 'delete') {
                const result = deleteFile(fileOp.path);
                return {
                    success: result.success,
                    message: result.success ? `✅ Deleted ${fileOp.path}` : `❌ Failed: ${result.error}`
                };
            }
            break;
        }

        case 'command': {
            const cmdOp = action.operation as CommandOperation;
            const cmdResult = executeCommand(cmdOp.command, cmdOp.cwd);
            return {
                success: cmdResult.success,
                message: cmdResult.success ? `✅ Command executed:\n${cmdResult.output}` : `❌ Command failed: ${cmdResult.error}`
            };
        }

        case 'package': {
            const pkgOp = action.operation as PackageOperation;
            const pkgResult = installPackages(pkgOp.packages, pkgOp.dev, projectAnalysis.packageManager);
            return {
                success: pkgResult.success,
                message: pkgResult.success ? `✅ Packages installed` : `❌ Installation failed: ${pkgResult.error}`
            };
        }
    }

    return { success: false, message: 'Unknown action type' };
}

// ============= Helpers =============

function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format project analysis for prompt
 */
export function formatProjectAnalysisForPrompt(analysis: ProjectAnalysis): string {
    const lines: string[] = [];

    lines.push('## Project Analysis');
    lines.push(`- Type: ${analysis.projectType}`);
    lines.push(`- Framework: ${analysis.framework}`);
    lines.push(`- Language: ${analysis.language}`);
    lines.push(`- Package Manager: ${analysis.packageManager}`);

    if (analysis.dependencies.length > 0) {
        lines.push(`\n### Dependencies (${analysis.dependencies.length})`);
        lines.push(analysis.dependencies.slice(0, 15).join(', '));
    }

    lines.push('\n### Project Structure');
    lines.push(formatDirectoryTree(analysis.structure, 0));

    if (analysis.relevantFiles.length > 0) {
        lines.push('\n### Relevant Files');
        for (const file of analysis.relevantFiles.slice(0, 10)) {
            const relativePath = path.relative(process.cwd(), file.path);
            lines.push(`\n#### ${relativePath}`);
            if (file.summary) {
                lines.push('```');
                lines.push(file.summary);
                lines.push('```');
            }
        }
    }

    return lines.join('\n');
}

function formatDirectoryTree(tree: DirectoryTree, indent: number): string {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    if (tree.type === 'directory') {
        lines.push(`${prefix}📁 ${tree.name}/`);
        if (tree.children) {
            for (const child of tree.children) {
                lines.push(formatDirectoryTree(child, indent + 1));
            }
        }
    } else {
        lines.push(`${prefix}📄 ${tree.name}`);
    }

    return lines.join('\n');
}

// ============= Chunked File Reading =============

export interface FileChunk {
    content: string;
    startLine: number;
    endLine: number;
    totalLines: number;
    hasMore: boolean;
}

/**
 * Read file in chunks for large files
 */
export function readFileChunked(filePath: string, startLine: number = 1, maxLines: number = 200): FileChunk {
    try {
        if (!fs.existsSync(filePath)) {
            return { content: '', startLine: 0, endLine: 0, totalLines: 0, hasMore: false };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const totalLines = lines.length;

        const actualStart = Math.max(0, startLine - 1);
        const actualEnd = Math.min(actualStart + maxLines, totalLines);

        const chunk = lines.slice(actualStart, actualEnd).join('\n');

        return {
            content: chunk,
            startLine: actualStart + 1,
            endLine: actualEnd,
            totalLines,
            hasMore: actualEnd < totalLines
        };
    } catch {
        return { content: '', startLine: 0, endLine: 0, totalLines: 0, hasMore: false };
    }
}

/**
 * Get file summary with line counts and key sections
 */
export function getFileSummary(filePath: string): { lines: number; size: string; language: string; sections: string[] } {
    try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').length;
        const ext = path.extname(filePath);

        const langMap: Record<string, string> = {
            '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
            '.jsx': 'JavaScript React', '.py': 'Python', '.rs': 'Rust',
            '.go': 'Go', '.java': 'Java', '.cpp': 'C++', '.c': 'C',
            '.svelte': 'Svelte', '.vue': 'Vue', '.md': 'Markdown',
            '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML'
        };

        const language = langMap[ext] || ext.substring(1).toUpperCase();

        // Find key sections (functions, classes, exports)
        const sections: string[] = [];
        const lineArr = content.split('\n');
        for (let i = 0; i < lineArr.length; i++) {
            const line = lineArr[i];
            if (line.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
                line.match(/^(export\s+)?class\s+\w+/) ||
                line.match(/^(export\s+)?interface\s+\w+/) ||
                line.match(/^(export\s+)?type\s+\w+\s*=/) ||
                line.match(/^def\s+\w+/) ||
                line.match(/^class\s+\w+/)) {
                sections.push(`Line ${i + 1}: ${line.trim().substring(0, 80)}`);
            }
        }

        return {
            lines,
            size: formatFileSize(stat.size),
            language,
            sections: sections.slice(0, 20)
        };
    } catch {
        return { lines: 0, size: '0 B', language: 'Unknown', sections: [] };
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============= Git Integration =============

export interface GitStatus {
    branch: string;
    staged: string[];
    modified: string[];
    untracked: string[];
    ahead: number;
    behind: number;
}

/**
 * Check if directory is a git repository
 */
export function isGitRepo(dir: string = process.cwd()): boolean {
    return fs.existsSync(path.join(dir, '.git'));
}

/**
 * Get git status
 */
export function getGitStatus(dir: string = process.cwd()): GitStatus | null {
    if (!isGitRepo(dir)) return null;

    try {
        const status: GitStatus = {
            branch: '',
            staged: [],
            modified: [],
            untracked: [],
            ahead: 0,
            behind: 0
        };

        // Get current branch
        try {
            status.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
        } catch {
            status.branch = 'unknown';
        }

        // Get status
        const statusOutput = execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' });
        const lines = statusOutput.split('\n').filter(l => l.trim());

        for (const line of lines) {
            const index = line[0];
            const workTree = line[1];
            const file = line.substring(3);

            if (index !== ' ' && index !== '?') {
                status.staged.push(file);
            }
            if (workTree === 'M' || workTree === 'D') {
                status.modified.push(file);
            }
            if (index === '?') {
                status.untracked.push(file);
            }
        }

        // Get ahead/behind
        try {
            const aheadBehind = execSync('git rev-list --left-right --count HEAD...@{upstream}', { cwd: dir, encoding: 'utf-8' }).trim();
            const [ahead, behind] = aheadBehind.split('\t').map(Number);
            status.ahead = ahead || 0;
            status.behind = behind || 0;
        } catch {
            // No upstream configured
        }

        return status;
    } catch {
        return null;
    }
}

/**
 * Git commit with message
 */
export function gitCommit(message: string, dir: string = process.cwd()): { success: boolean; error?: string } {
    try {
        execSync(`git add -A`, { cwd: dir, encoding: 'utf-8' });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: dir, encoding: 'utf-8' });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Get git diff for file or all changes
 */
export function getGitDiff(file?: string, staged: boolean = false, dir: string = process.cwd()): string {
    try {
        const stagedFlag = staged ? '--staged' : '';
        const fileArg = file ? `-- "${file}"` : '';
        return execSync(`git diff ${stagedFlag} ${fileArg}`, { cwd: dir, encoding: 'utf-8' });
    } catch {
        return '';
    }
}

/**
 * Create a new git branch
 */
export function gitCreateBranch(branchName: string, dir: string = process.cwd()): { success: boolean; error?: string } {
    try {
        execSync(`git checkout -b ${branchName}`, { cwd: dir, encoding: 'utf-8' });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Checkout existing branch
 */
export function gitCheckout(branchName: string, dir: string = process.cwd()): { success: boolean; error?: string } {
    try {
        execSync(`git checkout ${branchName}`, { cwd: dir, encoding: 'utf-8' });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ============= Undo/Rollback System =============

interface FileBackup {
    path: string;
    content: string;
    timestamp: number;
}

const backupStack: FileBackup[] = [];
const MAX_BACKUPS = 50;

/**
 * Create backup before modifying file
 */
export function createBackup(filePath: string): boolean {
    try {
        if (!fs.existsSync(filePath)) {
            backupStack.push({
                path: filePath,
                content: '__FILE_DID_NOT_EXIST__',
                timestamp: Date.now()
            });
        } else {
            const content = fs.readFileSync(filePath, 'utf-8');
            backupStack.push({
                path: filePath,
                content,
                timestamp: Date.now()
            });
        }

        // Limit backup stack size
        while (backupStack.length > MAX_BACKUPS) {
            backupStack.shift();
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Undo last file change
 */
export function undoLastChange(): { success: boolean; file?: string; error?: string } {
    if (backupStack.length === 0) {
        return { success: false, error: 'No changes to undo' };
    }

    const backup = backupStack.pop();
    if (!backup) {
        return { success: false, error: 'No changes to undo' };
    };

    try {
        if (backup.content === '__FILE_DID_NOT_EXIST__') {
            // File was created, delete it
            if (fs.existsSync(backup.path)) {
                fs.unlinkSync(backup.path);
            }
        } else {
            // Restore original content
            fs.writeFileSync(backup.path, backup.content, 'utf-8');
        }

        return { success: true, file: backup.path };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Get list of changes that can be undone
 */
export function getUndoHistory(): { path: string; timestamp: number }[] {
    return backupStack.map(b => ({
        path: b.path,
        timestamp: b.timestamp
    })).reverse();
}

/**
 * Clear all backups
 */
export function clearBackups(): void {
    backupStack.length = 0;
}

// ============= Multi-file Transaction =============

interface TransactionFile {
    path: string;
    originalContent: string | null; // null means file didn't exist
    newContent: string;
}

let currentTransaction: TransactionFile[] | null = null;

/**
 * Start a multi-file transaction
 */
export function startTransaction(): void {
    currentTransaction = [];
}

/**
 * Add file to transaction
 */
export function addToTransaction(filePath: string, newContent: string): boolean {
    if (!currentTransaction) {
        console.log(chalk.red('❌ No transaction started'));
        return false;
    }

    let originalContent: string | null = null;
    if (fs.existsSync(filePath)) {
        originalContent = fs.readFileSync(filePath, 'utf-8');
    }

    currentTransaction.push({
        path: filePath,
        originalContent,
        newContent
    });

    return true;
}

/**
 * Commit transaction (apply all changes)
 */
export function commitTransaction(): { success: boolean; filesChanged: number; error?: string } {
    if (!currentTransaction || currentTransaction.length === 0) {
        return { success: false, filesChanged: 0, error: 'No transaction or empty transaction' };
    }

    const appliedChanges: TransactionFile[] = [];

    try {
        for (const file of currentTransaction) {
            // Create directory if needed
            const dir = path.dirname(file.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Create backup
            createBackup(file.path);

            // Apply change
            fs.writeFileSync(file.path, file.newContent, 'utf-8');
            appliedChanges.push(file);
        }

        const count = currentTransaction.length;
        currentTransaction = null;

        return { success: true, filesChanged: count };
    } catch (error) {
        // Rollback all applied changes
        for (const file of appliedChanges) {
            try {
                if (file.originalContent === null) {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } else {
                    fs.writeFileSync(file.path, file.originalContent, 'utf-8');
                }
            } catch {
                // Ignore rollback errors
            }
        }

        currentTransaction = null;
        return { success: false, filesChanged: 0, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Rollback transaction (discard all pending changes)
 */
export function rollbackTransaction(): void {
    currentTransaction = null;
}

/**
 * Get pending transaction files
 */
export function getTransactionFiles(): string[] {
    return currentTransaction ? currentTransaction.map(f => f.path) : [];
}

// ============= Smart Search =============

export interface SearchResult {
    file: string;
    matches: {
        line: number;
        content: string;
        context: string[];
    }[];
    score: number;
}

/**
 * Smart search with relevance scoring
 */
export function smartSearch(query: string, rootDir: string = process.cwd()): SearchResult[] {
    const results: SearchResult[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const searchExtensions = ['.ts', '.tsx', '.js', '.jsx', '.svelte', '.vue', '.py', '.go', '.rs', '.java', '.md', '.json'];

    function searchDir(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.') ||
                    entry.name === 'dist' || entry.name === 'build') continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    searchDir(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (!searchExtensions.includes(ext)) continue;

                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        const matches: SearchResult['matches'] = [];
                        let score = 0;

                        // Score based on filename match
                        const fileName = entry.name.toLowerCase();
                        for (const term of searchTerms) {
                            if (fileName.includes(term)) {
                                score += 10;
                            }
                        }

                        // Search content
                        for (let i = 0; i < lines.length; i++) {
                            const lineLower = lines[i].toLowerCase();
                            let lineScore = 0;

                            for (const term of searchTerms) {
                                if (lineLower.includes(term)) {
                                    lineScore += 1;
                                }
                            }

                            if (lineScore > 0) {
                                score += lineScore;
                                const context = [
                                    i > 0 ? lines[i - 1] : '',
                                    lines[i],
                                    i < lines.length - 1 ? lines[i + 1] : ''
                                ].filter(Boolean);

                                matches.push({
                                    line: i + 1,
                                    content: lines[i].trim().substring(0, 150),
                                    context
                                });
                            }
                        }

                        if (matches.length > 0) {
                            results.push({
                                file: fullPath,
                                matches: matches.slice(0, 5), // Limit matches per file
                                score
                            });
                        }
                    } catch {
                        // Skip files that can't be read
                    }
                }
            }
        } catch {
            // Skip directories with permission issues
        }
    }

    searchDir(rootDir);

    // Sort by score and return top results
    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
}

/**
 * Find files by semantic meaning (looking for related code)
 */
export function findRelatedFiles(filePath: string, _rootDir: string = process.cwd()): string[] {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filePath);
        const relatedFiles: string[] = [];

        // Extract imports/requires
        const importMatches = content.match(/(?:import|require)\s*\(?['"](\.{1,2}\/[^'"]+)['"]\)?/g);
        if (importMatches) {
            for (const match of importMatches) {
                const pathMatch = match.match(/['"](\.{1,2}\/[^'"]+)['"]/);
                if (pathMatch) {
                    let importPath = pathMatch[1];
                    const dir = path.dirname(filePath);
                    let fullPath = path.resolve(dir, importPath);

                    // Try adding extensions
                    if (!fs.existsSync(fullPath)) {
                        const extensions = ['.ts', '.tsx', '.js', '.jsx', ext, '/index.ts', '/index.js'];
                        for (const tryExt of extensions) {
                            if (fs.existsSync(fullPath + tryExt)) {
                                fullPath = fullPath + tryExt;
                                break;
                            }
                        }
                    }

                    if (fs.existsSync(fullPath)) {
                        relatedFiles.push(fullPath);
                    }
                }
            }
        }

        // Find test files
        const baseName = path.basename(filePath, ext);
        const testPatterns = [
            `${baseName}.test${ext}`,
            `${baseName}.spec${ext}`,
            `__tests__/${baseName}${ext}`
        ];

        const dir = path.dirname(filePath);
        for (const pattern of testPatterns) {
            const testPath = path.join(dir, pattern);
            if (fs.existsSync(testPath)) {
                relatedFiles.push(testPath);
            }
        }

        return [...new Set(relatedFiles)]; // Remove duplicates
    } catch {
        return [];
    }
}

// ============= Conversation History =============

interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface ConversationSession {
    id: string;
    messages: ConversationMessage[];
    projectPath: string;
    createdAt: number;
    updatedAt: number;
}

const HISTORY_DIR = path.join(process.cwd(), '.mcp-history');

/**
 * Save conversation to history
 */
export function saveConversation(sessionId: string, messages: { role: string; content: string }[], projectPath: string): boolean {
    try {
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }

        const session: ConversationSession = {
            id: sessionId,
            messages: messages.map(m => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content,
                timestamp: Date.now()
            })),
            projectPath,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const filePath = path.join(HISTORY_DIR, `${sessionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');

        return true;
    } catch {
        return false;
    }
}

/**
 * Load conversation from history
 */
export function loadConversation(sessionId: string): ConversationSession | null {
    try {
        const filePath = path.join(HISTORY_DIR, `${sessionId}.json`);
        if (!fs.existsSync(filePath)) return null;

        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as ConversationSession;
    } catch {
        return null;
    }
}

/**
 * List recent conversations
 */
export function listConversations(limit: number = 10): { id: string; updatedAt: number; messageCount: number }[] {
    try {
        if (!fs.existsSync(HISTORY_DIR)) return [];

        const files = fs.readdirSync(HISTORY_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(HISTORY_DIR, f);
                const content = fs.readFileSync(filePath, 'utf-8');
                const session = JSON.parse(content) as ConversationSession;
                return {
                    id: session.id,
                    updatedAt: session.updatedAt,
                    messageCount: session.messages.length
                };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);

        return files;
    } catch {
        return [];
    }
}
