# MCP Project Configuration (`mcp.config.json`)

Every project created with `mcp create-project` includes a configuration file that controls the execution engine and behavior.

## File Location

The `mcp.config.json` file is created at the root of your project directory.

## Schema

```json
{
  "projectName": "string",
  "description": "string",
  "createdAt": "ISO-8601 datetime",
  "cliVersion": "string",
  "engine": "multi-layer" | "claude-code",
  "useClaudeCode": boolean,
  "layers": {
    "enabled": boolean,
    "defaultEscalation": ["L0", "L1", "L2", "L3"]
  },
  "costTracking": {
    "includePlanningPhase": boolean
  }
}
```

## Fields

### `projectName`
**Type:** `string`

The project name (sanitized from description or user input).

**Example:** `"build-react-dashboard"`

---

### `description`
**Type:** `string`

Original project description/prompt provided during creation.

**Example:** `"Build a React dashboard with authentication and charts"`

---

### `createdAt`
**Type:** `string` (ISO-8601 UTC)

Timestamp when the project was created.

**Example:** `"2025-12-02T10:30:45.123Z"`

---

### `cliVersion`
**Type:** `string`

Version of MCP CLI used to create the project.

**Example:** `"0.1.0"`

---

### `engine`
**Type:** `"multi-layer" | "claude-code"`

**Default:** `"multi-layer"`

Execution engine for AI tasks:

- **`multi-layer`**: Use MCP Gateway's L0 → L1 → L2 → L3 API pipeline
- **`claude-code`**: Use local Claude Code binary (requires Claude Pro subscription)

**Example:**
```json
{
  "engine": "claude-code"
}
```

---

### `useClaudeCode`
**Type:** `boolean`

**Default:** `false`

Quick boolean flag for Claude Code usage. Automatically set to `true` when `engine === "claude-code"`.

**Example:**
```json
{
  "engine": "claude-code",
  "useClaudeCode": true
}
```

---

### `layers`
**Type:** `object`

Layer routing configuration for multi-layer engine.

#### `layers.enabled`
**Type:** `boolean`

**Default:** `true`

Whether layer-based routing is enabled.

#### `layers.defaultEscalation`
**Type:** `string[]`

**Default:** `["L0", "L1", "L2", "L3"]`

Default escalation path for requests.

**Example:**
```json
{
  "layers": {
    "enabled": true,
    "defaultEscalation": ["L0", "L1", "L2", "L3"]
  }
}
```

---

### `costTracking`
**Type:** `object`

Cost tracking preferences.

#### `costTracking.includePlanningPhase`
**Type:** `boolean`

**Default:** `true`

Whether to include planning phase costs (SKETCH, LOGIC_FLOW, ROADMAP generation) in total project cost.

**Example:**
```json
{
  "costTracking": {
    "includePlanningPhase": true
  }
}
```

---

## Usage Scenarios

### Scenario 1: Free Tier Only (Multi-Layer)

```json
{
  "projectName": "my-free-project",
  "description": "Simple website",
  "createdAt": "2025-12-02T10:00:00.000Z",
  "cliVersion": "0.1.0",
  "engine": "multi-layer",
  "useClaudeCode": false,
  "layers": {
    "enabled": true,
    "defaultEscalation": ["L0"]
  },
  "costTracking": {
    "includePlanningPhase": true
  }
}
```

**Behavior:**
- CLI commands use only L0 (free tier) models
- No escalation to paid tiers
- No API costs (except rate limits may apply)

---

### Scenario 2: Claude Code Mode

```json
{
  "projectName": "enterprise-app",
  "description": "Enterprise SaaS platform with microservices",
  "createdAt": "2025-12-02T10:00:00.000Z",
  "cliVersion": "0.1.0",
  "engine": "claude-code",
  "useClaudeCode": true,
  "layers": {
    "enabled": true,
    "defaultEscalation": ["L0", "L1", "L2", "L3"]
  },
  "costTracking": {
    "includePlanningPhase": true
  }
}
```

