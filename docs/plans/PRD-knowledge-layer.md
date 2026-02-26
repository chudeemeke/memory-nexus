# PRD: Knowledge Layer for Memory-Nexus

**Author:** Claude (Opus 4.6) -- the primary consumer of this tool
**Date:** 2026-02-25
**Status:** Draft v2 (revised after OpenClaw research and OAuth findings)
**Scope:** New capability layer on top of memory-nexus v1.0

---

## Problem Statement

Memory-nexus v1.0 stores 42K+ messages across 532 sessions and provides keyword search. The data is there. The intelligence is not.

When I start a new session, I need to know: what happened recently, what decisions were made, what failed, what's unresolved. Currently, I either:
- Read project state files (STATE.md, ROADMAP.md) -- these capture project artifacts but not conversation context
- Search memory-nexus -- returns raw message snippets, breaks on special characters, gives no synthesis

The `memory context <project>` command returns session counts and tool usage stats. This tells me nothing useful. What I need is a synthesized briefing: recent decisions, unresolved items, learnings, and session summaries within a token budget.

**Trigger scenario:** User's 1-year-old cleared the screen (`/clear`). All conversation context was lost. Recovery required manually parsing a 12MB JSONL file. Memory-nexus should have handled this in one command.

---

## Design Philosophy: Agent-Written Memory

### Why Not Post-Session LLM Extraction?

The v1 draft of this PRD proposed a background LLM pipeline to extract summaries after sessions end. Research revealed two problems:

1. **OAuth restriction:** Anthropic banned consumer OAuth tokens in third-party tools (Jan 2026). The `@anthropic-ai/claude-code` SDK cannot use subscription auth for API calls. LLM extraction would require separate API key billing.

2. **The agent IS the best extractor.** OpenClaw's memory system demonstrates this: the agent writes its own memory during the session, not after. I (Claude) already know what's important -- I don't need a separate model to tell me post-hoc.

### The OpenClaw Pattern (Adapted)

OpenClaw uses a file-first memory architecture that works:
- **Daily log** (`memory/YYYY-MM-DD.md`): append-only, reads today + yesterday at session start
- **Curated memory** (`MEMORY.md`): durable facts, decisions, preferences
- **Pre-compaction flush**: before context compaction, the agent is reminded to write important context to files
- **Temporal decay** (FSRS-6): memories fade over time; frequently accessed ones stay strong; curated memory is exempt

**Adapted for memory-nexus + Claude Code:**

```
DURING SESSION:
  Claude writes to .planning/memory/YYYY-MM-DD.md  (daily log)
  Claude writes to .planning/memory/DECISIONS.md    (durable decisions)
  Claude writes to .planning/memory/LEARNINGS.md    (cross-session learnings)

AT PRE-COMPACTION (Claude Code PreCompact hook):
  memory-nexus reminds Claude to flush important context to files

AT SESSION END (Claude Code SessionEnd hook):
  memory-nexus sync indexes JSONL sessions + memory markdown files

AT SESSION START (via rules file instruction):
  memory context <project> reads today + yesterday logs + curated memory
  Provides structured briefing within token budget
```

### Why This Is Better

| Aspect | LLM Extraction (v1 draft) | Agent-Written Memory (v2) |
|--------|--------------------------|--------------------------|
| Cost | ~$0.001/session via API | $0 (agent is already running) |
| Accuracy | Summary of raw messages | Direct knowledge from the source |
| Latency | Background processing delay | Immediate (written during session) |
| Auth | Requires separate API key | No additional auth needed |
| Reliability | Depends on external API | Depends only on file writes |

---

## Who This Is For

**Primary consumer: Claude (the AI assistant)**
- Needs structured context at session start
- Needs decision recall during work ("did we discuss this?")
- Needs to avoid repeating mistakes across sessions
- Operates under token budget constraints

**Secondary consumer: The user (Chude)**
- Needs to verify what Claude "remembers"
- Needs to search past decisions
- Needs confidence that context survives session boundaries

---

## Core Features

### 1. Agent Memory Write Protocol

**What:** A defined protocol for how I (Claude) write memory during sessions.

**Memory file structure:**

