---
phase: "08"
plan: "02"
subsystem: presentation
tags: [cli, list, filtering, formatters]
dependency-graph:
  requires: ["07-01", "07-03", "04-01"]
  provides: ["list command", "session list filtering", "list output modes"]
  affects: ["09"]
tech-stack:
  added: []
  patterns: ["strategy pattern (ListFormatter)", "dynamic SQL WHERE clause"]
key-files:
  created:
    - src/presentation/cli/commands/list.ts
    - src/presentation/cli/commands/list.test.ts
    - src/presentation/cli/formatters/list-formatter.ts
    - src/presentation/cli/formatters/list-formatter.test.ts
  modified:
    - src/domain/ports/repositories.ts
    - src/infrastructure/database/repositories/session-repository.ts
    - src/infrastructure/database/repositories/session-repository.test.ts
    - src/presentation/cli/commands/index.ts
    - src/presentation/cli/formatters/index.ts
    - src/presentation/cli/index.ts
decisions:
  - id: dynamic-where-clause
    choice: "Build SQL WHERE dynamically based on filters"
    reason: "Flexible filtering without N! separate prepared statements"
  - id: list-formatter-strategy
    choice: "Strategy pattern like OutputFormatter"
    reason: "Consistent output mode handling across CLI commands"
  - id: limit-default-20
    choice: "Default limit of 20 sessions"
    reason: "Reasonable default for session listing without pagination"
metrics:
  duration: "7 minutes"
  completed: "2026-01-30"
  tests-added: 50
  total-tests: 988
---

# Phase 8 Plan 2: Session List Command Summary

**One-liner:** Session list command with project/date filtering using dynamic WHERE clause and strategy pattern formatters.

## What Was Built

### Repository Extension
- Added `SessionListOptions` interface to repository ports
- Extended `ISessionRepository` with `findFiltered(options)` method
- Implemented dynamic WHERE clause construction in SQLite repository
- Support for project name substring matching via LIKE
- Support for date range filtering (sinceDate, beforeDate)
- Default limit of 20, always ordered by start_time DESC

### List Formatter (Strategy Pattern)
- `ListFormatter` interface with `formatSessions`, `formatError`, `formatEmpty`
- `DefaultListFormatter`: Table-like columns (ID, project, time, messages)
- `JsonListFormatter`: Full session data as JSON array
- `QuietListFormatter`: Session IDs only, one per line
- `VerboseListFormatter`: Full details with execution timing and filters
- Message count pluralization ("1 message" vs "2 messages")
- Empty state message directing to `memory sync`

### List CLI Command
- `memory list` with comprehensive filtering options
- `--limit <count>` with default of 20
- `--project <name>` for project name filtering
- `--since <date>` for sessions after date (natural language)
- `--before <date>` for sessions before date
- `--days <n>` for sessions from last N days (includes today)
- `--json`, `--verbose`, `--quiet` output modes
- Option conflicts configured (days vs since/before, verbose vs quiet)
- `--days` validation with argParser for positive integers

## Key Implementation Details

### Dynamic WHERE Clause
```typescript
const conditions: string[] = [];
const params: Record<string, unknown> = {};

if (options.projectFilter) {
  conditions.push("project_name LIKE $projectFilter");
  params.$projectFilter = `%${options.projectFilter}%`;
}
// ... build conditions dynamically
const whereClause = conditions.length > 0
  ? `WHERE ${conditions.join(" AND ")}`
  : "";
```

### Date Range Calculation for --days
```typescript
// --days N = today + past N-1 days (inclusive)
const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dynamic WHERE | Build SQL dynamically | Flexible filtering without N! prepared statements |
| ListFormatter pattern | Strategy like OutputFormatter | Consistent output modes across commands |
| Default limit 20 | Hardcoded default | Reasonable for listing, YAGNI on pagination |
| Project filter LIKE | Substring match | More useful than exact match |

## Testing Summary

| Test File | Tests Added | Coverage |
|-----------|-------------|----------|
| session-repository.test.ts | 8 | findFiltered scenarios |
| list-formatter.test.ts | 24 | All formatter modes |
| list.test.ts | 18 | Command structure and options |
| **Total** | **50** | |

## Files Changed

### Created
- `src/presentation/cli/commands/list.ts` - List command implementation
- `src/presentation/cli/commands/list.test.ts` - Command tests
- `src/presentation/cli/formatters/list-formatter.ts` - Formatter strategy
- `src/presentation/cli/formatters/list-formatter.test.ts` - Formatter tests

### Modified
- `src/domain/ports/repositories.ts` - Added SessionListOptions and findFiltered
- `src/infrastructure/database/repositories/session-repository.ts` - Implemented findFiltered
- `src/infrastructure/database/repositories/session-repository.test.ts` - Extended tests
- `src/presentation/cli/commands/index.ts` - Export createListCommand
- `src/presentation/cli/formatters/index.ts` - Export list formatter
- `src/presentation/cli/index.ts` - Replace placeholder with module command

## Commits

| Hash | Message |
|------|---------|
| 38121a2 | feat(08-02): add findFiltered method to session repository |
| c552dfd | feat(08-02): add list output formatter with strategy pattern |
| 70cbe10 | feat(08-02): add list CLI command with filtering |

## Verification Results

```
bun test list
42 pass | 0 fail

bun test session-repository
28 pass | 0 fail

bun test (full suite)
988 pass | 0 fail
```

## CLI Usage Examples

```bash
# List recent sessions (default 20)
memory list

# Filter by project name
memory list --project memory-nexus

# Filter by date range
memory list --since "2 weeks ago"
memory list --before yesterday
memory list --days 7

# Output modes
memory list --json
memory list --verbose
memory list --quiet
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- [x] List command functional with filtering
- [x] All output modes working
- [x] Tests passing (988 total)
- [x] Ready for Phase 9 or remaining Phase 8 work
