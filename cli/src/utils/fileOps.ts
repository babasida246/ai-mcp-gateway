import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { dirname } from 'path';

export interface SafeWriteOptions {
    backup?: boolean; // create .bak
    force?: boolean; // overwrite without prompting
}

export function ensureParentExists(path: string) {
    const parent = dirname(path);
    if (!parent || parent === '.') return;
    try {
        mkdirSync(parent, { recursive: true });
    } catch { /* ignore */ }
}

export function backupFileIfExists(path: string): string | null {
    try {
        if (existsSync(path)) {
            const bak = `${path}.bak`;
            copyFileSync(path, bak);
            return bak;
        }
    } catch {
        // ignore
    }
    return null;
}

export function safeWriteFile(path: string, content: string, opts: SafeWriteOptions = { backup: true, force: false }): { written: boolean; backupPath?: string } {
    ensureParentExists(path);
    if (existsSync(path) && !opts.force) {
        return { written: false };
    }

    let bak: string | undefined;
    if (opts.backup && existsSync(path)) {
        bak = backupFileIfExists(path) || undefined;
    }

    try {
        writeFileSync(path, content, 'utf-8');
        return { written: true, backupPath: bak };
    } catch (err) {
        return { written: false };
    }
}

export function readFileSafe(path: string): string | null {
    try {
        if (!existsSync(path)) return null;
        return readFileSync(path, 'utf-8');
    } catch {
        return null;
    }
}
