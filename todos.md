# AI MCP Gateway - TODO List

> **Last Updated:** Auto-generated from project scan
> **Project:** AI MCP Gateway với MCP Tools cho môi trường ATTT cấp 3

---

## 📋 Tổng Quan

| Category | Count | Priority |
|----------|-------|----------|
| Backend Integrations (MCP Tools) | 17 | 🔴 Critical |
| Admin Dashboard | 4 | 🟡 Medium |
| CLI Commands | 2 | 🟢 Low |
| Infrastructure | 3 | 🟡 Medium |
| **Total** | **26** | - |

---

## 🔴 Critical: Backend Integrations (MCP Tools)

Các TODO này cần hoàn thành để production-ready. Hiện tại đang sử dụng mock data.

### Network Tools (`src/mcp/tools/net.ts`)

| # | Line | Description | Backend Types |
|---|------|-------------|---------------|
| 1 | 66 | Load NetworkBackendConfig from config file or environment | Config System |
| 2 | 766 | `net.dhcp_dns_manage` - Implement actual backend integrations | MikroTik, DHCP, DNS |
| 3 | 915 | `net.nac_control` - Implement actual NAC backend integrations | FortiNAC, Cisco ISE |
| 4 | 1129 | `net.inventory_device_lookup` - Replace with actual CMDB/NMS backend | CMDB, NetBox |
| 5 | 1243 | `net.inventory_interface_lookup` - Replace with actual NMS API | NetBox, LibreNMS, Zabbix |
| 6 | 1342 | `net.inventory_vlan_lookup` - Replace with actual switch API/SNMP query | SNMP, Switch API |
| 7 | 1437 | `net.inventory_topology_lookup` - Replace with actual CMDB/NMS data | CMDB, NMS |
| 8 | 1527 | `net.config_backup_lookup` - Replace with actual config backup system | Oxidized, RANCID |
| 9 | 1626 | `net.config_diff_lookup` - Replace with actual config diff from backup system | Oxidized, RANCID |
| 10 | 1733 | `net.baseline_check` - Replace with actual baseline checking engine | Custom Engine |
| 11 | 1852 | `net.nac_quarantine_lookup` - Replace with actual NAC backend query | FortiNAC, Cisco ISE |
| 12 | 1949 | `net.policy_suggest` - Replace with AI/rule-based policy suggestion engine | AI Engine |

### Security Tools (`src/mcp/tools/sec.ts`)

| # | Line | Description | Backend Types |
|---|------|-------------|---------------|
| 13 | 171 | `sec.siem_search` - Replace with actual SIEM backend integration | ELK, Wazuh, FortiAnalyzer |
| 14 | 245 | Document supported SIEM backends in tool description | Documentation |
| 15 | 311 | `sec.alert_lookup` - Replace with actual SIEM backend | ELK, Wazuh |
| 16 | 413 | `sec.threat_intel` - Implement actual backend aggregation | VirusTotal, OTX, MISP |
| 17 | 570 | `sec.compliance_check` - Implement actual backend aggregation | Compliance DB |

### MCP Adapter (`src/mcp/adapter/index.ts`)

| # | Line | Description | Priority |
|---|------|-------------|----------|
| 18 | 523 | HTTP transport fallback - currently only supports WebSocket/stdio | 🟡 Medium |

---

## 🟡 Medium: Admin Dashboard Integration

### Settings System (NEW - Just Implemented)

| # | Task | File | Status |
|---|------|------|--------|
| 19 | Connect McpTools.tsx to real API instead of mock data | `admin-dashboard/src/pages/McpTools.tsx` | ⏳ Pending |
| 20 | Connect Backends.tsx to real API instead of mock data | `admin-dashboard/src/pages/Backends.tsx` | ⏳ Pending |
| 21 | Add authentication/authorization for admin endpoints | `src/api/admin.ts` | ⏳ Pending |
| 22 | Persist settings to database instead of file | `src/mcp/settings/service.ts` | ⏳ Pending |

---

## 🟢 Low: CLI Commands

### Code Agent (`cli/src/commands/code.ts`)