**Behavior:**
- When `mcp code`, `mcp diff`, etc. need escalation → CLI prompts to use Claude Code
- If user accepts → Launches Claude Code with full project context
- If user declines → Falls back to multi-layer API escalation
- Uses Claude Pro subscription instead of API costs

---

### Scenario 3: Hybrid Mode

```json
{
  "projectName": "hybrid-project",
  "description": "Mobile app with backend API",
  "createdAt": "2025-12-02T10:00:00.000Z",
  "cliVersion": "0.1.0",
  "engine": "multi-layer",
  "useClaudeCode": false,
  "layers": {
    "enabled": true,
    "defaultEscalation": ["L0", "L1", "L2"]
  },
  "costTracking": {
    "includePlanningPhase": true
  }
}
```

**Behavior:**
- Uses multi-layer API by default
- Can still use `--use-claude-code` flag on any command
- Escalation limited to L2 (mid-tier), won't use L3 (premium)

---

## Modifying Configuration

You can manually edit `mcp.config.json` to change behavior:

### Switch to Claude Code Mode

```json
{
  "engine": "claude-code",
  "useClaudeCode": true
}
```

### Disable Escalation Beyond L1

```json
{
  "layers": {
    "enabled": true,
    "defaultEscalation": ["L0", "L1"]
  }
}
```

### Exclude Planning Costs

```json
{
  "costTracking": {
    "includePlanningPhase": false
  }
}
```

---

## Auto-Detection

MCP CLI automatically searches for `mcp.config.json` up to 5 levels up from the current directory. This allows you to run commands from subdirectories:

```bash
cd my-project/src/components
mcp code Button.tsx -p "Add loading state"
# CLI finds ../../mcp.config.json and uses project settings
```

---

## Best Practices

1. **Commit to Git**: Include `mcp.config.json` in version control so team members share the same settings

2. **Claude Code for Large Projects**: Use `engine: "claude-code"` for projects with >1000 lines of code where full context matters

3. **Multi-Layer for Quick Tasks**: Use `engine: "multi-layer"` for small scripts and utilities where API costs are negligible

4. **Free Tier for Learning**: Set `defaultEscalation: ["L0"]` when learning or experimenting to avoid unexpected costs

5. **Team Alignment**: Discuss engine choice with your team - Claude Code requires everyone to have Claude Pro subscriptions

---

## Migration

To convert an existing project to use Claude Code:

1. Create `mcp.config.json` manually:
   ```bash
   cd my-existing-project
   cat > mcp.config.json << 'EOF'
   {
     "projectName": "my-existing-project",
     "description": "Converted project",
     "createdAt": "2025-12-02T10:00:00.000Z",
     "cliVersion": "0.1.0",
     "engine": "claude-code",
     "useClaudeCode": true,
     "layers": {
       "enabled": true,
       "defaultEscalation": ["L0", "L1", "L2", "L3"]
     },
     "costTracking": {
       "includePlanningPhase": true
     }
   }
   EOF
   ```

2. Test with a command:
   ```bash
   mcp code src/index.ts -p "Review this code"
   # Should prompt to use Claude Code
   ```

---

## Related Commands

- **Create Project**: `mcp create-project "description" --use-claude-code`
- **Launch Claude Code**: `mcp claude --cwd ./project`
- **Force Claude Code**: `mcp code file.ts --use-claude-code -p "refactor"`

---

## Troubleshooting

**Config not detected?**
- Ensure you're in the project directory or a subdirectory
- Check that `mcp.config.json` exists at project root
- Verify JSON syntax is valid

**Claude Code not launching?**
- Install Claude Code: `npm install -g @anthropic-ai/claude-code`
- Set `CLAUDE_BIN` environment variable if using custom install path
- Check `claude --version` to verify installation

**Always being prompted to use Claude Code?**
- Set `"engine": "multi-layer"` to disable automatic Claude Code prompts
- Or use `--no-use-claude-code` flag (if implemented)

---

## See Also

- [MCP CLI README](./README.md) - Full CLI documentation
- [Claude Code Documentation](https://docs.anthropic.com/claude-code) - Official Claude Code docs
- [Layer Configuration](../README.md#layers) - Backend layer configuration
