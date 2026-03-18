# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v3.0 Knowledge Layer + Friction Logging -- agent-written memory, smart context, friction capture, backfill, qmd integration.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v3.0 Knowledge Layer + Friction Logging
**Phase:** 27 (qmd Integration) -- in progress
**Status:** Plan 27-01 complete, plan 27-02 remaining
**Current Plan:** 27-01 complete (IExternalSearchProvider port + QmdRunner adapter)

```
v3.0 Progress: [####################    ] 5/7 phases (complete)
  Phase 23: Foundation                [x] Complete (4/4 plans)
  Phase 24: Friction System           [x] Complete (3/3 plans)
  Phase 25: Intelligence              [x] Complete (4/4 plans, including gap closure)
  Phase 26: Hooks + Backfill          [x] Complete (3/3 plans)
  Phase 27: qmd Integration           [~] In Progress (1/2 plans)
  Phase 28: Friction Universalization  [ ] Discussed (no CONTEXT.md yet)
  Phase 29: Ambient Context            [~] In Progress (1/2 plans)
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

**Date:** 2026-03-18
**Completed:** Plan 27-01 (IExternalSearchProvider port + QmdRunner adapter)
**Stopped at:** Phase 27 plan 01 complete, plan 02 remaining

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
- QmdRunner follows ClaudeSummaryGenerator spawn pattern for consistency across infrastructure adapters
- Standalone isQmdAvailable/getQmdInfo functions duplicate class logic for non-DI contexts (doctor command)
- infrastructure/external/ directory for external CLI tool adapters (new pattern)
- Marker format uses HTML comments (<!-- memory-cli:start/end -->) for MEMORY.md block isolation
- mergeMemoryBlock exported as pure function for direct testing without filesystem ops
- AmbientContext config uses flat object (enabled + budget) matching existing config deep-merge pattern

### Context for Next Session

1. **27-01 complete** -- IExternalSearchProvider port + QmdRunner adapter with 15 tests
2. **29-01 complete** -- IAmbientContextWriter port + AutoMemoryWriter adapter with 16 tests + config extension
3. Plan 27-02 next: wire QmdRunner to search --files flag and doctor qmd status check
4. Plan 29-02 next: AmbientContextService application service, sync command integration
5. Phase 28 (Friction Universalization) still needs discuss-phase (no CONTEXT.md yet)
6. Pre-existing issues: error-codes.test.ts count assertion stale (expects 19, has 21)
7. infrastructure/external/ barrel NOT yet wired to infrastructure/index.ts (deferred to 27-02)

---

*Last updated: 2026-03-18 (29-01 executed, IAmbientContextWriter port + AutoMemoryWriter adapter)*
