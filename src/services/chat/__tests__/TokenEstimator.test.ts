/**
 * Unit tests for TokenEstimator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenEstimator, estimateTokensSync } from '../TokenEstimator';

describe('TokenEstimator', () => {
    let estimator: TokenEstimator;

    beforeEach(() => {
        estimator = new TokenEstimator();
    });

    describe('estimate (async)', () => {
        it('should estimate tokens for English text', async () => {
            const text = 'Hello world! This is a test message.';
            const tokens = await estimator.estimate(text);

            // ~36 chars / 4 = ~9 tokens, plus overhead
            expect(tokens).toBeGreaterThan(5);
            expect(tokens).toBeLessThan(20);
        });

        it('should estimate tokens for CJK text', async () => {
            const text = '这是一个测试消息。你好世界！';
            const tokens = await estimator.estimate(text);

            // CJK uses ~2 chars per token
            expect(tokens).toBeGreaterThan(5);
        });

        it('should estimate tokens for code', async () => {
            const code = `
function hello() {
  console.log('Hello World');
  return true;
}`;
            const tokens = await estimator.estimate(code);

            // Code detection should work
            expect(tokens).toBeGreaterThan(15);
        });

        it('should handle empty string', async () => {
            const tokens = await estimator.estimate('');
            expect(tokens).toBe(0);
        });

        it('should handle very long text', async () => {
            const text = 'word '.repeat(10000);
            const tokens = await estimator.estimate(text);

            expect(tokens).toBeGreaterThan(10000);
        });
    });

    describe('estimateTokensSync (sync helper)', () => {
        it('should estimate tokens synchronously', () => {
            const text = 'Hello world! This is a test message.';
            const tokens = estimateTokensSync(text);

            expect(tokens).toBeGreaterThan(5);
            expect(tokens).toBeLessThan(20);
        });
    });

    describe('estimateMessages', () => {
        it('should estimate tokens for message array', async () => {
            const messages = [
                { role: 'system' as const, content: 'You are a helpful assistant.' },
                { role: 'user' as const, content: 'Hello!' },
                { role: 'assistant' as const, content: 'Hi there! How can I help?' },
            ];

            const total = await estimator.estimateMessages(messages);

            expect(total).toBeGreaterThan(15);
        });

        it('should return 0 for empty message array', async () => {
            const total = await estimator.estimateMessages([]);
            expect(total).toBe(0);
        });
    });

    describe('strategy-specific behavior', () => {
        it('should use character-based estimation by default', async () => {
            const text = 'Test message';
            const charBased = await estimator.estimate(text);

            // Should be roughly chars / 4
            expect(charBased).toBeCloseTo(text.length / 4, 1);
        });
    });

    describe('edge cases', () => {
        it('should handle text with only whitespace', async () => {
            const tokens = await estimator.estimate('   \n\t   ');
            expect(tokens).toBeGreaterThanOrEqual(0);
        });

        it('should handle mixed language text', async () => {
            const text = 'Hello 你好 World 世界';
            const tokens = await estimator.estimate(text);
            expect(tokens).toBeGreaterThan(5);
        });

        it('should handle text with special characters', async () => {
            const text = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const tokens = await estimator.estimate(text);
            expect(tokens).toBeGreaterThan(0);
        });
    });
});
