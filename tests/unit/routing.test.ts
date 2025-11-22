import { describe, it, expect } from 'vitest';
import { estimateCost, compareCosts, formatCost } from '../../src/routing/cost';
import { ModelConfig } from '../../src/config/models';

describe('Cost utilities', () => {
    const mockModel: ModelConfig = {
        id: 'test-model',
        provider: 'openai',
        apiModelName: 'gpt-4o-mini',
        layer: 'L1',
        relativeCost: 3,
        pricePer1kInputTokens: 0.00015,
        pricePer1kOutputTokens: 0.0006,
        capabilities: {
            code: true,
            general: true,
            reasoning: true,
        },
        contextWindow: 128000,
        enabled: true,
    };

    it('should calculate cost correctly', () => {
        const cost = estimateCost(1000, 1000, mockModel);
        expect(cost).toBeCloseTo(0.00075); // (1000/1000 * 0.00015) + (1000/1000 * 0.0006)
    }); it('should return 0 for models without pricing', () => {
        const freeModel = { ...mockModel, pricePer1kInputTokens: undefined };
        const cost = estimateCost(1000, 1000, freeModel);
        expect(cost).toBe(0);
    });

    it('should compare model costs', () => {
        const cheapModel = { ...mockModel, relativeCost: 1 };
        const expensiveModel = { ...mockModel, relativeCost: 10 };

        expect(compareCosts(cheapModel, expensiveModel)).toBeLessThan(0);
        expect(compareCosts(expensiveModel, cheapModel)).toBeGreaterThan(0);
    });

    it('should format cost correctly', () => {
        expect(formatCost(0)).toBe('Free');
        expect(formatCost(0.0001)).toBe('$0.000100');
        expect(formatCost(0.005)).toBe('$0.0050');
        expect(formatCost(1.5)).toBe('$1.50');
    });
});
