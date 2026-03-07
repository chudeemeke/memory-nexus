# Design: Knowledge Layer + Friction Logging (v3.0)

**Date:** 2026-03-07
**Status:** Approved
**Milestone:** v3.0

## Overview

Ship the complete knowledge layer alongside a friction logging system. 11 features across 5 phases, bundled because each feature reinforces the others. Friction logging captures tool-specific pain points; the knowledge layer makes that data (and all memory data) actually useful.

## Decisions Made During Design

| Decision | Choice | Over | Because |
|----------|--------|------|---------|
| Scope | All 8 PRD features + friction + backfill + qmd | Friction-only or subset | Features reinforce each other; cohesive milestone |
| Dashboard | CLI stats + static HTML report | CLI-only or full web server | CLI for daily use, HTML with Chart.js for visual review sessions. No server. |
| Friction capture scope | Tool-specific friction only | All development friction | Focused, actionable data. Memory knows when it falls short. |
| Memory dir location | Global ~/.memory/ | Project-local .memory/ or GSD .planning/memory/ | Global, not GSD-dependent. Accessible from any project. |
| Per-project subdirs | Encoded paths (~/.memory/projects/C--Users-Destiny-...) | Human-readable names | Mirrors ~/.claude/projects/ convention. Same rename behavior. ProjectNameResolver already handles display names. |
| Cross-project intelligence | Included | Deferred | Small effort (tagging convention + search filter), high value |
| Backfill | Included via Agent SDK | Excluded due to OAuth concern | Thariq (Anthropic) confirmed Agent SDK + Max subscription is fine for solo developers |
| qmd | Optional peer dependency | Not included / hard dependency | Already installed. Complements memory's JSONL search with markdown file search. Runtime check, not hard dep. |
| Phase structure | 5 grouped phases (Approach B) | 10 linear phases | Fewer phases, more parallel work per phase. Better for GSD agents. |

## Phase Structure

### Phase 23: Foundation
- Agent write protocol (daily logs, DECISIONS.md, LEARNINGS.md conventions)
- ~/.memory/ global directory with encoded-path project subdirectories
- Memory file indexing (sync discovers and indexes ~/.memory/**/*.md)
- FTS5 search reliability (special character sanitization)

### Phase 24: Friction System
- FrictionEntry domain entity
- IFrictionRepository port + SQLite adapter
- friction_log table (schema migration)
- CLI commands: memory friction log/list/resolve/dashboard
- Static HTML report with Chart.js (memory friction dashboard --html)
- Rules file update for auto-capture across all projects

### Phase 25: Intelligence
- Smart context rewrite (memory context reads memory files, --budget, structured briefings)
- Temporal decay (time-weighted search scoring, curated file exemptions)
- AI-first output mode (--format ai across all commands)
- Cross-project intelligence (learnings tagged "Applies to: cross-project" surfaced globally)

### Phase 26: Hooks + Backfill
- Pre-compaction flush hook (PreCompact event, memory flush reminder)
- Backfill command (memory backfill via Agent SDK, generates daily logs from historical sessions)

### Phase 27: qmd Integration
- Optional peer dependency for markdown file search
- memory search --files delegates to qmd
- memory doctor reports qmd status
- Install instructions in --help

## Data Model

### ~/.memory/ Directory Structure

```
~/.memory/
  config.json
  DECISIONS.md                                    # cross-project
  LEARNINGS.md                                    # cross-project
  USER-PREFS.md                                   # user interaction patterns
  daily/
    2026-03-07.md                                 # today's session log
    2026-03-06.md
  projects/
    C--Users-Destiny-Projects-kanbanflow/
      DECISIONS.md                                # project-specific
      LEARNINGS.md
    C--Users-Destiny-Projects-memory-nexus/
      DECISIONS.md
      LEARNINGS.md
```

Encoded paths mirror ~/.claude/projects/ convention. ProjectNameResolver maps encoded paths to display names. If a project is renamed, both session storage and memory storage use the new encoded path -- same behavior, same resolution logic.

### FrictionEntry Entity

```typescript
type FrictionSeverity = "low" | "medium" | "high" | "critical";
type FrictionCategory = "search" | "sync" | "cli" | "context" | "integration" | "ux";
type FrictionStatus = "open" | "resolved" | "wont-fix";

interface FrictionEntryParams {
  id?: number;
  description: string;
  severity: FrictionSeverity;
  category: FrictionCategory;
  status: FrictionStatus;
  context?: string;
  sourceProject?: string;
  loggedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}
```

### friction_log Table

```sql
CREATE TABLE friction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'cli',
    status TEXT NOT NULL DEFAULT 'open',
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
);
CREATE INDEX idx_friction_status ON friction_log(status);
CREATE INDEX idx_friction_severity ON friction_log(severity);
CREATE INDEX idx_friction_category ON friction_log(category);
```

### IFrictionRepository Port

```typescript
interface IFrictionRepository {
  save(entry: FrictionEntry): Promise<FrictionEntry>;
  findById(id: number): Promise<FrictionEntry | null>;
  findOpen(): Promise<FrictionEntry[]>;
  findAll(options?: { status?: FrictionStatus; category?: FrictionCategory }): Promise<FrictionEntry[]>;
  resolve(id: number, resolution: string): Promise<void>;
  getStats(): Promise<FrictionStats>;
}
```

## CLI Commands

### Friction

```bash
memory friction log "search fails on hyphens" --severity high --category search
memory friction list
memory friction list --all
memory friction resolve 42 --resolution "FTS5 sanitization added"
memory friction dashboard
memory friction dashboard --html
```

