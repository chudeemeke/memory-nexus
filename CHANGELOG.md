# Changelog

All notable changes to @chude/memory are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
