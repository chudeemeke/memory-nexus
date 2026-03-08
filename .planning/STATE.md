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
**Current Plan:** 24-01 complete (1/3 plans)

```
v3.0 Progress: [#####                   ] 1/5 phases (complete)
  Phase 23: Foundation                [x] Complete (4/4 plans)
  Phase 24: Friction System           [~] In Progress (1/3 plans)
  Phase 25: Intelligence              [ ] Discussed (CONTEXT.md ready)
  Phase 26: Hooks + Backfill          [~] In Progress (1/3 plans)
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
**Completed:** Plan 26-01 (PreCompact flush reminder in sync hook script)
**Stopped at:** Plan 26-01 complete

### Decisions

- FrictionEntry create() is permissive on resolution field (service enforces business rules)
- getWeeklyTrends uses strftime('%Y-W%W') for ISO week grouping
- friction_log CHECK constraints enforce valid values at database level
- Flush reminder outputs before syncOnCompaction check (always fires for PreCompact regardless of sync config)

### Context for Next Session

1. Phase 24 (Friction System) in progress: 1/3 plans complete
2. Phase 26 (Hooks + Backfill) in progress: 1/3 plans complete (26-01 done)
3. 26-01 complete: PreCompact flush reminder added to sync-hook-script.ts
4. Next in phase 26: 26-02 (backfill state management) or 26-03 (Agent SDK backfill)

---

*Last updated: 2026-03-08 (plan 26-01 complete)*