| # | Line | Description |
|---|------|-------------|
| 23 | 275 | Track actual budget in codeAgentRun |
| 24 | 325 | Implement smart detection of when to update project docs |

---

## 🟡 Medium: Infrastructure

| # | Task | Files | Description |
|---|------|-------|-------------|
| 25 | Database migration for MCP settings | `migrations/` | Create migration for mcp_tool_settings and backend_configs tables |
| 26 | Unit tests for MCP Settings | `tests/unit/` | Add tests for settings service, enforcement, and admin API |

---

## 📁 File Locations Summary

```
src/
├── mcp/
│   ├── tools/
│   │   ├── net.ts          # 12 TODOs - Network integrations
│   │   ├── sec.ts          # 5 TODOs - Security integrations
│   │   └── log.ts          # ✅ No TODOs
│   ├── adapter/
│   │   └── index.ts        # 1 TODO - HTTP transport
│   └── settings/
│       └── service.ts      # NEW - needs DB persistence
├── api/
│   └── admin.ts            # NEW - needs auth
cli/
├── src/
│   └── commands/
│       └── code.ts         # 2 TODOs - Budget tracking
admin-dashboard/
├── src/
│   └── pages/
│       ├── McpTools.tsx    # NEW - needs real API
│       └── Backends.tsx    # NEW - needs real API
```

---

## 🎯 Recommended Implementation Order

### Phase 1: Core Backend Services (Priority: Critical)
1. [ ] Create service classes for backend integrations:
   - `CmdbService` (NetBox, custom CMDB)
   - `NmsService` (LibreNMS, Zabbix)
   - `SiemService` (ELK, Wazuh, FortiAnalyzer)
   - `NacService` (FortiNAC, Cisco ISE)
   - `ConfigBackupService` (Oxidized, RANCID)

2. [ ] Implement configuration system:
   - Load `NetworkBackendConfig` from environment/config file
   - Create credentials management (không expose secrets)

### Phase 2: Database & Persistence (Priority: High)
3. [ ] Create database migrations:
   - `007_mcp_settings.sql` for tool settings
   - `008_backend_configs.sql` for backend configurations

4. [ ] Update `McpSettingsService` to use PostgreSQL
5. [ ] Add Redis caching for settings lookups

### Phase 3: Admin Dashboard (Priority: Medium)
6. [ ] Connect frontend to real API endpoints
7. [ ] Add authentication middleware for admin routes
8. [ ] Add audit log viewer in dashboard

### Phase 4: Testing & Documentation (Priority: Low)
9. [ ] Add unit tests for new components
10. [ ] Update API documentation
11. [ ] Create backend integration guides

---

## 🔐 ATTT Cấp 3 Compliance Checklist

- [x] Default read-only modes (`inspect`, `plan` - không có `apply`)
- [x] Audit logging cho tất cả thay đổi
- [x] Không expose secrets (chỉ dùng `credentialsProfileId`)
- [x] Scope limits (`maxRows`, `maxTimeRange`)
- [ ] Role-based access control cho admin endpoints
- [ ] Encryption at rest cho sensitive configs
- [ ] Rate limiting cho admin API

---

## 📝 Notes

### Mock Data Locations
Tất cả mock data nằm trong các tool handlers. Khi implement backend thật:
1. Giữ lại mock data như fallback cho dev/test mode
2. Sử dụng environment variable để switch giữa mock và production

### Backend Service Interface Pattern
```typescript
interface IBackendService<TInput, TOutput> {
  isAvailable(): Promise<boolean>;
  execute(input: TInput): Promise<TOutput>;
  getHealthStatus(): Promise<HealthStatus>;
}
```

### Configuration Structure
```typescript
// Recommended config structure
{
  "mcp": {
    "tools": {
      "net.fw_log_search": { "enabled": true, "maxRows": 1000 },
      // ...
    },
    "backends": {
      "cmdb": { "type": "netbox", "url": "..." },
      "siem": { "type": "elk", "url": "..." },
      // ...
    }
  }
}
```

---

*Generated by AI MCP Gateway Project Scanner*
