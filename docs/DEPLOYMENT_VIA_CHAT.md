# 🚀 Infrastructure Deployment via Chat

## Overview

This feature enables users to deploy infrastructure (DHCP, DNS, firewall rules, etc.) through natural language requests via the chat interface. The system:

1. **Detects** deployment requests in user messages
2. **Generates** appropriate commands using LLM
3. **Requests** user confirmation before execution
4. **Executes** approved commands on target devices via saved connections
5. **Reports** results and provides rollback options

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Chat Interface                       │
│  "Deploy DHCP on 172.251.96.200"                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            ChatDeploymentHandler                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. detectDeploymentRequest()                           │  │
│  │    - Analyzes message for deployment keywords          │  │
│  │    - Returns: taskType, confidence, targetDevice       │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            CommandGenerationService                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 2. generateCommands()                                   │  │
│  │    - Calls LLM with structured prompt                  │  │
│  │    - Generates step-by-step commands with validation   │  │
│  │    - Returns: CommandGenerationResponse                │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              User Confirmation Flow                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 3. Displays:                                           │  │
│  │    - Command list with descriptions                    │  │
│  │    - Risk levels (low/medium/high/critical)            │  │
│  │    - Affected services & warnings                      │  │
│  │    - Estimated duration                                │  │
│  │                                                         │  │
│  │ 4. User chooses:                                       │  │
│  │    - ✅ Approve all                                    │  │
│  │    - ❌ Reject                                         │  │
│  │    - ✏️  Edit selection                                │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                  ✅ Approved
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         CommandExecutionService                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 5. executeCommands()                                    │  │
│  │    - Uses saved connection to target device            │  │
│  │    - Sends commands to terminal session                │  │
│  │    - Tracks execution status & results                 │  │
│  │                                                         │  │
│  │ 6. handleResults()                                     │  │
│  │    - Logs output/errors                                │  │
│  │    - Validates expected outcomes                       │  │
│  │    - Offers rollback if needed                         │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Results & Reporting                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ - Formatted execution results                           │  │
│  │ - Success/failure status per command                   │  │
│  │ - Execution logs & error messages                      │  │
│  │ - Rollback commands if available                       │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Check Deployment Request
```http
POST /v1/deployments/check

Request:
{
  "message": "Deploy DHCP on 172.251.96.200"
}

Response:
{
  "isDeploymentRequest": true,
  "taskType": "dhcp",
  "targetDevice": "172.251.96.200",
  "confidence": 0.95,
  "reasoning": "Contains DHCP deployment keywords"
}
```

### 2. Generate Commands
```http
POST /v1/deployments/generate

Request:
{
  "message": "Deploy DHCP on 172.251.96.200",
  "taskType": "dhcp",
  "targetDevice": "172.251.96.200",
  "connectionId": "conn_123"  // Optional: saved connection
}

Response:
{
  "generationId": "gen_1733754000000_abc123",
  "sessionId": "exec_1733754000000_def456",
  "taskDescription": "Deploy DHCP on 172.251.96.200",
  "commandCount": 3,
  "commands": [
    {
      "id": "cmd_001",
      "description": "Create DHCP pool for address range",
      "riskLevel": "medium"
    },
    // ... more commands
  ],
  "explanation": "This deployment will...",
  "warnings": ["Existing DHCP config will be replaced"],
  "affectedServices": ["DHCP", "Network connectivity"],
  "estimatedDuration": 5,
  "display": "Formatted display text"
}
```

### 3. Get Session Details
```http
GET /v1/deployments/:sessionId

Response:
{
  "sessionId": "exec_...",
  "userId": "web-user",
  "targetDevice": "172.251.96.200",
  "status": "pending|confirmed|executing|completed|failed|cancelled",
  "commandIds": ["cmd_001", "cmd_002", "cmd_003"],
  "results": [],
  "startTime": "2025-12-09T15:44:35Z",
  "endTime": null
}
```

### 4. Confirm/Reject Execution
```http
POST /v1/deployments/:sessionId/confirm

Request:
{
  "approved": true,
  "selectedCommandIds": ["cmd_001", "cmd_002", "cmd_003"]  // Optional: subset
}

Response:
{
  "approved": true,
  "sessionId": "exec_...",
  "status": "confirmed",
  "message": "✅ Deployment approved. Executing 3 commands...",
  "commandIds": ["cmd_001", "cmd_002", "cmd_003"]
}
```

