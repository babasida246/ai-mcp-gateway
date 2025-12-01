import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for app to load
        await page.waitForLoadState('networkidle');
    });

    test('should load the dashboard page', async ({ page }) => {
        await expect(page).toHaveTitle(/AI MCP Gateway/);
        await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();
    });

    test('should display navigation sidebar', async ({ page }) => {
        // Check for navigation items (use .first() since there are mobile and desktop navs)
        await expect(page.getByRole('link', { name: /^dashboard$/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /gateway tokens/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /logs/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /providers/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /models/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible();
    });

    test('should navigate between pages', async ({ page }) => {
        // Navigate to Gateway Tokens
        await page.getByRole('link', { name: /gateway tokens/i }).first().click();
        await expect(page).toHaveURL(/.*gateway-tokens/);
        await expect(page.locator('h1').filter({ hasText: /token/i })).toBeVisible();

        // Navigate to Logs
        await page.getByRole('link', { name: /logs/i }).first().click();
        await expect(page).toHaveURL(/.*logs/);

        // Navigate to Providers
        await page.getByRole('link', { name: /providers/i }).first().click();
        await expect(page).toHaveURL(/.*providers/);

        // Navigate to Models
        await page.getByRole('link', { name: /models/i }).first().click();
        await expect(page).toHaveURL(/.*models/);

        // Navigate to Settings
        await page.getByRole('link', { name: /settings/i }).first().click();
        await expect(page).toHaveURL(/.*settings/);

        // Navigate back to Dashboard
        await page.getByRole('link', { name: /^dashboard$/i }).first().click();
        await expect(page).toHaveURL('/');
    });

    test('should display metrics on dashboard', async ({ page }) => {
        // Wait for dashboard content to load
        await page.waitForSelector('h1:has-text("Dashboard")');

        // Check for metric cards by looking for specific text patterns
        const metricsContainer = page.locator('text=/Total Requests|Total Cost|Total Tokens|Avg Latency/').first();
        await expect(metricsContainer).toBeVisible();
    });

    test('should handle loading states', async ({ page }) => {
        // The dashboard should show loading initially and then content
        // System health indicator should be visible
        await expect(page.locator('text=/System Healthy|System Error/')).toBeVisible();
    });

    test('should be responsive on mobile', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Page should still load
        await expect(page.locator('h2').filter({ hasText: 'AI MCP Gateway' }).first()).toBeVisible();

        // Mobile menu button should be visible
        const menuButton = page.getByRole('button', { name: /open sidebar/i });
        await expect(menuButton).toBeVisible();

        // Click to open menu
        await menuButton.click();

        // After clicking menu, navigation links should be visible
        await expect(page.getByRole('link', { name: /^dashboard$/i }).first()).toBeVisible();
    });
});
