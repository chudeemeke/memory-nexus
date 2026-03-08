# Phase 25: Intelligence — Discussion Context

**Source:** Brainstorming session 2026-03-07 (design doc: docs/plans/2026-03-07-knowledge-layer-friction-design.md)
**Phase goal:** Rewrite smart context to produce structured briefings, add temporal decay to search, implement AI-first output mode, and enable cross-project intelligence.

## What This Phase Builds

The "intelligence" layer that makes raw memory data useful:

1. **Smart context rewrite** — `memory context` reads memory files and produces structured briefings
2. **Temporal decay** — search results weighted by recency
3. **AI-first output mode** — `--format ai` across all commands
4. **Cross-project intelligence** — learnings tagged "Applies to: cross-project" surfaced globally

## Smart Context Rewrite

### Current Problem

`memory context kanbanflow` returns session metadata (counts, dates, tool usage). This is useless for understanding what happened or what to do next.

### New Behavior

Reads agent-written memory files from ~/.memory/ + recent session data and produces a structured briefing within a token budget.

### Data Sources (Priority Order)

1. ~/.memory/projects/<encoded>/DECISIONS.md — project decisions
2. ~/.memory/projects/<encoded>/LEARNINGS.md — project learnings
3. ~/.memory/daily/<today>.md + <yesterday>.md — recent session logs
4. ~/.memory/DECISIONS.md — cross-project decisions (if --cross-project)
5. ~/.memory/LEARNINGS.md — cross-project learnings tagged for this project
6. Open friction entries for this project (from friction_log table)
7. Indexed session data (fallback for projects without memory files)

### CLI

```bash
memory context kanbanflow
memory context kanbanflow --budget 1500
memory context kanbanflow --format ai
memory context kanbanflow --days 7
memory context kanbanflow --cross-project
memory context kanbanflow --format ai --budget 1500 --days 3 --cross-project
```

### Output Structure (--format ai)

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

### Budget Allocation

When --budget is set, sections filled in priority order:
1. Unresolved items (most actionable)
2. Active decisions
3. Recent learnings
4. Open friction
5. Session summaries (first to be truncated)

Each section truncated independently. Token estimation: ~4 chars per token for English text.

## Temporal Decay

### Algorithm

```
decayedScore = score * e^(-lambda * ageInDays)
lambda = ln(2) / halfLifeDays
```

Default half-life: 30 days
- Today: 100% of original score
- 7 days: ~84%
- 30 days: 50%
- 90 days: 12.5%

### Exemptions

Curated files never decay:
- DECISIONS.md (all levels)
- LEARNINGS.md (all levels)
- USER-PREFS.md

### Application Points

- `SearchService.search()` — apply decay to FTS5 rank scores
- `HybridSearchService.hybridSearch()` — apply decay to RRF scores
- memory_files search results — apply decay to daily logs, exempt curated files

Note: v2.0 already has temporal decay infrastructure in SearchConfig. This phase extends it to memory files and ensures curated file exemption.

## AI-First Output Mode

### What --format ai Does

Strips all terminal decoration and outputs clean, token-efficient text:
- No color codes (ANSI escape sequences)
- No box-drawing characters
- No decorative borders or padding
- Simple markdown-like structure
- Every token carries information

### Where to Apply

All commands that produce output:
- memory search — results as compact list
- memory context — structured briefing (see above)
- memory list — session list without decoration
- memory show — session detail without decoration
- memory stats — key-value pairs, no charts
- memory friction list — compact friction table
- memory friction dashboard — stats only, no charts
- memory related — link list without decoration

### Implementation

Add `--format` flag to the root commander program (inherited by all subcommands). Check `opts.format === 'ai'` in each formatter. Create a shared `formatForAi()` utility that strips ANSI codes as a safety net.

## Cross-Project Intelligence

### Convention

Learnings in any LEARNINGS.md tagged with `Applies to: cross-project` are surfaced globally.

### How It Works

1. Memory file indexing (Phase 23) stores all LEARNINGS.md entries with their `Applies to` tag
2. When `memory context kanbanflow --cross-project` is run:
   a. Read kanbanflow-specific learnings
   b. Query memory_files for LEARNINGS.md entries where content contains "Applies to: cross-project"
   c. Include matching entries in the briefing under "Cross-Project Learnings" section
3. The `--cross-project` flag is opt-in to avoid noise by default

### Example

In ~/.memory/projects/C--Users-Destiny-Projects-wow-system/LEARNINGS.md:
```markdown
## Don't reason from absence of usage
- **Applies to:** cross-project
```

Running `memory context kanbanflow --cross-project` would include this learning in the kanbanflow briefing.

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| ContextService rewrite | Application | src/application/services/context-service.ts |
| Budget allocator | Application | src/application/services/budget-allocator.ts (new) |
| AI formatter | Presentation | src/presentation/cli/formatters/ai-formatter.ts (new) |
| --format flag | Presentation | src/presentation/cli/commands/index.ts (root program) |
| Temporal decay extension | Application | extend existing decay in SearchConfig |
| Cross-project query | Infrastructure | extend SqliteMemoryFileRepository |

## Dependencies

- Depends on: Phase 23 (memory file indexing), Phase 24 (friction entries in context)
- Blocks: Nothing directly (Phase 26 and 27 are independent)

## Testing Strategy

- Unit tests for budget allocator (priority ordering, truncation, edge cases)
- Unit tests for AI formatter (ANSI stripping, markdown output)
- Integration tests for smart context (reads memory files, respects budget)
- Integration tests for temporal decay on memory files (curated exemption)
- Integration tests for cross-project learnings query
- Regression tests for existing context command behavior
