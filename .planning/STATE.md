# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v3.0 Knowledge Layer + Friction Logging -- agent-written memory, smart context, friction capture, backfill, qmd integration.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v3.0 Knowledge Layer + Friction Logging
**Phase:** 24 (Friction System) -- IN PROGRESS
**Status:** Executing
**Current Plan:** 24-02 complete (2/3 plans)

```
v3.0 Progress: [#####                   ] 1/5 phases (complete)
  Phase 23: Foundation                [x] Complete (4/4 plans)
  Phase 24: Friction System           [~] In Progress (2/3 plans)
  Phase 25: Intelligence              [ ] Discussed (CONTEXT.md ready)
  Phase 26: Hooks + Backfill          [~] In Progress (2/3 plans)
  Phase 27: qmd Integration           [ ] Discussed (CONTEXT.md ready)
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

**Date:** 2026-03-08
**Completed:** Plans 24-02, 26-01, 26-02
**Stopped at:** Executing 26-03 (Wave 2)

### Decisions

- FrictionEntry create() is permissive on resolution field (service enforces business rules)
- getWeeklyTrends uses strftime('%Y-W%W') for ISO week grouping
- friction_log CHECK constraints enforce valid values at database level
- wontFix flow: resolve() then updateStatus() for correct final state
- Added generic NOT_FOUND and INVALID_STATE error codes (not entity-specific)
- --json on each subcommand individually (Commander.js pitfall)
- Flush reminder outputs before syncOnCompaction check (always fires for PreCompact regardless of sync config)

### Context for Next Session

1. Phase 24 (Friction System) in progress: 2/3 plans complete
2. Phase 26 (Hooks + Backfill) in progress: 2/3 plans complete (26-01, 26-02 done)
3. 24-01 complete: FrictionEntry entity, IFrictionRepository port, friction_log schema, SqliteFrictionRepository
4. 24-02 complete: FrictionService, CLI friction commands, executeFrictionCommand API
5. 26-01 complete: PreCompact flush reminder added to sync-hook-script.ts
6. 26-02 complete: BackfillState entity, IBackfillStateRepository port, schema, SqliteBackfillStateRepository
7. Next: 26-03 (BackfillService, ClaudeSummaryGenerator, backfill CLI command)

---

*Last updated: 2026-03-08 (plans 26-01, 26-02 merged)*
