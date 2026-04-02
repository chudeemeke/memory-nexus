# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** All three milestones shipped. Ready for v4.0 planning.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v3.0 Knowledge Layer + Friction Logging -- SHIPPED
**Phase:** All complete
**Status:** Between milestones

```
v3.0 Progress: [########################] 9/9 phases complete
  Phase 23: Foundation                 [x] Complete (4/4 plans)
  Phase 24: Friction System            [x] Complete (3/3 plans)
  Phase 25: Intelligence               [x] Complete (4/4 plans)
  Phase 26: Hooks + Backfill           [x] Complete (3/3 plans)
  Phase 27: qmd Integration            [x] Complete (2/2 plans)
  Phase 28: Friction Universalization   [x] Complete (6/6 plans)
  Phase 29: Ambient Context             [x] Complete (2/2 plans)
  Phase 29.1: Test Determinism          [x] Complete (2/2 plans)
```

## Milestone History

**v1.0 (shipped 2026-02-16):** 12 phases, 56 plans, full CLI with sync, search, context, hooks
**v2.0 (shipped 2026-03-01):** 10 phases (13-22), package rename, hybrid search (FTS5 + sqlite-vec), embedding providers, API stabilization
**v3.0 (shipped 2026-04-02):** 9 phases (23-29.1), agent-written memory, smart context, friction system, backfill, qmd, ambient context, test determinism

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

**Date:** 2026-03-22
**Completed:** Plan 29.1-02 (browse dispatch mock isolation)
**Stopped at:** Phase 29.1 plan 02 complete

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
- Clock DI as private field with default in constructor, not optional chaining on deps (constructor destructures deps)
- 15s explicit timeouts on individual slow integration tests, not blanket describe-level timeout
- mergeMemoryBlock exported as pure function for direct testing without filesystem ops
- AmbientContext config uses flat object (enabled + budget) matching existing config deep-merge pattern
- executeFileSearch short-circuits before DB init (file search does not need memory database)
- dim([INFO]) for qmd status in doctor (visually distinct from pass/fail checks)
- qmd status does NOT affect doctor exit code or issue count (informational only)
- --json with --files outputs raw qmd JSON array (not wrapped in metadata)
- AmbientContextDeps DI interface for sync integration testing (matches EmbeddingPassDeps/BackgroundModeDeps pattern)
- Formatter injected as structural type (duck typing) to avoid presentation-layer import in application service
- Ambient context runs after memory file sync, before embedding pass in sync command
- Non-fatal ambient context: errors caught and logged to stderr, never fail overall sync
- Lazy dynamic imports for all ambient context dependencies (zero startup overhead when disabled)

- service.list() uses findAll with status='open' when tool/category/sourceProject filter is specified (findOpen has no filter params)
- markReviewed called after list display so user sees NEW indicators before they are cleared
- byCategory iteration in dashboard formatter made fully dynamic via Object.entries (no hardcoded 6-category list)
- Pre-loop migration: friction_log migration runs before SCHEMA_SQL loop to avoid CREATE INDEX on missing tool column
- Tool defaults to 'memory' at service level (the tool itself is the default friction source)
- loggedAt parameter on LogFrictionParams enables backdated entries from fallback file ingest
- Auto-ingest maps project->sourceProject and date->loggedAt with T00:00:00Z suffix for UTC parsing
- File delete failure after auto-ingest is non-fatal (entries already saved to DB)
- COMMON_CATEGORIES as documentation-only export replacing enforced VALID_CATEGORIES array
- Category CHECK constraint removed at both domain (type = string) and infrastructure (SQL) levels
- Dynamic byCategory in getStats replaces hardcoded 6-key Record (presentation handles display)
- findPatterns two-pass query: GROUP BY for threshold, then full SELECT per group for entries

- Inserted Phase 29.1: Test Determinism and Environment Isolation (urgent) (2026-03-22)
- mock.module before browse import to intercept all four dispatch targets (show, search, context, related)
- Browse dispatch tests assert correct function + args, not just that picker ran

### Context for Next Session

1. **v3.0 shipped** -- all 9 phases complete, UAT passed for Phase 29 (ambient context)
2. **friction purge command added** -- `memory friction purge "pattern" --force` for bulk cleanup
3. **ambient context skip message fixed** -- sync now logs "skipped (reason)" instead of silence
4. **bun link install** -- v2.0.0 installed globally via bun link (symlink to source, not npm publish)
5. Pre-existing issues: error-codes.test.ts count assertion stale (expects 19, has 21)
6. Pre-existing issue: smart-context-service.test.ts "daily logs filtered" test is time-sensitive
7. **God file review scheduled** -- calendar event 2026-04-06 for sync.ts (928 lines) and friction.ts (638 lines)
8. Ready for `/gsd:new-milestone` to plan v4.0

---

*Last updated: 2026-04-02 (v3.0 milestone shipped, Phase 18 directories consolidated)*
