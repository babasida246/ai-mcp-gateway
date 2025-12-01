import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Check what is actually rendered', async ({ page }) => {
    await page.goto('/models');
    await page.waitForLoadState('networkidle');

    // Get the entire body text
    const bodyHTML = await page.locator('body').innerHTML();

    // Save to file for inspection
    fs.writeFileSync('test-results/models-page.html', bodyHTML);

    console.log('HTML saved to test-results/models-page.html');
    console.log('Body length:', bodyHTML.length);
    console.log('Contains "Model Layers":', bodyHTML.includes('Model Layers'));
    console.log('Contains "Add Layer":', bodyHTML.includes('Add Layer'));
    console.log('Contains "Loading":', bodyHTML.includes('Loading'));
    console.log('Contains "Error":', bodyHTML.includes('Error'));
});