```
.planning/memory/
  DECISIONS.md       -- durable decision registry (curated, never decays)
  LEARNINGS.md       -- cross-session learnings (curated, never decays)
  USER-PREFS.md      -- user interaction patterns and preferences (curated)
  2026-02-25.md      -- daily session log (append-only, temporal decay applies)
  2026-02-24.md      -- yesterday's log
  ...
```

**Daily log format (`YYYY-MM-DD.md`):**
```markdown
# 2026-02-25

## Session: 96bb26ae (13:04 - 17:12)

### Topic
Rules infrastructure audit against Opus 4.6 best practices

### Decisions
- Phase 22 scope: SYNC-09 and SYNC-10 requirements stand on merit;
  upstream overlap concern closed as unfounded
- Rules audit: defer restructuring until eval data confirms need;
  don't change a working system based on theory

### Outcomes
- Phase 21 (Sync Intelligence) executed: 3/3 plans, 800 tests
- Opus 4.6 guide fetched but not saved

### Unresolved
- Save Opus 4.6 guide as reference file
- Design eval for rules effectiveness
- Fix ghost directory tree in CLAUDE.md
- Run /gsd:discuss-phase 22

### Learnings
- Reasoning from absence is invalid: "hasn't been used" != "isn't needed"
- Don't volunteer strategic opinions that weren't asked for
- Flag context window degradation at ~60%, not 80%

### Key Files
- ~/.claude/CLAUDE.md, ~/.claude/rules/*
- .planning/STATE.md, .planning/ROADMAP.md
```

**Decision registry format (`DECISIONS.md`):**
```markdown
# Decisions

## [2026-02-25] Phase 22 requirements valid
- **Chose:** Keep SYNC-09 and SYNC-10 as Phase 22 requirements
- **Over:** Dropping Phase 22 or deferring to v0.4.0
- **Because:** Upstream overlap concern was unfounded; requirements address
  structural fork maintenance needs (selective sync, conflict resolution)
- **Status:** active
- **Session:** 96bb26ae

## [2026-02-25] Defer rules restructuring
- **Chose:** Wait for eval data before changing rules infrastructure
- **Over:** Immediate restructuring based on Opus 4.6 guide recommendations
- **Because:** TACHES' point that combined .md files are what makes GSD work;
  eval-driven decisions > theory-driven changes
- **Status:** active
- **Session:** 96bb26ae
```

**Learnings format (`LEARNINGS.md`):**
```markdown
# Learnings

## Don't reason from absence of usage
- **Context:** Evaluating whether Phase 22 features were needed
- **Wrong approach:** "Selective sync hasn't been needed in 200+ commits"
- **Why wrong:** Circular reasoning; can't measure demand for unbuilt features
- **Correct approach:** Evaluate features against structural use cases
- **Applies to:** All projects (general reasoning principle)
- **Date:** 2026-02-25

## Don't volunteer unsolicited strategic opinions
- **Context:** User asked about reassessment rationale; I expanded into
  whether Phase 22 should exist
- **Wrong approach:** Answering questions that weren't asked
- **Why wrong:** Scope creep in responses wastes context and risks flawed reasoning
- **Correct approach:** Answer the question asked, then stop
- **Applies to:** All projects (communication discipline)
- **Date:** 2026-02-25
```

**When I write:** At natural breakpoints during sessions:
- After a significant decision is made
- After a task is completed
- After a learning moment (error correction, user pushback)
- Before `/clear` when the user signals session end
- When prompted by the pre-compaction hook

---

### 2. Pre-Compaction Memory Flush

**What:** A Claude Code `PreCompact` hook that reminds me to write important context before compaction destroys it.

**How it works:**
1. Claude Code fires `PreCompact` event when context is about to be compressed
2. memory-nexus hook injects a system message: "Session approaching compaction. Write important context (decisions, unresolved items, learnings) to memory files now."
3. I write to the daily log and update curated files as needed
4. Compaction proceeds, but durable memory survives in files

**This is the mechanism that prevents the "Micah cleared my screen" problem.** If memory was flushed before compaction (or before `/clear`), the context is recoverable from files.

**Configuration:**
```json
{
  "hooks": {
    "preCompact": {
      "memoryFlush": {
        "enabled": true,
        "prompt": "Session nearing compaction. Write important context to memory files."
      }
    }
  }
}
```

---

### 3. Smart Context Command (Reimagined)

**What:** `memory context <project>` returns a synthesized briefing by reading agent-written memory files, not just session stats.

