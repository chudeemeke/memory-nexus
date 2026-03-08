# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v3.0 Knowledge Layer + Friction Logging -- agent-written memory, smart context, friction capture, backfill, qmd integration.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v3.0 Knowledge Layer + Friction Logging
**Phase:** 23 (Foundation) -- Plans 01-02 complete, executing plans
**Status:** Plan 23-02 complete (FTS5 sanitizer + search integration), 2 plans remaining
**Current Plan:** 3 of 4

```
v3.0 Progress: [#####                   ] 1/5 phases (in progress)
  Phase 23: Foundation                [~] In Progress (2/4 plans)
  Phase 24: Friction System           [ ] Discussed (CONTEXT.md ready)
  Phase 25: Intelligence              [ ] Discussed (CONTEXT.md ready)
  Phase 26: Hooks + Backfill          [ ] Discussed (CONTEXT.md ready)
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
**Completed:** Plan 23-02 (FTS5 query sanitizer, search service integration, searchSummaries)
**Stopped at:** Completed 23-02-PLAN.md

### Decisions

- Lowercase-only hex validation for contentHash (/^[a-f0-9]{64}$/)
- MemoryFileInfo placed in sources.ts alongside IMemoryFileScanner
- Preserve asterisks in FTS5 sanitizer (valid prefix search operator)
- Preserve balanced double quotes in FTS5 sanitizer (valid phrase search syntax)
- Infrastructure importing application pure function accepted (matches existing codebase pattern)

### Context for Next Session

1. Plans 23-01 and 23-02 complete
2. Continue with plans 23-03 and 23-04
3. sanitizeFtsQuery() available in application/services for any FTS5 query path
4. SessionRepository.searchSummaries() ready for context/intelligence features
5. 1699 core tests passing, zero regressions

---

*Last updated: 2026-03-08 (plan 23-02 complete)*
