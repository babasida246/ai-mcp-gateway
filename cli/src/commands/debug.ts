/**
 * Debug Command - Capture and analyze CLI output for debugging
 * Allows reading previous command outputs and saving them for analysis
 */

import chalk from 'chalk';
import { writeFileSync, existsSync, readFileSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

interface DebugOptions {
    output?: string;
    append?: boolean;
    format?: 'json' | 'text' | 'markdown';
    includeTimestamp?: boolean;
    maxLines?: number;
}

export async function debugCommand(
    action: string,
    options: DebugOptions & {
        endpoint?: string;
        apiKey?: string;
        username?: string;
        password?: string;
    }
): Promise<void> {
    try {
        switch (action) {
            case 'capture':
                await captureTerminalOutput(options);
                break;
            case 'read':
                await readCapturedOutput(options);
                break;
            case 'clear':
                await clearDebugLogs();
                break;
            case 'analyze':
                await analyzeDebugLogs(options);
                break;
            default:
                console.log(chalk.red('❌ Invalid action. Use: capture, read, clear, or analyze'));
                process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red(`❌ Debug command failed: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}

/**
 * Capture terminal output for debugging
 */
async function captureTerminalOutput(options: DebugOptions): Promise<void> {
    console.log(chalk.blue('🔍 Starting terminal output capture...'));
    console.log(chalk.dim('Press Ctrl+C to stop capturing'));

    const debugDir = join(process.cwd(), '.mcp-debug');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = options.output || `terminal-output-${timestamp}.log`;
    const filepath = join(debugDir, filename);

    // Ensure debug directory exists
    if (!existsSync(debugDir)) {
        mkdirSync(debugDir, { recursive: true });
    }

    console.log(chalk.dim(`📝 Saving output to: ${filepath}`));

    // Capture stdout and stderr immediately
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;

    let buffer = '';
    const maxBufferSize = 1024 * 1024; // 1MB buffer limit

    // Override stdout
    process.stdout.write = function (chunk: any, encoding?: any, callback?: any) {
        const output = chunk.toString();
        buffer += output;
        if (buffer.length > maxBufferSize) {
            buffer = buffer.slice(-maxBufferSize / 2); // Keep last half
        }
        return originalStdout.call(process.stdout, chunk, encoding, callback);
    };

    // Override stderr
    process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
        const output = chunk.toString();
        buffer += output;
        if (buffer.length > maxBufferSize) {
            buffer = buffer.slice(-maxBufferSize / 2);
        }
        return originalStderr.call(process.stderr, chunk, encoding, callback);
    };

    // Set up signal handler for graceful shutdown
    let isShuttingDown = false;
    const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(chalk.yellow('\n⏹️  Stopping capture...'));

        // Restore original functions
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;

        // Save captured output
        try {
            const content = formatOutput(buffer, options);
            writeFileSync(filepath, content, 'utf-8');
            console.log(chalk.green(`✅ Output captured and saved to: ${filepath}`));
            console.log(chalk.dim(`📊 Captured ${buffer.length} characters`));
        } catch (error) {
            console.error(chalk.red(`❌ Failed to save output: ${error instanceof Error ? error.message : String(error)}`));
        }

        process.exit(0);
    };

    // Handle termination signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive and show status
    const startTime = Date.now();
    const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        process.stdout.write(`\r${chalk.dim(`📊 Capturing... ${elapsed}s elapsed, ${buffer.length} chars`)}\r`);
    }, 1000);

    // Cleanup interval on exit
    process.on('exit', () => {
        clearInterval(interval);
        process.stdout.write('\n'); // New line after status updates
    });
}

/**
 * Read previously captured debug output
 */
async function readCapturedOutput(options: DebugOptions): Promise<void> {
    const debugDir = join(process.cwd(), '.mcp-debug');

    if (!existsSync(debugDir)) {
        console.log(chalk.yellow('⚠️  No debug logs found. Use "mcp debug capture" first.'));
        return;
    }

    const files = readdirSync(debugDir)
        .filter((file: string) => file.endsWith('.log'))
        .sort()
        .reverse(); // Most recent first

    if (files.length === 0) {
        console.log(chalk.yellow('⚠️  No debug log files found.'));
        return;
    }

    const latestFile = options.output || files[0];
    const filepath = join(debugDir, latestFile);

    if (!existsSync(filepath)) {
        console.log(chalk.red(`❌ Debug file not found: ${filepath}`));
        console.log(chalk.dim('Available files:'));
        files.forEach((file: string) => console.log(chalk.dim(`  - ${file}`)));
        return;
    }

    try {
        const content = readFileSync(filepath, 'utf-8');
        const lines = content.split('\n');

        console.log(chalk.blue(`📖 Reading debug log: ${latestFile}`));
        console.log(chalk.dim(`📊 Total lines: ${lines.length}`));
        console.log(chalk.dim('─'.repeat(50)));

        // Display content with optional line limiting
        const displayLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;
        displayLines.forEach((line: string, index: number) => {
            if (line.trim()) {
                console.log(`${chalk.gray((index + 1).toString().padStart(4, ' '))}: ${line}`);
            }
        });

        if (options.maxLines && lines.length > options.maxLines) {
            console.log(chalk.dim(`... (${lines.length - options.maxLines} more lines)`));
        }

    } catch (error) {
        console.error(chalk.red(`❌ Failed to read debug file: ${error instanceof Error ? error.message : String(error)}`));
    }
}

/**
 * Clear debug logs
 */
async function clearDebugLogs(): Promise<void> {
    const debugDir = join(process.cwd(), '.mcp-debug');

    if (!existsSync(debugDir)) {
        console.log(chalk.yellow('⚠️  No debug directory found.'));
        return;
    }

    const files = readdirSync(debugDir)
        .filter((file: string) => file.endsWith('.log'));

    if (files.length === 0) {
        console.log(chalk.yellow('⚠️  No debug log files to clear.'));
        return;
    }

    console.log(chalk.blue(`🗑️  Clearing ${files.length} debug log files...`));

    files.forEach((file: string) => {
        try {
            unlinkSync(join(debugDir, file));
            console.log(chalk.dim(`  ✅ Deleted: ${file}`));
        } catch (error) {
            console.log(chalk.red(`  ❌ Failed to delete: ${file}`));
        }
    });

    console.log(chalk.green('✅ Debug logs cleared.'));
}

/**
 * Analyze debug logs for patterns and insights
 */
async function analyzeDebugLogs(options: DebugOptions): Promise<void> {
    const debugDir = join(process.cwd(), '.mcp-debug');

    if (!existsSync(debugDir)) {
        console.log(chalk.yellow('⚠️  No debug logs found for analysis.'));
        return;
    }

    const files = readdirSync(debugDir)
        .filter((file: string) => file.endsWith('.log'));

    if (files.length === 0) {
        console.log(chalk.yellow('⚠️  No debug log files to analyze.'));
        return;
    }

    console.log(chalk.blue(`🔍 Analyzing ${files.length} debug log files...`));

    const analysis = {
        totalFiles: files.length,
        totalLines: 0,
        errors: 0,
        warnings: 0,
        apiCalls: 0,
        fileOperations: 0,
        patterns: {} as Record<string, number>
    };

    files.forEach((file: string) => {
        try {
            const content = readFileSync(join(debugDir, file), 'utf-8');
            const lines = content.split('\n');

            analysis.totalLines += lines.length;

            lines.forEach((line: string) => {
                const lowerLine = line.toLowerCase();

                // Count patterns
                if (lowerLine.includes('error') || lowerLine.includes('❌')) analysis.errors++;
                if (lowerLine.includes('warning') || lowerLine.includes('warn') || lowerLine.includes('⚠️')) analysis.warnings++;
                if (lowerLine.includes('api') || lowerLine.includes('request') || lowerLine.includes('response')) analysis.apiCalls++;
                if (lowerLine.includes('file') || lowerLine.includes('write') || lowerLine.includes('read')) analysis.fileOperations++;

                // Extract common patterns
                const patterns = [
                    /✅\s*(.+)/g,
                    /❌\s*(.+)/g,
                    /🔍\s*(.+)/g,
                    /📝\s*(.+)/g,
                    /⏳\s*(.+)/g
                ];

                patterns.forEach(pattern => {
                    let match;
                    while ((match = pattern.exec(line)) !== null) {
                        const key = match[1].trim();
                        analysis.patterns[key] = (analysis.patterns[key] || 0) + 1;
                    }
                });
            });
        } catch (error) {
            console.log(chalk.red(`  ❌ Failed to analyze: ${file}`));
        }
    });

    // Display analysis results
    console.log(chalk.blue('\n📊 Debug Log Analysis Results:'));
    console.log(chalk.dim('─'.repeat(40)));
    console.log(`📁 Files analyzed: ${analysis.totalFiles}`);
    console.log(`📝 Total lines: ${analysis.totalLines}`);
    console.log(`❌ Errors found: ${analysis.errors}`);
    console.log(`⚠️  Warnings found: ${analysis.warnings}`);
    console.log(`🔗 API calls: ${analysis.apiCalls}`);
    console.log(`📄 File operations: ${analysis.fileOperations}`);

    if (Object.keys(analysis.patterns).length > 0) {
        console.log(chalk.dim('\n🔍 Common Patterns:'));
        Object.entries(analysis.patterns)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .forEach(([pattern, count]) => {
                console.log(`  ${pattern}: ${count} times`);
            });
    }

    // Save analysis if requested
    if (options.output) {
        const analysisFile = join(debugDir, options.output);
        const analysisContent = JSON.stringify(analysis, null, 2);
        writeFileSync(analysisFile, analysisContent, 'utf-8');
        console.log(chalk.green(`\n💾 Analysis saved to: ${analysisFile}`));
    }
}

/**
 * Format output based on specified format
 */
function formatOutput(content: string, options: DebugOptions): string {
    const timestamp = options.includeTimestamp ? new Date().toISOString() : null;

    switch (options.format) {
        case 'json':
            return JSON.stringify({
                timestamp,
                content: content.split('\n'),
                metadata: {
                    lines: content.split('\n').length,
                    characters: content.length
                }
            }, null, 2);

        case 'markdown':
            let markdown = timestamp ? `# Debug Output - ${timestamp}\n\n` : '# Debug Output\n\n';
            markdown += '```\n';
            markdown += content;
            markdown += '\n```\n';
            return markdown;

        case 'text':
        default:
            let output = '';
            if (timestamp) {
                output += `=== Debug Output - ${timestamp} ===\n\n`;
            }
            output += content;
            return output;
    }
}