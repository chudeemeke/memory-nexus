# Phase 10: Hook Integration and Incremental Sync - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement automatic sync via Claude Code hooks for zero-friction operation. When a session ends or context compacts, memory-nexus automatically syncs without user intervention. Includes installation commands and configurable behavior.

</domain>

<decisions>
## Implementation Decisions

### Hook Trigger Timing
- Trigger on both SessionStop AND ContextCompaction events
- ContextCompaction provides OpenClaw-style "memory flush" before context is lost
- If ContextCompaction hook doesn't exist in Claude Code, gracefully fall back to SessionStop only
- Session-specific sync (only the session that triggered the hook, not batch)
- Use $SESSION_ID from hook environment to identify which session to sync
- If SESSION_ID unavailable, fail gracefully with log entry (no fallback derivation)
- ContextCompaction triggers full sync (same as SessionStop), not separate "flush" logic

### Crash Recovery
- Configurable startup recovery scan to detect unsaved sessions
- Default: Enabled (scan runs on first aidev memory command)
- User can disable via config to avoid startup latency

### Background Execution Strategy
- Use detached child process (spawn with detached:true, unref())
- Process survives parent termination
- 5 second timeout (matches OpenClaw pattern)
- On timeout: let process continue in background (don't kill)
- Trust SQLite WAL mode for concurrent sync handling (no application-level locking)

### Failure Handling Behavior
- Configurable visibility, default: silent with log only (never interrupt user)
- Log location: ~/.memory-nexus/logs/sync.log
- Log format: Structured JSON lines (machine-parseable)
- No automatic retry - failed sessions caught by next manual sync or recovery scan

### Configuration Approach
- Config location: ~/.memory-nexus/config.json (separate from Claude Code settings)
- Enable toggle: autoSync: true/false in config file
- Moderate config options:
  - autoSync (boolean)
  - recoveryOnStartup (boolean)
  - syncOnCompaction (boolean)
  - timeout (number, milliseconds)
  - logLevel (string)
  - logRetentionDays (number)
  - showFailures (boolean)
- Default config: All features enabled (autoSync, recoveryOnStartup, syncOnCompaction all true)
- Config reload: Apply on next hook trigger (no restart needed)
- Invalid config: Fall back to defaults with warning log

### Hook Installation
- Primary: Auto-detect missing hooks on first run, prompt to install
- Backup: aidev memory install command available for manual installation
- Backup existing ~/.claude/settings.json before modifying
- aidev memory uninstall command to cleanly remove hooks (restore from backup if available)

### Status and Visibility
- Dedicated aidev memory status command showing:
  - Hooks installed?
  - autoSync enabled?
  - Last sync time
  - Pending sessions count
- Also include hook/config summary in aidev memory stats output

### Config Format
- JSON format (standard, matches Claude Code settings)

### Claude's Discretion
- Exact hook event names (research Claude Code's actual hook system)
- spawn() options and error handling details
- Log rotation implementation
- Status command output formatting
- Recovery scan performance optimization

</decisions>

<specifics>
## Specific Ideas

- OpenClaw research provides the pattern: session-memory hook captures context when session boundaries occur
- OpenClaw's "memory flush" pattern (pre-compaction extraction) maps to our ContextCompaction trigger
- 5-second timeout from OpenClaw's sessionEnd configuration is proven reasonable
- Structured JSON logs enable future tooling (log analysis, debugging commands)
- Backup-before-modify pattern protects user's existing Claude Code configuration

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 10-hook-integration*
*Context gathered: 2026-01-30*
