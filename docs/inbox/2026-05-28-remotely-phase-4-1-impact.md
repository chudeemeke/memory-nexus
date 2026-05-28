---
schema_version: "1.2"
source_project: remotely
created: 2026-05-28
type: docs
severity: low
affects_scope: unknown
status: open
---

# Remotely Phase 4.1 Impact

Date: 2026-05-28  
Source: `C:\Projects\remotely` commit `308b384`

`remotely` is first-class shared infrastructure. Memory-nexus continuity/sync work may use it for scripted remote verification, so stale assumptions about logging and paths should be avoided.

Impact to check:

- Prefer `remotely run` for scripted remote verification.
- Use `RUST_LOG` for remotely diagnostics.
- Do not hard-code tunnel state paths.
- Reinstall remotely after source updates before comparing installed behavior.

Next action: review any memory sync/recovery docs that prescribe raw SSH or old remotely behavior.