**Data sources (in priority order):**
1. Today's daily log + yesterday's daily log
2. DECISIONS.md (curated, never decays)
3. LEARNINGS.md (curated, never decays)
4. USER-PREFS.md (curated, never decays)
5. Indexed session data (fallback for projects without memory files)

**Output modes:**
```bash
# Default: read memory files + recent session data
memory context done

# Token-budget aware
memory context done --budget 2000

# AI-optimized (compact, no decoration)
memory context done --format ai

# Time-scoped
memory context done --days 7

# Combined
memory context done --format ai --budget 1500 --days 3
```

**The `--budget` flag** constrains output to approximately N tokens. Priority within budget:
1. Unresolved items from most recent session (continuations)
2. Active decisions from the time window
3. Learnings from the time window
4. Session summaries from daily logs (most recent first)

---

### 4. Search Reliability

**What:** Fix FTS5 special character handling.

**Problems:**
- Periods (`"Opus 4.6"`) → FTS5 syntax error
- Hyphens (`"SYNC-09"`) → "no such column" error
- Version numbers, URLs, technical identifiers are common in dev context

**Fix:** Sanitize queries before FTS5. Quote or escape characters that FTS5 treats as operators. Memory files should also be indexed alongside JSONL messages for search.

**The hybrid search work in v2.0 roadmap (Phases 14-18) complements this** by adding vector-based retrieval. Both fixes are valuable.

---

### 5. AI-First Output Mode

**What:** `--format ai` flag on all commands for token-efficient LLM consumption.

**Principles:**
- No color codes, box-drawing characters, or decorative borders
- No redundant labels or headers
- Structured but readable: simple markdown-like formatting
- Token-efficient: every token carries information
- Consistent format across all commands

---

### 6. Temporal Decay for Search Results

**What:** Memory search results decay in relevance over time, keeping context fresh.

