# Claude Analysis: Memory Friction Logging System

**Source:** get-stuff-done project session, 2026-03-06
**Companion to:** handoff-user-thoughts.md

## Current Friction Points Observed (2026-03-06)

### 1. Memory not used as first recall mechanism
- **What happened:** User asked "what were we last talking about?" I read `.planning/CONTINUE.md` and local memory files instead of running `memory search` or `memory context`
- **Root cause:** `~/.claude/rules/memory.md` says "query memory when needed" but doesn't make it mandatory before local files
- **Impact:** Memory data was richer (had today's crashed session) but I didn't find it until explicitly asked

### 2. Crashed session data not auto-synced
- **What happened:** Terminal crashed 6 hours ago. Session data existed in JSONL but wasn't in memory DB until manual `memory sync`
- **Root cause:** SessionEnd hook only fires on clean exit. Crash = no hook = no sync
- **Impact:** Recent session invisible to memory queries until manual intervention
- **Potential fix:** Periodic sync (cron/startup), or stale-detection in `memory context` that auto-syncs if last sync > N hours

### 3. memory context returns session metadata, not actual context
- **What happened:** PRD already documents this. `memory context done` returns "5 sessions, 0 messages" not useful briefing
- **Root cause:** Knowledge layer (PRD features) not yet built
- **Impact:** The command exists but isn't useful, so I skip it

### 4. No structured way to log friction from other projects
- **What happened:** Friction encountered in get-stuff-done project, but the fix belongs in memory-nexus
- **Root cause:** No cross-project friction capture mechanism exists
- **Impact:** Friction gets noted in conversation, maybe in session notes, but doesn't reliably reach the project that needs to fix it

## Architecture Suggestions

### Friction Log as a Feature, Not a File

The user wants more than a markdown file. They want:
- A **database-backed store** (queryable, structured)
- A **visual dashboard** (charts, trends)
- **Lifecycle management** (open -> fixed -> archived)
- **Auto-capture** from any project

This maps to a new `memory friction` subcommand family:

```bash
# Log friction from any project
memory friction log "search fails on hyphens" --severity high --context "get-stuff-done session"

# List open friction items
memory friction list

# Mark as resolved
memory friction resolve <id> --resolution "FTS5 sanitization added in v2.1"

# Dashboard (opens HTML or outputs stats)
memory friction dashboard
```

Friction entries stored in the same SQLite DB alongside sessions. Schema:

```sql
CREATE TABLE friction_log (
    id INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',  -- low, medium, high, critical
    context TEXT,                     -- project, session, what was happening
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT,
    category TEXT                     -- search, sync, cli, integration, ux
);
```

### Dashboard Options

1. **CLI table** -- `memory friction dashboard` outputs stats to terminal (quick, always works)
2. **HTML report** -- generates a static HTML file with charts (Chart.js or similar), opens in browser
3. **Both** -- CLI for quick checks, HTML for review sessions

Recommendation: Start with CLI, add HTML later. The friction data is small enough that CLI covers daily use.

### Auto-Capture Mechanism

The rules file approach is the most reliable:

1. Add friction logging instructions to `~/.claude/rules/memory.md`
2. Include the `memory friction log` command syntax
3. Claude logs friction when encountered, as part of normal work
4. No special hooks needed -- it's a behavioral instruction

The `memory --help` suggestion is good too: if a new session doesn't know the friction protocol, `memory --help` should show it. Self-documenting tools > rules files for discoverability.

### Data vs Intelligence (My View)

**Both, layered:**

1. **Raw data stays raw** -- JSONL sessions, friction log entries, memory files. This is the ground truth.
2. **Intelligence happens at two points:**
   - **Write time:** I (Claude) synthesize during sessions -- daily logs, DECISIONS.md, LEARNINGS.md. This is cheap, accurate, and immediate.
   - **Query time:** I interpret raw data for specific questions. This handles questions the write-time synthesis didn't anticipate.
3. **The knowledge layer (PRD) is the bridge** -- it structures write-time intelligence so query-time interpretation is fast and cheap.

The friction dashboard is an example of write-time intelligence: structured entries with severity, category, and resolution status. The visual dashboard is query-time presentation of that structured data.

## Recommended Implementation Order

1. `memory friction log` command (capture mechanism)
2. `memory friction list` / `memory friction resolve` (lifecycle)
3. Update `~/.claude/rules/memory.md` with friction protocol
4. Update `memory --help` to show friction commands
5. `memory friction dashboard` CLI output
6. HTML dashboard (later milestone)

## Files to Read

- `docs/plans/PRD-knowledge-layer.md` -- the knowledge layer design this builds on
- `docs/plans/handoff-user-thoughts.md` -- user's verbatim requirements
- `docs/plans/qmd-integration-notes.md` -- related tool investigation notes
