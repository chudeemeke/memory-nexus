# Phase 38.3: Remote Sync Application Service and Git Transport

Status: Complete
Completed: 2026-06-06

## Goal

Synchronize canonical event logs through an application service and shell-safe Git transport adapter.

## Implemented

- Added `RemoteEventSyncService` in the application layer.
- Added transport, privacy preflight, and projection rebuild ports so remote sync orchestration no longer lives in the CLI.
- Added remote URL validation for HTTPS, SSH URL, and SCP-style Git remotes.
- Added explicit local-path remote consent for temp-bare/integration use; local paths remain blocked by default.
- Added remote ref validation and durable machine identity validation.
- Added `GitRemoteEventTransport` with argument-array Git subprocess execution and sanitized Git environment.
- Integrated the experimental `memory sync` remote path through `RemoteEventSyncService`.

## Boundaries

- Phase 38.3 is the service and transport phase, not the public operations phase.
- `memory remote set/remove/status/preflight/doctor`, stable JSON output, documented exit codes, backup, restore, rollback, and recovery remain Phase 38.4.
- The remote command is still gated by `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1` until Phase 38.4 completes.

## Verification

- Remote service and validation tests: pass.
- Git transport unit and temp bare repository integration tests: pass.
- Sync command service-seam tests: pass.
- Existing legacy `GitSyncer` regression tests: pass.
- Focused Phase 38.3 suite: 87 pass, 0 fail.
- Typecheck: pass.
- Build: pass.
- Diff whitespace: pass.
