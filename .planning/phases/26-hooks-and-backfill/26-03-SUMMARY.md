---
phase: 26
plan: 03
subsystem: backfill
tags: [llm, cli, application-service, infrastructure-adapter, tdd]
dependency-graph:
  requires: [26-02]
  provides: [backfill-service, claude-summary-generator, backfill-cli]
  affects: [domain-ports, application-services, cli-commands]
tech-stack:
  added: [claude-cli-integration]
  patterns: [child-process-spawn, env-var-stripping, lazy-import, DI-for-tests]
key-files:
  created:
    - src/infrastructure/llm/claude-summary-generator.ts
    - src/infrastructure/llm/claude-summary-generator.test.ts
    - src/application/services/backfill-service.ts
    - src/application/services/backfill-service.test.ts
    - src/presentation/cli/commands/backfill.ts
    - src/presentation/cli/commands/backfill.test.ts
  modified:
    - src/domain/ports/services.ts
    - src/domain/ports/index.ts
    - src/domain/ports/ports.test.ts
    - src/application/services/index.ts
    - src/presentation/cli/commands/index.ts
    - src/presentation/cli/index.ts
decisions:
  - "Separated executeBackfillCommand from createBackfillCommand for testability"
  - "Lazy infrastructure imports in CLI action handler to avoid startup cost"
  - "Progress bar only shown in TTY environments via dynamic import"
  - "FileDailyLogWriter as concrete infrastructure class in CLI layer (not service)"
  - "CLAUDECODE env var stripping via delete env.CLAUDECODE before spawn"
requirements-completed: []
metrics:
  duration: 18min
  completed: 2026-03-08
  tasks: 3/3
  tests-added: 40
  tests-total: 77 (plan-specific)
---

# Phase 26 Plan 03: BackfillService, ClaudeSummaryGenerator, and Backfill CLI Command Summary

ISummaryGenerator port, ClaudeSummaryGenerator adapter shelling out to claude -p with CLAUDECODE env stripping, BackfillService orchestrating session content extraction with 16K char cap and error isolation, and backfill CLI command with dry-run, progress bar, and confirmation prompt.

## What Was Built

### Task A: ISummaryGenerator Port + ClaudeSummaryGenerator Adapter
- Added `ISummaryGenerator` interface to `src/domain/ports/services.ts` with `generateSummary()` method
- Created `ClaudeSummaryGenerator` in `src/infrastructure/llm/` that spawns `claude -p --output-format text`
- Critical: strips `CLAUDECODE` env var from child process to prevent nested session detection
- Prompt includes session metadata and requests structured daily log format (Topic, Decisions, Outcomes, etc.)
- 7 tests covering spawn args, env stripping, error handling (non-zero exit, ENOENT), and prompt content

### Task B: BackfillService Application Service
- `dryRun()` returns unprocessed count and estimated cost ($0.001/session)
- `backfill()` orchestrates: query unprocessed -> extract content -> generate summary -> write daily log -> save state
- Content extraction caps at 16000 chars with truncation notice
- Error isolation: individual session failures do not block others (try/catch per session)
- Double-check idempotency: re-checks backfill state inside loop to handle race conditions
- Project name derived from `session.projectPath.decoded` last path segment
- Sequential processing (not parallel) to avoid concurrent writes to same daily log
- `IDailyLogWriter` port abstracts file I/O for testability
- 18 tests covering all behavior paths

### Task C: Backfill CLI Command
- `memory backfill --dry-run` shows session count and estimated cost
- `memory backfill --project <name>` filters to one project
- `memory backfill --batch <n>` limits sessions per run (default 50)
- `memory backfill -f/--force` skips confirmation prompt
- Progress bar via cli-progress (TTY-only, graceful degradation)
- `FileDailyLogWriter` concrete implementation in CLI layer
- `executeBackfillCommand()` programmatic API separated for testability
- Lazy infrastructure imports in action handler
- 15 tests covering option parsing, output formatting, and service integration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No createConnection function exists**
- **Found during:** Task C implementation
- **Issue:** Plan referenced `createConnection()` which doesn't exist; project uses `initializeDatabase()`
- **Fix:** Used `initializeDatabase({ path: dbPath })` matching existing CLI patterns (e.g., sync.ts)
- **Files modified:** src/presentation/cli/commands/backfill.ts

**2. [Rule 3 - Blocking] program.ts does not exist**
- **Found during:** Task C wiring (known from prompt corrections)
- **Issue:** Plan referenced program.ts but CLI entry point is src/presentation/cli/index.ts
- **Fix:** Registered command in index.ts following existing pattern
- **Files modified:** src/presentation/cli/index.ts

## Decisions Made

1. **Lazy imports in CLI action:** Infrastructure modules (database, repositories, paths) are lazily imported inside the action handler to avoid loading heavy dependencies when other commands run.

2. **Progress bar via dynamic import:** The `cli-progress` package is dynamically imported and only used when stderr is a TTY. Non-TTY environments silently skip the progress bar.

3. **FileDailyLogWriter in CLI layer:** The concrete file writer lives in the CLI command module (presentation layer), not the application service. The service depends on the `IDailyLogWriter` port. This follows the composition root pattern.

4. **executeBackfillCommand as separate function:** Following the `executeFrictionCommand` pattern, the command's logic is extracted into a testable function that accepts a `BackfillServiceDeps` interface, allowing tests to inject mock services without touching infrastructure.

## Self-Check: PASSED

- All 6 created files exist on disk
- All 3 task commits verified (8feca0c, a2bd486, 3db4380)
- 77 plan-specific tests pass (37 ports + 7 LLM + 18 service + 15 CLI)
- No regressions in related test suites (519 tests pass)
