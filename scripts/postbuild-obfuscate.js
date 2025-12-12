import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const distDir = join(process.cwd(), 'dist');

async function obfuscateFile(file) {
    if (!file.endsWith('.js')) return;
    const filePath = join(distDir, file);
    let code = await readFile(filePath, 'utf8');

    let shebang = '';
    if (code.startsWith('#!')) {
        const idx = code.indexOf('\n');
        if (idx !== -1) {
            shebang = code.slice(0, idx + 1);
            code = code.slice(idx + 1);
        }
    }

    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.9,
        unicodeEscapeSequence: false,
    });

    const out = shebang + obfuscated.getObfuscatedCode();
    await writeFile(filePath, out, 'utf8');
    console.log('Obfuscated', filePath);
}

async function run() {
    try {
        const files = await readdir(distDir);
        for (const f of files) {
            await obfuscateFile(f);
        }
        console.log('Obfuscation complete');
    } catch (err) {
        console.error('Obfuscation failed:', err);
        process.exit(1);
    }
}

run();
