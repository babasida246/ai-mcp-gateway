# AI Routing Heuristics

## Overview

This document defines the heuristics used by the routing engine to select models and layers for different types of tasks.

---

## Task Classification

### By Type

- **code**: Writing, analyzing, or refactoring code
- **debug**: Finding and fixing bugs
- **refactor**: Restructuring existing code
- **test**: Writing test cases
- **general**: General knowledge questions
- **reasoning**: Complex logical reasoning

### By Complexity

- **low**: Simple, straightforward tasks (< 100 chars, basic operations)
- **medium**: Standard tasks requiring some thought
- **high**: Complex tasks requiring deep analysis or multi-step solutions

### By Quality Requirement

- **normal**: Standard quality, acceptable for most use cases
- **high**: High quality needed, important features
- **critical**: Mission-critical, security/safety/financial implications

---

## Routing Rules

### Rule 1: Complexity-based layer selection

```
IF complexity == 'low' AND quality == 'normal'
  THEN start_layer = 'L0'

IF complexity == 'medium' OR quality == 'high'
  THEN start_layer = 'L1'

IF complexity == 'high' AND quality == 'high'
  THEN start_layer = 'L2'

IF quality == 'critical'
  THEN start_layer = 'L2' (minimum)
```

### Rule 2: Cross-check activation

```
IF quality == 'normal'
  THEN cross_check = disabled (single model for speed)

IF quality == 'high' OR quality == 'critical'
  THEN cross_check = enabled (multiple models for validation)
```

### Rule 3: Auto-escalation triggers

```
IF cross_check_conflicts > 0 AND enable_auto_escalate
  THEN escalate to next_layer (up to MAX_ESCALATION_LAYER)

IF task_fails > 2
  THEN escalate to next_layer
```

### Rule 4: Capability matching

```
FOR task_type IN ['code', 'reasoning']:
  FILTER models WHERE capabilities[task_type] == true

IF no_capable_models_in_layer:
  FALLBACK to any_available_model
```

---

## Layer Escalation Strategy

### When to escalate

1. **Cross-check conflicts**: Primary and review models disagree significantly
2. **Quality requirements**: Task marked as critical
3. **Complexity**: Task complexity exceeds layer capabilities
4. **User request**: Explicit request for premium model

### When NOT to escalate

1. **Cost constraints**: User has set strict budget limits
2. **Speed priority**: Low-latency requirements
3. **Simple tasks**: Complexity=low, even if quality=high
4. **Previous success**: Same task type succeeded at lower layer before

---

## Model Selection Within Layer

Given multiple models in the same layer:

1. **Filter by capability**: Must support task type
2. **Sort by cost**: Prefer cheaper models (relativeCost ascending)
3. **Check availability**: Model must be enabled
4. **Select first match**: Return cheapest capable model

---

## Special Cases

### Case 1: Testing tasks

```
IF task_type == 'test':
  PREFER models with strong code capabilities
  ENABLE cross_check (tests are critical)
  START_LAYER = L0 (tests can be simple)
```

### Case 2: Security/Authentication

```
IF task mentions ['security', 'auth', 'password', 'encryption']:
  FORCE quality = 'critical'
  START_LAYER = L2 minimum
  ENABLE cross_check
```

### Case 3: Data processing

```
IF task involves large data:
  PREFER models with large context windows
  CONSIDER token limits in selection
```

---

## Performance Optimization

### Caching Strategy

- Cache results for identical prompts (exact match)
- TTL: 1 hour for code tasks, 24 hours for general knowledge
- Invalidate on context change

### Batch Processing

- Group similar tasks to same model to reduce cold-start overhead
- Parallel execution where possible

### Token Management

- Estimate tokens before API call
- Chunk inputs if exceeding context window
- Prioritize important context, truncate less important

---

## Continuous Improvement

This document should be updated when:

1. New patterns are discovered
2. Model capabilities change
3. Cost structures are updated
4. User feedback indicates routing issues

---

## Appendix: Model Capabilities Matrix

| Model ID                   | Layer | Code | General | Reasoning | Vision | Cost  |
| -------------------------- | ----- | ---- | ------- | --------- | ------ | ----- |
| oss-llama-3-8b             | L0    | ✓    | ✓       | ✗         | ✗      | Free  |
| openrouter-mistral-7b-free | L0    | ✓    | ✓       | ✗         | ✗      | Free  |
| openrouter-qwen-7b-free    | L0    | ✓    | ✓       | ✗         | ✗      | Free  |
| openrouter-gemini-flash    | L1    | ✓    | ✓       | ✓         | ✓      | $0.08 |
| openai-gpt-4o-mini         | L1    | ✓    | ✓       | ✓         | ✓      | $0.75 |
| anthropic-haiku            | L2    | ✓    | ✓       | ✓         | ✓      | $1.38 |
| openai-gpt-4o              | L2    | ✓    | ✓       | ✓         | ✓      | $12.5 |
| anthropic-sonnet           | L3    | ✓    | ✓       | ✓         | ✓      | $18   |

*Note: Costs are per 1M tokens (input+output combined), approximate*
