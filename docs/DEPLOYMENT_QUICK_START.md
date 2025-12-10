# 🚀 Chat-Based Deployment Quick Start Guide

## Setup Steps

### 1. Save Device Connection

First, save your target device connection in the Web Terminal:

```bash
# Via Web UI:
1. Go to Web Terminal
2. Click "SSH" tab
3. Enter device details:
   - Host: 172.251.96.200
   - Port: 22
   - Username: admin
   - Password or Private Key
4. Click "Save Connection for Later"
5. Name: "MikroTik-Core-01"
```

Or via API:
```bash
curl -X POST http://localhost:3000/v1/terminal/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MikroTik-Core-01",
    "type": "ssh",
    "host": "172.251.96.200",
    "port": 22,
    "username": "admin",
    "password": "your-password",
    "auth_type": "password"
  }'
```

### 2. Enable Deployment Feature

Set environment variable:
```bash
export ENABLE_DEPLOYMENTS=true
```

Or in `.env`:
```
ENABLE_DEPLOYMENTS=true
DEPLOYMENT_LLM_PROVIDER=openai
DEPLOYMENT_COMMAND_TIMEOUT=30000
```

### 3. Start the Gateway

```bash
npm start
# or
docker-compose up -d
```

## Basic Workflow

### Step 1: Send Deployment Request

```bash
# Via Chat API
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Deploy DHCP on 172.251.96.200 with pool 172.251.96.100-200"
      }
    ]
  }'
```

Or in Web UI Chat:
```
User: Deploy DHCP on 172.251.96.200 with pool 172.251.96.100-200 and DNS 8.8.8.8
```

### Step 2: System Detects & Generates Commands

The system will:
1. Detect this is a DHCP deployment request
2. Generate appropriate commands
3. Present them for your review

### Step 3: Review Commands

```
📋 DEPLOYMENT PLAN: Deploy DHCP on 172.251.96.200

COMMANDS (3 total):
────────────────────────────────

1. [MEDIUM] Create DHCP pool for address range
   Command: /ip/pool/add name=default-pool ranges=172.251.96.100-172.251.96.200

2. [MEDIUM] Configure DHCP network with gateway and DNS
   Command: /ip/dhcp-server/network/add address=172.251.96.0/24 ...

3. [HIGH] Enable DHCP server on interface
   Command: /ip/dhcp-server/add interface=ether1 ...

⚠️ WARNINGS:
- Existing DHCP configuration will be replaced
- All clients will need to renew their leases

Estimated Duration: 5s
```

### Step 4: Approve or Reject

User response options:

**Option A: Approve all**
```
User: ✅ Approve All
```

**Option B: Reject deployment**
```
User: ❌ Reject
```

**Option C: Edit selection** (approve only specific commands)
```
User: ✏️ Execute only commands 1 and 2
```

### Step 5: Execution

System executes the approved commands:

```
🚀 Executing Deployment
Starting command execution on 172.251.96.200...
Commands: 3

[Executing command 1/3...]
[Executing command 2/3...]
[Executing command 3/3...]
```

### Step 6: Results

```
✅ EXECUTION RESULTS

Status: COMPLETED
Device: 172.251.96.200
Duration: 4.23s

1. ✅ Create DHCP pool
   Duration: 125ms
   Output: IP pool "default-pool" added successfully

2. ✅ Configure DHCP network
   Duration: 230ms
   Output: DHCP network configuration added

3. ✅ Enable DHCP server
   Duration: 145ms
   Output: DHCP server started and listening

✅ Deployment completed successfully!
All 3 commands executed without errors.
```

## Usage Examples

### Example 1: Deploy DHCP

```
User: Deploy DHCP on 172.251.96.200 with IP pool 172.251.96.100-200, gateway 172.251.96.1, and DNS 8.8.8.8

[System generates 3 commands]

User: ✅ Approve All

[System executes commands]

System: ✅ Deployment completed! DHCP is now running.
```

### Example 2: Configure DNS

```
User: Add DNS records for example.com pointing to 10.0.0.5 and cdn.example.com pointing to 10.0.0.10

[System generates DNS record commands]

User: ✏️ Execute only the first record

[System executes selected command]

System: ✅ DNS record for example.com has been created.
```

### Example 3: Firewall Rules

```
User: Configure firewall rules to block SSH (port 22) from the internet on 192.168.1.1

[System generates firewall rules]

User: ✅ Approve All

[System executes rules]

System: ✅ Firewall rules have been applied. SSH is now blocked from internet traffic.
```

### Example 4: VLAN Setup

```
User: Create VLAN 100 for management network on the core switch with IP 10.100.0.1/24

[System generates VLAN commands]

User: ✅ Approve All

[System executes commands]

System: ✅ VLAN 100 has been created with management interface.
```

## API Integration Examples

### Using the Deployment API Directly

