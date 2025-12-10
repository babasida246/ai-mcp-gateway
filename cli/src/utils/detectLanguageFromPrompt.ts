export function detectLanguageFromPrompt(prompt: string | undefined, fallback = 'typescript') {
    if (!prompt) return fallback;
    const p = prompt.toLowerCase();

    // Strong signals
    if (p.includes('.svelte') || p.includes('svelte')) return 'svelte';
    if (p.includes('.tsx') || p.includes('react') || p.includes('tsx')) return 'tsx';
    if (p.includes('.jsx') || p.includes('jsx')) return 'jsx';
    if (p.includes('.ts') || p.includes('typescript')) return 'typescript';
    if (p.includes('.js') || p.includes('javascript')) return 'javascript';
    if (p.includes('.py') || p.includes('python')) return 'python';
    if (p.includes('.go') || p.includes('golang')) return 'go';
    if (p.includes('.rs') || p.includes('rust')) return 'rust';
    if (p.includes('.html') || p.includes('html')) return 'html';
    if (p.includes('.css') || p.includes('css')) return 'css';
    if (p.includes('.json') || p.includes('json')) return 'json';

    // Fallback heuristics
    if (p.includes('component') || p.includes('ui') || p.includes('svelte')) return 'svelte';
    if (p.includes('node') || p.includes('server') || p.includes('express')) return 'typescript';

    return fallback;
}

export function langToExt(lang: string) {
    switch (lang) {
        case 'svelte': return 'svelte';
        case 'tsx': return 'tsx';
        case 'jsx': return 'jsx';
        case 'typescript': return 'ts';
        case 'javascript': return 'js';
        case 'python': return 'py';
        case 'go': return 'go';
        case 'rust': return 'rs';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        default: return 'txt';
    }
}
