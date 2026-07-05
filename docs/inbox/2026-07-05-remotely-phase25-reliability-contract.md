---
source_project: remotely
source_phase: 25-cohesive-reliability-platform-deepening
status: incoming
created: 2026-07-05
---

# remotely Phase 25 Reliability Contract Update

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
