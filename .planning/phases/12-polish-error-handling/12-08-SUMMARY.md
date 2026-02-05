---
phase: 12-polish-error-handling
plan: 08
subsystem: database
tags: [sqlite, busy-timeout, integrity, error-handling]
depends_on:
  requires: [12-03]
  provides: [busy-timeout, quick-check, db-startup-utility]
  affects: [all-commands]
tech_stack:
  added: []
  patterns: [error-wrapping, tty-detection, backup-on-corruption]
key_files:
  created:
    - src/presentation/cli/db-startup.ts
    - src/presentation/cli/db-startup.test.ts
  modified:
    - src/infrastructure/database/connection.ts
    - src/infrastructure/database/connection.test.ts
    - src/infrastructure/database/index.ts
decisions:
  - id: busy-timeout-5000
    choice: "5000ms default busy_timeout"
    rationale: "Balance between waiting for locks and timing out on genuine deadlocks"
  - id: quick-check-default
    choice: "quickCheck enabled for existing file databases"
    rationale: "Fast startup validation without full integrity_check overhead"
  - id: tty-detection
    choice: "isTTY() checks stdin and stdout"
    rationale: "Both must be TTY for interactive prompts to work"
metrics:
  duration: "1h 1m"
  completed: 2026-02-05
  tests_added: 24
---

# Phase 12 Plan 08: Database Connection Enhancement Summary

Enhanced database connection with busy_timeout and integrity checks for production robustness.

## One-liner

SQLite busy_timeout (5000ms) + quick_check on startup + CLI corruption recovery utility.

## What Was Built

### Task 1: Connection Enhancement (28e59d5)

Enhanced `initializeDatabase` in connection.ts:

1. **Busy Timeout Configuration**
   - Added `busyTimeout` config option (default: 5000ms)
   - Prevents SQLITE_BUSY errors under concurrent access
   - Set via `PRAGMA busy_timeout = {value}`

2. **Quick Integrity Check**
   - Added `quickCheck` config option
   - Default: true for existing file databases, false for :memory:
   - Uses `PRAGMA quick_check(1)` (fast structural validation)
   - Skipped for new databases (nothing to check)

3. **Error Wrapping**
   - All initialization errors now throw MemoryNexusError
   - Error context includes: path, errno, SQLite version
   - Corrupted file detection via "file is not a database" message
   - Added `initializeDatabaseSafe` wrapper for CLI use

4. **14 new tests** for busy_timeout, integrity, and error handling

### Task 2: CLI Startup Utility (59202ff)

Created `src/presentation/cli/db-startup.ts`:

1. **initializeDatabaseForCli()**
   - Wraps database initialization with error handling
   - Returns `{ success: true, db }` or `{ success: false, error }`
   - Handles corrupted database recovery flow

2. **Corrupted Database Recovery**
   - TTY: Prompts "Database corrupted. Recreate and re-sync?"
   - Non-TTY: Shows error, suggests running interactively
   - On confirm: Backs up `memory.db` to `memory.db.corrupted.{timestamp}`
   - Creates fresh database, advises `memory sync`

3. **isTTY() Detection**
   - Checks both stdin and stdout for TTY
   - Enables interactive prompts only when both are TTY

4. **10 new tests** for startup, corruption, and error formatting

## Key Technical Details

### PRAGMA Configuration

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;        -- File databases only
PRAGMA busy_timeout = 5000;       -- Wait 5s for locks
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;       -- 64MB
PRAGMA temp_store = MEMORY;
PRAGMA quick_check(1);            -- Startup validation
```

### Error Detection Flow

```
initializeDatabase()
  |
  +-- new Database() fails? --> MemoryNexusError(DB_CONNECTION_FAILED)
  |
  +-- PRAGMA fails with "not a database"? --> MemoryNexusError(DB_CORRUPTED)
  |
  +-- FTS5 check fails? --> MemoryNexusError(DB_CONNECTION_FAILED)
  |
  +-- quick_check != "ok"? --> MemoryNexusError(DB_CORRUPTED)
  |
  +-- Success
```

### CLI Recovery Flow

```
initializeDatabaseForCli()
  |
  +-- Success --> return { success: true, db }
  |
  +-- DB_CORRUPTED error
      |
      +-- Non-TTY --> Show error, suggest interactive
      |
      +-- TTY --> Prompt recreation
          |
          +-- User declines --> return { success: false, error }
          |
          +-- User confirms --> Backup, recreate, return success
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| busy_timeout default | 5000ms | Standard timeout balances waiting vs deadlock detection |
| quickCheck default | true for existing files | Fast startup validation, skip for new/memory databases |
| Error wrapping scope | All init errors | Consistent error handling throughout CLI |
| TTY detection | stdin AND stdout | Both needed for interactive prompt/response |
| Backup naming | .corrupted.{ISO-timestamp} | Unique, chronologically sortable backups |

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| src/infrastructure/database/connection.ts | Modified | busy_timeout, quickCheck, error wrapping |
| src/infrastructure/database/connection.test.ts | Modified | 14 new tests |
| src/infrastructure/database/index.ts | Modified | Export initializeDatabaseSafe |
| src/presentation/cli/db-startup.ts | Created | CLI startup utility |
| src/presentation/cli/db-startup.test.ts | Created | 10 tests |

## Test Results

```
38 pass, 0 fail
55 expect() calls
2 files tested
```

- connection.test.ts: 28 tests (14 new)
- db-startup.test.ts: 10 tests (all new)

## Verification

1. busy_timeout verified: PRAGMA returns 5000
2. quick_check used (not integrity_check) for speed
3. Corrupted database throws DB_CORRUPTED error
4. Non-TTY environments handled gracefully (no prompt)
5. All errors use MemoryNexusError with appropriate codes

## Next Steps

Commands can now use `initializeDatabaseForCli()` for consistent:
- Integrity checking on startup
- Error formatting
- Corruption recovery with user prompt

The utility is available but integration into existing commands is optional -
they already have their own error handling. New commands should use this utility.
