---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Intelligence Layer
status: executing
last_updated: "2026-05-08T22:00:00.000Z"
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 6
  completed_plans: 5
---

# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Out-of-roadmap test-isolation cleanup paused at Stage 13/14 (paths.ts remains). Resume v4.0 Phase 32 (CLI Surface) once paths.ts done OR triaged.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: 31 (bug-fixes) — COMPLETE
**Milestone:** v4.0 Intelligence Layer
**Status:** Out-of-roadmap test-isolation cleanup PAUSED at Stage 13/14. paths.ts migration is the last blocker. See `~/.claude/projects/<encoded>/memory/test_isolation_cleanup.md` for full arc and design options.

```
v4.0 Progress: [######__________________] 2/8 phases complete
  Phase 30: God File Cleanup                [done]
  Phase 31: Bug Fixes                       [done] (31-01 + 31-02)
  Phase 32: CLI Surface                     [ ] Not started
  Phase 33: Knowledge Extraction Foundation [ ] Not started
  Phase 34: Extraction Pipeline             [ ] Not started
  Phase 35: Context Intelligence            [ ] Not started
  Phase 36: Portability                     [ ] Not started
  Phase 37: Publishing                      [ ] Not started
```

## Out-of-roadmap: Test Isolation Cleanup (2026-05-08)

41 → 0 test failures, 28 → 3 gate violations across 13 atomic commits. Established the deps-parameter pattern as canonical seam for testable production code. Latest commit: c8838c3 (settings-manager).

**Remaining:** paths.ts migration (3 violations: `let testOverrides`, `setTestPaths`, `resetTestPaths`). 67 production call sites. See test_isolation_cleanup.md for design options A/B/C.

**CI gate:** `bun run test:isolation` (script: `scripts/check-test-isolation.ts`).

## Milestone History

**v1.0 (shipped 2026-02-16):** 12 phases, 56 plans, full CLI with sync, search, context, hooks
**v2.0 (shipped 2026-03-01):** 10 phases (13-22), package rename, hybrid search (FTS5 + sqlite-vec), embedding providers, API stabilization
**v3.0 (shipped 2026-04-02):** 9 phases (23-29.1), agent-written memory, smart context, friction system, backfill, qmd, ambient context, test determinism

## Performance Metrics

**v3.0 final:**

- 9 phases, 26 plans
- All tests passing (0 failures after Phase 29.1 determinism fixes)

## Accumulated Context

### Decisions

- LLM-powered extraction is non-negotiable (Mem0/Zep research confirms heuristic-only is unusable)
- Mem0's ADD/UPDATE/DELETE/NOOP model adopted for fact consolidation
- Zep's temporal superseding adopted in simplified form (observed_at, superseded_at)
- IExtractionProvider follows IEmbeddingProvider pattern (pluggable adapters)
- CLI help groups via Commander.js labeled categories (no command renames)
- SmartContextService reads from SQLite fact tables, not ~/.memory/ files
- ~/.memory/ directory deprecated (knowledge goes in SQLite)
- [Phase 30]: Compressed JSDoc and consolidated imports to keep all sync modules under 200 lines
- [Phase 30]: Compressed JSDoc and consolidated imports to keep friction/index.ts under 200-line cap
- [Phase 31-bug-fixes]: Blacklist regex approach for FTS5 fallback (preserves symbols like C++, TCP/IP)
- [Phase 31-bug-fixes]: maxTotal tracking for download progress bar to defer display until non-zero total
- [Phase 31-02]: text-width utility (string-width lib); truncateForTerminal derives prefix width from string, not magic number
- [Test isolation cleanup, 2026-05-08]: deps parameter is canonical seam (not options.dbPath). options = user input; deps = operational deps.
- [Test isolation cleanup]: codex (gpt-5.5 high) review caught framing errors — codex review IS Stage 0 of any non-trivial architectural plan

### Blockers/Concerns

- sync.ts (928 lines) and friction.ts (638 lines): RESOLVED via Phase 30 SRP splits
- bun link install active (symlink to source, not npm published yet)
- paths.ts is the last test-isolation gate violator (3 of 3 remaining)

## Session Continuity

### Last Session — 2026-05-08

**Completed:**
- Phase 31 (bug-fixes) fully complete: 31-01 + 31-02 (CLI output width-aware via truncateForTerminal)
- 13-stage out-of-roadmap test-isolation cleanup: 41 → 0 failures, 28 → 3 gate violations
- Codex-validated deps-parameter pattern as canonical seam across CLI commands and infrastructure
- Latest commit: c8838c3 (settings-manager migration to PathOverrides)
- Tests: 3096/3096 passing in full src/ suite
- CLI verified working

**Next step (decision needed):**
- (a) Continue test-isolation cleanup: migrate paths.ts (Stage 14, 3 final violations). See test_isolation_cleanup.md "What remains" — 3 design options (A: per-call PathOverrides, B: env-var-based, C: Paths service interface). Recommendation: Option B (env vars) for smallest scope.
- (b) Resume v4.0 roadmap: `/gsd:plan-phase 32` (CLI Surface).

**Per `feedback_validate_with_external_ai.md`:** if going option (a) with Option C scope, run plan past codex first.

---

*Last updated: 2026-05-08 (test isolation cleanup, paths.ts deferred)*
