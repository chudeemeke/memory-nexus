---
phase: 28-friction-universalization
plan: 03
subsystem: application
tags: [friction, service, auto-ingest, pattern-detection]
dependency_graph:
  requires: [28-01]
  provides: [friction-service-universal]
  affects: [friction-cli]
tech_stack:
  added: []
  patterns: [field-mapping, fallback-ingest, TDD]
key_files:
  created: []
  modified:
    - src/application/services/friction-service.ts
    - src/application/services/friction-service.test.ts
decisions:
  - "Tool defaults to 'memory' at service level (the tool's own friction)"
  - "loggedAt parameter enables backdated entries from fallback file"
  - "Auto-ingest maps project->sourceProject, date->loggedAt with T00:00:00Z suffix"
  - "Malformed JSON lines in friction.jsonl are skipped with stderr warning, not thrown"
  - "File delete failure after ingest is non-fatal (entries already saved)"
requirements_completed:
  - SC-03
  - SC-06
  - SC-08
metrics:
  duration: 6m
  completed: 2026-03-21
---

# Phase 28 Plan 03: FrictionService Auto-Ingest, Tool Threading, Pattern Detection Summary

Tool parameter threading through log/list, friction.jsonl auto-ingest with field mapping and graceful error handling, plus pattern detection and markReviewed delegation to repository.

## Changes Made

### Task 1: Tool parameter threading, auto-ingest, pattern detection

Extended FrictionService with six new capabilities:

1. **Tool parameter on log()**: Added `tool?: string` to LogFrictionParams, defaults to `"memory"`. Threaded through to FrictionEntry.create().

2. **loggedAt parameter on log()**: Added `loggedAt?: Date` for backdated entries (used by auto-ingest).

3. **Tool and sourceProject filters on list()**: Added `tool?: string` and `sourceProject?: string` to ListFrictionOptions, passed through to repository.findAll().

4. **ingestFallbackFile()**: Reads friction.jsonl line by line, maps fields (project->sourceProject, date->loggedAt), defaults missing tool to "unknown" and missing category to "cli", skips malformed lines, deletes file after ingest. Returns count of ingested entries.

5. **detectPatterns()**: Delegates to repository.findPatterns(threshold), default threshold 3.

6. **markReviewed()**: Delegates to repository.markReviewed(tool, new Date()).

**Commit:** 1bd8c98

## Test Coverage

40 tests total (was 22, added 18 new):
- log() tool threading: 2 tests (explicit + default)
- log() loggedAt: 1 test
- list() tool filter: 1 test
- list() sourceProject filter: 1 test
- ingestFallbackFile: 7 tests (read/save, field mapping, default tool, default category, malformed lines, missing file, delete failure)
- detectPatterns: 3 tests (default threshold, custom threshold, returns result)
- markReviewed: 1 test

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
