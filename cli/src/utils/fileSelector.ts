import { readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';

export function slugifyForFilename(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 48) || 'generated';
}

export function findCandidateFiles(promptText: string, maxResults = 10): string[] {
    const cwd = process.cwd();
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'for', 'with', 'by', 'on', 'in', 'of', 'from', 'left', 'right', 'nav', 'navbar', 'menu']);
    const words = (promptText || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w));

    const candidates: { path: string; score: number }[] = [];

    function walk(dir: string) {
        let list: string[] = [];
        try { list = readdirSync(dir); } catch { return; }
        for (const name of list) {
            const full = join(dir, name);
            try {
                const s = statSync(full);
                if (s.isDirectory()) {
                    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') continue;
                    walk(full);
                } else if (s.isFile()) {
                    const rel = relative(cwd, full).replace(/\\/g, '/');
                    const lname = rel.toLowerCase();
                    let score = 0;
                    for (const w of words) {
                        if (lname.includes(w)) score += 2;
                        const base = basename(lname);
                        if (base.includes(w)) score += 3;
                    }
                    if (lname.endsWith('.svelte') || lname.endsWith('.tsx') || lname.endsWith('.jsx') || lname.endsWith('.ts') || lname.endsWith('.js') || lname.endsWith('.html')) {
                        score += 1;
                    }
                    if (score > 0) candidates.push({ path: rel, score });
                }
            } catch { /* ignore */ }
        }
    }

    walk(cwd);

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, maxResults).map(c => c.path);
}

export function chooseOutputForCreate(promptText: string, language: string | undefined): string {
    const candidates = findCandidateFiles(promptText, 8);
    let chosen: string | null = null;

    for (const c of candidates) {
        if (!existsSync(c)) { chosen = c; break; }
    }

    if (!chosen && candidates.length > 0) {
        const first = candidates[0];
        const extMatch = first.match(/\.([0-9a-z]+)$/i);
        const ext = extMatch ? extMatch[1] : (language === 'typescript' ? 'ts' : 'js');
        const slug = slugifyForFilename((promptText || '').split('\n')[0] || 'generated');
        chosen = `generated/${slug}.${ext}`;
    }

    if (!chosen) {
        const ext = language === 'typescript' ? 'ts' : 'js';
        const slug = slugifyForFilename((promptText || '').split('\n')[0] || 'generated');
        chosen = `generated/${slug}.${ext}`;
    }

    // Ensure parent exists
    try {
        const parent = dirname(chosen);
        if (parent && parent !== '.' && !existsSync(parent)) mkdirSync(parent, { recursive: true });
    } catch { /* ignore */ }

    return chosen;
}
