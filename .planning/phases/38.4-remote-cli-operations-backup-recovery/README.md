# Phase 38.4: Remote CLI, Operations, Backup, and Recovery

Status: completed 2026-06-06.

## Scope

Phase 38.4 moved remote sync from a hidden prototype surface to an explicit, diagnosable, recoverable CLI surface:

- `memory remote` is registered publicly.
- `memory sync --remote` is the only ordinary sync path that performs remote event-log egress.
- Configured remotes are skipped during plain `memory sync` with an actionable warning.
- `memory remote set/remove/status/preflight/doctor` expose stable JSON where requested.
- `memory remote backup/restore/rollback` provide local recovery for remote config and event-log content.
- Restore and rollback require `--confirm`.
- Backup/restore intentionally exclude `.git` internals.

## Security Decisions

- Local path remotes remain blocked by default; `--allow-local-path` is explicit consent for private/test workflows.
- Preflight and doctor validate machine identity, URL safety, actual Git origin drift, and active event-log secret findings.
- Recovery snapshots do not restore Git internals, avoiding accidental import of Git hooks/config from backup archives.
- Remote egress remains explicit; no hidden auto-push was introduced.

## Evidence

- `bun test src/presentation/cli/commands/remote.test.ts src/presentation/cli/commands/sync/index.test.ts src/presentation/cli/commands/completion.test.ts src/presentation/cli/help-groups.test.ts --timeout 120000` passed with 140 tests.
- `bun run quality` passed after the Phase 38.4 branch-coverage remediation.
- Coverage passed with statements 97.13%, branches 95.13%, functions 96.09%, and lines 97.25%.
- `gitleaks detect --no-banner --redact --source .` found no leaks.
- `git diff --check` passed with no whitespace errors.

## Operational Docs

See `docs/operations/remote-sync-runbook.md`.

## Next Phase

Phase 38.5: Secure Capability Interop. Keep authkey and future capability providers optional. Memory must consume only handles, masked metadata, proofs, readiness, or fingerprints, never raw secret values.
