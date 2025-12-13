MikroTik Configuration Analysis — Plan

Purpose
- Provide automated analysis of generated or existing MikroTik RouterOS configurations.
- Detect performance issues, common misconfigurations, and security/operational risks.
- Offer actionable remediation suggestions and safe, idempotent commands where possible.

Analysis Types
1. Performance Analysis
- Check for suboptimal MTU, mismatched MTU across L2/L3 causing fragmentation.
- Detect excessive bridge/filtering rules that can cause CPU spikes.
- Identify interfaces in high-utilization patterns (requires telemetry integration).
- Suggest batching or rate-limiting changes that could reduce impact.

2. Error / Safety Analysis
- Find conflicting VLAN/PVID assignments (same interface assigned different PVIDs).
- Detect missing bridge ports, or applying VLAN filtering without bridge settings.
- Warn about non-idempotent commands (like removing interfaces) and recommend safer alternatives.
- Flag operations requiring reboot or service disruption.

3. Security Analysis
- Detect default/weak credentials (if config includes password placeholders).
- Check for open management interfaces on WAN-facing ports.
- Suggest minimizing exposure and enabling secure access (SSH keys, firewall rules).

4. Best-practice Hints
- Use explicit names and comments in scripts.
- Prefer `set` over `add` when possible to maintain idempotence.
- Group related changes into single transaction where supported.

Suggested UI Workflow
- "Analyze config" button alongside "Generate with AI".
- Show categorized findings: Performance / Errors / Security / Suggestions.
- Each finding includes: severity (low/medium/high), explanation, suggested remediation commands (if safe) and a single-click copy-to-clipboard.
- Allow user to preview remediation commands before execution.

Implementation Notes
- Analysis can be implemented in backend as an additional step in `generateDeploymentCommands` or as a separate endpoint `/v1/deployments/analyze`.
- Use rule-based checks first (fast, deterministic). Augment with LLM-based interpretation for fuzzy checks and remediation wording.
- Keep all analysis results idempotent and conservative: do not propose destructive commands automatically.

Example Findings & Fixes
- Finding: "Interface ether2 has MTU 1500 but bonded interfaces are set to 9000"
  - Severity: medium
  - Explanation: mixed MTU can cause fragmentation and connectivity issues.
  - Suggested fix:
    /interface ethernet set mtu=9000 [find name="ether2"]
  - Suggest running this during maintenance window.

- Finding: "Bridge 'br-lan' has VLAN filtering enabled but no bridge VLANs configured"
  - Severity: low
  - Explanation: VLAN filtering without bridge-vlan entries can result in traffic drop.
  - Suggested fix:
    /interface bridge vlan add bridge=br-lan tagged=... untagged=...

- Finding: "Multiple access ports assigned same PVID on same physical interface"
  - Severity: high
  - Explanation: Conflicting PVIDs can cause VLAN leakage.
  - Suggested fix: Review the VLAN assignments and correct PVIDs; provide example `interface bridge port` and `bridge vlan` commands.

Ops & Safety
- Any auto-generated remediation commands should be marked as recommendations.
- When suggesting changes that impact traffic, indicate required maintenance window and estimated disruption.

Next Steps
- Add a backend analyzer module that accepts the configuration (structured context) and returns findings.
- Add a small UI panel on `Mikrotik` page to invoke analysis and display results (category-filtered list with copy buttons).
- Instrument telemetry endpoints (optional) for performance analysis.

Authorship: Generated integration plan by the developer team.
