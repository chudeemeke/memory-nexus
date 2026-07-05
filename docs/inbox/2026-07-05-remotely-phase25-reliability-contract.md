---
schema_version: "1.3"
source_project: remotely
created: 2026-07-05
type: docs
severity: low
fix_status: none
affects_scope: this-project-only
priority_rationale: "Remotely Phase 25 changes expected install, doctor, explain, evidence, and transfer-readiness assumptions; memory-nexus should update stale cross-machine guidance the next time it touches remotely-backed automation."
related_issue: "C:\\Projects\\remotely Phase 25 cohesive reliability platform deepening"
issue_id: remotely:2026-07-05:phase25-reliability-contract-memory-nexus
thread_id: remotely:2026-07-05:phase25-reliability-contract
next_owner: memory-nexus
status: triaged
triaged_at: 2026-07-05
---

# remotely Phase 25 Reliability Contract Update

## Event Log

<!-- inbox-events:v1 -->
- 2026-07-05T22:35:00.000Z | conversations | triaged | Normalized malformed broadcast metadata to inbox schema v1.3; receiver project still owns whether any local guidance changes are needed.

## Source Phase

`25-cohesive-reliability-platform-deepening`

`remotely` Phase 25 is pending PR/merge. After it lands and the installed binary
is refreshed, consuming sessions should update any stale assumptions:

- Source-checkout reinstall path is now
  `cargo install --path crates\remotely-cli --force --locked`.
- `remotely doctor --fix --yes` can repair a safe stale install when the
  remediation plan authorizes it.
- `remotely run --explain` and `--explain --json` expose the resolved operation
  plan without executing.
- `remotely support-evidence --json` emits durable readiness evidence. Generate
  it to a temp path first, then copy into repo docs.
- MCP `remotely_send` and `remotely_fetch` are no longer globally disabled, but
  they require explicit named transfer roots, canonical local/remote proof,
  approval, audit, and recheck. Recursive transfer and native Windows remote
  proof remain out of scope.

Action: when this project next touches cross-machine automation, check for stale
`cargo install --path .` guidance, raw SSH workarounds, or MCP assumptions that
still treat transfer as globally unavailable.
