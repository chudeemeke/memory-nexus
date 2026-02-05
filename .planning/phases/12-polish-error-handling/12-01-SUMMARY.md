---
phase: 12-polish-error-handling
plan: 01
subsystem: errors
tags: [error-handling, cli, json, ansi-color]

# Dependency graph
requires:
  - phase: 07-filtering-output-formatting
    provides: Color utilities (red, shouldUseColor)
provides:
  - ErrorCode constant with 14 stable error types
  - MemoryNexusError class with toJSON() for structured output
  - formatError() for human-readable CLI error display
  - formatErrorJson() for machine-readable JSON errors
  - getSuggestion() for corrective action recommendations
affects: [12-02, 12-03, 12-04, all-commands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Error codes as const object for type-safe error identification
    - toJSON() pattern for structured error serialization
    - Suggestion lookup for contextual help

key-files:
  created:
    - src/domain/errors/error-codes.ts
    - src/domain/errors/memory-nexus-error.ts
    - src/domain/errors/index.ts
    - src/presentation/cli/formatters/error-formatter.ts
  modified:
    - src/domain/index.ts
    - src/presentation/cli/formatters/index.ts

key-decisions:
  - "ErrorCode as const object: Type-safe enum alternative with string values"
  - "UNKNOWN error code added: Catch-all for generic errors"
  - "Context is optional: Only include in toJSON when non-empty"

patterns-established:
  - "Error formatting: formatError for TTY, formatErrorJson for pipes/scripts"
  - "Suggestion mapping: Switch-based lookup for error-specific guidance"

# Metrics
duration: 24min
completed: 2026-02-05
---

# Phase 12 Plan 01: Error Codes and Error Formatter Summary

**Domain error codes with stable identifiers and CLI formatters for human-readable and JSON error output**

## Performance

- **Duration:** 24 min
- **Started:** 2026-02-05T14:06:24Z
- **Completed:** 2026-02-05T14:29:56Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- ErrorCode constant with 14 error types covering database, session, file, parse, sync, and CLI errors
- MemoryNexusError class extending Error with code, message, optional context, and toJSON() method
- formatError() produces human-readable output with context, suggestions, and optional stack traces
- formatErrorJson() produces structured JSON matching CONTEXT.md specification: `{"error":{"code":"...","message":"...","context":{}}}`
- getSuggestion() provides corrective action recommendations for all error codes
- Red ANSI color applied to error prefix in TTY environments

## Task Commits

Each task was committed atomically:

1. **Task 1: Create domain error codes and base error class** - `81b058e` (feat)
2. **Task 2: Create CLI error formatter with tests** - `a851868` (feat)

## Files Created/Modified

- `src/domain/errors/error-codes.ts` - ErrorCode constant and ErrorCodeType union
- `src/domain/errors/memory-nexus-error.ts` - Base error class with toJSON()
- `src/domain/errors/error-codes.test.ts` - 9 tests for error codes
- `src/domain/errors/memory-nexus-error.test.ts` - 11 tests for error class
- `src/domain/errors/index.ts` - Barrel export for errors module
- `src/domain/index.ts` - Added errors export
- `src/presentation/cli/formatters/error-formatter.ts` - Error formatting functions
- `src/presentation/cli/formatters/error-formatter.test.ts` - 34 tests for formatters
- `src/presentation/cli/formatters/index.ts` - Added error formatter exports

## Decisions Made

1. **ErrorCode as const object** - Provides type-safe string values without enum limitations; keys equal values for consistency
2. **UNKNOWN error code added** - Catch-all for generic errors not fitting other categories
3. **Empty context omitted from JSON** - toJSON() only includes context property when non-empty for cleaner output
4. **Suggestion for each code** - Every error code except UNKNOWN has a corrective action suggestion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Error infrastructure ready for use in all CLI commands
- formatError/formatErrorJson available for consistent error output
- Plan 12-02 (Graceful Degradation) can now use MemoryNexusError for structured errors
- All commands can integrate error formatting for consistent user experience

---
*Phase: 12-polish-error-handling*
*Completed: 2026-02-05*
