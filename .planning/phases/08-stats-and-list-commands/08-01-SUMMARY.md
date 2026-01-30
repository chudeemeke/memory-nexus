---
phase: 08-stats-and-list-commands
plan: 01
subsystem: cli
tags: [stats, database, formatting, sqlite, cli]

dependency-graph:
  requires: [07-filtering-and-output-formatting]
  provides: [stats-command, stats-service, stats-formatter]
  affects: [08-02-list-command]

tech-stack:
  added: []
  patterns: [strategy-pattern, port-adapter, factory-function]

key-files:
  created:
    - src/infrastructure/database/services/stats-service.ts
    - src/infrastructure/database/services/stats-service.test.ts
    - src/presentation/cli/formatters/stats-formatter.ts
    - src/presentation/cli/formatters/stats-formatter.test.ts
    - src/presentation/cli/commands/stats.ts
    - src/presentation/cli/commands/stats.test.ts
  modified:
    - src/domain/ports/services.ts
    - src/infrastructure/database/services/index.ts
    - src/infrastructure/database/index.ts
    - src/presentation/cli/formatters/index.ts
    - src/presentation/cli/commands/index.ts

decisions:
  - key: subquery-totals
    choice: "Single query with subqueries for session/message/tool counts"
    rationale: "Efficient single round-trip; avoids multiple COUNT(*) queries"
  - key: table-valued-pragma
    choice: "pragma_page_count() * pragma_page_size() for database size"
    rationale: "SQLite standard approach; works with in-memory and file databases"
  - key: left-join-messages
    choice: "LEFT JOIN messages_meta for project breakdown"
    rationale: "COUNT(m.id) returns 0 for projects with sessions but no messages"
  - key: intl-number-format
    choice: "Intl.NumberFormat('en-US') for thousands separators"
    rationale: "Standard browser/Node API; consistent formatting across platforms"
  - key: bytes-formatting-1024
    choice: "Binary thresholds (1024) for B/KB/MB/GB"
    rationale: "Traditional computing convention; matches user expectations for file sizes"

metrics:
  tests-added: 75
  duration: "~25 minutes"
  completed: "2026-01-30"
---

# Phase 8 Plan 1: Stats Command Summary

Database statistics command showing totals and per-project breakdown with multiple output formats.

## One-liner

SqliteStatsService with table-valued PRAGMA for size, strategy pattern formatters for default/json/quiet/verbose output modes.

## What Was Built

### Task 1: StatsService Port Interface and Implementation

Created `IStatsService` port interface with `StatsResult` and `ProjectStats` types in the domain layer. Implemented `SqliteStatsService` using efficient SQL patterns:

- Single query with subqueries for totals (sessions, messages, tool uses)
- Table-valued PRAGMA functions for database size
- LEFT JOIN with COUNT(m.id) for accurate project message counts
- ORDER BY sessionCount DESC for most-active-first breakdown

### Task 2: Stats Output Formatter

Created stats-formatter.ts following the same strategy pattern as output-formatter.ts:

- `DefaultStatsFormatter`: Header sections with formatted numbers
- `JsonStatsFormatter`: Machine-parseable JSON output
- `QuietStatsFormatter`: Just numbers on lines (sessions, messages, tools, size)
- `VerboseStatsFormatter`: Execution timing, detailed byte counts, averages per session

Helper functions:
- `formatBytes()`: Converts bytes to human-readable B/KB/MB/GB
- `formatNumber()`: Uses Intl.NumberFormat for thousands separators

### Task 3: Stats CLI Command

Created stats.ts with Commander.js options:
- `--json`: Output as JSON
- `-v, --verbose`: Show detailed output with timing (conflicts with quiet)
- `-q, --quiet`: Minimal output (conflicts with verbose)
- `--projects <count>`: Number of projects in breakdown (default 10)

Empty database shows helpful "No sessions synced" message.

## Commits

| Hash | Description |
|------|-------------|
| 4bfdbe5 | feat(08-01): add IStatsService port and SqliteStatsService implementation |
| ebc86ff | feat(08-01): add stats output formatter with strategy pattern |
| 2a62f67 | feat(08-01): add stats CLI command with output modes |

## Test Results

```
75 tests passing across 3 files:
- stats-service.test.ts: 16 tests
- stats-formatter.test.ts: 34 tests
- stats.test.ts: 25 tests
```

Coverage:
- stats-service.ts: 100% functions, 100% lines
- stats-formatter.ts: 84.21% functions, 97.66% lines
- stats.ts: 75% functions, 64.41% lines

## Key Code Patterns

### Efficient SQL for Totals

```sql
SELECT
  (SELECT COUNT(*) FROM sessions) as totalSessions,
  (SELECT COUNT(*) FROM messages_meta) as totalMessages,
  (SELECT COUNT(*) FROM tool_uses) as totalToolUses
```

### Database Size via PRAGMA

```sql
SELECT page_size * page_count as size
FROM pragma_page_count(), pragma_page_size()
```

### Project Breakdown with LEFT JOIN

```sql
SELECT
  s.project_name as projectName,
  COUNT(DISTINCT s.id) as sessionCount,
  COUNT(m.id) as messageCount
FROM sessions s
LEFT JOIN messages_meta m ON m.session_id = s.id
GROUP BY s.project_name
ORDER BY sessionCount DESC
LIMIT $limit
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tool_uses column name in tests**

- **Found during:** Task 1 test execution
- **Issue:** Test helper used `tool_name` column, but schema has `name`; also missing required `status` column
- **Fix:** Changed `insertTestToolUse` helper to use correct column names
- **Files modified:** stats-service.test.ts
- **Commit:** 4bfdbe5

## Next Phase Readiness

Plan 08-01 complete. Ready for 08-02 (list command) which follows similar patterns:
- Session repository findFiltered method
- List output formatter
- List CLI command with filtering options

Total test count: 988 tests passing (75 new from this plan).
