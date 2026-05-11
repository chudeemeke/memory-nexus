---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Intelligence Layer
status: gated_on_audit
last_updated: "2026-05-11T00:00:00.000Z"
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

**Current Focus:** Architecture first-principles audit IN PROGRESS. Phase-level plan revised after codex review #1 (verdict was BLOCK; 8 findings integrated) — see `docs/audits/2026-05-11-architecture-first-principles-audit.md` PART I §3-12. **Next action: Stage 0 (derive provisional irreducible truths into §16.0) — gates Stage 1 subagent spawn.** Durable plan: `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md` (status: in-progress). v4.0 Phase 32-37 work paused. Inbox item `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md` status: `in-progress`.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: 31 (bug-fixes) — COMPLETE
Test-isolation cleanup arc — COMPLETE (2026-05-11, gate at 0 violations)
**Milestone:** v4.0 Intelligence Layer — paused at 2/8 phases done, gated on architecture audit
**Status:** Architecture audit scheduled. Hard schedule gates: audit MUST land before Phase 33 (Knowledge Extraction Foundation) and before Phase 37 (Publishing). See audit plan at `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`.

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

## Out-of-roadmap: Test Isolation Cleanup (2026-05-08 → 2026-05-11) — CLOSED

41 → 0 test failures, 28 → 0 gate violations across two arcs (18 atomic commits). Established the deps-parameter pattern as canonical seam for CLI commands and infrastructure; env-var pattern (XDG + new `MEMORY_HOME`) for paths.ts. Latest closing commit: 3ac29dc (concurrent-commands + interrupted-sync migration).

**CI gate:** `bun run test:isolation` (script: `scripts/check-test-isolation.ts`) — PASS at 0 violations.

**Pre-existing issues surfaced during verification (filed to inbox, NOT arc-scoped):**
- `docs/inbox/2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md`
- `docs/inbox/2026-05-11-memory-nexus-friction-test-phase-30-orphan.md`
- `docs/inbox/2026-05-11-memory-nexus-bun-windows-full-suite-crash.md`

## Out-of-roadmap: Architecture First-Principles Audit (2026-05-11) — IN PROGRESS

**Kicked off:** 2026-05-11 (this session).
- Audit doc: `docs/audits/2026-05-11-architecture-first-principles-audit.md` — phase-level plan drafted (PART I, §3-9)
- Durable plan: `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md` — status: in-progress
- Source inbox item: `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md` (triaged → in-progress)
- Codex review #1 of 2: pending (next step this session, gates subagent spawn)

**Hard schedule gates:** audit MUST land before Phase 33 and before Phase 37. Phase 32 is secondary support.

**Five candidate outcomes:** A continue v4.0 / B scope v5 federation / C surgical consolidation / D freeze at v4.0 / E deprecate-or-replace.

Cross-AI review cap: 2 calls (plan + recommendation). Subagent briefs use verbatim user worry + anti-bias + path-claim verification per durable plan §8.

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

### Last Session — 2026-05-11

**Completed:**
- Test-isolation cleanup arc CLOSED: paths.ts migrated to XDG + MEMORY_HOME env-var pattern; helper at `tests/helpers/env-overrides.ts`; 2 collateral integration tests migrated (concurrent-commands + interrupted-sync); 3 pre-existing issues filed to inbox.
- Friction-primacy inbox decision MERGED (Option 1, status quo). Cross-repo doc fix to `~/.claude/rules/tool-friction.md` applied. Counter-notification filed in conversations.
- Architecture-audit inbox item TRIAGED with durable plan at `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`.
- Both inbox triages codex-reviewed (gpt-5.5 high), pushbacks integrated.

**Next step:**
- Kick off the architecture first-principles audit per `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md` §14 (10-step sequence).
- v4.0 Phase 32-37 work paused until audit recommendation lands.

**Per `feedback_validate_with_external_ai.md`:** the audit's own plan AND final recommendation each require ONE codex review (capped at 2 calls total, per codex pushback on the disposition).

---

*Last updated: 2026-05-11 (test-isolation arc closed; both inbox items triaged; architecture audit scheduled as next major work)*
