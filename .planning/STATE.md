# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v2.0 Hybrid Search and Rebrand -- package rename, embedding infrastructure, hybrid search, API stabilization.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node

## Current Position

**Milestone:** v2.0 Hybrid Search and Rebrand
**Phase:** 13 (Package Rename) -- Plan 01 complete, Plan 02 next
**Status:** Executing phase 13

```
v2.0 Progress: [....................] 0/6 phases
  Phase 13: Package Rename          [>] In Progress (Plan 01/03 complete)
  Phase 14: Embedding Infrastructure [ ] Pending
  Phase 15: Embedding Pipeline       [ ] Pending
  Phase 16: Hybrid Search            [ ] Pending
  Phase 17: Provider Ecosystem       [ ] Pending
  Phase 18: API Stabilization        [ ] Pending
```

## Performance Metrics

**v1.0 (shipped):**
- 12 phases, 56 plans, 85 requirements
- ~1,966 tests, 95.67% line coverage, 94.49% function coverage
- 85.46% mutation score (domain layer)
- 49,764 LOC (17,073 source + 32,691 tests)

**v2.0 (target):**
- 6 phases, ~17-23 estimated plans, 35 phase-mapped + 4 cross-cutting requirements
- 95%+ coverage at EACH metric for all new code
- Zero domain layer external dependencies maintained

**v2.0 (actual):**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13-01 | Centralized paths + migration | 14min | 2 | 18 |

## Accumulated Context

### Key Technical Decisions (v2.0)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding runtime | Transformers.js v3 | Stable; v4 preview-only; migrate when stable |
| Vector storage | sqlite-vec (brute-force) | <75ms at 200K messages; ANN unnecessary at scale |
| Default model | all-MiniLM-L6-v2 (384d, 23MB) | Fastest, smallest; hybrid search compensates quality |
| Scoring fusion | Reciprocal Rank Fusion (k=60) | BM25 and cosine on incompatible scales; RRF uses ranks |
| Provider architecture | IEmbeddingProvider port | Domain-layer port; pluggable adapters in infrastructure |
| ONNX loading | Lazy (dynamic import) | Only loads when semantic search actually invoked |
| WASM fallback | Automatic on native failure | Transparent to user; 2-5x slower but always works |
| aidev integration | Option E (npm dependency) | memory as dependency in aidev TS CLI; discover surface before committing to merge |
| Package name | @chude/memory, binary: memory | Matches aidev subcommand; memory-nexus deprecated |
| XDG paths | ~/.config/memory (config), ~/.local/share/memory (data) | XDG Base Directory Specification compliance |
| Migration hook re-install | Non-fatal (logged, data migration still succeeds) | Data integrity prioritized over hook state |

### Research Completed

- .planning/research/SEMANTIC-SEARCH.md -- Embedding models, sqlite-vec, hybrid search architecture, Bun compatibility
- .planning/research/AIDEV-INTEGRATION.md -- Integration options evaluated, Option E selected

### Open Questions

None blocking. All technical questions resolved during research phase.

### Blockers

None.

## Session Continuity

### Last Session

**Date:** 2026-02-22
**Completed:** Phase 13 Plan 01 -- centralized paths module and legacy migration with infrastructure rewiring
**Stopped at:** Completed 13-01-PLAN.md

### Context for Next Session

1. Phase 13 Plan 01 complete: paths.ts, migration.ts, all infrastructure rewired
2. Next: Phase 13 Plan 02 (package.json rename, binary name, output text)
3. All tests pass: 2061 tests, zero regressions
4. New XDG paths: ~/.config/memory (config), ~/.local/share/memory (data)
5. Migration module ready but not yet integrated into CLI startup flow

---

*Last updated: 2026-02-22 (Phase 13 Plan 01 complete)*
