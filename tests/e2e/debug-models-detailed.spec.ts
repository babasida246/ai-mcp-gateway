import { test, expect } from '@playwright/test';

test('Debug Models Page - Detailed', async ({ page }) => {
    // Listen to all browser console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
        const text = `[${msg.type()}] ${msg.text()}`;
        consoleMessages.push(text);
        console.log(text);
    });

    // Listen to page errors
    const pageErrors: string[] = [];
    page.on('pageerror', error => {
        const text = `ERROR: ${error.message}`;
        pageErrors.push(text);
        console.log(text);
    });

    // Listen to network requests
    page.on('response', response => {
        if (response.url().includes('/health')) {
            console.log(`API Response: ${response.status()} - ${response.url()}`);
        }
    });

    await page.goto('/models');

    // Wait longer for API call
    await page.waitForTimeout(5000);

    // Check loading state
    const loadingVisible = await page.locator('text=Loading').isVisible().catch(() => false);
    console.log('Loading visible:', loadingVisible);

    // Check error state
    const errorVisible = await page.locator('text=Error').isVisible().catch(() => false);
    console.log('Error visible:', errorVisible);

    // Check if h1 "Model Layers" exists
    const h1Visible = await page.locator('h1:has-text("Model Layers")').isVisible().catch(() => false);
    console.log('H1 "Model Layers" visible:', h1Visible);

    // Get all visible text on page
    const bodyText = await page.locator('body').textContent();
    console.log('Page contains "Model Layers":', bodyText?.includes('Model Layers'));
    console.log('Page contains "Add Layer":', bodyText?.includes('Add Layer'));

    // Take screenshot
    await page.screenshot({ path: 'test-results/debug-models-detailed.png', fullPage: true });

    console.log('\n=== Console Messages ===');
    consoleMessages.forEach(msg => console.log(msg));

    console.log('\n=== Page Errors ===');
    if (pageErrors.length === 0) {
        console.log('No page errors');
    } else {
        pageErrors.forEach(err => console.log(err));
    }
});
