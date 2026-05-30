---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Intelligence Layer
status: in_progress
last_updated: "2026-05-30T11:35:00.000+01:00"
progress:
  total_phases: 14
  completed_phases: 12
  total_plans: 15
  completed_plans: 13
---

> **FOUNDATION HARDENING VERIFIED 2026-05-28** - Phase 36.8 is implemented. Typecheck, build, full tests, test-isolation, dependency audit, and gitleaks pass. Provider support now routes through an internal provider registry instead of presentation/health/factory switch drift. Phase 36.9 replaced the missing-metric Bun LCOV gate with an Istanbul-backed Bun coverage harness.
> **COVERAGE GATE RESTORED 2026-05-30** - Phase 36.9 is complete. `bun run test:coverage` passes with statements 97.18% (7103/7309), branches 95.00% (4049/4262), functions 96.09% (1303/1356), and lines 97.32% (6805/6992). `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and `gitleaks detect --no-banner --redact --source .` pass.
> **PUBLISH BLOCKER INSERTED 2026-05-30** - Phase 37 audit found active legacy `~/.memory` / `MEMORY_HOME` reads and writes despite Phase 35's deprecated-filesystem claim, plus npm auth E401, placeholder repository metadata, and path leakage in current bundles. Phase 36.10 is inserted before publish to make legacy memory-file behavior explicit opt-in.
> **INBOX RECONCILED 2026-05-28** - Stale bug reports for the Windows full-suite crash, orphaned friction test, and programmatic API real-DB pollution were validated against the current code and archived. The durable-friction-list filing was accepted into ROADMAP as post-v4 capacity, archived as planned, and counter-notified to conversations. No active memory-nexus inbox items remain.
> **REMOTE CONSUMER NOTES REVIEWED 2026-05-30** - The two remotely consumer-impact inbox notes were reviewed against current memory-nexus docs/scripts. No current raw SSH/rsync operating instructions or hard-coded remotely tunnel-state assumptions were found, so both notes were archived with disposition text. Future Phase 38 cross-machine work must still use current `remotely` conventions where applicable.
> **FIRST-PARTY INFRASTRUCTURE BROADCAST 2026-05-28** - User clarified that `memory` is a first-class first-party tool used by most/all projects. Canonical tool/package naming is `memory` / `@chude/memory`; the repository remains `memory-nexus`, and `nexus` is a legacy alias. Updated Codex/Claude rules and document-for-clear skills, added a Codex memory note, and filed notification inbox items to opted-in projects so consumers know about provider-secret, redaction/export, registry, and authkey-optional contract changes.
# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** 2026-05-27 foundation reviews supersede any publish-ready assumption. Phase 36.8 (Secret Boundary and Optional Provider Interop) and Phase 36.9 (Coverage Runner Migration) are implemented and verified. Relevant docs: `docs/audits/2026-05-27-v4-foundation-architecture-security-quality-review.md`, `docs/audits/2026-05-27-remote-sync-architecture-security-quality-review.md`, `docs/plans/2026-05-27-authkey-optional-integration.md`, `.planning/phases/36.8-secret-boundary-optional-provider-interop/36.8-01-SUMMARY.md`, and `.planning/phases/36.9-coverage-runner-migration/36.9-01-SUMMARY.md`.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: 36.10 (Legacy Memory File Publish Hardening) - IN PROGRESS
Test-isolation cleanup arc - RESTORED as of 2026-05-27 (`bun run test:isolation` passes)
Architecture first-principles audit — COMPLETE (LOCKED 2026-05-13, recommendation A-prime)
**Milestone:** v4.0 Intelligence Layer - foundation hardening inserted before publish
**Status:** v4.0 cannot publish yet. Phase 36.8 removed the immediate secret-boundary blockers and Phase 36.9 restored the honest four-metric coverage gate, but Phase 37 audit found default legacy memory-file reads/writes that contradict the Phase 35 storage claim. Phase 36.10 must make `~/.memory` / `MEMORY_HOME` behavior explicit opt-in before packaging/publish execution resumes.

```
v4.0 Progress: [########################____] 12/14 phases complete
  Phase 30:   God File Cleanup                [done]
  Phase 31:   Bug Fixes                       [done] (31-01 + 31-02)
  Phase 32:   CLI Surface                     [done]
  Phase 32.5: Surface Consolidation (NEW)     [done] — per audit A-prime
  Phase 33:   Knowledge Extraction Foundation [done] — event-log SSOT requirement
  Phase 34:   Extraction Pipeline             [done] — supersedence-as-event-type
  Phase 35:   Context Intelligence            [done] — T7 plain-text canonical
  Phase 36:   Portability                     [done] — WSL migration + doctor portability
  Phase 36.8: Secret Boundary + Optional Interop [done] - redaction + env/ref secrets + optional authkey run path
  Phase 36.9: Coverage Runner Migration       [done] - honest four-metric gate restored and verified
  Phase 36.10: Legacy Memory File Hardening   [~] In progress - publish blocker inserted
  Phase 37:   Publishing                      [ ] Not started - blocked until Phase 36.10 and npm auth/packaging gates pass
```

## Out-of-roadmap: Test Isolation Cleanup (2026-05-08 → 2026-05-11) — CLOSED

41 → 0 test failures, 28 → 0 gate violations across two arcs (18 atomic commits). Established the deps-parameter pattern as canonical seam for CLI commands and infrastructure; env-var pattern (XDG + new `MEMORY_HOME`) for paths.ts. Latest closing commit: 3ac29dc (concurrent-commands + interrupted-sync migration).

**Historical CI gate:** `bun run test:isolation` passed at closure. **Current 2026-05-27 truth:** gate passes again after replacing first-party remote-sync module mocks with dependency injection.

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
- Release gates restored as of 2026-05-27: `bun test --timeout 15000`, `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and `gitleaks detect --no-banner --redact --source .` pass.
- Secret boundary hardening is implemented for new sync persistence, extraction payloads, embedding payloads, CLI export, health readiness, and status JSON config output.
- Optional authkey interop is documented in `docs/plans/2026-05-27-authkey-optional-integration.md`; authkey must remain optional and must not be used as a raw secret resolver.
- Phase 38 remote-sync prototype code exists in the tree but is parked behind `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1`. The public CLI does not register `memory remote` and `memory sync` will not push/pull remote event logs unless that explicit prototype flag is set. It remains non-release-ready until the Phase 38 threat model, event envelope, conflict semantics, redaction/privacy controls, and application-port architecture are implemented.
- Residual release-quality gap: Phase 36.10 must remove default legacy `~/.memory` / `MEMORY_HOME` reads/writes before publish. Publishing also requires Phase 37 packaging/install verification, npm authentication, and release execution.

## Session Continuity

### Current Resume Point - 2026-05-30

**Completed this review/update pass:**
- Added `docs/audits/2026-05-27-v4-foundation-architecture-security-quality-review.md` with the conclusion that v4 is not publication-grade until foundation hardening lands.
- Added `docs/audits/2026-05-27-remote-sync-architecture-security-quality-review.md` with the conclusion that dirty remote-sync work must not ship as-is.
- Added `docs/plans/2026-05-27-authkey-optional-integration.md` to capture optional authkey interop without hard dependency.
- Updated `.planning/ROADMAP.md` with Phase 36.8 and Phase 38.5.
- Added an ad-hoc memory note at `C:\Users\Destiny\.codex\memories\extensions\ad_hoc\notes\2026-05-27T20-00-16-authkey-memory-nexus-optional-integration.md` so the docs/plans artifact is not forgotten.
- Completed Phase 36.8 implementation: restored release gates, removed masked build/type failures, restored test isolation, added redaction, added env/ref provider secret handling, sanitized status JSON, made export redacted by default, documented optional authkey run usage, and verified with full gates.
- Completed Phase 36.9 implementation and remediation: `bun run test:coverage` now passes the honest four-metric gate with statements 97.18%, branches 95.00%, functions 96.09%, and lines 97.32%. Supporting gates passed: `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and `gitleaks detect --no-banner --redact --source .`.
- Refreshed `ROADMAP.md` and `REQUIREMENTS.md` so completed v4 phases and the Phase 36.9 gate no longer show stale pending/in-progress statuses.
- Reviewed and archived the two remotely consumer-impact inbox notes; current active inbox contains only `README.md` plus archived/rejected folders.
- Began Phase 37 audit and inserted Phase 36.10 because current source still indexes `~/.memory` during `memory sync` and writes `MEMORY_HOME` daily logs during `memory backfill` by default. Additional publish blockers found: npm auth E401, package not visible to unauthenticated `npm view`, placeholder repository URL, and absolute local path leakage in current bundles.

**Next step:**
- Execute Phase 36.10. Do not publish until legacy memory-file behavior is default-off and verified, then resume Phase 37 packaging/install/auth verification.
- Current inbox truth: zero active memory-nexus inbox items; only `docs/inbox/README.md` remains outside `docs/inbox/archived/` and `docs/inbox/rejected/`.
- Cross-project notification filed at `C:\Projects\conversations\docs\inbox\2026-05-28-memory-nexus-friction-list-durable-filters-roadmapped.md`.
- First-party infrastructure broadcast filed to opted-in project inboxes: ai-dev-environment, authkey, conversations, docTruth, ez-deploy, get-stuff-done, klakson, later, medesine-rx, prompter, tailscale, and watchtower. Frontmatter lint passed via `node C:\Projects\conversations\scripts\inbox-lint.cjs <files>`.
- Latest verification after coverage-runner migration: `bun run test:coverage` runs 4,050 tests successfully and passes the honest coverage gate at statements 97.18%, branches 95.00%, functions 96.09%, and lines 97.32%. `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and gitleaks pass.

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

*Last updated: 2026-05-30 (Phase 36.10 inserted after publish audit; Phase 37 blocked until legacy memory-file defaults are hardened)*
