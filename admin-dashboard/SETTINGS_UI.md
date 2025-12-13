# Settings Page Documentation

## Overview

The Settings page provides a comprehensive web interface for managing all AI MCP Gateway configuration stored in the database. It replaces the need to manually edit `.env` files for business configuration.

## Features

### 5 Configuration Tabs

1. **System Configuration**
   - Server host and port
   - API version
   - Log level (debug, info, warn, error)
   - Redis connection settings
   - Cache TTL configuration

2. **Provider Configuration**
   - Add/edit/delete LLM provider credentials
   - Manage API keys (OpenRouter, OpenAI, Anthropic, etc.)
   - Configure provider endpoints
   - Enable/disable providers
   - View encrypted API keys (with toggle visibility)

3. **Layer Configuration**
   - Configure L0-L3 model layers
   - Set model priorities
   - Manage multiple models per layer
   - Add/remove models dynamically
   - Enable/disable layers

4. **Task Configuration**
   - Configure task-specific models (chat, code, analyze, create_project)
   - Set preferred model for each task
   - Manage fallback model chains
   - Enable/disable tasks

5. **Feature Flags**
   - Toggle features on/off
   - View feature descriptions
   - Inspect feature metadata (JSON)
   - Simple toggle switches for quick changes

## UI Components

### Tab Navigation
Clean tab interface at the top for switching between configuration sections.

### Provider Management
- **Add New**: Button to create new provider
- **Edit Mode**: Inline editing with validation
- **API Key Visibility**: Toggle to show/hide encrypted keys
- **Delete**: Remove provider (with confirmation)
- **Status Badges**: Visual indicators for enabled/disabled state

### Layer/Task Configuration
- **Inline Editing**: Click "Edit" to modify configuration
- **Dynamic Lists**: Add/remove models or fallbacks
- **Priority Settings**: Numeric priority values
- **Validation**: Required fields and proper formats

### Feature Flags
- **Toggle Switches**: Simple on/off controls
- **Descriptions**: Hover or view descriptions
- **Metadata Display**: JSON viewer for complex settings

## API Integration

All tabs connect to `/v1/config/*` endpoints:

```typescript
// System Config
GET    /v1/config/system          // Load all settings
PUT    /v1/config/system/:key     // Update single setting

// Providers
GET    /v1/config/providers       // List all providers
GET    /v1/config/providers/:id   // Get one provider
POST   /v1/config/providers/:id   // Create/update provider
DELETE /v1/config/providers/:id   // Delete provider

// Layers
GET    /v1/config/layers          // List all layers
PUT    /v1/config/layers/:layer   // Update layer config

// Tasks
GET    /v1/config/tasks           // List all tasks
PUT    /v1/config/tasks/:task     // Update task config

// Features
GET    /v1/config/features        // List all flags
PUT    /v1/config/features/:flag  // Update flag

// Cache
POST   /v1/config/cache/clear     // Clear config cache
```

## Data Flow

1. **Load**: Page mounts → Fetch all config data in parallel
2. **Edit**: User clicks Edit → Opens inline editor
3. **Save**: User saves → POST/PUT to API → Reload data → Show success
4. **Cache**: Clear cache button → Invalidates server cache

## Validation

### Provider Configuration
- Provider name: Required, alphanumeric
- API Key: Required
- Endpoint: Valid URL format
- Status: Enabled/disabled toggle

### Layer Configuration
- Layer name: L0, L1, L2, or L3
- Models: Array of strings (provider/model format)
- Priority: Integer
- Status: Enabled/disabled

### Task Configuration
- Task type: chat, code, analyze, create_project
- Preferred model: Required
- Fallbacks: Optional array
- Status: Enabled/disabled

### Feature Flags
- Flag key: String identifier
- Enabled: Boolean
- Description: Optional string
- Metadata: Optional JSON object

## Security

### API Keys
- Stored encrypted in database (AES-256-CBC)
- Displayed encrypted in UI by default
- Toggle to show (still encrypted, not decrypted)
- Never sent to browser in decrypted form

### Access Control
- Settings page requires authentication
- Protected by ProtectedRoute component
- Admin-only access (if role-based auth enabled)

## User Experience

### Loading States
- Spinner during initial data load
- Individual save buttons per tab
- Success/error notifications
- Auto-dismiss after 3 seconds

### Error Handling
- API errors shown in red alert box
- Validation errors inline
- Confirmation dialogs for destructive actions
- Graceful fallbacks for missing data

### Responsive Design
- Grid layout adapts to screen size
- Mobile-friendly forms
- Touch-friendly toggle switches
- Scrollable content areas

## Usage Examples

### Adding a New Provider

1. Navigate to **Providers** tab
2. Click **Add Provider**
3. Fill in:
   - Provider Name: `openrouter`
   - API Key: `sk-or-v1-...`
   - Endpoint: `https://openrouter.ai/api/v1`
4. Toggle **Enabled**: ON
5. Click **Save Provider**

### Configuring Layer Models

1. Navigate to **Layers** tab
2. Find the layer (e.g., L1)
3. Click **Edit**
4. Add models:
   - `google/gemini-flash-1.5`
   - `openai/gpt-4o-mini`
5. Set priority: `1`
6. Click **Save Layer**

### Updating System Config

1. Navigate to **System** tab
2. Modify values:
   - Server Port: `3000`
   - Log Level: `info`
   - Redis Host: `localhost`
3. Click **Save Changes**

### Enabling Feature Flags

1. Navigate to **Features** tab
2. Find feature flag (e.g., `ENABLE_ORCHESTRATOR`)
3. Toggle switch to ON
4. Changes save automatically

## Integration with Bootstrap Config

The Settings page works with the hybrid configuration approach:

- **Bootstrap file** (`.env.bootstrap`): Contains DB credentials + encryption key
- **Database config**: All business settings (managed via Settings UI)
- **Runtime**: ConfigService loads from DB, caches in memory

Changes made in Settings UI:
1. Saved to database
2. Cache cleared automatically
3. Available immediately to ConfigService
4. No server restart required

## Troubleshooting

### Settings not loading
- Check `/v1/config/*` API endpoints are accessible
- Verify database connection in `.env.bootstrap`
- Check browser console for errors

### Changes not persisting
- Ensure database migrations ran (`npm run db:migrate`)
- Check system_config, provider_credentials, layer_config, task_config, feature_flags tables exist
- Verify API routes are mounted in server.ts

### API key encryption errors
- Check `CONFIG_ENCRYPTION_KEY` is set in `.env.bootstrap`
- Key must be exactly 32 characters
- Re-run `npm run setup:config` if needed

## Development

### Adding New Config Sections

1. Add database table (migration)
2. Create API endpoints in `src/api/routes/config.ts`
3. Add tab in Settings page
4. Create tab component with form
5. Wire up save handlers

### Testing

```bash
# Test API endpoints
curl http://localhost:3000/v1/config/system
curl http://localhost:3000/v1/config/providers

# Test UI
npm run dev
# Navigate to http://localhost:5173/settings
```

## Future Enhancements

- [ ] Bulk import/export configuration (JSON)
- [ ] Configuration history/audit log
- [ ] Validation rules engine
- [ ] Real-time config updates (WebSocket)
- [ ] Advanced search/filter
- [ ] Configuration templates
- [ ] Multi-environment support
- [ ] Configuration diff viewer
