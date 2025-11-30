/**
 * Code Command - Send file or code for AI analysis/review
 */

import chalk from 'chalk';
import { readFileSync } from 'fs';
import { MCPClient } from '../client.js';
import { basename, extname } from 'path';

export async function codeCommand(
    filePath: string,
    options: {
        prompt?: string;
        endpoint?: string;
        apiKey?: string;
        stdin?: boolean;
    }
): Promise<void> {
    const client = new MCPClient(options.endpoint, options.apiKey);

    let fileContent: string;
    let fileName: string;
    let language: string;

    if (options.stdin || filePath === '-') {
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
            console.log(chalk.dim(`📖 Read file: ${fileName} (${language})\n`));
        } catch (error) {
            console.error(chalk.red(`❌ Cannot read file: ${filePath}`));
            console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    }

    const prompt = options.prompt || 'Please review this code and provide suggestions.';

    console.log(chalk.dim('⏳ Sending to MCP server...\n'));

    const context = client.getCurrentContext();
    // Add file info to context
    if (context.context) {
        context.context.filename = fileName;
        context.context.language = language;
    }

    // Include file content in message
    const fullMessage = `${prompt}\n\nFile: ${fileName}\nLanguage: ${language}\n\n\`\`\`${language}\n${fileContent}\n\`\`\``;

    try {
        const response = await client.send({
            mode: 'code',
            message: fullMessage,
            ...context,
        });

        printResponse(response);
    } catch (error) {
        process.exit(1);
    }
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
 * Print code review response
 */
function printResponse(response: any): void {
    console.log(chalk.cyan('╔' + '═'.repeat(58) + '╗'));
    console.log(chalk.cyan('║') + chalk.bold(' MCP CODE REVIEW RESPONSE ').padEnd(58) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(58) + '╝\n'));

    console.log(chalk.white(response.message || response));
    console.log();

    if (response.model) {
        const tokens = response.tokens?.total || 0;
        const cost = response.cost ? `$${response.cost.toFixed(4)}` : '';
        console.log(chalk.dim(`📊 Model: ${response.model} | Tokens: ${tokens} ${cost ? `| Cost: ${cost}` : ''}`));
    }
    console.log();
}
