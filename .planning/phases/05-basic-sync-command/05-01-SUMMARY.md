# Phase 5 Plan 01: ExtractionState File Metadata Extension - Summary

```yaml
phase: 05
plan: 01
subsystem: domain-entity
tags: [extraction-state, file-metadata, incremental-sync]
dependency-graph:
  requires: [04-01]
  provides: [extraction-state-file-metadata]
  affects: [05-02, 05-04]
tech-stack:
  added: []
  patterns: [immutable-entity, defensive-copy]
key-files:
  created: []
  modified:
    - src/domain/entities/extraction-state.ts
    - src/domain/entities/extraction-state.test.ts
    - src/infrastructure/database/repositories/extraction-state-repository.ts
    - src/infrastructure/database/repositories/extraction-state-repository.test.ts
decisions: []
metrics:
  duration: 15 minutes
  completed: 2026-01-28
```

## One-liner

ExtractionState entity extended with fileMtime/fileSize properties for incremental sync detection.

## What Was Done

### Task 1: Add file metadata properties to ExtractionState entity
- Added `fileMtime?: Date` and `fileSize?: number` optional properties to ExtractionStateParams
- Added private readonly fields with defensive copying for Date immutability
- Added validation for negative fileSize in create() method
- Updated all state transition methods (startProcessing, complete, fail, incrementMessages) to preserve file metadata
- Added `withFileMetadata(mtime: Date, size: number)` method for setting metadata on existing state
- Added 13 new unit tests covering file metadata functionality

### Task 2: Update ExtractionStateRepository to persist file metadata
- Updated rowToExtractionState() to reconstruct fileMtime and fileSize from database rows
- Updated save() to persist fileMtime as ISO 8601 string and fileSize as integer
- Added 7 new tests for file metadata persistence (round-trip, null handling, findBySessionPath, upsert, findPending, zero/large sizes)

### Task 3: Full test suite verification
- All 611 tests pass (increased from 591)
- 20 new tests added (13 entity + 7 repository)
- No regressions in existing functionality

## Commits

| Hash | Description |
|------|-------------|
| 7df46bb | feat(05-01): add file metadata properties to ExtractionState entity |
| f9d340f | feat(05-01): update ExtractionStateRepository to persist file metadata |

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies Delivered

- **extraction-state-file-metadata**: ExtractionState now tracks fileMtime and fileSize for comparing against session files during incremental sync detection

## Next Phase Readiness

05-02 (SyncService) can now:
1. Create ExtractionState with file metadata from SessionFileInfo
2. Compare stored metadata against current file stats
3. Determine which sessions need re-extraction

## Key Code Patterns

### Immutable Entity with File Metadata
```typescript
// Creating state with file metadata
const state = ExtractionState.create({
  id: "extract-123",
  sessionPath: "/path/to/session.jsonl",
  startedAt: new Date(),
  fileMtime: new Date("2024-01-15T09:00:00Z"),
  fileSize: 2048,
});

// Or setting metadata on existing state
const withMeta = state.withFileMetadata(mtime, size);
```

### Incremental Sync Detection Pattern
```typescript
// Compare stored state against current file
function needsReextraction(session: SessionFileInfo, state: ExtractionState | null): boolean {
  if (!state || state.status !== "complete") return true;
  if (!state.fileMtime || !state.fileSize) return true;
  return (
    session.modifiedTime.getTime() !== state.fileMtime.getTime() ||
    session.size !== state.fileSize
  );
}
```

## Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| extraction-state.test.ts | 36 | Pass |
| extraction-state-repository.test.ts | 27 | Pass |
| **Total** | 63 | Pass |