**Implementation (adapted from OpenClaw's FSRS-6 pattern):**
```
decayedScore = score * e^(-lambda * ageInDays)
where lambda = ln(2) / halfLifeDays
```

**Default half-life:** 30 days
- Today: 100% of original score
- 7 days: ~84%
- 30 days: 50%
- 90 days: 12.5%

**Exemptions:** Curated files (DECISIONS.md, LEARNINGS.md, USER-PREFS.md) never decay. These are durable knowledge that remains relevant regardless of age.

---

### 7. Memory File Indexing

**What:** memory-nexus indexes agent-written memory markdown files alongside JSONL sessions.

**Sync behavior:**
```bash
memory sync
# Indexes:
#   1. JSONL session files (existing behavior)
#   2. .planning/memory/*.md files (new)
#   3. Builds entity relationships between memory entries and sessions
```

**Why both:** JSONL sessions are the raw record -- useful for full-text search and session navigation. Memory files are the curated knowledge layer -- useful for context briefings and decision recall. Indexing both gives the best of both worlds.

---

### 8. Cross-Project Intelligence

**What:** When working on project A, surface relevant patterns from project B.

**Implementation:**
- Learnings tagged as cross-project in LEARNINGS.md are indexed globally
- `memory context <project>` includes cross-project learnings in the briefing
- `memory search` with `--cross-project` flag searches across all projects

**File convention:** Cross-project learnings in each project's LEARNINGS.md are tagged with `Applies to: cross-project`. memory-nexus indexes these globally.

---

## Integration with Claude Code

### Hook Events Used

| Event | Purpose |
|-------|---------|
| `PreCompact` | Trigger memory flush reminder before context compaction |
| `SessionEnd` | Trigger sync of JSONL + memory files |

### Rules File Integration

Update `~/.claude/rules/memory-nexus.md` to include:

```markdown
# Memory Protocol

At session start, run:
  memory-nexus context <project> --format ai --budget 1500

During sessions, write durable memory to .planning/memory/:
  - Daily log: .planning/memory/YYYY-MM-DD.md (append entries for this session)
  - Decisions: .planning/memory/DECISIONS.md (when significant choices are made)
  - Learnings: .planning/memory/LEARNINGS.md (when mistakes are corrected)

Before /clear or session end:
  Ensure important context is written to memory files.
```

---

## Implementation Strategy

### What memory-nexus needs to build:

1. **Memory file indexing** -- Extend sync to discover and index `.planning/memory/*.md` files alongside JSONL sessions
2. **Smart context command** -- Rewrite `context` to read memory files and produce structured briefings with budget control
3. **FTS5 sanitization** -- Escape special characters in search queries
4. **Pre-compaction hook** -- Install hook that injects memory flush reminder
5. **AI output format** -- Add `--format ai` across all commands
6. **Temporal decay** -- Apply time-based score adjustment to search results (exempt curated files)

### What does NOT need building:

- LLM extraction pipeline (the agent writes memory directly)
- External API integration for extraction (no cost, no auth issues)
- Embedding infrastructure (this is the v2.0 hybrid search work, separate concern)

### Relationship to v2.0 Hybrid Search Roadmap

| Work | What it does | Dependency |
|------|-------------|------------|
| Knowledge layer (this PRD) | Adds structured knowledge + smart context | Builds on v1.0 |
| Hybrid search (v2.0 Phases 14-18) | Improves retrieval quality | Builds on knowledge layer OR v1.0 |
| Package rename (v2.0 Phase 13) | Renames binary and paths | Independent |

**Recommended sequencing:**
1. Knowledge layer first (highest value, no external dependencies)
2. Package rename (independent, can parallelize)
3. Hybrid search (improves retrieval on top of the knowledge layer)

---

## Modified Commands

| Command | Change |
|---------|--------|
| `memory context` | Read memory files, produce structured briefings, --budget, --format ai |
| `memory sync` | Index memory markdown files alongside JSONL sessions |
| `memory search` | FTS5 query sanitization, temporal decay, search across memory files, --format ai |
| `memory show` | Show daily log entry if available for session, --format ai |
| `memory install` | Install PreCompact hook for memory flush alongside SessionEnd hook |
| All commands | Add --format ai output mode |

---

## Success Criteria

1. Running `memory context done --format ai --budget 1500` at session start gives me a useful briefing with decisions, unresolved items, and session summaries within 1500 tokens.

2. When the user asks "did we discuss X before?", searching memory files returns structured decision records, not raw message snippets.

3. `memory search "SYNC-09"` returns results instead of an FTS5 syntax error.

4. After a session where I write to memory files, `memory sync` indexes both the JSONL session and the memory files.

5. The PreCompact hook reminds me to flush context before compaction, preventing the "lost conversation" scenario.

6. Cross-project learnings written in one project are surfable from `memory context` in another project.

---

## Open Questions

1. **Memory file location:** `.planning/memory/` (GSD-specific) vs `~/.memory/` (global) vs `<project>/.memory/` (per-project but GSD-agnostic). The GSD path works for GSD projects but doesn't generalize. Recommendation: configurable, with `.planning/memory/` as default for GSD projects.

2. **Write discipline:** How do we ensure I actually write memory during sessions without being reminded? Options: rules file instruction (current plan), auto-prompting at regular intervals, or explicit user command ("write memory now"). Recommendation: rules file + PreCompact hook. Don't over-automate.

3. **Backfill:** 532 existing sessions have no memory files. Should memory-nexus offer a backfill command that generates summary-style entries from historical JSONL data? This would require LLM extraction (API cost) but only as a one-time catch-up. Recommendation: optional backfill via `memory backfill --api-key <key>`, not required for the feature to work going forward.

4. **Memory file versioning:** Should memory files be git-committed? They contain project knowledge that's valuable to preserve. But they also grow over time. Recommendation: yes, commit them. They're small text files and they're the source of truth for project memory.

---

## Research References

- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory) -- file-first architecture, pre-compaction flush, FSRS-6 decay
- [OpenClaw Memory Architecture (community)](https://github.com/coolmanns/openclaw-memory-architecture) -- 12-layer architecture with knowledge graph
- [Mem0 for OpenClaw](https://mem0.ai/blog/mem0-memory-for-openclaw) -- persistent memory plugin
- [Anthropic OAuth Policy](https://natural20.com/coverage/anthropic-banned-openclaw-oauth-claude-code-third-party) -- consumer OAuth banned in third-party tools (Jan 2026)

---

*This PRD was written by the primary consumer of memory-nexus (Claude Opus 4.6) based on direct experience using the tool across 500+ sessions, informed by OpenClaw's production memory system patterns. The core insight: the agent should write its own memory during sessions, not rely on post-session extraction.*
