# Common Bugs and Fixes

## Purpose

This document tracks common bugs encountered during development and their solutions. Use this to build regression tests and improve code quality.

---

## Bug Log

### Bug #001: Token estimation inaccuracy

**Date**: TBD  
**Severity**: Medium  
**Description**: Token estimation using "text.length / 4" is too simplistic, especially for code with many symbols

**Root Cause**: 
- Different tokenizers have different behavior
- Code has different token density than natural language

**Fix**:
- Use tiktoken library for GPT models
- Use model-specific tokenizers when available
- Add safety margin (1.2x estimated tokens)

**Regression Test**: `tests/regression/token-estimation.test.ts`

**Status**: ⏳ Pending

---

### Bug #002: Cross-check false positives

**Date**: TBD  
**Severity**: Low  
**Description**: Cross-check detects "conflicts" when review model uses words like "issue" in positive context

**Root Cause**:
- Simple keyword matching ("issue", "problem") without context understanding
- Review model might say "no issues found"

**Fix**:
- Improve conflict detection logic
- Use sentiment analysis or structured review format
- Ask review model for explicit rating (1-5 scale)

**Regression Test**: `tests/regression/cross-check.test.ts`

**Status**: ⏳ Pending

---

### Bug #003: Environment variable type coercion

**Date**: TBD  
**Severity**: High  
**Description**: Boolean environment variables read as strings, causing logic errors

**Root Cause**:
- process.env returns all values as strings
- Comparison `env.VAR === true` always false

**Fix**:
- Use Zod transform to convert string to boolean
- Explicitly check `=== 'true'` or use transform

**Regression Test**: `tests/unit/env-config.test.ts`

**Status**: ✅ Fixed

---

### Bug #004: Race condition in parallel model calls

**Date**: TBD  
**Severity**: Medium  
**Description**: When calling multiple models in parallel for cross-check, metrics can be corrupted

**Root Cause**:
- Shared metrics object updated from multiple async contexts
- No synchronization

**Fix**:
- Use atomic operations or locks for metrics updates
- Queue metric updates
- Consider immutable data structures

**Regression Test**: `tests/integration/parallel-calls.test.ts`

**Status**: ⏳ Pending

---

### Bug #005: Context window overflow

**Date**: TBD  
**Severity**: High  
**Description**: Large code files cause token limit errors

**Root Cause**:
- Not checking context window size before API call
- No chunking strategy

**Fix**:
- Estimate tokens before call
- Chunk large inputs
- Prioritize relevant sections
- Add max_tokens validation

**Regression Test**: `tests/regression/context-overflow.test.ts`

**Status**: ⏳ Pending

---

## Common Patterns

### Pattern 1: Null/Undefined handling

**Issue**: Optional properties accessed without checking  
**Fix**: Use optional chaining (`?.`) and nullish coalescing (`??`)

```typescript
// ❌ Bad
const cost = model.pricePer1kInputTokens * tokens;

// ✅ Good
const cost = (model.pricePer1kInputTokens ?? 0) * tokens;
```

### Pattern 2: Error message clarity

**Issue**: Generic error messages don't help debugging  
**Fix**: Include context in error messages

```typescript
// ❌ Bad
throw new Error('Model not found');

// ✅ Good
throw new Error(`Model '${modelId}' not found in layer ${layer}. Available models: ${availableModels.join(', ')}`);
```

### Pattern 3: Async error handling

**Issue**: Unhandled promise rejections  
**Fix**: Always use try-catch with async/await

```typescript
// ❌ Bad
async function process() {
  const result = await apiCall();
  return result;
}

// ✅ Good
async function process() {
  try {
    const result = await apiCall();
    return result;
  } catch (error) {
    logger.error('Process failed', { error });
    throw error;
  }
}
```

---

## Testing Checklist

When adding new features, test for:

- [ ] Null/undefined inputs
- [ ] Empty arrays/objects
- [ ] Invalid types
- [ ] Boundary conditions (0, -1, MAX_INT)
- [ ] Concurrent access
- [ ] Network failures
- [ ] Timeout scenarios
- [ ] Invalid configuration

---

## Appendix

Add new bug entries above as they are discovered. Update status:
- ⏳ Pending: Not fixed yet
- 🔧 In Progress: Fix being developed
- ✅ Fixed: Fix deployed and tested
- ✔️ Verified: Regression test passing
