---
source_project: remotely
created: 2026-05-28
severity: medium
status: open
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
