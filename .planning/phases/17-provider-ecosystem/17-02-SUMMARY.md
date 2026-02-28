---
phase: 17
plan: "17-02"
title: "Dimension-aware re-embedding on provider/model change"
subsystem: embedding-pipeline
tags: [embedding, dimension-change, vec0, provider-switch]
dependency-graph:
  requires: [17-01]
  provides: [dimension-aware-reembedding]
  affects: [embedding-repository, sync-command]
tech-stack:
  added: []
  patterns: [vec0-table-recreation, dimension-detection-from-stored-vectors]
key-files:
  created: []
  modified:
    - src/infrastructure/database/repositories/embedding-repository.ts
    - src/infrastructure/database/repositories/embedding-repository.test.ts
    - src/presentation/cli/commands/sync.ts
    - src/presentation/cli/commands/sync.test.ts
decisions:
  - "Detect stored dimensions by querying one embedding and dividing byteLength by 4 (Float32)"
  - "recreateVecTable clears both vec0 table and embedding_state atomically"
  - "Skip table recreation when storedDimensions is null (no prior embeddings)"
  - "Same-dimension model changes use existing DELETE-only path (no table drop)"
requirements-completed: [PROV-04]
metrics:
  duration: "6min"
  tasks-completed: 2
  tests-added: 14
  tests-total: 2523
  completed: "2026-02-28"
---

# Phase 17 Plan 02: Dimension-Aware Re-embedding Summary

**One-liner:** Vec0 table DROP/CREATE with new dimensions on provider/model switch, integrated into sync re-embedding flow

## Tasks Completed

| Task | Description | Commit | Key Changes |
|------|-------------|--------|-------------|
| 1 | Dimension-aware vec0 table operations in EmbeddingRepository | 075ff84 | getStoredEmbeddingDimensions(), recreateVecTable(dims) |
| 2 | Integrate dimension-aware re-embedding into sync flow | a6cec08 | Dimension check in runEmbeddingPass before clearAndReembed |

## What Was Built

### EmbeddingRepository Extensions

**getStoredEmbeddingDimensions()** -- Queries one embedding from message_embeddings, returns byteLength/4 (Float32 = 4 bytes per dimension). Returns null when no embeddings exist.

**recreateVecTable(dimensions)** -- Drops the existing message_embeddings vec0 table and recreates it with the specified dimension count. Also clears embedding_state since tracking data is logically paired with vector data.

### Sync Flow Integration

When a model change is detected AND the user confirms (or --force), the sync flow now:
1. Calls `getStoredEmbeddingDimensions()` to check current dimension
2. Compares against `config.embedding.dimensions`
3. If different: calls `recreateVecTable(newDimensions)` before re-embedding
4. If same: uses existing DELETE-only path (no table recreation needed)
5. Logs "Recreating embedding table for N-dimensional vectors..." for visibility

## Decisions Made

1. **Dimension detection via stored vector**: Query one embedding row and compute byteLength/4. More reliable than probing vec0 table definition (virtual tables don't report schema reliably via PRAGMA).

2. **Atomic state clearing in recreateVecTable**: Both message_embeddings (DROP+CREATE) and embedding_state (DELETE) are cleared together. This prevents orphaned state when vectors are gone.

3. **Null-safe dimension check**: When getStoredEmbeddingDimensions returns null (no prior embeddings), recreation is skipped. The table already has the correct dimensions from initial schema creation, or will be recreated on first embed.

4. **Same-dimension model changes**: When switching between models with identical dimensions (e.g., two 384d local models), the standard DELETE-only clearAllEmbeddings() path runs. No table drop needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing mock repo in sync.test.ts**
- **Found during:** Task 2, GREEN phase
- **Issue:** Existing test "logs clearing message and re-embeds when model change is accepted" had a mock repo without the new getStoredEmbeddingDimensions() and recreateVecTable() methods, causing TypeError
- **Fix:** Added the new methods to the existing mock repo
- **Files modified:** src/presentation/cli/commands/sync.test.ts
- **Commit:** a6cec08

## Verification

- All 2523 tests pass (14 new tests added)
- Zero regressions across 97 test files
- EmbeddingRepository test coverage: 100% functions, 100% lines
- Cross-dimension switches (384 -> 1536, 1536 -> 768) verified in tests
- Same-dimension model changes (384 -> 384) use DELETE-only path
- Table recreation is idempotent (calling twice is safe)
- Works when message_embeddings doesn't exist yet (DROP IF EXISTS)

## Self-Check: PASSED

- All 5 key files verified present on disk
- Commit 075ff84 verified in git log
- Commit a6cec08 verified in git log
