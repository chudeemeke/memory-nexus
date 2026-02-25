# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v2.0 Hybrid Search and Rebrand -- package rename, embedding infrastructure, hybrid search, API stabilization.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node

## Current Position

**Milestone:** v2.0 Hybrid Search and Rebrand
**Phase:** 13 (Package Rename) -- COMPLETE (all 3 plans done)
**Status:** Phase 13 complete, ready for Phase 14

```
v2.0 Progress: [###.................] 1/6 phases
  Phase 13: Package Rename          [x] Complete (3/3 plans)
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
| 13-02 | Internal identity rename + user-facing strings | 25min | 2 | 36 |
| 13-03 | Deprecation stub, migration docs, CLAUDE.md updates | 6min | 2 | 11 |

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
| Dual marker hook detection | MEMORY_MARKER + LEGACY_MARKER | Backward compatible detection of old hooks during rename transition |
| Dynamic error paths | getLogDir() in SYNC_FAILED suggestion | User-facing paths always resolve correctly regardless of XDG config |
| Deprecation stub version | 0.2.0 (not matching main 2.0.0) | Stub is static signpost; its own version history is independent |
| Stale hook detection | warnStaleHookReferences() in install | Warns users if old memory-nexus hooks persist in settings.json |

### Research Completed

- .planning/research/SEMANTIC-SEARCH.md -- Embedding models, sqlite-vec, hybrid search architecture, Bun compatibility
- .planning/research/AIDEV-INTEGRATION.md -- Integration options evaluated, Option E selected

### Open Questions

None blocking. All technical questions resolved during research phase.

### Blockers

None.

## Session Continuity

### Last Session

**Date:** 2026-02-25
**Completed:** Phase 13 Plan 03 -- deprecation stub, migration docs, CLAUDE.md updates (Phase 13 COMPLETE)
**Stopped at:** Completed 13-03-PLAN.md

### Context for Next Session

1. Phase 13 (Package Rename) complete: all 3 plans done
2. Next: Phase 14 (Embedding Infrastructure)
3. All tests pass: 2064 pass, 0 fail
4. Package identity: @chude/memory v2.0.0, binary: memory
5. Deprecation stub at deprecation-stub/ ready for independent npm publish
6. MIGRATION.md, README.md, CLAUDE.md all updated to @chude/memory identity
7. External WoW rules file renamed: ~/.claude/rules/memory.md (was memory-nexus.md)
8. Install command now detects and warns about stale memory-nexus hook references

---

*Last updated: 2026-02-25 (Phase 13 complete)*
