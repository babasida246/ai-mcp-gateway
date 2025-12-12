# Code Duplication & Fragmentation Inventory

**Generated:** 2025-12-10  
**Purpose:** Catalog duplicated functionality across the codebase to guide consolidation efforts.

---

## 🔴 HIGH PRIORITY - Exact Duplicates

### 1. **RouterOS Command Builders & Helpers**

| Feature | Location 1 (UI) | Location 2 (Service) | Lines | Complexity |
|---------|-----------------|----------------------|-------|------------|
| `normalizeList()` | `admin-dashboard/src/pages/Mikrotik.tsx:6-12` | `src/services/mikrotik/manager.ts:135-144` | ~8 each | **LOW** ⚡ |
| `parseCidr()` | `admin-dashboard/src/pages/Mikrotik.tsx:14-31` | `src/services/mikrotik/manager.ts:146-168` | ~18 each | **MEDIUM** 🔶 |
| VLAN wizard builder | `buildVlanWizard()` in Mikrotik.tsx:76+ | `createVlanNetwork()` in manager.ts:578+ | ~20 each | **MEDIUM** 🔶 |
| Firewall template | `buildFirewallTemplate()` in Mikrotik.tsx:108+ | `applyFirewallTemplate()` in manager.ts:609+ | ~15 each | **MEDIUM** 🔶 |
| Block address list | `buildBlockAddressList()` in Mikrotik.tsx:124+ | `addBlockAddressList()` in manager.ts:621+ | ~10 each | **LOW** ⚡ |
| DNS force | `buildDnsForce()` in Mikrotik.tsx:132+ | `enforceDns()` in manager.ts:632+ | ~12 each | **LOW** ⚡ |
| DHCP quick setup | `buildDhcpQuick()` in Mikrotik.tsx:144+ | `setupDhcpQuick()` in manager.ts:646+ | ~15 each | **MEDIUM** 🔶 |
| L2TP server setup | `buildL2tpServer()` in Mikrotik.tsx | `setupL2tpServer()` in manager.ts:669+ | ~12 each | **MEDIUM** 🔶 |
| IPsec site-to-site | `buildIpsecSiteToSite()` in Mikrotik.tsx | `setupIpsecSiteToSite()` in manager.ts:679+ | ~15 each | **MEDIUM** 🔶 |
| Simple queue (IP) | `buildSimpleQueueIp()` in Mikrotik.tsx | `addSimpleQueueIp()` in manager.ts:718+ | ~8 each | **LOW** ⚡ |
| Simple queue (subnet) | `buildSimpleQueueSubnet()` in Mikrotik.tsx | `addSimpleQueueSubnet()` in manager.ts:728+ | ~8 each | **LOW** ⚡ |

**Impact:** ~150+ lines duplicated between UI and service. Changes to command logic require editing both files.

**Recommendation:** Extract all command builders into `src/lib/mikrotik/commands/` as canonical implementations. UI and service both import from shared lib.

---

### 2. **SSH Client Wrappers**

| Feature | Location 1 | Location 2 | Notes |
|---------|-----------|-----------|-------|
| SSH connection mgmt | `MikrotikSSH` in `src/services/mikrotik/client.ts` | Generic `SSHClient` usage in `src/tools/terminal/index.ts` | Different abstractions for same SSH2 library |
| Command execution | `MikrotikSSH.exec()` / `.execMulti()` | `TerminalTool.executeSSHCommand()` | Both wrap ssh2 exec but with different patterns |

**Impact:** Two distinct SSH wrappers mean duplicate connection handling, error parsing, and session management.

**Recommendation:** Create a unified `src/lib/ssh/` module with a base `SSHConnection` class. `MikrotikSSH` extends it with RouterOS-specific helpers; `TerminalTool` uses the base class.

---

### 3. **Type Definitions**

