---
phase: 04-storage-adapters
plan: 02
subsystem: database
tags: [sqlite, fts5, bun:sqlite, message-repository, batch-insert]

# Dependency graph
requires:
  - phase: 02-database-schema
    provides: messages_meta table, messages_fts virtual table, FTS5 triggers
  - phase: 04-01
    provides: SqliteSessionRepository (foreign key dependency)
provides:
  - SqliteMessageRepository implementing IMessageRepository
  - Batch write support with progress callback
  - FTS5 automatic indexing via triggers verified
  - INSERT OR IGNORE idempotency pattern
affects: [04-04, 05-sync-commands, 06-search-queries]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Existence check before insert (FTS5 trigger workaround)
    - db.transaction().immediate() for batch writes
    - Batch size 100 (hardcoded per CONTEXT.md)

key-files:
  created:
    - src/infrastructure/database/repositories/message-repository.ts
    - src/infrastructure/database/repositories/message-repository.test.ts
  modified:
    - src/infrastructure/database/repositories/index.ts
    - src/infrastructure/database/index.ts

key-decisions:
  - "Use existence check before insert instead of relying on changes count"
  - "FTS5 triggers cause cumulative changes within transactions - workaround applied"

patterns-established:
  - "Repository pattern: constructor accepts Database, creates prepared statements"
  - "Batch operations: process in batches of 100 within immediate transactions"
  - "Row mapping: private rowToEntity method converts DB row to domain entity"

# Metrics
duration: 45min
completed: 2026-01-28
---

# Phase 4 Plan 02: Message Repository Summary

**SqliteMessageRepository with batch saveMany (100/batch), FTS5 trigger-based indexing, and existence-check workaround for accurate insert counting**

## Performance

- **Duration:** 45 min (estimated)
- **Completed:** 2026-01-28
- **Tasks:** 3
- **Files modified:** 4
- **Tests added:** 24

## Accomplishments

- Implemented SqliteMessageRepository with all IMessageRepository interface methods
- Batch saveMany processes messages in groups of 100 with immediate transactions
- FTS5 automatic indexing verified - messages searchable via MATCH immediately after insert
- 1000 messages inserted in 163ms (well under 5 second requirement)
- Discovered and fixed FTS5 trigger interference with bun:sqlite changes count

## Task Commits

The work was committed in a combined commit:

1. **Tasks 1-3: Core methods, batch saveMany, FTS5 verification** - `c5e9878` (feat)

**Note:** The commit was labeled as 04-03 but contains the message repository implementation for plan 04-02. This occurred due to parallel execution across plans.

## Files Created/Modified

- `src/infrastructure/database/repositories/message-repository.ts` - SqliteMessageRepository implementation
- `src/infrastructure/database/repositories/message-repository.test.ts` - 24 tests covering all functionality
- `src/infrastructure/database/repositories/index.ts` - Export SqliteMessageRepository
- `src/infrastructure/database/index.ts` - Re-export from barrel file

## Decisions Made

**1. Existence check instead of changes count**
- **Issue:** FTS5 triggers cause `stmt.run().changes` to accumulate incorrectly within transactions
- **Evidence:** Inserting duplicate returned changes=4 instead of 0 due to trigger execution
- **Solution:** Check existence with `SELECT id` before INSERT OR IGNORE
- **Trade-off:** One extra query per message, but accurate counting

**2. Batch size 100 (hardcoded)**
- Per CONTEXT.md decision, batch size is not configurable
- Balances memory safety with transaction overhead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FTS5 trigger interference with changes count**
- **Found during:** Task 2 (batch saveMany implementation)
- **Issue:** Plan specified using `stmt.run().changes` to detect new vs duplicate inserts, but FTS5 triggers cause this value to accumulate incorrectly within transactions
- **Fix:** Added existsStmt prepared statement to check existence before each insert
- **Files modified:** src/infrastructure/database/repositories/message-repository.ts
- **Verification:** "mixed batch with duplicates" test now passes - correctly reports 2 inserted, 2 skipped
- **Committed in:** c5e9878

---

**Total deviations:** 1 auto-fixed (bug in plan's specified approach)
**Impact on plan:** Essential fix for correct batch reporting. No scope creep.

## Issues Encountered

- **bun:sqlite FTS5 trigger behavior:** The `changes` property on statement results accumulates trigger changes within a transaction. This is documented behavior in SQLite but not obvious when using FTS5 with content tables. The workaround (existence check) adds one query per message but is reliable.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Message repository complete and tested
- FTS5 indexing verified working
- Ready for Plan 04-03 (SqliteToolUseRepository) - already complete
- Ready for Plan 04-04 (Repository Integration Tests)

---
*Phase: 04-storage-adapters*
*Completed: 2026-01-28*
