import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    shims: true,
    minify: false,
    treeshake: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node20',
    banner: {
        js: '#!/usr/bin/env node',
    },
    // Copy instructions.md to dist
    async onSuccess() {
        const { copyFileSync, mkdirSync } = await import('fs');
        const { join, dirname } = await import('path');

        // Copy to dist/tools/codeAgent for non-bundled imports
        const destPath = join(process.cwd(), 'dist/tools/codeAgent/instructions.md');
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(
            join(process.cwd(), 'src/tools/codeAgent/instructions.md'),
            destPath
        );

        // Also copy to dist root for bundled code
        copyFileSync(
            join(process.cwd(), 'src/tools/codeAgent/instructions.md'),
            join(process.cwd(), 'dist/instructions.md')
        );
    },
});