### Smart Context

```bash
memory context kanbanflow
memory context kanbanflow --budget 1500
memory context kanbanflow --format ai
memory context kanbanflow --days 7
memory context kanbanflow --cross-project
memory context kanbanflow --format ai --budget 1500 --days 3 --cross-project
```

### Backfill

```bash
memory backfill
memory backfill --dry-run
memory backfill --project kanbanflow
memory backfill --batch 20
```

### Search (enhanced)

```bash
memory search "SYNC-09"              # FTS5 sanitized, no more syntax errors
memory search "query" --format ai    # token-efficient output
memory search "query" --files        # delegates to qmd for markdown search
```

## Smart Context Output Structure

When `--format ai` is used, output follows this structure with sections filled in priority order within the token budget:

```
## <project> context (<date>)

### Unresolved (from last session)
- Item 1
- Item 2

### Active Decisions
- [date] Decision summary

### Recent Learnings
- Learning (cross-project tag if applicable)

### Open Friction
- #id (severity/category): description -- age

### Session Summary (last N days)
- date: what happened
```

Budget allocation: unresolved items first (most actionable), then decisions, learnings, friction, session summaries last. Each section truncated to fit remaining budget.

## Dashboard Design

### CLI (memory friction dashboard)

Rich terminal rendering matching Claude Code's /stats aesthetic:
- GitHub-style heatmap showing friction activity over time
- Tab navigation: Overview | By Category | Trends
- Key stats grid: open/resolved/won't-fix counts, severity breakdown, MTTR, oldest open
- Horizontal bar charts for category distribution
- Time period cycling: All time | Last 30 days | Last 7 days
- Keyboard shortcuts: r to cycle dates, q to quit, ctrl+s to copy

### HTML (memory friction dashboard --html)

Self-contained HTML file at ~/.memory/dashboard.html. Chart.js embedded (no CDN). Dark theme (#1a1a2e background, amber/orange accent, green for resolved, red for critical).

Layout:
- Header with stats cards (open, resolved, critical, MTTR)
- Line chart: friction over time (new/resolved/cumulative)
- Doughnut chart: by category
- Stacked bar: severity per category
- Grouped bar: weekly new vs resolved
- Sortable table: all open items

## Search Improvements

### FTS5 Sanitization

Characters that FTS5 treats as operators (periods, hyphens, colons) get escaped or tokenized before query:
- "Opus 4.6" becomes tokenized search for "opus" AND "4" AND "6"
- "SYNC-09" becomes "sync" AND "09"

### Temporal Decay

```
decayedScore = score * e^(-lambda * ageInDays)
lambda = ln(2) / 30  (half-life: 30 days)
```

Exemptions: curated files (DECISIONS.md, LEARNINGS.md, USER-PREFS.md) never decay.

### AI Output Mode

`--format ai` flag on all commands:
- No color codes, box-drawing, decorative borders
- Structured markdown-like formatting
- Token-efficient: every token carries information

## Hooks

### PreCompact (new)

```json
{
  "hooks": {
    "PreCompact": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Session nearing compaction. Write important context to ~/.memory/ files now.'",
        "timeout": 5
      }]
    }]
  }
}
```

`memory install` manages both SessionEnd and PreCompact hooks. `memory uninstall` removes both.

## Backfill

Uses @anthropic-ai/claude-code (already a dependency) with Max subscription auth.

Process:
1. Query sessions with no corresponding daily log entries
2. Extract key messages per session
3. Generate structured summary via Agent SDK
4. Write to ~/.memory/daily/<date>.md
5. Track in backfill_state table

Safety: --dry-run shows count + estimated cost before proceeding. ~$0.001/session.

## qmd Integration

Optional peer dependency. Checked at runtime via `which qmd`.

- `memory search --files` delegates to qmd for BM25 + vector + LLM reranking over ~/.memory/ markdown files
- If qmd not installed, prints install instructions
- `memory doctor` reports qmd status
- Not a hard dependency -- all existing functionality works without it

## Rules File Updates

Update ~/.claude/rules/memory.md with:
- Session start protocol (memory context --format ai --budget 1500)
- Write protocol (when and where to write memory files)
- Friction logging protocol (what counts as friction, command syntax)
- Pre-clear protocol (ensure context is written before /clear)

Update ~/.claude/CLAUDE.md Quick Reference table with memory --help reference.

## OAuth Status

Thariq (Anthropic, @trq212) confirmed 2026-03: Agent SDK + Max subscription usage is unchanged. The Jan 2026 "ban" was a docs cleanup that caused confusion. Solo developers building personal tools with the Agent SDK are not at risk.

Sources:
- https://x.com/trq212/status/2024212378402095389
- https://x.com/MatthewBerman/status/2024644370654470606

Note: official docs still list the restriction. Verbal clarification only. Low risk for personal tooling.

## Success Criteria

1. `memory context kanbanflow --format ai --budget 1500` returns a structured briefing with decisions, unresolved items, learnings, and friction within 1500 tokens
2. `memory search "SYNC-09"` returns results instead of FTS5 syntax error
3. `memory friction log` captures friction from any project; `memory friction dashboard` visualizes trends
4. `memory friction dashboard --html` opens a Chart.js dashboard in the browser
5. PreCompact hook reminds Claude to flush context before compaction
6. `memory backfill --dry-run` shows backfill plan; `memory backfill` generates daily logs from history
7. `memory search --files` delegates to qmd when installed
8. Cross-project learnings surface in `memory context` across projects
9. All existing tests pass (no behavioral regression)
10. 95%+ coverage at each metric for all new code
