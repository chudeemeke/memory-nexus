# Phase 26: Hooks + Backfill — Discussion Context

**Source:** Brainstorming session 2026-03-07 (design doc: docs/plans/2026-03-07-knowledge-layer-friction-design.md)
**Phase goal:** Install PreCompact hook for memory flush reminders, and build the backfill command that generates daily logs from historical sessions via the Agent SDK.

## What This Phase Builds

1. **Pre-compaction flush hook** — reminds Claude to save context before compaction
2. **Backfill command** — generates daily logs from the 500+ existing sessions

## Pre-Compaction Flush Hook

### Problem

When Claude Code compresses context (or when user runs /clear), conversation context is destroyed. If Claude hasn't written important decisions/learnings to memory files, that knowledge is lost.

### Solution

Claude Code fires a `PreCompact` event before context compression. memory-nexus installs a hook that outputs a reminder message:

```json
{
  "hooks": {
    "PreCompact": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Session nearing compaction. Write important context (decisions, unresolved items, learnings) to ~/.memory/ files now.'",
        "timeout": 5
      }]
    }]
  }
}
```

### Integration with Existing Hooks

`memory install` already manages SessionEnd hooks. Extend it to also install PreCompact:

```bash
memory install
# Output:
#   Installed SessionEnd hook (background sync)
#   Installed PreCompact hook (memory flush reminder)

memory uninstall
# Removes both hooks
```

### Implementation

- Extend src/infrastructure/hooks/hook-installer.ts to handle PreCompact
- Update src/presentation/cli/commands/install.ts to install both hooks
- Update src/presentation/cli/commands/uninstall.ts to remove both hooks
- Update memory doctor to check for PreCompact hook presence

## Backfill Command

### Purpose

Generate structured daily log entries from the 500+ existing sessions that have no memory files. This makes `memory context` immediately useful for historical projects.

### How It Works

1. Query sessions table for sessions with no corresponding daily log in memory_files table
2. For each session, extract key content:
   - User questions (summarize intent)
   - Assistant decisions (key choices made)
   - Tool uses (what was built/changed)
   - Session summary (if available from JSONL)
3. Use the Claude Agent SDK (@anthropic-ai/claude-code, already a dependency) to generate a structured summary in daily log format
4. Write to ~/.memory/daily/<date>.md (append if date already has entries)
5. Track backfill state to avoid reprocessing

### CLI

```bash
memory backfill                    # backfill all unprocessed sessions
memory backfill --dry-run          # show count + estimated cost, don't process
memory backfill --project kanbanflow  # only backfill sessions for one project
memory backfill --batch 20         # process N sessions per run (default: 50)
```

### Safety

- `--dry-run` shows session count and estimated cost before proceeding
- Requires explicit confirmation ("Process 532 sessions? Estimated cost: ~$0.53 [y/N]")
- Batch processing with progress bar (cli-progress, already a dependency)
- Each session processed independently — failure on one doesn't block others
- Idempotent: backfill_state table tracks which sessions are done

### Schema Addition

```sql
CREATE TABLE backfill_state (
    session_id TEXT PRIMARY KEY,
    backfilled_at TEXT NOT NULL,
    daily_log_path TEXT NOT NULL,     -- which daily log file the entry was written to
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT                 -- NULL on success
);
```

### Agent SDK Usage

The @anthropic-ai/claude-code package is already a dependency. The backfill uses it to generate summaries:

```typescript
// Pseudocode for backfill generation
const prompt = `Summarize this Claude Code session in the following format:
## Session: ${sessionId} (${startTime} - ${endTime})
### Topic
### Decisions
### Outcomes
### Unresolved
### Learnings
### Key Files

Session content:
${extractedContent}`;

const result = await agentSdk.complete(prompt);
```

### OAuth Status

Thariq (Anthropic, @trq212) confirmed 2026-03 that Agent SDK + Max subscription usage is unchanged. The Jan 2026 policy scare was a docs cleanup error. Solo developers building personal tools are not at risk.

Sources:
- https://x.com/trq212/status/2024212378402095389
- https://x.com/MatthewBerman/status/2024644370654470606

Note: official docs still list the restriction as of 2026-03-07. Verbal clarification only.

### Cost Estimate

- ~$0.001 per session (input: extracted content, output: structured summary)
- 532 existing sessions = ~$0.53 total
- Uses Max subscription, not separate API billing

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| Hook installer extension | Infrastructure | src/infrastructure/hooks/hook-installer.ts |
| BackfillService | Application | src/application/services/backfill-service.ts (new) |
| IBackfillStateRepository | Domain Port | src/domain/ports/repositories.ts |
| SqliteBackfillStateRepository | Infrastructure | src/infrastructure/database/repositories/ (new) |
| backfill_state schema | Infrastructure | src/infrastructure/database/schema.ts |
| backfill CLI command | Presentation | src/presentation/cli/commands/backfill.ts (new) |
| install/uninstall extension | Presentation | src/presentation/cli/commands/install.ts, uninstall.ts |

## Dependencies

- Depends on: Phase 23 (memory file indexing — backfill writes daily logs that need to be indexed)
- Independent of: Phase 24, 25 (can run in parallel with friction and intelligence)

## Testing Strategy

- Unit tests for BackfillService (session selection, content extraction, dry-run)
- Unit tests for hook installer extension (PreCompact hook generation)
- Integration tests for backfill_state repository (tracking, idempotency)
- Mock Agent SDK calls in unit tests (don't make real API calls in tests)
- Integration test for hook install/uninstall (both SessionEnd and PreCompact)
- CLI tests for backfill command (dry-run output, confirmation prompt, progress)

## Open Questions for Planning

1. Should backfill use the claude_agent_sdk directly or shell out to a command?
   Recommendation: use the SDK programmatically — it's already a dependency, no shell overhead.

2. How much session content should be sent to the LLM for summarization?
   Recommendation: extract user messages + assistant text responses only (skip tool outputs, thinking blocks). Cap at ~4000 tokens input per session.

3. Should backfill generate per-project DECISIONS.md and LEARNINGS.md in addition to daily logs?
   Recommendation: daily logs only for backfill. Curated files should be human/AI-reviewed, not auto-generated from raw session data.
