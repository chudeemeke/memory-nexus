---
source_project: remotely
created: 2026-05-28
severity: medium
status: archived
---

# remotely Phase 4.5-5 Consumer Impact

`remotely` is now a release-candidate first-party cross-machine tool.

Consumer-visible changes:

- Prefer `remotely send <local> [remote]` and `remotely fetch <remote> <local>` for normal configured-machine file transfer. Keep raw `rsync` for advanced mirrors or non-configured hosts.
- Use `remotely run --stdin` for heredocs and multi-line scripts.
- `remotely status` exits 1 when probes fail; CLI misuse and config-shape errors exit 2; remote command exit codes still propagate.
- Transfer backend config is `transfer_backend = "auto" | "wsl" | "rsync" | "scp"`.
- `remotely completions <shell>` and `remotely man` are available.

Action: review cross-machine memory sync, verification, and recovery scripts for stale raw SSH/rsync assumptions.

## Disposition

Reviewed 2026-05-30. Current memory-nexus docs and scripts do not prescribe raw SSH/rsync as the normal cross-machine workflow. The only matches are these inbox notes and historical review excerpts. Future Phase 38 remote-sync work remains responsible for using the current first-party `remotely` conventions where cross-machine verification or transfer is needed.
