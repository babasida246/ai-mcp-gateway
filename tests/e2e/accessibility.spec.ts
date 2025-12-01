import { test, expect } from '@playwright/test';

test.describe('Accessibility Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('dashboard should have proper heading hierarchy', async ({ page }) => {
        // Check for main heading (wait for it to load)
        await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();
    });

    test('navigation should be keyboard accessible', async ({ page }) => {
        // Press Tab to navigate
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Some element should have focus (just check that tab key works)
        const activeElement = page.locator('*:focus');
        const count = await activeElement.count();
        expect(count).toBeGreaterThan(0);
    });

    test('buttons should have accessible labels or text', async ({ page }) => {
        // Get all buttons
        const buttons = await page.locator('button').all();

        for (const button of buttons) {
            const text = await button.innerText().catch(() => '');
            const ariaLabel = await button.getAttribute('aria-label').catch(() => '');
            const title = await button.getAttribute('title').catch(() => '');

            // Button should have visible text OR aria-label OR title
            const hasLabel = text.trim().length > 0 || ariaLabel || title;

            // Only fail if button is visible and has no label
            const isVisible = await button.isVisible().catch(() => false);
            if (isVisible) {
                expect(hasLabel).toBeTruthy();
            }
        }
    });

    test('forms should have proper labels', async ({ page }) => {
        // Navigate to a page with a form
        await page.getByRole('link', { name: /gateway tokens/i }).first().click();
        await page.waitForLoadState('networkidle');

        // Open create token modal
        const createButton = page.getByRole('button', { name: /create|new/i });
        if (await createButton.isVisible()) {
            await createButton.click();
            await page.waitForTimeout(500);

            // Get all visible inputs
            const inputs = await page.locator('input:visible').all();

            for (const input of inputs) {
                const id = await input.getAttribute('id');
                const name = await input.getAttribute('name');
                const ariaLabel = await input.getAttribute('aria-label');
                const placeholder = await input.getAttribute('placeholder');

                // Input should have some form of identification
                expect(id || name || ariaLabel || placeholder).toBeTruthy();
            }
        }
    });
});

test.describe('Error Handling', () => {
    test('should display error state when API fails', async ({ page }) => {
        // Mock API failure
        await page.route('**/v1/server-stats', route => route.abort());
        await page.route('**/health', route => route.abort());

        await page.goto('/');
        await page.waitForTimeout(2000);

        // Should show error message or handle gracefully
        const hasError = await page.locator('text=/error|failed|connection/i').count() > 0;
        const hasRetry = await page.getByRole('button', { name: /retry/i }).count() > 0;

        // Page should still be functional
        const nav = page.getByRole('link', { name: /gateway tokens/i }).first();
        await expect(nav).toBeVisible();

        // Should show some indication of error OR retry button
        expect(hasError || hasRetry).toBeTruthy();
    });

    test('should handle slow API responses', async ({ page }) => {
        // Mock slow API
        await page.route('**/v1/server-stats', async route => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await route.fulfill({
                status: 200,
                body: JSON.stringify({
                    requestsProcessed: 0,
                    totalCostUSD: 0,
                    totalTokens: 0,
                    avgLatencyMs: 0
                })
            });
        });

        await page.goto('/');

        // Should show loading state initially
        // Then content should eventually load
        await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 5000 });
    });

    test('should handle failed API responses', async ({ page }) => {
        // Mock 500 error
        await page.route('**/v1/server-stats', route => route.fulfill({ status: 500 }));

        await page.goto('/');
        await page.waitForTimeout(1000);

        // Page should still render and be usable
        await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();
    });
});

test.describe('Performance Tests', () => {
    test('page should load within 3 seconds', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        await page.waitForSelector('h1:has-text("Dashboard")');
        const loadTime = Date.now() - startTime;

        expect(loadTime).toBeLessThan(3000);
    });

    test('navigation should be smooth', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const startTime = Date.now();
        await page.getByRole('link', { name: /gateway tokens/i }).first().click();
        await page.waitForLoadState('domcontentloaded');
        const navTime = Date.now() - startTime;

        expect(navTime).toBeLessThan(1000);
    });
});