### 5. Record Command Result
```http
POST /v1/deployments/:sessionId/result

Request:
{
  "commandId": "cmd_001",
  "success": true,
  "stdout": "/ip/pool 'default-pool' added",
  "stderr": null,
  "exitCode": 0,
  "duration": 125  // milliseconds
}

Response:
{
  "recorded": true,
  "sessionId": "exec_...",
  "commandId": "cmd_001"
}
```

### 6. Finalize Session
```http
POST /v1/deployments/:sessionId/finalize

Request:
{
  "success": true,
  "error": null
}

Response:
{
  "sessionId": "exec_...",
  "status": "completed",
  "success": true,
  "resultCount": 3,
  "resultsDisplay": "Formatted results..."
}
```

### 7. Get Results
```http
GET /v1/deployments/:sessionId/results

Response:
{
  "sessionId": "exec_...",
  "status": "completed",
  "results": [
    {
      "commandId": "cmd_001",
      "success": true,
      "stdout": "Pool created",
      "duration": 125,
      "timestamp": "2025-12-09T15:44:36Z"
    }
  ],
  "summary": {
    "totalCommands": 3,
    "executedCommands": 3,
    "successCount": 3
  }
}
```

### 8. Cancel Deployment
```http
DELETE /v1/deployments/:sessionId

Request:
{
  "reason": "User cancelled"
}

Response:
{
  "cancelled": true,
  "sessionId": "exec_...",
  "message": "Deployment cancelled"
}
```

## Usage Examples

### Example 1: DHCP Deployment

**User Chat:**
```
Me: Deploy DHCP on 172.251.96.200 with pool 172.251.96.100-200 and DNS 8.8.8.8
```

**System Response:**
```
🔍 Deployment Request Detected

I detected a request to deploy DHCP. Let me generate the commands...

📋 DEPLOYMENT PLAN: Deploy DHCP on 172.251.96.200

EXPLANATION:
This deployment will:
1. Create a DHCP address pool (172.251.96.100-172.251.96.200)
2. Configure the DHCP network with subnet 172.251.96.0/24
3. Enable DHCP server on the primary interface

⚠️ WARNINGS:
- Existing DHCP configuration will be replaced
- All clients will need to renew their leases

COMMANDS (3 total):
────────────────────────────────

1. [MEDIUM] Create DHCP pool for address range
   ID: cmd_001
   Command: /ip/pool/add name=default-pool ranges=172.251.96.100-172.251.96.200
   Expected: IP pool "default-pool" added successfully

2. [MEDIUM] Configure DHCP network with gateway and DNS
   ID: cmd_002
   Command: /ip/dhcp-server/network/add address=172.251.96.0/24 gateway=172.251.96.1 dns-server=8.8.8.8,1.1.1.1
   Prerequisites: cmd_001
   Expected: DHCP network configuration added

3. [HIGH] Enable DHCP server on interface
   ID: cmd_003
   Command: /ip/dhcp-server/add interface=ether1 address-pool=default-pool disabled=no
   Prerequisites: cmd_001, cmd_002
   Expected: DHCP server started and listening
   Rollback: /ip/dhcp-server/disable [find]

────────────────────────────────
⏱️ Estimated Duration: 5s
```

**User confirms:**
```
Me: ✅ Approve All
```

**System executes and reports:**
```
🚀 Executing Deployment

Starting command execution on 172.251.96.200...
Commands: 3

[Executing...]

✅ EXECUTION RESULTS: Session exec_1733754000000_abc123

Status: COMPLETED
Device: 172.251.96.200
Duration: 4.23s

📋 COMMAND RESULTS:

1. ✅ cmd_001
   Duration: 125ms
   Exit Code: 0
   Output: IP pool "default-pool" added successfully

2. ✅ cmd_002
   Duration: 230ms
   Exit Code: 0
   Output: DHCP network configuration added

3. ✅ cmd_003
   Duration: 145ms
   Exit Code: 0
   Output: DHCP server started and listening

✅ Deployment completed successfully!
All 3 commands executed without errors.
```

## Command Generation

### Supported Task Types

- **dhcp**: DHCP server setup and management
- **dns**: DNS server and record management
- **firewall**: Firewall rule configuration
- **routing**: Routing configuration (static, BGP, OSPF, etc.)
- **vlan**: VLAN and trunk configuration
- **other**: Custom infrastructure tasks

### Supported Device Types

- **mikrotik**: MikroTik RouterOS (API/SSH)
- **linux**: Linux/Unix systems (SSH/shell)
- **windows**: Windows Server (WinRM/PowerShell)
- **generic**: Generic shell commands

