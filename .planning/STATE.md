# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v4.0 Intelligence Layer -- knowledge extraction, CLI surface, context intelligence, portability, publishing.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

**Milestone:** v4.0 Intelligence Layer
**Phase:** 30 of 37 (God File Cleanup)
**Status:** Ready to plan

```
v4.0 Progress: [________________________] 0/8 phases complete
  Phase 30: God File Cleanup                [ ] Not started
  Phase 31: Bug Fixes                       [ ] Not started
  Phase 32: CLI Surface                     [ ] Not started
  Phase 33: Knowledge Extraction Foundation [ ] Not started
  Phase 34: Extraction Pipeline             [ ] Not started
  Phase 35: Context Intelligence            [ ] Not started
  Phase 36: Portability                     [ ] Not started
  Phase 37: Publishing                      [ ] Not started
```

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

### Blockers/Concerns

- sync.ts (928 lines) and friction.ts (638 lines) need SRP split before extraction work
- 5 open friction entries (#14, #15, #137, #146, #163)
- bun link install active (symlink to source, not npm published yet)

## Session Continuity

### Last Session

**Date:** 2026-04-03
**Completed:** v4.0 roadmap created (8 phases, 25 requirements mapped)
**Next step:** `/gsd:plan-phase 30` (God File Cleanup)

---

*Last updated: 2026-04-03 (v4.0 roadmap created)*
