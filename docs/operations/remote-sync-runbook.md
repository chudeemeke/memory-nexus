# Remote Sync Operations Runbook

Status: active for v5 Phase 38.4.

## Invariants

- Remote sync is explicit egress. `memory sync` does not push or pull event logs. Use `memory sync --remote`.
- Local path remotes are rejected unless the command uses `--allow-local-path` or an internal test seam opts in.
- Preflight and doctor scan active event logs for likely secret findings before remote egress.
- Backup and restore operate on remote sync config plus event-log files. They do not restore `.git` internals.
- Restore and rollback require `--confirm`.

## Exit Codes

- `0`: command succeeded or remote preflight is ready.
- `1`: command failed due to an execution, filesystem, config, or validation error.
- `2`: command completed but remote sync is not ready, or a mutating recovery command lacks `--confirm`.

## Configure

```bash
memory remote set <repository-url>
memory remote status --json
memory remote preflight --json
memory sync --remote
```

For local/private test remotes only:

```bash
memory remote set /path/to/bare.git --allow-local-path
memory remote preflight /path/to/bare.git --allow-local-path --json
```

## Diagnose

```bash
memory remote doctor --json
memory audit-secrets --json
```

If `doctor` reports event-log secret findings, remediate before remote sync:

```bash
memory audit-secrets --quarantine-events --json
memory remote doctor --json
```

## Backup

```bash
memory remote backup --json
memory remote backup ./remote-sync-backups --json
```

The backup manifest is `manifest.json`. The snapshot includes `config.json` when present and an `events/` directory containing event-log content. `.git` is excluded deliberately so restore cannot import Git hooks or remote metadata from an archive.

## Restore

Preview by reading the manifest:

```bash
cat <backup-dir>/manifest.json
```

Restore requires explicit confirmation and creates a rollback snapshot of the current state first:

```bash
memory remote restore <backup-dir> --confirm --json
```

After restore:

```bash
memory remote status --json
memory remote preflight --json
```

If the existing Git origin no longer matches restored config, run `memory remote set <repository-url>` to rebind the local Git metadata.

## Rollback

Use the `rollbackBackupPath` returned by restore:

```bash
memory remote rollback <rollback-backup-dir> --confirm --json
memory remote preflight --json
```

## Cross-Machine Verification

For scripted remote execution, use first-party `remotely` rather than raw SSH:

```bash
remotely run "cd ~/Projects/memory-nexus && memory remote doctor --json"
remotely run "cd ~/Projects/memory-nexus && memory sync --remote"
```

Use raw SSH only for interactive recovery.

## Release Evidence

Phase 38.4 verification included focused remote CLI tests, sync explicit-egress tests, shell completion tests, help snapshot tests, full `bun run quality`, coverage statements 97.13%, branches 95.13%, functions 96.09%, lines 97.25%, gitleaks, and diff whitespace.
