---
phase: "15"
plan: "01"
title: "EmbeddingRepository and EmbeddingService with model hash tracking"
subsystem: "embedding-pipeline"
tags: [embedding, repository, service, model-hash, batch-processing]
dependency-graph:
  requires: [EMBED-04, EMBED-05]
  provides: [EmbeddingRepository, EmbeddingService, computeModelHash]
  affects: [sync-command, embedding-pipeline]
tech-stack:
  added: []
  patterns: [repository-pattern, constructor-injection, transaction-batching, SHA-256-hash-truncation]
key-files:
  created:
    - src/infrastructure/database/repositories/embedding-repository.ts
    - src/infrastructure/database/repositories/embedding-repository.test.ts
    - src/application/services/embedding-service.ts
    - src/application/services/embedding-service.test.ts
  modified:
    - src/infrastructure/database/schema.ts
    - src/infrastructure/database/repositories/index.ts
    - src/infrastructure/database/index.ts
    - src/application/services/index.ts
    - src/infrastructure/hooks/config-manager.ts
    - src/infrastructure/hooks/config-manager.test.ts
key-decisions:
  - "Float32Array passed directly to sqlite-vec vec_f32() works in bun:sqlite (no Buffer conversion needed)"
  - "model_name column added via ALTER TABLE migration with PRAGMA table_info check for idempotency"
  - "EmbeddingService accepts dependencies via constructor injection for testability"
  - "computeModelHash is a standalone pure function, not a class method, for reuse"
patterns-established:
  - "EmbeddingRepository follows existing SqliteXxxRepository pattern with Database constructor"
  - "Mock repository/provider creation helpers for embedding service testing"
requirements-completed:
  - PIPE-02
  - PIPE-03
  - PIPE-05
metrics:
  duration: "6min"
  completed: "2026-02-26"
---

# Phase 15 Plan 01: EmbeddingRepository and EmbeddingService with Model Hash Tracking Summary

EmbeddingRepository provides database CRUD for embedding state and vector storage; EmbeddingService orchestrates batch embedding with SHA-256 model hash tracking, progress callbacks, and re-embedding support.

## Performance

- 70 tests across 3 test files (22 repository + 26 service + 22 config-manager)
- EmbeddingRepository: 100% function, 100% line coverage
- EmbeddingService: 100% function, 100% line coverage
- All 1663+ existing tests pass (excluding pre-existing EBUSY flaky test in export.test.ts)
- Plan duration: 6 minutes

## Accomplishments

1. **EmbeddingRepository** -- Full data access layer with findUnembedded (LEFT JOIN), storeBatch (atomic transaction into vec0 + embedding_state), getStoredModelHash, getStoredModelName, clearAllEmbeddings, getEmbeddedCount, getTotalMessageCount
2. **Schema migration** -- Added model_name column to embedding_state via ALTER TABLE with PRAGMA table_info idempotency check
3. **EmbeddingService** -- Application layer orchestrator with checkModelState (model change detection with human-readable names), embedUnembedded (batch processing with progress), clearAndReembed
4. **computeModelHash** -- Pure function generating 16-char hex SHA-256 hash from provider:model:dimensions
5. **EmbeddingConfigData** -- Extended with batchSize field (default: 100), deep-merge preserved in loadConfig()

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 15-01-A | EmbeddingRepository | c752bde | embedding-repository.ts, schema.ts, repositories/index.ts |
| 15-01-B | EmbeddingService | af62b6d | embedding-service.ts, config-manager.ts, services/index.ts |

## Files Created

- `src/infrastructure/database/repositories/embedding-repository.ts` -- Repository with 7 methods
- `src/infrastructure/database/repositories/embedding-repository.test.ts` -- 22 tests
- `src/application/services/embedding-service.ts` -- Service with 3 methods + pure function
- `src/application/services/embedding-service.test.ts` -- 26 tests

## Files Modified

- `src/infrastructure/database/schema.ts` -- EMBEDDING_STATE_ADD_MODEL_NAME migration + createSchema migration logic
- `src/infrastructure/database/repositories/index.ts` -- Added EmbeddingRepository exports
- `src/infrastructure/database/index.ts` -- Added EmbeddingRepository and EMBEDDING_STATE_ADD_MODEL_NAME exports
- `src/application/services/index.ts` -- Added EmbeddingService, computeModelHash, and type exports
- `src/infrastructure/hooks/config-manager.ts` -- Added batchSize to EmbeddingConfigData and DEFAULT_EMBEDDING_CONFIG
- `src/infrastructure/hooks/config-manager.test.ts` -- Added batchSize tests, updated toEqual assertions

## Decisions Made

1. **Float32Array works with vec_f32()**: bun:sqlite passes Float32Array correctly to sqlite-vec's vec_f32() function. No Buffer conversion needed (confirmed by storeBatch tests passing).
2. **ALTER TABLE migration pattern**: Used PRAGMA table_info check before ALTER TABLE to make migration idempotent. Applied in createSchema() after EMBEDDING_STATE_TABLE creation.
3. **computeModelHash as standalone function**: Exported separately (not a method) for reuse in other modules without instantiating EmbeddingService.
4. **Constructor injection for EmbeddingService**: Repository, provider, and config injected via constructor object for testability with mock objects.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- **Pre-existing EBUSY flaky test**: `export.test.ts` fails intermittently on Windows with EBUSY file lock in tmpdir cleanup. Unrelated to this plan's changes. All other 1663+ tests pass.

## Next Phase Readiness

Plan 15-02 (sync workflow integration) can now consume:
- `EmbeddingRepository` for database operations
- `EmbeddingService` for embedding orchestration
- `computeModelHash` for model change detection
- `EmbeddingConfigData.batchSize` for batch configuration
