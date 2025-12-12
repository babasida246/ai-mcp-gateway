#!/usr/bin/env node

/**
 * Git Subtree Helper for Product Release
 * 
 * This script helps manage the product/ directory as a git subtree
 * that can be deployed to a separate repository without source code.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PRODUCT_DIR = 'product';
const PRODUCT_BRANCH = 'product-release';

async function run(cmd, description) {
    console.log(`\n▶️  ${description}...`);
    try {
        const { stdout, stderr } = await execAsync(cmd);
        if (stdout) console.log(stdout.trim());
        if (stderr) console.error(stderr.trim());
        console.log('✅ Done');
        return true;
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        return false;
    }
}

async function createSubtreeBranch() {
    console.log('\n🌳 Creating Git Subtree for Product Release');
    console.log('═'.repeat(50));

    // Check if product/ exists
    try {
        await execAsync(`test -d ${PRODUCT_DIR} || dir ${PRODUCT_DIR}`);
    } catch {
        console.error(`❌ Product directory not found. Run 'npm run build:product' first.`);
        process.exit(1);
    }

    // Add product files to git
    await run(
        `git add ${PRODUCT_DIR}`,
        'Adding product files to git'
    );

    // Commit product changes
    const commitResult = await run(
        `git commit -m "chore: update product release" || echo "Nothing to commit"`,
        'Committing product changes'
    );

    // Create/update subtree branch
    console.log(`\n📦 Creating ${PRODUCT_BRANCH} branch...`);
    const branchExists = await execAsync(`git rev-parse --verify ${PRODUCT_BRANCH}`)
        .then(() => true)
        .catch(() => false);

    if (branchExists) {
        console.log(`ℹ️  Branch ${PRODUCT_BRANCH} exists, will update it`);
    }

    await run(
        `git subtree split --prefix=${PRODUCT_DIR} -b ${PRODUCT_BRANCH}`,
        `Splitting product/ into ${PRODUCT_BRANCH} branch`
    );

    console.log('\n' + '═'.repeat(50));
    console.log('✅ Subtree branch created successfully!');
    console.log('\n📋 Next steps:\n');
    console.log(`  View the branch:`);
    console.log(`    git checkout ${PRODUCT_BRANCH}\n`);
    console.log(`  Push to a separate repository:`);
    console.log(`    git remote add product-repo <url>`);
    console.log(`    git push product-repo ${PRODUCT_BRANCH}:main\n`);
    console.log(`  Or push to GitHub as a release:`);
    console.log(`    git push origin ${PRODUCT_BRANCH}\n`);
    console.log(`  Return to main branch:`);
    console.log(`    git checkout master\n`);
}

async function pushToRemote() {
    const args = process.argv.slice(2);
    
    if (args[0] === 'push' && args[1]) {
        const remoteName = args[1];
        const remoteBranch = args[2] || 'main';
        
        console.log(`\n🚀 Pushing ${PRODUCT_BRANCH} to ${remoteName}/${remoteBranch}...`);
        
        await run(
            `git push ${remoteName} ${PRODUCT_BRANCH}:${remoteBranch} --force`,
            `Pushing to ${remoteName}`
        );
        
        console.log('\n✅ Product released!');
    } else if (args[0] === 'push') {
        console.error('\n❌ Usage: node scripts/setup-subtree.js push <remote-name> [branch]');
        console.log('\nExample:');
        console.log('  node scripts/setup-subtree.js push product-repo main');
        process.exit(1);
    } else {
        await createSubtreeBranch();
    }
}

pushToRemote().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});
