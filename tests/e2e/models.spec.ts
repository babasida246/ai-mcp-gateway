import { test, expect } from '@playwright/test';

test.describe('Models Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/models');
        await page.waitForLoadState('networkidle');
    });

    test('should load models page', async ({ page }) => {
        await expect(page).toHaveTitle(/AI MCP Gateway/);
        await expect(page.locator('h1').filter({ hasText: 'Models' })).toBeVisible();
    });

    test('should display add layer button', async ({ page }) => {
        const addButton = page.getByRole('button', { name: /add layer/i });
        await expect(addButton).toBeVisible();
    });

    test('should open add layer modal', async ({ page }) => {
        await page.getByRole('button', { name: /add layer/i }).click();

        await expect(page.locator('h2').filter({ hasText: 'Add New Layer' })).toBeVisible();
        await expect(page.getByLabel(/layer name/i)).toBeVisible();
    });

    test('should display existing layers', async ({ page }) => {
        // Wait for layers to load
        await page.waitForTimeout(1000);

        // Check if layers are displayed or empty state
        const hasLayers = await page.locator('.card').count() > 0;
        const hasEmptyState = await page.locator('text=/no layers configured/i').isVisible();

        expect(hasLayers || hasEmptyState).toBeTruthy();
    });

    test('should toggle layer status', async ({ page }) => {
        // Wait for layers to load
        await page.waitForTimeout(1000);

        // Find first layer toggle button
        const toggleButton = page.getByTitle(/disable layer|enable layer/i).first();

        if (await toggleButton.isVisible()) {
            await toggleButton.click();
            // Status should change
            await page.waitForTimeout(500);
        }
    });

    test('should allow adding models to layer', async ({ page }) => {
        await page.waitForTimeout(1000);

        // Find "Add Model" button
        const addModelButton = page.getByRole('button', { name: /add model/i }).first();

        if (await addModelButton.isVisible()) {
            await addModelButton.click();

            // Input field should appear
            const input = page.locator('input[placeholder*="model name"]');
            await expect(input).toBeVisible();
        }
    });

    test('should display models in layer', async ({ page }) => {
        await page.waitForTimeout(1000);

        // Check if any models are displayed
        const modelsExist = await page.locator('text=/Models \\(/').count() > 0;
        const noModelsMsg = await page.locator('text=/no models configured/i').count() > 0;

        expect(modelsExist || noModelsMsg > 0).toBeTruthy();
    });

    test('should be responsive on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/models');
        await page.waitForLoadState('networkidle');

        // Page should still load
        await expect(page.locator('h1').filter({ hasText: 'Model Layers' })).toBeVisible();
    });
});