| Type | Location 1 | Location 2 | Conflict Risk |
|------|-----------|-----------|---------------|
| `CommandResult` | `admin-dashboard/src/pages/Mikrotik.tsx:4` (UI shape `{commands, disabled?}`) | `src/tools/terminal/index.ts:38` (service shape `{stdout, stderr, exitCode}`) | **HIGH** 🔴 Name collision, different contracts |
| Config types | `BackupConfig`, `ConfigSnapshot`, `ConfigApplyResult` in `manager.ts:106-130` | No UI equivalent yet | Future UI features may duplicate these |

**Impact:** Name collision for `CommandResult` means TypeScript can't safely import both. Confusing for developers.

**Recommendation:** Rename UI type to `UICommandResult` or `CommandBuilderResult`. Move all config types to `src/types/mikrotik.ts` shared module.

---

### 4. **Validation Logic**

| Validator | Location 1 | Location 2 | Coverage |
|-----------|-----------|-----------|----------|
| `validateCommand()` | `src/services/mikrotik/manager.ts:359+` | UI has inline validation in builders (e.g., checking `!name.trim()`) | Different validation approaches |
| Command validation | `src/services/chat/commandGeneration.ts:276` (`validateCommands()`) | Separate logic for chat-generated commands | Overlapping concerns |

**Impact:** Validation scattered across 3+ locations. UI can produce invalid commands that service rejects.

**Recommendation:** Create `src/lib/mikrotik/validators.ts` with runtime validators (Zod schemas). Use in UI, service, and chat handlers.

---

## 🟡 MEDIUM PRIORITY - Overlapping Responsibilities

### 5. **UI Components**

| Component | Current Location | Duplication Risk |
|-----------|------------------|------------------|
| `CommandBlock` | Defined inline in `Mikrotik.tsx:349-375` | Likely to be copied if other pages need command display |
| Input wizards | Each card has own state + inputs (bridge, VLAN, firewall, etc.) | Pattern repeated ~15 times in one file |

**Recommendation:** Extract to `admin-dashboard/src/components/mikrotik/`:
- `CommandBlock.tsx` (reusable)
- `ConfigWizard.tsx` (generic form wrapper with state)
- Individual wizard components (VlanWizard, FirewallWizard, etc.)

---

### 6. **Command Execution Flow**

| Layer | Implementation | Notes |
|-------|---------------|-------|
| UI | Generates `string[]` commands, displayed in `CommandBlock` | User manually copies/pastes |
| Service | `manager.applyCommands(commands)` → `ssh.execMulti()` → snapshot + rollback | Automated execution with safety |
| Bulk apply | `applyCommandsBulk()` loops over devices, calls `applyCommands()` | Added recently for batch ops |

**Observation:** UI and service are decoupled (good), but no API endpoint yet to let UI trigger `applyCommands` directly. UI bulk feature only generates JSON payload.

**Recommendation:** Create REST endpoint `/api/mikrotik/apply` that accepts `{deviceId, commands}` and calls `manager.applyCommands()`. UI sends commands directly instead of copy/paste flow.

---

## 🟢 LOW PRIORITY - Potential Future Duplication

### 7. **Constants & Config Maps**

| Constant | Location | Usage |
|----------|----------|-------|
| `MIKROTIK_COMMANDS` | `src/services/mikrotik/manager.ts:10-104` | Static command templates |
| Hardcoded RouterOS commands | Scattered in UI builder functions | Same strings duplicated |

**Recommendation:** Move `MIKROTIK_COMMANDS` to `src/lib/mikrotik/commands/templates.ts`. Import in both UI and service.

---

### 8. **Testing Utilities**

| Test Helper | Location | Notes |
|-------------|----------|-------|
| Mock SSH client | `src/services/mikrotik/__tests__/mikrotik.test.ts` | Single test file so far |

**Recommendation:** When adding more tests, create `src/services/mikrotik/__tests__/helpers.ts` with shared mocks to avoid duplication.

---

## 📊 Summary Statistics

