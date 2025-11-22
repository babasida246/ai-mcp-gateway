# AI Orchestrator Notes

## Purpose

This document tracks insights, patterns, and lessons learned from using the AI MCP Gateway to improve future performance and routing decisions.

---

## Initial Configuration (2024-11-21)

### Layer Structure

- **Layer L0 (Free/Cheap)**: Mistral 7B Free, Qwen 2 7B Free, OSS Local models
- **Layer L1 (Low-cost)**: Gemini Flash 1.5, GPT-4o Mini
- **Layer L2 (Mid-tier)**: Claude 3 Haiku, GPT-4o
- **Layer L3 (Premium)**: Claude 3.5 Sonnet, OpenAI o1

### Default Routing Strategy

1. Start at L0 for most tasks
2. Enable cross-check for quality=high or quality=critical
3. Auto-escalate if conflicts detected
4. Max escalation to L2 by default (configurable)

---

## Lessons Learned

### Pattern 1: Simple tasks work well at L0

**Date**: TBD  
**Finding**: Simple refactoring, adding comments, basic code generation work well with free models  
**Action**: Continue defaulting to L0 for complexity=low

### Pattern 2: Code review benefits from cross-check

**Date**: TBD  
**Finding**: Having 2+ models review code catches more bugs than single model  
**Action**: Always enable cross-check for quality=high tasks

### Pattern 3: Complex architecture needs L2+

**Date**: TBD  
**Finding**: System design, complex algorithms need reasoning capabilities of L2+ models  
**Action**: Auto-select L2 for complexity=high + quality=high

---

## Common Failure Modes

### Issue 1: Token limit exceeded

**Symptom**: Error when processing very large files  
**Root cause**: Exceeding model context window  
**Solution**: Chunk large inputs, summarize context

### Issue 2: Inconsistent cross-check results

**Symptom**: Models give contradictory answers on same task  
**Root cause**: Task ambiguity, lack of clear requirements  
**Solution**: Improve task decomposition, add clarifying questions

---

## Optimization Ideas

1. **Token estimation**: Improve accuracy of token counting for better cost prediction
2. **Model routing**: Add capability-based routing (e.g., prefer vision models for image tasks)
3. **Cache results**: Cache common patterns to reduce API calls
4. **Batch processing**: Group similar tasks to reduce overhead

---

## Appendix

Add new entries above as you discover patterns and insights.
