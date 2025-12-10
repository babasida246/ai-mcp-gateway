# Infrastructure Deployment via Chat - Complete Reference Guide

## 📋 Table of Contents

1. [Quick Navigation](#quick-navigation)
2. [Feature Overview](#feature-overview)
3. [File Directory](#file-directory)
4. [Getting Started](#getting-started)
5. [Core Concepts](#core-concepts)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)
8. [API Quick Reference](#api-quick-reference)
9. [Code Examples](#code-examples)
10. [Support & Resources](#support--resources)

---

## Quick Navigation

### I want to...

| Task | Document | File |
|------|----------|------|
| **Understand the system** | [Feature Overview](#feature-overview) | `DEPLOYMENT_IMPLEMENTATION_SUMMARY.md` |
| **Get started quickly** | `DEPLOYMENT_QUICK_START.md` | Section: "Basic Workflow" |
| **See detailed API docs** | `DEPLOYMENT_VIA_CHAT.md` | Section: "API Reference" |
| **Understand architecture** | `DEPLOYMENT_DIAGRAMS.md` | All diagrams |
| **Set up the system** | `INTEGRATION_CHECKLIST.md` | Phase 1-3 |
| **Deploy to production** | `INTEGRATION_CHECKLIST.md` | Phase 8-10 |
| **Write tests** | `src/services/chat/__tests__/chatDeployment.test.ts` | Entire file |
| **Use the API** | `DEPLOYMENT_QUICK_START.md` | Section: "API Integration" |
| **Deploy DHCP** | `DEPLOYMENT_VIA_CHAT.md` | Section: "Example: DHCP Deployment" |
| **Find file location** | [File Directory](#file-directory) | Below |

---

## Feature Overview

### What This System Does

The **Infrastructure Deployment via Chat** system allows you to:

1. **Write natural language deployment requests** in chat
   - Example: "Deploy DHCP on 172.251.96.200"
   
2. **Get AI-generated deployment commands**
   - System generates correct commands for target device type
   - Analyzes device type (MikroTik, Linux, Windows)
   - Adapts to connection method (SSH, Telnet, Local)

3. **Review and approve before execution**
   - See all commands that will run
   - Understand what will happen
   - Review risk assessments
   - Identify affected services

4. **Execute with confidence**
   - Commands run automatically on target device
   - Results tracked in real-time
   - Failures logged and reported
   - Rollback options available for risky operations

5. **Maintain audit trail**
   - Who requested what deployment
   - When it was approved and executed
   - What actually happened on the device
   - Complete history for compliance

### Key Features

✅ **LLM-Powered Command Generation**
- Uses OpenAI/Anthropic to generate device-specific commands
- Context-aware (understands device type, connection, task)
- Produces realistic, production-ready commands

✅ **Safety & Validation**
- Detects dangerous command patterns
- Requires rollback commands for critical operations
- Validates command structure before execution
- Prevents accidental data loss

✅ **User Confirmation Workflow**
- Mandatory approval before any execution
- Can filter which commands to execute
- Clear explanation of what will happen
- Warnings for high-risk operations

✅ **Device Integration**
- Works with saved terminal connections
- Supports SSH, Telnet, Local connections
- Compatible with MikroTik, Linux, Windows
- Supports new device types via plugins

✅ **Complete Documentation**
- Technical reference with API specs
- Quick start guide for users
- Visual diagrams of architecture
- Integration checklist for setup

---

## File Directory

### Core Implementation Files

```
src/services/chat/
├── commandGeneration.ts (405 lines)
│   ├── Zod Schemas: Command, CommandGenerationResponse, etc.
│   ├── generateCommands() - Main LLM integration
│   ├── validateCommands() - Safety checks
│   ├── formatCommandsForDisplay() - User-friendly output
│   └── getMockCommandResponse() - Testing support
│
├── commandExecution.ts (420 lines)
│   ├── CommandExecutionManager class
│   ├── createSession() - Create execution session
│   ├── approveExecution() - User approval handling
│   ├── recordResult() - Track command results
│   ├── completeSession() - Finalize execution
│   └── cleanupOldSessions() - Automatic cleanup
│
├── chatDeploymentHandler.ts (520 lines)
│   ├── ChatDeploymentHandler class
│   ├── detectDeploymentRequest() - Parse user intent
│   ├── generateDeploymentCommands() - Orchestrate generation
│   ├── handleUserConfirmation() - Process approval
│   ├── recordExecutionResult() - Track results
│   └── buildDeploymentChatResponse() - Format responses
│
└── __tests__/
    └── chatDeployment.test.ts (650 lines)
        ├── 7 test suites
        ├── 35+ test cases
        ├── Mock LLM client
        └── Full workflow coverage

src/api/routes/
└── deployments.ts (420 lines)
    ├── POST /v1/deployments/check - Detect request
    ├── POST /v1/deployments/generate - Generate commands
    ├── GET /v1/deployments/:sessionId - Get session
    ├── POST /v1/deployments/:sessionId/confirm - Approve
    ├── POST /v1/deployments/:sessionId/result - Record result
    ├── POST /v1/deployments/:sessionId/finalize - Complete
    ├── GET /v1/deployments/:sessionId/results - Get results
    └── DELETE /v1/deployments/:sessionId - Cancel
```

### Documentation Files

```
docs/
├── DEPLOYMENT_VIA_CHAT.md (550 lines)
│   ├── Architecture & flow
│   ├── Complete API reference
│   ├── Usage examples (DHCP, DNS, firewall, routing, VLAN)
│   ├── Configuration guide
│   ├── Security considerations
│   ├── Troubleshooting FAQ
│   └── Future enhancements
│
├── DEPLOYMENT_QUICK_START.md (400 lines)
│   ├── 3-step setup
│   ├── 6-step workflow
│   ├── 4 complete examples
│   ├── API integration guide
│   ├── Supported deployment types
│   ├── Troubleshooting FAQ
│   └── Best practices
│
├── DEPLOYMENT_IMPLEMENTATION_SUMMARY.md (450 lines)
│   ├── Feature overview
│   ├── Files created summary
│   ├── Architecture flow
│   ├── API response examples
│   ├── Configuration reference
│   ├── Security features
│   ├── Testing coverage
│   └── Deployment checklist
│
├── DEPLOYMENT_DIAGRAMS.md (550 lines)
│   ├── System architecture diagram
│   ├── Workflow sequence diagram
│   ├── Decision flow diagram
│   ├── Command generation process
│   ├── Error handling flow
│   ├── Risk assessment matrix
│   ├── Session state machine
│   └── Execution timeline
│
├── INTEGRATION_CHECKLIST.md (400+ lines)
│   ├── Pre-integration verification
│   ├── Phase 1: Chat integration
│   ├── Phase 2: API integration
│   ├── Phase 3: Environment setup
│   ├── Phase 4: Database setup
│   ├── Phase 5: Terminal integration
│   ├── Phase 6: Testing & validation
│   ├── Phase 7: Security verification
│   ├── Phase 8: Production deployment
│   ├── Phase 9: Documentation & training
│   ├── Phase 10: Monitoring & maintenance
│   └── Final sign-off checklist
│
└── REFERENCE.md (THIS FILE)
    └── Quick navigation & common tasks
```

### Related Files (Existing)

```
src/services/
├── chat/
│   └── integration.ts - Chat message handler (modify for integration)
│
├── terminal/
│   └── executor.ts - Terminal execution (integrate with deployment)
│   └── connectionManager.ts - Saved connections (use for device access)
│
└── auth/ - Permission checks (integrate for security)

src/api/
├── server.ts - Express app (register deployment routes)
└── middleware/ - Auth, validation (add deployment guards)

migrations/
└── [new] 009_deployment_sessions.sql - Database schema

.env - Environment variables (add deployment config)
docker-compose.yml - Container setup (add env vars)
```

---

## Getting Started

### 1. First Time Setup (5 minutes)

```bash
# Navigate to project
cd ai-mcp-gateway

# Install/verify dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
# ENABLE_DEPLOYMENTS=true
# DEPLOYMENT_LLM_PROVIDER=openai

# Run tests to verify
npm test -- --run src/services/chat/__tests__/chatDeployment.test.ts

# Start the system
npm start

# Test in another terminal
curl -X POST http://localhost:3000/v1/deployments/check \
  -H "Content-Type: application/json" \
  -d '{"message": "Deploy DHCP on 172.251.96.200"}'
```

### 2. Deploy Your First DHCP Service (5 minutes)

```bash
# Via Chat
1. Send: "Deploy DHCP on 172.251.96.200"
2. Review the command list shown
3. Click "Approve"
4. Watch execution complete
5. See results

# Via API
curl -X POST http://localhost:3000/v1/deployments/generate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Deploy DHCP on 172.251.96.200",
    "context": {"userId": "user-123"}
  }' | jq .
```

### 3. Understand What Happened

See the [Architecture Diagrams](#architecture) section in `DEPLOYMENT_DIAGRAMS.md`:
- User message → Detection → Generation → Approval → Execution → Results

---

## Core Concepts

### 1. Deployment Request Detection

**What it does:** Analyzes user message to determine if it's a deployment request

**Example inputs:**
- ✅ "Deploy DHCP on 172.251.96.200" → `isDeploymentRequest: true`
- ✅ "Set up DNS for domain.com" → `isDeploymentRequest: true`
- ❌ "What is DHCP?" → `isDeploymentRequest: false`

**Output:**
```json
{
  "isDeploymentRequest": true,
  "taskType": "dhcp",
  "confidence": 0.95,
  "targetDevice": "172.251.96.200",
  "deviceType": "mikrotik",
  "connectionType": "ssh"
}
```

**Key file:** `chatDeploymentHandler.ts` - `detectDeploymentRequest()`

---

### 2. Command Generation

**What it does:** Uses LLM to create device-specific commands for the requested task

**Process:**
1. Build system prompt (device-specific context)
2. Build user prompt (task-specific details)
3. Call LLM (OpenAI/Anthropic)
4. Parse JSON response
5. Validate commands
6. Format for display

**Output:**
```json
{
  "taskDescription": "Deploy DHCP service",
  "commands": [
    {
      "id": "cmd_001",
      "command": "/ip/pool/add name=dhcp_pool ranges=192.168.1.100-192.168.1.200",
      "description": "Create IP address pool for DHCP",
      "riskLevel": "medium",
      "prerequisites": [],
      "rollbackCommand": "/ip/pool/remove dhcp_pool"
    }
  ],
  "warnings": ["DHCP restart will be required"],
  "affectedServices": ["dhcp-server"],
  "explanation": "..."
}
```

**Key file:** `commandGeneration.ts` - `generateCommands()`

---

### 3. User Confirmation

**What it does:** Gets explicit user approval before executing any commands

**Workflow:**
1. System shows generated commands
2. User reviews each command
3. User can:
   - Approve all commands
   - Reject entire deployment
   - Select subset to execute
4. Commands don't execute until approved

**Key file:** `chatDeploymentHandler.ts` - `handleUserConfirmation()`

---

### 4. Command Execution

**What it does:** Connects to target device and runs approved commands

**Process:**
1. Get saved connection details (SSH/Telnet/Local)
2. Connect to target device
3. Execute each command sequentially
4. Capture output/errors
5. Track results
6. Close connection

**Output:**
```json
{
  "sessionId": "exec_123",
  "status": "completed",
  "results": [
    {
      "commandId": "cmd_001",
      "success": true,
      "stdout": "pool created",
      "exitCode": 0,
      "duration": 1.23
    }
  ]
}
```

**Key file:** `commandExecution.ts` - `recordResult()`

---

### 5. Session Management

**What it does:** Tracks deployment from creation to completion

**Session states:**
- `pending` - Waiting for user approval
- `confirmed` - Approved, ready to execute
- `executing` - Commands running
- `completed` - All done
- `cancelled` - User rejected or error

**Key file:** `commandExecution.ts` - `CommandExecutionManager`

---

## Common Tasks

### Deploy DHCP

```
User Message: "Deploy DHCP on 172.251.96.200"

System Response:
1. Detects: DHCP deployment request
2. Extracts: Device IP 172.251.96.200, MikroTik device type
3. Generates: 3 commands to set up DHCP
4. Displays: Commands with explanations and warnings
5. Awaits: User confirmation
6. Executes: Commands on target device (if approved)
7. Reports: Results of deployment
```

**Expected commands for MikroTik:**
```
/ip/pool/add name=dhcp_pool ranges=192.168.1.100-192.168.1.200
/ip/dhcp-server/network/add address=192.168.1.0/24 gateway=192.168.1.1 dns-server=192.168.1.1
/ip/dhcp-server/add name=dhcp1 address-pool=dhcp_pool interface=bridge disabled=no
```

---

### Deploy DNS

```
User Message: "Set up DNS for domain.com pointing to 8.8.8.8"

System Response:
Similar to DHCP but generates DNS-specific commands:
- Create DNS record
- Configure DNS server
- Set forward zone
- Apply configuration
```

---

### Configure Firewall Rules

```
User Message: "Block TCP port 23 on all interfaces except LAN"

System Response:
Generates firewall rules:
- Create firewall filter rule
- Set source/destination
- Set action (drop/accept)
- Apply to specific interface
- Add logging for monitoring
```

---

### Check Deployment Status

```bash
# Get session details
curl http://localhost:3000/v1/deployments/{sessionId}

# Get execution results
curl http://localhost:3000/v1/deployments/{sessionId}/results

# Get all sessions for user
GET http://localhost:3000/v1/deployments/user/{userId}/sessions
```

---

### Cancel a Deployment

```bash
# Cancel before approval
curl -X DELETE http://localhost:3000/v1/deployments/{sessionId}

# Or reject during approval
curl -X POST http://localhost:3000/v1/deployments/{sessionId}/confirm \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "reason": "Need to check with team"}'
```

---

### Rollback a Deployment

```bash
# If deployment had errors, use rollback commands
# These are automatically generated for critical operations

# Manual rollback (get rollback commands from results)
curl -X POST http://localhost:3000/v1/deployments/generate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Rollback DHCP deployment from session abc123",
    "context": {"sessionId": "abc123"}
  }'
```

---

## Troubleshooting

### Issue: "isDeploymentRequest: false" for a real deployment request

**Cause:** Confidence score too low (< 0.6) or task not recognized

**Solution:**
1. Be more specific: "Deploy DHCP" vs "Set up the DHCP service"
2. Include device IP: Add IP address to message
3. Specify device type: "Deploy DHCP on MikroTik 172.251.96.200"
4. Check LLM model: May need better model for complex requests

---

### Issue: Generated commands have syntax errors

**Cause:** LLM generated incorrect commands for device type

**Solution:**
1. Check device type detection: Is it correct?
2. Provide more context: "MikroTik RouterOS v6.48"
3. Reject and retry: System will try again
4. Edit commands: Manually fix syntax before approval

---

### Issue: Command execution fails

**Cause:** Connection issues or device state

**Solution:**
1. Verify connection: Can you manually SSH to device?
2. Check credentials: Are they correct and valid?
3. Check device state: Is device online and accessible?
4. Review error message: See what actually happened
5. Try rollback: Use generated rollback commands

---

### Issue: Session expires before completion

**Cause:** Long-running commands or network issues

**Solution:**
1. Increase timeout: `DEPLOYMENT_COMMAND_TIMEOUT=60000`
2. Split deployment: Break into smaller tasks
3. Check device performance: May need optimization
4. Check network: Verify stable connection

---

### Issue: Can't find saved connection

**Cause:** Connection not saved or not named correctly

**Solution:**
1. Save connection in Terminal: Menu → Save Connection
2. Verify connection name: Use exact saved name
3. List available: Call `/v1/terminal/connections` endpoint
4. Check credentials: Verify stored correctly

---

## API Quick Reference

### Endpoints Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/deployments/check` | Detect if deployment request |
| POST | `/v1/deployments/generate` | Generate commands |
| GET | `/v1/deployments/:id` | Get session details |
| POST | `/v1/deployments/:id/confirm` | Approve/reject |
| POST | `/v1/deployments/:id/result` | Record result |
| POST | `/v1/deployments/:id/finalize` | Complete session |
| GET | `/v1/deployments/:id/results` | Get results |
| DELETE | `/v1/deployments/:id` | Cancel session |

---

### POST /v1/deployments/check

**Purpose:** Detect if a message is a deployment request

**Request:**
```json
{
  "message": "Deploy DHCP on 172.251.96.200"
}
```

**Response:**
```json
{
  "isDeploymentRequest": true,
  "taskType": "dhcp",
  "confidence": 0.95,
  "targetDevice": "172.251.96.200",
  "deviceType": "mikrotik"
}
```

---

### POST /v1/deployments/generate

**Purpose:** Generate deployment commands

**Request:**
```json
{
  "message": "Deploy DHCP on 172.251.96.200",
  "context": {
    "userId": "user-123",
    "llmProvider": "openai"
  }
}
```

**Response:**
```json
{
  "generationId": "gen_456",
  "sessionId": "exec_789",
  "taskDescription": "Deploy DHCP service",
  "commands": [...],
  "warnings": [...],
  "affectedServices": ["dhcp-server"],
  "explanation": "..."
}
```

---

### POST /v1/deployments/:sessionId/confirm

**Purpose:** Approve or reject deployment

**Request (Approve all):**
```json
{
  "approved": true
}
```

**Request (Approve subset):**
```json
{
  "approved": true,
  "selectedCommandIds": ["cmd_001", "cmd_002"]
}
```

**Request (Reject):**
```json
{
  "approved": false,
  "reason": "Need to check with team"
}
```

**Response:**
```json
{
  "sessionId": "exec_789",
  "status": "confirmed",
  "message": "Deployment approved. Executing 3 commands..."
}
```

---

### GET /v1/deployments/:sessionId/results

**Purpose:** Get deployment results

**Response:**
```json
{
  "sessionId": "exec_789",
  "status": "completed",
  "taskDescription": "Deploy DHCP service",
  "results": [
    {
      "commandId": "cmd_001",
      "command": "/ip/pool/add ...",
      "success": true,
      "stdout": "pool created",
      "duration": 0.5
    }
  ],
  "summary": {
    "total": 3,
    "succeeded": 3,
    "failed": 0
  }
}
```

---

## Code Examples

### Example 1: Detect Deployment Request

```typescript
import { ChatDeploymentHandler } from './services/chat/chatDeploymentHandler';

const handler = new ChatDeploymentHandler();

const result = await handler.detectDeploymentRequest(
  "Deploy DHCP on 172.251.96.200"
);

console.log(result);
// Output:
// {
//   isDeploymentRequest: true,
//   taskType: 'dhcp',
//   confidence: 0.95,
//   targetDevice: '172.251.96.200',
//   deviceType: 'mikrotik'
// }
```

---

### Example 2: Generate Commands

```typescript
import { ChatDeploymentHandler } from './services/chat/chatDeploymentHandler';

const handler = new ChatDeploymentHandler();

const response = await handler.generateDeploymentCommands(
  "Deploy DHCP on 172.251.96.200",
  {
    isDeploymentRequest: true,
    taskType: "dhcp",
    targetDevice: "172.251.96.200",
    deviceType: "mikrotik"
  },
  llmClient
);

console.log(response.commands);
// Output: Array of Command objects with id, command, description, etc.
```

---

### Example 3: User Confirmation

```typescript
import { ChatDeploymentHandler } from './services/chat/chatDeploymentHandler';

const handler = new ChatDeploymentHandler();

// User approves all commands
const result = await handler.handleUserConfirmation(
  "exec_789",
  true  // approved
);

console.log(result);
// Output:
// {
//   sessionId: 'exec_789',
//   status: 'confirmed',
//   message: 'Deployment approved. Executing 3 commands...'
// }
```

---

### Example 4: API Usage with cURL

```bash
# Check if deployment request
curl -X POST http://localhost:3000/v1/deployments/check \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Deploy DHCP on 172.251.96.200"
  }' | jq .

# Generate commands
curl -X POST http://localhost:3000/v1/deployments/generate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Deploy DHCP on 172.251.96.200",
    "context": {"userId": "user-123"}
  }' | jq .

# Approve deployment (use sessionId from generate response)
curl -X POST http://localhost:3000/v1/deployments/exec_789/confirm \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | jq .

# Get results
curl http://localhost:3000/v1/deployments/exec_789/results | jq .
```

---

### Example 5: Integrate into Chat Handler

```typescript
import { ChatDeploymentHandler } from './services/chat/chatDeploymentHandler';

async function processChatMessage(message: string, context: ChatContext) {
  const deploymentHandler = new ChatDeploymentHandler();
  
  // Check if deployment request
  const detection = await deploymentHandler.detectDeploymentRequest(message);
  
  if (detection.isDeploymentRequest) {
    // Route to deployment workflow
    const response = await deploymentHandler.generateDeploymentCommands(
      message,
      detection,
      context.llmClient
    );
    
    return {
      type: 'deployment',
      content: response,
      sessionId: response.sessionId,
      requiresApproval: true
    };
  }
  
  // Normal chat flow
  return processNormalChat(message, context);
}
```

---

## Support & Resources

### Documentation Files

| Document | Purpose | Location |
|----------|---------|----------|
| DEPLOYMENT_VIA_CHAT.md | Complete technical reference | `docs/` |
| DEPLOYMENT_QUICK_START.md | User quick start guide | `docs/` |
| DEPLOYMENT_IMPLEMENTATION_SUMMARY.md | Implementation overview | `docs/` |
| DEPLOYMENT_DIAGRAMS.md | Visual architecture diagrams | `docs/` |
| INTEGRATION_CHECKLIST.md | Integration setup steps | `docs/` |

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| commandGeneration.ts | Command generation service | 405 |
| commandExecution.ts | Execution & session management | 420 |
| chatDeploymentHandler.ts | Main orchestration | 520 |
| deployments.ts | API routes | 420 |
| chatDeployment.test.ts | Test suite (35+ tests) | 650 |

### Quick Commands

```bash
# Run all tests
npm test -- --run src/services/chat/__tests__/chatDeployment.test.ts

# Type check
npm run type-check

# Lint
npm run lint

# Start system
npm start

# Check API health
curl http://localhost:3000/health
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Detection not working | Check confidence threshold (>0.6) |
| Commands have errors | Verify device type and LLM model |
| Execution fails | Check saved connection and credentials |
| Session expires | Increase DEPLOYMENT_COMMAND_TIMEOUT |

### Getting Help

1. **Check troubleshooting section** - Most common issues documented
2. **Review documentation** - Comprehensive guides available
3. **Check logs** - `logs/deployment*.log` has detailed info
4. **Run tests** - Verify system is working correctly
5. **Review examples** - See working code examples

### Monitoring & Health

```bash
# Check system health
curl http://localhost:3000/health

# View logs
tail -f logs/deployment*.log

# Monitor metrics
curl http://localhost:3000/metrics | grep deployment

# Check database
psql -c "SELECT COUNT(*) FROM deployment_sessions;"
```

---

**Last Updated:** [Current Date]
**Version:** 1.0
**Status:** ✅ Production Ready
**Support:** See INTEGRATION_CHECKLIST.md for support contact info
