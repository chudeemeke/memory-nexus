---
phase: 23-foundation
plan: "03"
subsystem: database
tags: [sqlite, fts5, schema, repository, scanner, memory-files]

requires:
  - phase: 23-foundation/01
    provides: MemoryFile entity, IMemoryFileRepository port, IMemoryFileScanner port
  - phase: 23-foundation/02
    provides: sanitizeFtsQuery() for FTS5 query safety
provides:
  - memory_files table with FTS5 search
  - SqliteMemoryFileRepository implementing IMemoryFileRepository
  - MemoryFileScanner implementing IMemoryFileScanner
  - getMemoryDir() path helper
affects: [23-04, 24-friction-system, 25-intelligence]

tech-stack:
  added: []
  patterns: [external-content-fts5, upsert-on-conflict, test-path-override]

key-files:
  created:
    - src/infrastructure/database/repositories/memory-file-repository.ts
    - src/infrastructure/database/repositories/memory-file-repository.test.ts
    - src/infrastructure/sources/memory-file-scanner.ts
    - src/infrastructure/sources/memory-file-scanner.test.ts
  modified:
    - src/infrastructure/database/schema.ts
    - src/infrastructure/database/schema.test.ts
    - src/infrastructure/paths.ts
    - src/infrastructure/paths.test.ts
    - src/infrastructure/database/repositories/index.ts
    - src/infrastructure/sources/index.ts

key-decisions:
  - "Skip unrecognized .md files in scanner (only 4 defined types indexed, adding a 5th would require schema CHECK constraint change)"
  - "Deduplicated upsert SQL between save() and saveMany() using shared const"
  - "getMemoryDir() uses home directory directly, not XDG (matches ~/.memory/ convention)"

patterns-established:
  - "External content FTS5 pattern for memory_files matches messages_fts pattern exactly"
  - "MemoryFileScanner follows FileSystemSessionSource discovery pattern"
  - "TestPathOverrides extended for memoryDir alongside configDir/dataDir"

requirements-completed: []

duration: 11min
completed: 2026-03-08
---

# Phase 23 Plan 03: Schema Extension, SqliteMemoryFileRepository, and MemoryFileScanner Summary

**memory_files table with FTS5 search, SqliteMemoryFileRepository with upsert and full-text search, MemoryFileScanner for ~/.memory/ file discovery with type classification and SHA-256 hashing**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-08T03:03:47Z
- **Completed:** 2026-03-08T03:15:37Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- memory_files table with CHECK constraint on file_type, UNIQUE on file_path, FTS5 virtual table, and INSERT/UPDATE/DELETE sync triggers
- SqliteMemoryFileRepository with save (upsert), saveMany (transactional), findByPath, findByType, findByProject, and searchContent (FTS5 MATCH with sanitizeFtsQuery)
- MemoryFileScanner discovering .md files recursively, classifying 4 types from path patterns, extracting project encoded names, computing SHA-256 hashes, graceful no-op for missing directories
- getMemoryDir() path helper with test override support

## Task Commits

Each task was committed atomically:

1. **Task 23-03-A: Schema extension** - `d90a933` (feat)
2. **Task 23-03-B: getMemoryDir + SqliteMemoryFileRepository** - `c17b243` (feat)
3. **Task 23-03-C: MemoryFileScanner** - `f496d21` (feat)

## Files Created/Modified
- `src/infrastructure/database/schema.ts` - MEMORY_FILES_TABLE, MEMORY_FILES_FTS_TABLE, MEMORY_FILES_FTS_TRIGGERS added to SCHEMA_SQL
- `src/infrastructure/database/schema.test.ts` - 16 new tests for memory_files table, FTS5, triggers
- `src/infrastructure/database/repositories/memory-file-repository.ts` - SqliteMemoryFileRepository with full CRUD + FTS5 search
- `src/infrastructure/database/repositories/memory-file-repository.test.ts` - 12 tests for repository operations
- `src/infrastructure/database/repositories/index.ts` - Barrel export for SqliteMemoryFileRepository
- `src/infrastructure/sources/memory-file-scanner.ts` - MemoryFileScanner discovering and classifying ~/.memory/ files
- `src/infrastructure/sources/memory-file-scanner.test.ts` - 20 tests for scanner behavior
- `src/infrastructure/sources/index.ts` - Barrel export for MemoryFileScanner
- `src/infrastructure/paths.ts` - getMemoryDir() function, TestPathOverrides extended with memoryDir
- `src/infrastructure/paths.test.ts` - 5 new tests for getMemoryDir

## Decisions Made
- Skip unrecognized .md files in scanner rather than adding a 5th type -- the schema CHECK constraint is locked to 4 types and changing it was not discussed in CONTEXT.md
- Deduped upsert SQL between save() and saveMany() via shared UPSERT_SQL constant
- getMemoryDir() returns ~/.memory/ directly (not under XDG), matching the convention from CONTEXT.md

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema, repository, and scanner are ready for Plan 23-04 (sync integration)
- All infrastructure pieces needed by the sync command to index memory files are in place
- 2723 tests passing, zero regressions

## Self-Check: PASSED

All created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 23-foundation*
*Completed: 2026-03-08*
