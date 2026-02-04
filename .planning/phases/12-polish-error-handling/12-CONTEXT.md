# Phase 12: Polish, Error Handling, Edge Cases - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Production hardening - comprehensive error handling, signal management, test coverage validation, and quality-of-life features. This phase makes existing functionality robust and production-ready, not adding new core capabilities.

</domain>

<decisions>
## Implementation Decisions

### Error Messages and Exit Codes
- Contextual error messages (message + path/context)
- Exit codes: 0 (success), 1 (any failure) - simple convention
- All errors to stderr
- Stack traces only with `--verbose` flag
- Red ANSI color for errors in TTY environments
- Always suggest corrective actions when possible
- Validation errors: Claude's discretion on immediate exit vs collect all
- Error logging to `~/.memory-nexus/logs/errors.log` automatically
- Size-based log rotation (10MB threshold)
- Timestamps in log file only, not console output
- Show full command help on argument errors
- JSON errors as structured object: `{"error": {"code": "...", "message": "...", "context": {...}}}`
- Stable error codes for programmatic handling (DB_CONNECTION_FAILED, INVALID_SESSION_ID, etc.)
- Return partial results on batch operation errors

### Signal Handling
- Ctrl+C prompts user with 3 options: Abort Immediately, Abort after current session, Cancel abort
- Second Ctrl+C = immediate exit (force kill)
- Checkpoint sync progress for recovery
- Always clean up temp files on abort
- SIGTERM handled same as SIGINT (prompt user)
- Show recovery notice on next run: "Resuming from previous interrupted sync (45/100 sessions done)"
- No --no-interrupt flag - always interruptible
- Database connections must be properly closed before exit

### Coverage Strategy
- Integration tests for: large files (10K+ lines), concurrent access, interrupted sync recovery
- Per-layer coverage targets: Domain 99%, Infrastructure 95%, Presentation 90%
- Performance benchmarks: track but don't fail tests (warn on regression)
- Cross-platform tests only (no platform-specific tests)
- Mutation testing with 80%+ score requirement
- Smoke tests for all CLI commands (--help exits 0)

### Failure Modes
- DB corruption: Offer to recreate ("Database corrupted. Recreate and re-sync? (y/n)")
- Disk full: Graceful stop, save progress, report space needed
- Source inaccessible: Clear error message with permission check suggestion
- Single file corruption: Attempt partial recovery, skip and log, continue with others
- DB locked: Wait and retry (5 seconds), then queue operation for later
- Format changes: Version detection, warn if unknown but try to parse, store raw events for reprocessing
- Offline sync: Queue for later retry
- OOM: Configurable --max-memory flag + dynamic batch size reduction on memory pressure

### Additional Features (Industry Best Practices)
- `--dry-run` option for sync (show what would sync without syncing)
- Version/update check on startup (once per day notification)
- Shell completion support: `memory completion bash/zsh/fish`
- Health check: `memory doctor` command (DB integrity, permissions, hook status)
- Opt-in local stats tracking for user's own insight
- `memory export` command for backup (JSON/SQLite formats)
- `memory import` command to restore from export
- `memory purge --older-than 90d` with confirmation prompt
- Config file (~/.memory-nexus/config.json) with CLI flags as override

### Claude's Discretion
- Exact error code naming conventions
- Validation error collection strategy
- Internal error classification hierarchy
- Config file format details
- Completion script implementation

</decisions>

<specifics>
## Specific Ideas

- Error log path: `~/.memory-nexus/logs/errors.log` (not root of config dir)
- Recovery notice format: "Resuming from previous interrupted sync (X/Y sessions done)"
- Doctor command should check: DB integrity, file permissions, hook installation, config validity
- Future-proofing: Store raw JSONL events to allow reprocessing when format changes

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope. All features discussed are production hardening and quality-of-life improvements appropriate for Phase 12.

</deferred>

---

*Phase: 12-polish-error-handling*
*Context gathered: 2026-02-04*
