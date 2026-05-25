# Changelog

All notable changes to @chude/memory are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0] - 2026-05-25

### Added

- **Event-Log SSOT (Single Source of Truth):** Re-architected storage to treat a structured, plain-text event log (`events.jsonl`) as the canonical source of truth for all memory events (decisions, learnings, preferences, friction, observations, and supersedence). SQLite database tables now serve exclusively as derived projection indices, guaranteeing high-performance query boundaries while maintaining fully auditable, human-readable records on disk.
  [Phase 33]
- **Temporal Supersedence Semantics:** Introduced explicit facts supersedence events to capture and logically version shifting knowledge over time without destructive in-place mutations of past historical data.
  [Phase 34]
- **T7 Recovery Capability:** Verified non-lock-in human-readable and model-recoverable file formats, enabling direct inspection of facts without needing the framework binary itself.
  [Phase 35]
- **Standalone `migrate` Command:** Implemented `memory migrate --from-windows` supporting cross-environment migrations (Windows native to WSL/Linux systems), fully automating SQLite WAL log checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`), structural integrity verification (`PRAGMA integrity_check`), sync lock cleaning, and native Git hooks sequential re-installation.
  [Phase 36 / PORT-01]
- **Orphan Workspace Pruning:** Extended the `purge` command with the `--orphans` flag, cascade-pruning stale database records and associated facts if their target source workspace directory has been deleted or moved.
  [Phase 36 / PORT-03]
- **Portability Diagnostics:** Extended `memory doctor` with a `--portability` option, scanning for mixed slash conventions, orphaned project workspaces, and stale embedding locks with automatic lock-clearing fixes.
  [Phase 36 / PORT-02]

### Changed

- **BREAKING (consumer-side):** `memory search --json` (and the other 5 query
  commands — `context`, `show`, `list`, `related`, `stats`) now emit a
  `QueryResultEnvelope`-shaped JSON document on stdout:
  `{ schema_version: "1", command, kind, data, meta }`. Previously, `search`
  emitted `{ meta, results }`, `list` emitted a bare array, `stats` emitted a
  flat object, and `search --files --json` emitted a bare array. Update
  consumers to read `data` instead of the top-level array/results key.
  [Phase 32 / CLI-02]
- CLI `--format` flag is normalized across all 6 query commands. New choices:
  `brief` (condensed) and `ai` (AI-optimized text). When `--format` is omitted,
  the implicit default text output is preserved unchanged.
  [Phase 32 / CLI-03]
- Help output now groups commands under labeled categories: Query Commands,
  Data Commands, System Commands, Feedback Commands.
  [Phase 32 / CLI-01]

### Deprecated

- `--format default` on `search`, `list`, `show`, `stats` is deprecated.
  Behavior is preserved as a transparent alias for "no `--format` flag" but
  emits a one-shot stderr warning. Will be removed in the next minor release.
  Migrate by omitting `--format` or using `--format brief` / `--format ai`.
  [Phase 32 / CLI-03]
- `--format detailed` on `context` and `related` is deprecated. Behavior
  preserved as a transparent alias for the existing detailed output but emits
  a one-shot stderr warning. Will be removed in the next minor release.
  Migrate to `--format brief` or `--format ai`.
  [Phase 32 / CLI-03]