#### 1. Check if message is a deployment request
```bash
curl -X POST http://localhost:3000/v1/deployments/check \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Deploy DHCP on 172.251.96.200"
  }'
```

Response:
```json
{
  "isDeploymentRequest": true,
  "taskType": "dhcp",
  "targetDevice": "172.251.96.200",
  "confidence": 0.95
}
```

#### 2. Generate deployment commands
```bash
curl -X POST http://localhost:3000/v1/deployments/generate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Deploy DHCP on 172.251.96.200",
    "taskType": "dhcp",
    "targetDevice": "172.251.96.200",
    "connectionId": "conn_abc123"
  }'
```

Response:
```json
{
  "generationId": "gen_1733754000000_abc123",
  "sessionId": "exec_1733754000000_def456",
  "taskDescription": "Deploy DHCP on 172.251.96.200",
  "commandCount": 3,
  "commands": [
    {
      "id": "cmd_001",
      "description": "Create DHCP pool",
      "riskLevel": "medium"
    }
  ],
  "explanation": "This deployment will...",
  "warnings": ["Existing DHCP config will be replaced"],
  "affectedServices": ["DHCP", "Network connectivity"],
  "estimatedDuration": 5
}
```

#### 3. Approve deployment
```bash
curl -X POST http://localhost:3000/v1/deployments/exec_1733754000000_def456/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "selectedCommandIds": ["cmd_001", "cmd_002", "cmd_003"]
  }'
```

#### 4. Record command result
```bash
curl -X POST http://localhost:3000/v1/deployments/exec_1733754000000_def456/result \
  -H "Content-Type: application/json" \
  -d '{
    "commandId": "cmd_001",
    "success": true,
    "stdout": "IP pool default-pool added",
    "exitCode": 0,
    "duration": 125
  }'
```

#### 5. Finalize execution
```bash
curl -X POST http://localhost:3000/v1/deployments/exec_1733754000000_def456/finalize \
  -H "Content-Type: application/json" \
  -d '{
    "success": true
  }'
```

#### 6. Get results
```bash
curl http://localhost:3000/v1/deployments/exec_1733754000000_def456/results
```

Response:
```json
{
  "sessionId": "exec_1733754000000_def456",
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

## Supported Deployment Types

### DHCP Configuration
```
Deploy DHCP on <device> with pool <range> [gateway <ip>] [dns <ips>]

Example:
"Deploy DHCP on 172.251.96.200 with pool 172.251.96.100-200, gateway 172.251.96.1"
```

### DNS Management
```
Add DNS record <name> pointing to <ip> [with type <A|AAAA|CNAME>]

Example:
"Add DNS record example.com pointing to 10.0.0.5"
```

### Firewall Rules
```
Configure firewall to [block|allow] <protocol> port <port> from <source> [to <dest>]

Example:
"Block SSH port 22 from internet"
```

### VLAN Configuration
```
Create VLAN <id> [for <purpose>] [with subnet <ip/mask>]

Example:
"Create VLAN 100 for management with subnet 10.100.0.0/24"
```

### Routing
```
Add route to <destination> via <gateway> [with metric <value>]

Example:
"Add route to 192.168.100.0/24 via 10.0.0.1"
```

## Troubleshooting

### "Message does not appear to be a deployment request"
- Use more specific keywords (e.g., "deploy", "configure", "setup")
- Include IP address or device name
- Specify task type clearly (DHCP, DNS, firewall, etc.)

### "Session not found"
- Verify session ID is correct
- Session may have expired (24-hour cleanup)
- Create a new deployment request

### Connection failed
- Verify device is reachable from gateway
- Check saved connection credentials
- Ensure correct IP/hostname

### Commands not generating
- Check LLM provider is configured
- Verify API key is valid
- Try simpler request message

### Execution timeout
- Increase `DEPLOYMENT_COMMAND_TIMEOUT` environment variable
- Check device responsiveness
- Reduce number of commands

## Security Best Practices

1. **Always review commands before approving** - Understand what will be executed
2. **Use SSH over Telnet** - More secure connection
3. **Limit user permissions** - Only deploy to authorized devices
4. **Keep credentials secure** - Use SSH keys when possible
5. **Enable audit logging** - Track all deployments
6. **Test in staging first** - Validate in non-production environment
7. **Have rollback plans** - Know how to undo changes

## Getting Help

For issues or questions:

1. Check the logs: `docker-compose logs mcp-gateway`
2. Review documentation: `/docs/DEPLOYMENT_VIA_CHAT.md`
3. Check API responses for error details
4. Test with simpler deployment requests first

## See Also

- [Full Deployment Documentation](./DEPLOYMENT_VIA_CHAT.md)
- [Web Terminal Guide](../admin-dashboard/WebTerminal.md)
- [Chat System Architecture](./CHAT_CONTEXT_OPTIMIZATION.md)
- [API Reference](./API-GUIDE.md)