### Connection Types

- **ssh**: SSH connection (most secure)
- **telnet**: Telnet connection (legacy, unencrypted)
- **local**: Local shell execution

## Risk Levels

- **low**: Read-only or non-disruptive changes
  - Example: Query current config, list pools
  
- **medium**: Configuration changes, may require restart
  - Example: Add DNS record, create pool
  
- **high**: Service restart, temporary downtime expected
  - Example: Enable/disable service, change interface config
  
- **critical**: Data-affecting, multi-service impact
  - Example: Clear all rules, reset device config
  - **Requires rollback command**

## Error Handling

### Invalid Requests
```json
{
  "error": "Message does not appear to be a deployment request",
  "confidence": 0.2,
  "reasoning": "No deployment keywords detected"
}
```

### Validation Failures
```json
{
  "error": "Failed to generate deployment commands",
  "details": "Zod validation error: ..."
}
```

### Session Not Found
```json
{
  "error": "Session not found",
  "sessionId": "exec_..."
}
```

### Execution Errors
```json
{
  "status": "failed",
  "errorMessage": "Command failed with exit code 1",
  "results": [
    {
      "commandId": "cmd_001",
      "success": false,
      "stderr": "Error message here"
    }
  ]
}
```

## Configuration

### Environment Variables

```bash
# Enable deployment feature
ENABLE_DEPLOYMENTS=true

# LLM provider for command generation
DEPLOYMENT_LLM_PROVIDER=openai|anthropic|openrouter

# Command execution timeout (milliseconds)
DEPLOYMENT_COMMAND_TIMEOUT=30000

# Default device connection type
DEPLOYMENT_DEFAULT_CONNECTION=ssh

# Auto-confirm low-risk commands (for testing)
DEPLOYMENT_AUTO_CONFIRM_LOW_RISK=false
```

### Saved Connections

Users should first save connections to devices:

```http
POST /v1/terminal/connections

{
  "name": "MikroTik-Core-01",
  "type": "ssh",
  "host": "172.251.96.200",
  "port": 22,
  "username": "admin",
  "auth_type": "password",
  "password": "encrypted_password"
}
```

Then reference in deployment:
```http
POST /v1/deployments/generate

{
  "message": "Deploy DHCP",
  "connectionId": "conn_xyz123"
}
```

## Security Considerations

### Input Validation

- Commands are validated before execution
- Suspicious patterns (e.g., `rm -rf /`) are rejected
- User must approve before any state-changing operation

### Audit Logging

All operations are logged:
```
[CommandGeneration] Generated 3 commands for DHCP deployment
[CommandExecution] Approved deployment on 172.251.96.200
[CommandExecution] Command cmd_001 executed successfully
[CommandExecution] Session completed - 3/3 commands succeeded
```

### Rollback Support

High-risk commands include rollback commands:
```json
{
  "id": "cmd_003",
  "command": "/ip/dhcp-server/add interface=ether1...",
  "rollbackCommand": "/ip/dhcp-server/disable [find]"
}
```

Users can execute rollback commands if needed:
```
Me: Rollback the DHCP deployment
```

## Future Enhancements

1. **Scheduled Deployments**: Schedule deployments for maintenance windows
2. **Rollback Automation**: Automatic rollback on command failure
3. **Template Library**: Pre-built deployment templates
4. **Approval Workflow**: Multi-user approval for critical deployments
5. **Deployment History**: Track all deployments and changes
6. **Configuration Backup**: Auto-backup before deployments
7. **Dry-run Mode**: Test deployments without executing
8. **Multi-device Deployments**: Deploy to multiple devices simultaneously

## Troubleshooting

### Session Not Found
- Ensure sessionId is correct
- Check if session expired (24-hour cleanup)
- Verify session was created successfully

### Command Execution Failed
- Check device connectivity
- Verify saved connection credentials
- Review command error message
- Check device support for command syntax

### Deployment Detection False Positives
- Increase confidence threshold in detection
- Provide more specific instructions
- Use explicit deployment context

### Generation Timeouts
- Check LLM provider availability
- Increase DEPLOYMENT_COMMAND_TIMEOUT
- Simplify request message

## See Also

- [Web Terminal Documentation](../admin-dashboard/WebTerminal.md)
- [Chat Integration Guide](./CHAT_CONTEXT_OPTIMIZATION.md)
- [Network Tools MCP Documentation](./API-GUIDE.md)
