import { test, expect } from '@playwright/test';

test('Debug Models Page', async ({ page }) => {
    // Listen to console logs
    page.on('console', msg => {
        console.log(`BROWSER: ${msg.type()}: ${msg.text()}`);
    });

    // Listen to page errors
    page.on('pageerror', error => {
        console.log(`PAGE ERROR: ${error.message}`);
    });

    await page.goto('/models');
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/debug-models.png', fullPage: true });

    // Get page content
    const content = await page.content();
    console.log('Page HTML length:', content.length);

    // Check if h1 exists
    const h1Count = await page.locator('h1').count();
    console.log('H1 count:', h1Count);

    // Get all h1 texts
    const h1Texts = await page.locator('h1').allTextContents();
    console.log('H1 texts:', h1Texts);
});
