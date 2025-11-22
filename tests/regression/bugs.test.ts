import { describe, it, expect } from 'vitest';

/**
 * Regression test example
 * 
 * When bugs are found, add tests here to prevent regression
 */

describe('Regression tests', () => {
    it('should handle empty TODO list gracefully', () => {
        // Example: Bug where empty TODO caused crash
        // Fixed: Added validation
        const todoList: string[] = [];
        expect(() => {
            // Your code that processes TODO
            todoList.forEach((item) => console.log(item));
        }).not.toThrow();
    });

    it('should handle undefined model configuration', () => {
        // Example: Crash when model not found
        const modelId = 'non-existent';
        expect(() => {
            const model = undefined; // getModelById(modelId)
            if (!model) {
                throw new Error(`Model ${modelId} not found`);
            }
        }).toThrow('Model non-existent not found');
    });
});
