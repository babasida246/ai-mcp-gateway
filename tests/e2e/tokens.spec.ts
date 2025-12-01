import { test, expect } from '@playwright/test';

test.describe('Gateway Tokens Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/gateway-tokens');
        await page.waitForLoadState('networkidle');
    });

    test('should display tokens page heading', async ({ page }) => {
        await expect(page.locator('h1').filter({ hasText: /token/i })).toBeVisible();
    });

    test('should have create token button', async ({ page }) => {
        const createButton = page.getByRole('button', { name: /create.*token|new.*token/i });
        await expect(createButton).toBeVisible();
    });

    test('should open create token modal', async ({ page }) => {
        // Click create token button
        const createButton = page.getByRole('button', { name: /create.*token|new.*token/i });
        await createButton.click();

        // Modal should appear
        await page.waitForSelector('text=/Token Name/i');

        // Check for form inputs by label
        await expect(page.getByLabel(/token name/i)).toBeVisible();
        await expect(page.getByLabel(/expires/i)).toBeVisible();
    });

    test('should display token list or empty state', async ({ page }) => {
        // Page should show either token list or empty state
        const hasTokens = await page.locator('text=/^token-/').count() > 0;
        const hasEmptyState = await page.locator('text=/no tokens|empty/i').count() > 0;

        // One of these should be true
        expect(hasTokens || hasEmptyState).toBeTruthy();
    });

    test('should handle token creation form validation', async ({ page }) => {
        // Open modal
        const createButton = page.getByRole('button', { name: /create.*token|new.*token/i });
        await createButton.click();

        // Try to submit empty form
        const generateButton = page.getByRole('button', { name: /generate/i });
        if (await generateButton.isVisible()) {
            await generateButton.click();

            // Form should still be visible (validation should prevent submission with empty name)
            await expect(page.getByLabel(/token name/i)).toBeVisible();
        }
    });

    test('should allow canceling token creation', async ({ page }) => {
        // Open modal
        const createButton = page.getByRole('button', { name: /create.*token|new.*token/i });
        await createButton.click();

        // Click cancel
        const cancelButton = page.getByRole('button', { name: /cancel/i });
        await cancelButton.click();

        // Modal should close - form inputs should not be visible
        await expect(page.getByLabel(/token name/i)).not.toBeVisible();
    });

    test('should display action buttons for tokens', async ({ page }) => {
        // If there are tokens, check for action buttons
        const tokens = await page.locator('[class*="token"]').count();

        if (tokens > 0) {
            // Should have copy or revoke buttons
            const hasActions = await page.getByRole('button', { name: /copy|revoke/i }).count() > 0;
            expect(hasActions).toBeTruthy();
        }
    });
});