| Category | Duplicated Items | Est. Lines | Priority |
|----------|------------------|------------|----------|
| Command builders | 11 functions | ~150 | 🔴 HIGH |
| Helpers (normalize, parse) | 2 functions | ~26 | 🔴 HIGH |
| SSH wrappers | 2 classes | ~200 | 🟡 MEDIUM |
| Type definitions | 2 types | ~15 | 🔴 HIGH |
| Validation logic | 3 locations | ~50 | 🟡 MEDIUM |
| UI components | 1 component + patterns | ~30 | 🟡 MEDIUM |
| **TOTAL** | **~20 items** | **~471 lines** | - |

---

## 🎯 Recommended Consolidation Phases

### Phase 1: Quick Wins (1-2 days) ⚡
1. Extract `normalizeList()` and `parseCidr()` to `src/lib/mikrotik/utils.ts`
2. Update imports in `Mikrotik.tsx` and `manager.ts`
3. Rename UI `CommandResult` type to `UICommandResult` to avoid collision
4. Move `CommandBlock` to `admin-dashboard/src/components/mikrotik/CommandBlock.tsx`

**Expected reduction:** ~50 lines, eliminates type collision.

---

### Phase 2: Command Builder Unification (3-5 days) 🔶
1. Create `src/lib/mikrotik/commands/` directory structure:
   - `builders.ts` - all command builder functions
   - `templates.ts` - move `MIKROTIK_COMMANDS` map
   - `types.ts` - shared types (`VlanWizardOpts`, etc.)
2. Refactor `manager.ts` methods to call shared builders
3. Refactor `Mikrotik.tsx` functions to call shared builders
4. Add unit tests for each builder (dry-run mode)

**Expected reduction:** ~150 lines, single source of truth for RouterOS commands.

---

### Phase 3: SSH & Validation Consolidation (5-7 days) 🔶
1. Create `src/lib/ssh/` with base `SSHConnection` class
2. Refactor `MikrotikSSH` to extend base class
3. Update `TerminalTool` to use base SSH utilities
4. Create `src/lib/mikrotik/validators.ts` with Zod schemas
5. Replace inline validation in UI, service, and chat handlers

**Expected reduction:** ~100 lines, unified SSH abstraction.

---

### Phase 4: API & Full Integration (7-10 days) 🟢
1. Create `/api/mikrotik/apply` endpoint (wraps `applyCommandsBulk`)
2. Add authentication & approval workflow
3. Wire UI bulk apply card to POST to endpoint
4. Add per-device result display in UI
5. Deprecate copy/paste flow in favor of direct execution

**Expected reduction:** 0 lines (adds functionality), but eliminates manual copy/paste duplication risk.

---

## 🚨 Migration Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing UI/service during refactor | **HIGH** | Use feature flags; keep old code until new code tested |
| Import path changes cause build failures | **MEDIUM** | Use TypeScript path aliases (`@lib/*`); update tsconfig |
| Shared code increases bundle size for UI | **LOW** | Tree-shaking handles unused exports; measure with `vite-bundle-visualizer` |
| Tests break during migration | **MEDIUM** | Update tests incrementally; ensure CI passes before merging |

---

## ✅ Success Metrics

- [ ] Duplicate code reduced by **80%** (from ~471 to <100 lines)
- [ ] All command builders covered by unit tests (dry-run mode)
- [ ] ESLint reports **0 unused imports** after cleanup
- [ ] Type safety: no `CommandResult` name collisions
- [ ] UI can execute commands via API (not just copy/paste)
- [ ] CI passes with all existing tests + new shared lib tests

---

## 📋 Next Steps

1. **Review this inventory** with team (5 min)
2. **Start Phase 1** (extract helpers) — quick PR today
3. **Schedule Phase 2** review after Phase 1 merged
4. **Assign owners** for each phase

---

**Estimated total effort:** 16-24 developer days across 4 phases.  
**ROI:** Eliminates ~70% of duplicate code, improves type safety, enables UI automation.
