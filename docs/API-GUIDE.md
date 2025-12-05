# API Reference

## Base URL

```
http://localhost:3000
```

## Authentication

Most endpoints require no authentication for local development. For production, use JWT tokens via the `/v1/auth/login` endpoint.

---

## Health & Status

### GET /health

Check gateway health and service status.

**Response:**
```json
{
  "status": "ok",
  "redis": true,
  "database": true,
  "timestamp": "2025-12-05T06:00:00.000Z",
  "providers": {
    "openai": false,
    "anthropic": false,
    "openrouter": true,
    "oss-local": false
  },
  "healthyProviders": ["openrouter"],
  "layers": {
    "L0": { "enabled": true, "models": [...] },
    "L1": { "enabled": false, "models": [...] },
    "L2": { "enabled": false, "models": [...] },
    "L3": { "enabled": false, "models": [...] }
  },
  "configuration": {
    "logLevel": "info",
    "defaultLayer": "L0",
    "enableCrossCheck": true,
    "enableAutoEscalate": false,
    "maxEscalationLayer": "L0",
    "enableCostTracking": true,
    "costAlertThreshold": 1
  }
}
```

---

## Chat Completion

### POST /v1/chat/completions

OpenAI-compatible chat completion endpoint.

**Request:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "model": "auto",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1733385600,
  "model": "qwen/qwen3-235b-a22b:free",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

---

## Models

### GET /v1/models

List all available models.

**Response:**
```json
{
  "data": [
    {
      "id": "openrouter-qwen-qwen3-235b-a22b:free",
      "provider": "openrouter",
      "apiModelName": "qwen/qwen3-235b-a22b:free",
      "layer": "L0",
      "enabled": true,
      "priority": 0
    }
  ]
}
```

### GET /v1/models/layers

List models grouped by layer.

**Response:**
```json
{
  "layers": {
    "L0": {
      "enabled": true,
      "models": [
        {
          "id": "openrouter-qwen-qwen3-235b-a22b:free",
          "provider": "openrouter",
          "apiModelName": "qwen/qwen3-235b-a22b:free",
          "enabled": true,
          "priority": 0
        },
        {
          "id": "openrouter-llama-3.3-70b-free",
          "provider": "openrouter",
          "apiModelName": "meta-llama/llama-3.3-70b-instruct:free",
          "enabled": true,
          "priority": 1
        }
      ],
      "providers": ["openrouter"]
    },
    "L1": { ... },
    "L2": { ... },
    "L3": { ... }
  }
}
```

### POST /v1/models

Add a new model configuration.

**Request:**
```json
{
  "id": "my-custom-model",
  "provider": "openrouter",
  "apiModelName": "openai/gpt-4",
  "layer": "L2",
  "enabled": true,
  "priority": 0,
  "relativeCost": 1.0
}
```

### PUT /v1/models/:id

Update a model configuration.

**Request:**
```json
{
  "enabled": false,
  "priority": 5
}
```

### DELETE /v1/models/:id

Delete a model configuration.

---

## Terminal

### POST /v1/terminal/sessions

Create a new terminal session.

**Request:**
```json
{
  "type": "local"
}
```

Or for SSH:
```json
{
  "type": "ssh",
  "host": "192.168.1.100",
  "port": 22,
  "username": "admin",
  "password": "secret"
}
```

**Response:**
```json
{
  "session": {
    "id": "term-1733385600000-abc123",
    "type": "local",
    "createdAt": "2025-12-05T06:00:00.000Z",
    "connected": true
  }
}
```

### GET /v1/terminal/sessions

List all terminal sessions.

**Response:**
```json
{
  "sessions": [
    {
      "id": "term-1733385600000-abc123",
      "type": "local",
      "createdAt": "2025-12-05T06:00:00.000Z",
      "connected": true
    }
  ]
}
```

### POST /v1/terminal/:id/execute

Execute a command in a local terminal session.

**Request:**
```json
{
  "command": "ls -la"
}
```

**Response:**
```json
{
  "result": {
    "stdout": "total 64\ndrwxr-xr-x  10 user  staff   320 Dec  5 06:00 .\n...",
    "stderr": "",
    "exitCode": 0
  }
}
```

### POST /v1/terminal/:id/send

Send data to SSH/Telnet session.

**Request:**
```json
{
  "data": "ls -la\n"
}
```

### GET /v1/terminal/:id/output

Get output from SSH/Telnet session (polling).

**Response:**
```json
{
  "output": ["total 64\n", "drwxr-xr-x  10 user  staff   320 Dec  5 06:00 .\n"]
}
```

### DELETE /v1/terminal/:id

Close and delete a terminal session.

---

## Authentication

### POST /v1/auth/login

Login to admin dashboard.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin",
    "username": "admin",
    "role": "admin"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here",
  "details": "Additional details if available"
}
```

Common HTTP status codes:
- `400`: Bad Request - Invalid parameters
- `401`: Unauthorized - Authentication required
- `404`: Not Found - Resource doesn't exist
- `500`: Internal Server Error - Server-side error

---

## Rate Limiting

Default rate limits (configurable):
- 100 requests per minute per IP
- 1000 requests per hour per API key

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1733385660
```
