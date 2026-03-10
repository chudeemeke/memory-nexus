# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v3.0 Knowledge Layer + Friction Logging -- agent-written memory, smart context, friction capture, backfill, qmd integration.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v3.0 Knowledge Layer + Friction Logging
**Phase:** 25 (Intelligence) -- complete (including gap closure)
**Status:** Phase 25 fully complete, ready for phases 27/28/29
**Current Plan:** 25-04 complete (flaky vector-only decay test fixed)

```
v3.0 Progress: [####################    ] 5/7 phases (complete)
  Phase 23: Foundation                [x] Complete (4/4 plans)
  Phase 24: Friction System           [x] Complete (3/3 plans)
  Phase 25: Intelligence              [x] Complete (4/4 plans, including gap closure)
  Phase 26: Hooks + Backfill          [x] Complete (3/3 plans)
  Phase 27: qmd Integration           [ ] Discussed (CONTEXT.md ready)
  Phase 28: Friction Universalization  [ ] Discussed (no CONTEXT.md yet)
  Phase 29: Ambient Context            [ ] Discussed (CONTEXT.md ready)
```

## Milestone History

**v1.0 (shipped 2026-02-16):** 12 phases, 56 plans, full CLI with sync, search, context, hooks
**v2.0 (shipped 2026-03-01):** 10 phases, package rename, hybrid search (FTS5 + sqlite-vec), embedding providers, API stabilization
**Phase 22 (2026-03-07):** Ad-hoc gap closure -- sync domain ports, browse test, barrel deletion

## Performance Metrics

**v2.0 final:**
- 2605 tests, 1 pre-existing timeout failure
- 10/10 phases complete, 39/39 requirements met
- Zero application-to-infrastructure boundary violations

## v3.0 Design Summary

**Design doc:** docs/plans/2026-03-07-knowledge-layer-friction-design.md

11 features across 5 phases:
1. Agent write protocol (daily logs, DECISIONS.md, LEARNINGS.md)
2. ~/.memory/ global directory with encoded-path project subdirs
3. Memory file indexing (sync indexes markdown files)
4. FTS5 search reliability (special char sanitization)
5. Friction logging (entity, repo, CLI, dashboard)
6. Smart context rewrite (structured briefings with --budget)
7. Temporal decay (time-weighted search, curated exemptions)
8. AI-first output mode (--format ai across all commands)
9. Cross-project intelligence (tagged learnings surfaced globally)
10. Pre-compaction flush hook + backfill via Agent SDK
11. qmd integration (optional peer dependency for markdown search)

**Key design decisions:**
- Encoded paths for project subdirs (mirrors ~/.claude/projects/ convention)
- Tool-specific friction only (not general development friction)
- CLI stats + static HTML report for dashboard (no server)
- Backfill uses Agent SDK with Max subscription (Thariq confirmed OK)
- qmd is optional runtime dependency, not hard dep

## Session Continuity

### Last Session

**Date:** 2026-03-10
**Completed:** Plan 25-04 (gap closure: fix flaky vector-only decay test)
**Stopped at:** Phase 25 fully complete (all 4 plans done, including gap closure)

### Decisions

- SQL LIKE over FTS5 MATCH for cross-project tag: FTS5 tokenizes hyphens, causing false matches on small result sets
- Decay at search() pipeline exit, not per-mode: SRP -- each mode handles retrieval, decay is cross-cutting scoring
- applyDecayToResults inline in HybridSearchService using SearchResult.timestamp directly (no rowid-to-timestamp map)
- FrictionEntry create() is permissive on resolution field (service enforces business rules)
- getWeeklyTrends uses strftime('%Y-W%W') for ISO week grouping
- friction_log CHECK constraints enforce valid values at database level
- wontFix flow: resolve() then updateStatus() for correct final state
- Added generic NOT_FOUND and INVALID_STATE error codes (not entity-specific)
- --json on each subcommand individually (Commander.js pitfall)
- Flush reminder outputs before syncOnCompaction check (always fires for PreCompact regardless of sync config)
- executeBackfillCommand separated from createBackfillCommand for testability (DI pattern)
- Lazy infrastructure imports in backfill CLI action handler to avoid startup cost
- FileDailyLogWriter in presentation layer (composition root pattern)
- CLAUDECODE env var stripping via delete before spawn
- Chart.js UMD read from node_modules at generation time (no CDN)
- Dashboard HTML at ~/.memory/dashboard.html via getMemoryDir()
- Inlined estimateTokens in application layer to avoid presentation-layer import (hexagonal boundary)
- IProjectResolver as separate port rather than direct infrastructure dependency
- getSessionSummary as optional function dep rather than injecting full SqliteContextService
- Daily log date filtering from file path parsing (daily/YYYY-MM-DD.md pattern)
- Empty sections omitted entirely from SmartContextResult rather than included with empty content
- SqliteProjectResolver co-located with SqliteContextService (same DB, same session queries)
- formatSmartContext as optional method on ContextFormatter interface (only AI mode uses it)
- formatForAi pipe pattern over parallel AI formatter classes (simpler, same result)
- Friction --format on parent command (Commander.js does not propagate parent options to subcommands)
- useSmartContext() routing function separates smart/legacy context paths for backward compatibility

### Context for Next Session

1. **25-04 complete** -- flaky vector-only decay test fixed with controlled embeddings
2. Plan+execute remaining phases (27, 28, 29 are all independent)
3. Phase 29 (Ambient Context) CONTEXT.md is complete -- skip discuss-phase, go straight to plan-phase
4. Phase 28 (Friction Universalization) still needs discuss-phase (no CONTEXT.md yet)
5. Safe parallel set: 27 + 29. Run 28 after those land (schema overlap risk with friction data)
6. Pre-existing issues: error-codes.test.ts count assertion stale (expects 19, has 21)
7. All 7 output-producing commands support --format ai
8. SmartContextService fully wired with SqliteProjectResolver, memory file repo, friction repo

---

*Last updated: 2026-03-10 (25-04 gap closure executed, phase 25 fully complete)*
