---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Intelligence Layer
status: in_progress
last_updated: "2026-05-14T00:00:00.000Z"
progress:
  total_phases: 9
  completed_phases: 2
  total_plans: 6
  completed_plans: 5
---

# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Architecture first-principles audit LOCKED 2026-05-13. Recommendation: **A-prime** (hybrid; continue v4.0 with NEW Phase 32.5 + event-log SSOT architectural enforcement + supersedence-as-event-type + plain-text canonical for new typed memory + prerelease publishing with GA gated on acceptance criteria). Audit doc at `docs/audits/2026-05-11-architecture-first-principles-audit.md`. **Next action: Phase 31 (existing bug-fixes) is complete; v4.0 resumes at Phase 32.** Inbox item status: `merged` (archived).

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: 31 (bug-fixes) — COMPLETE
Test-isolation cleanup arc — COMPLETE (2026-05-11, gate at 0 violations)
Architecture first-principles audit — COMPLETE (LOCKED 2026-05-13, recommendation A-prime)
**Milestone:** v4.0 Intelligence Layer — resumed 2026-05-14 at 2/9 phases done (Phase 32.5 added per audit)
**Status:** v4.0 resumes at Phase 32. Phase 33 carries event-log SSOT architectural enforcement; Phase 37 GA gated on §21 acceptance criteria per audit recommendation.

```
v4.0 Progress: [####________________________] 2/9 phases complete
  Phase 30:   God File Cleanup                [done]
  Phase 31:   Bug Fixes                       [done] (31-01 + 31-02)
  Phase 32:   CLI Surface                     [ ] Not started
  Phase 32.5: Surface Consolidation (NEW)     [ ] Not started — per audit A-prime
  Phase 33:   Knowledge Extraction Foundation [ ] Not started — event-log SSOT requirement
  Phase 34:   Extraction Pipeline             [ ] Not started — supersedence-as-event-type
  Phase 35:   Context Intelligence            [ ] Not started — T7 plain-text canonical
  Phase 36:   Portability                     [ ] Not started
  Phase 37:   Publishing                      [ ] Not started — prerelease OK; GA-gated
```

## Out-of-roadmap: Test Isolation Cleanup (2026-05-08 → 2026-05-11) — CLOSED

41 → 0 test failures, 28 → 0 gate violations across two arcs (18 atomic commits). Established the deps-parameter pattern as canonical seam for CLI commands and infrastructure; env-var pattern (XDG + new `MEMORY_HOME`) for paths.ts. Latest closing commit: 3ac29dc (concurrent-commands + interrupted-sync migration).

**CI gate:** `bun run test:isolation` (script: `scripts/check-test-isolation.ts`) — PASS at 0 violations.

**Pre-existing issues surfaced during verification (filed to inbox, NOT arc-scoped):**
- `docs/inbox/2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md`
- `docs/inbox/2026-05-11-memory-nexus-friction-test-phase-30-orphan.md`
- `docs/inbox/2026-05-11-memory-nexus-bun-windows-full-suite-crash.md`

## Out-of-roadmap: Architecture First-Principles Audit (2026-05-11 → 2026-05-13) — COMPLETE

**Locked:** 2026-05-13.
- Audit doc: `docs/audits/2026-05-11-architecture-first-principles-audit.md` (LOCKED)
- Both codex reviews integrated (§13 review #1, §20 review #2). Both BLOCK verdicts, all 20 findings addressed.
- Source inbox item: `docs/inbox/archived/2026-05-08-conversations-first-principles-architecture-audit.md` (status: merged)
- Counter-notification filed in conversations inbox: `~/Projects/conversations/docs/inbox/2026-05-13-memory-nexus-first-principles-architecture-audit-merged.md` (uncommitted; conversations session will handle)

**Recommendation: A-prime.** Continue v4.0 with: NEW Phase 32.5 (surface consolidation) + Phase 33 event-log SSOT requirement + supersedence-as-event-type in Phase 34 + T7 plain-text canonical in Phase 35 + prerelease publishing with GA-gated on acceptance criteria.

**8 gaps identified.** 3 HIGH+ severity (G1 typed kinds, G2 context-recall wiring, G3 supersedence CRITICAL). All map to v4.0 phases. Closeability inside v4.0 confirmed.

**B (federation) deferred re-evaluation post-Phase-35**, not preemptively rejected. Recommend adding deferred reminder when Phase 35 acceptance criteria pass.

**Stage 1a output files (kept as reference for Phase 33-35 PLAN.md):**
- `docs/audits/2026-05-11-subagent-A-friction-surface.md`
- `docs/audits/2026-05-11-subagent-B-search-surface.md`
- `docs/audits/2026-05-11-subagent-C-sync-surface.md`
- `docs/audits/2026-05-11-subagent-D-admin-surface.md`
- `docs/audits/2026-05-11-architecture-evidence-map.md`
- `docs/audits/2026-05-11-system-A-mem0.md` (Mem0)
- `docs/audits/2026-05-11-system-B-openclaw.md` (OpenClaw)
- `docs/audits/2026-05-11-system-C-hermes.md` (Hermes Agent)
- `docs/audits/2026-05-11-system-D-mempalace.md` (MemPalace)

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

### Last Session — 2026-05-13 → 2026-05-14

**Completed:**
- 4 inbox items triaged (bun-windows-crash, friction-test-phase-30-orphan, programmatic-api-real-db-pollution, friction-list-durable-filter). Item 1 workaround documented in README. Items 2-4 deferred with concrete trigger = audit Stage 3 outcome in {A, B, C, D}; A-prime is in scope.
- Architecture audit Stage 0 → Stage 3 completed: 4 parallel subagents (Stage 1a), architecture-evidence map (Stage 1b), 4 adjacent-system summaries (Stage 2), refined truths + comparison matrix + gap analysis + recommendation (Stage 3).
- Both codex audit-cap reviews consumed. #1 (audit plan) BLOCK 8 findings integrated. #2 (recommendation) BLOCK 12 findings integrated. §19 rewritten to A-prime per codex review #2.
- Audit inbox item closed (status: merged, archived). Counter-notification filed in conversations inbox.
- ROADMAP.md updated to insert Phase 32.5 (NEW per audit A-prime) and architectural enforcement notes for Phase 33-37.
- STATE.md updated to release audit pause; total phases now 9 (was 8).

**Next step:**
- v4.0 resumes at Phase 32 (CLI Surface). Phase 31 already complete.
- When Phase 32 plans, scope stays as labeled help groups + uniform flags. Surface consolidation moves to NEW Phase 32.5.
- Phase 33 PLAN.md must encode event-log SSOT requirement per audit §19 item 4 and §21 acceptance gates.

**Cross-project follow-up (uncommitted):**
- Counter-notification file in conversations inbox needs commit/push from a conversations session.
- Conversations memory architecture inventory should be updated to note A-prime landing (deferred B-revaluation path).

---

*Last updated: 2026-05-14 (architecture audit LOCKED at A-prime; v4.0 resumed; Phase 32.5 added)*
