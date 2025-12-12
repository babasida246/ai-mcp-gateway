import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, copyFile, writeFile, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

const productDir = join(process.cwd(), 'product');
const binDir = join(productDir, 'bin');
const configDir = join(productDir, 'config');
const docsDir = join(productDir, 'docs');

async function ensureDirs() {
    console.log('📁 Creating product directory structure...');
    await mkdir(productDir, { recursive: true });
    await mkdir(binDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await mkdir(docsDir, { recursive: true });
}

async function buildTypeScript() {
    console.log('\n🔨 Building TypeScript with tsup (minified)...');
    await execAsync('npm run build -- --minify');
}

async function obfuscateCode() {
    console.log('\n🔐 Obfuscating JavaScript...');
    await execAsync('node scripts/postbuild-obfuscate.js');
}

async function packageBinaries() {
    console.log('\n📦 Packaging standalone binaries with pkg...');
    try {
        // pkg builds from dist/index.js
        await execAsync('npx pkg dist/index.js --compress Brotli --targets node20-win-x64,node20-linux-x64,node20-macos-x64 --output product/bin/mcp-gateway');
        console.log('✅ Binaries created in product/bin/');
    } catch (error) {
        console.error('❌ pkg failed:', error.message);
        console.log('ℹ️  Continuing without binaries - obfuscated JS is available in dist/');
    }
}

async function copyEssentialFiles() {
    console.log('\n📄 Copying essential files to product/...');
    
    // Copy config examples
    const configFiles = [
        '.env.example',
        'docker-compose.yml',
        'docker-compose.dev.yml'
    ];
    
    for (const file of configFiles) {
        const src = join(process.cwd(), file);
        if (existsSync(src)) {
            await copyFile(src, join(configDir, file));
        }
    }

    // Copy documentation
    const docFiles = [
        'README.md',
        'LICENSE',
        'docs/DEPLOYMENT-QUICK-START.md',
        'docs/DOCKER-DEPLOYMENT.md',
        'docs/API-GUIDE.md'
    ];
    
    for (const file of docFiles) {
        const src = join(process.cwd(), file);
        if (existsSync(src)) {
            const destFile = file.includes('/') ? file.split('/').pop() : file;
            await copyFile(src, join(docsDir, destFile));
        }
    }

    // Copy migrations (needed for deployment)
    const migrationsDir = join(productDir, 'migrations');
    await mkdir(migrationsDir, { recursive: true });
    try {
        await execAsync(`xcopy /E /I /Y migrations "${migrationsDir}"`);
    } catch {
        // Linux/Mac fallback
        await execAsync(`cp -r migrations "${migrationsDir}"`);
    }

    // Copy obfuscated dist as fallback
    const distObfDir = join(productDir, 'dist-obfuscated');
    await mkdir(distObfDir, { recursive: true });
    try {
        await execAsync(`xcopy /E /I /Y dist "${distObfDir}"`);
    } catch {
        await execAsync(`cp -r dist "${distObfDir}"`);
    }
}

async function createProductReadme() {
    console.log('\n📝 Creating product README...');
    
    const readme = `# MCP Gateway - Production Release

## Quick Start

### Using Standalone Binary (Recommended)

#### Windows
\`\`\`powershell
cd product/bin
.\\mcp-gateway-win.exe
\`\`\`

#### Linux
\`\`\`bash
cd product/bin
chmod +x mcp-gateway-linux
./mcp-gateway-linux
\`\`\`

#### macOS
\`\`\`bash
cd product/bin
chmod +x mcp-gateway-macos
./mcp-gateway-macos
\`\`\`

### Using Node.js (Fallback)

If binaries don't work on your system:

\`\`\`bash
cd product/dist-obfuscated
node index.js
\`\`\`

**Requirements**: Node.js >= 20.0.0

## Configuration

1. Copy \`config/.env.example\` to \`.env\` in your working directory
2. Edit \`.env\` with your API keys and database credentials
3. Run migrations: \`node dist-obfuscated/index.js db:migrate\`

See \`docs/\` for detailed deployment guides.

## Structure

- \`bin/\` - Standalone executables (no Node.js needed)
- \`dist-obfuscated/\` - Obfuscated Node.js code (fallback)
- \`config/\` - Configuration templates
- \`docs/\` - Documentation
- \`migrations/\` - Database migration scripts

## Security Notes

- This release contains minified and obfuscated code
- Source maps are not included
- Binaries are compressed with Brotli

## License

See \`docs/LICENSE\` for license information.
`;

    await writeFile(join(productDir, 'README.md'), readme, 'utf8');
}

async function createGitignore() {
    console.log('\n🔒 Creating product .gitignore...');
    
    const gitignore = `# Exclude source code
../src/
../*.ts
../tsconfig.json
../tsup.config.ts

# Exclude dev files
../node_modules/
../.env
../tests/
../*.test.*
../vitest.config.ts
../playwright.config.ts

# Include only production artifacts
!bin/
!dist-obfuscated/
!config/
!docs/
!migrations/
!README.md
`;

    await writeFile(join(productDir, '.gitignore'), gitignore, 'utf8');
}

async function main() {
    console.log('🚀 Building Production Release\n');
    console.log('═'.repeat(50));
    
    try {
        await ensureDirs();
        await buildTypeScript();
        await obfuscateCode();
        await packageBinaries();
        await copyEssentialFiles();
        await createProductReadme();
        await createGitignore();
        
        console.log('\n' + '═'.repeat(50));
        console.log('✅ Production build complete!');
        console.log('\nProduct location: product/');
        console.log('\nNext steps:');
        console.log('  1. Test binaries: cd product/bin && ./mcp-gateway-*');
        console.log('  2. Create git subtree: git subtree split -P product -b product-release');
        console.log('  3. Push to separate repo or branch');
        
    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
