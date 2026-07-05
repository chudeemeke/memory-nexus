# Changelog

All notable changes to @chude/memory are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.3] - 2026-07-05

### Fixed

- Windows hook background sync now resolves and launches the `memory` executable directly instead of routing through `aidev memory sync`, avoiding `bash ...\.bun\bin\aidev ...` launch failures on Windows.
- Hook/stats install hints now point at `memory install`, matching the published CLI binary.

### Documentation

- Recorded the scoped Phase 43 market-readiness decision and Phase 44 publish handoff requirements.
- Documented that broad agentic-memory category-leader claims remain blocked until MCP/local-server integration and public benchmark parity are implemented or explicitly dispositioned.

## [4.0.2] - 2026-06-22

### Fixed

- Completed the embedding pipeline follow-up for idempotent embedding storage after the 4.0.1 provider-limit resilience release.
- Corrected path/source naming behavior found during Windows and cross-project verification.

## [4.0.1] - 2026-06-22

### Added

- Added the v5 memory platform foundation: canonical event kernel, privacy governance, remote event sync, secure capability interop, durable friction query contract, evaluation harness, persona memory, temporal graph retrieval, and utility-aware ranking.

### Fixed

- Hardened embedding-provider limit handling so oversized provider requests can split and resume instead of wedging `memory sync --embed`.

## [4.0.0] - 2026-05-30

### Changed

- Legacy `~/.memory` / `MEMORY_HOME` markdown sidecars are now explicit opt-in. `memory sync` no longer indexes them by default; use `--include-memory-files`, `MEMORY_LEGACY_MEMORY_FILES=1`, or `legacyMemoryFiles.enabled=true` when compatibility indexing is needed. `memory backfill` now requires `--write-memory-files` or the same env/config opt-in before writing legacy daily logs.
  [Phase 36.10]

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
