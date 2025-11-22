import { describe, it, expect } from 'vitest';
import {
    getModelsByLayer,
    getModelById,
    getEnabledModels,
    getNextLayer,
} from '../../src/config/models';

describe('Model configuration', () => {
    it('should get models by layer', () => {
        const l0Models = getModelsByLayer('L0');
        expect(l0Models.length).toBeGreaterThan(0);
        l0Models.forEach((model) => {
            expect(model.layer).toBe('L0');
            expect(model.enabled).toBe(true);
        });
    });

    it('should get model by ID', () => {
        const model = getModelById('openai-gpt-4o-mini');
        expect(model).toBeDefined();
        expect(model?.id).toBe('openai-gpt-4o-mini');
    });

    it('should return undefined for non-existent model', () => {
        const model = getModelById('non-existent-model');
        expect(model).toBeUndefined();
    });

    it('should get all enabled models', () => {
        const models = getEnabledModels();
        expect(models.length).toBeGreaterThan(0);
        models.forEach((model) => {
            expect(model.enabled).toBe(true);
        });
    });

    it('should get next layer correctly', () => {
        expect(getNextLayer('L0')).toBe('L1');
        expect(getNextLayer('L1')).toBe('L2');
        expect(getNextLayer('L2')).toBe('L3');
        expect(getNextLayer('L3')).toBeUndefined();
    });
});
