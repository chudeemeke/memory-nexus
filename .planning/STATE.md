---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Market-Leader Memory Platform
status: in_progress
last_updated: "2026-06-07T02:31:42.118+01:00"
progress:
  total_phases: 16
  completed_phases: 10
  total_plans: 10
  completed_plans: 10
---

> **FOUNDATION HARDENING VERIFIED 2026-05-28** - Phase 36.8 is implemented. Typecheck, build, full tests, test-isolation, dependency audit, and gitleaks pass. Provider support now routes through an internal provider registry instead of presentation/health/factory switch drift. Phase 36.9 replaced the missing-metric Bun LCOV gate with an Istanbul-backed Bun coverage harness.
> **COVERAGE GATE RESTORED 2026-05-30** - Phase 36.9 is complete. `bun run test:coverage` passes with statements 97.18% (7103/7309), branches 95.00% (4049/4262), functions 96.09% (1303/1356), and lines 97.32% (6805/6992). `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and `gitleaks detect --no-banner --redact --source .` pass.
> **PUBLISH BLOCKER RESOLVED 2026-05-30** - Phase 37 audit found active legacy `~/.memory` / `MEMORY_HOME` reads and writes despite Phase 35's deprecated-filesystem claim, plus npm auth E401, placeholder repository metadata, and path leakage in current bundles. Phase 36.10 made legacy memory-file behavior explicit opt-in before publish, repository metadata was corrected, bundle path leakage was removed, and npm auth was completed before the final publish.
> **LEGACY MEMORY-FILE DEFAULTS HARDENED 2026-05-30** - Phase 36.10 is complete. `memory sync` and `memory backfill` no longer read/write legacy `~/.memory` / `MEMORY_HOME` sidecars by default; compatibility requires explicit CLI/env/config opt-in. Release gates pass with statements 97.18%, branches 95.02%, functions 96.09%, and lines 97.33%. Build output is clean of sourcemaps and local absolute path leakage. Phase 37 was unblocked by npm auth completion and registry publish execution.
> **PHASE 37 LOCAL PUBLISH CHECKS PASS 2026-05-30** - `npm pack --dry-run --json`, isolated tarball install smoke (`memory --version`, `memory --help`, `memory status --json`), and `npm publish --dry-run --access public` passed before real publish. The earlier E401/E404 state is historical only; `@chude/memory@4.0.0` is now visible on npm with `latest` pointing to `4.0.0`.
> **V4.0 PUBLISHED 2026-05-30** - `@chude/memory@4.0.0` is published on npm with `latest` pointing to `4.0.0`. Registry checks, npm global install smoke, and Bun global install smoke passed. Windows Bun creates `memory.exe` under `bun pm bin -g`, not npm-style `memory.cmd`; `bun run verify:published @chude/memory@4.0.0` now encodes this verification.
> **V5 MARKET-LEADER PLAN INSERTED 2026-06-04** - `docs/plans/2026-06-04-v5-market-leader-gsd-plan.md` defines the long-horizon execution framework. ROADMAP now expands v5 into phases 38.0-44, and REQUIREMENTS now includes v5 traceability for event kernel, privacy governance, remote sync, secure capability interop, durable friction, persona, graph, ranking, dreaming, UX completeness, release-candidate handoff, and final sales-readiness gates.
> **V5 PHASE 38.0 COMPLETE 2026-06-05** - v5 PRD, threat model, evaluation baseline, ADRs, Phase 38.1 context, and cross-AI review request were created. ROADMAP now includes required consent/provenance governance, executable eval harness, feature-completeness/UX polish, and release-candidate packaging/publish handoff gates. No source implementation changed in Phase 38.0.
> **V5 PHASE 38.1 COMPLETE 2026-06-05** - Canonical v2 memory event envelopes, v1 fact-record adaptation, structured invalid-line reporting, deterministic projection replay, and the application-layer projection registry are implemented. Existing `appendEvent`, `readEvents`, and `rebuildProjections` compatibility APIs remain available. Remote sync remains gated; privacy enforcement moves next to Phase 38.2.
> **V5 PHASE 38.2 COMPLETE 2026-06-06** - Redaction, secret audit/remediation, provider-egress policy, and privacy preflights are implemented. `memory audit-secrets` scans database/event logs without raw secret output, database remediation rebuilds FTS indexes, event-log remediation quarantines raw logs and writes sanitized replacements, doctor/status report egress readiness, and the experimental remote-sync path blocks Git egress when active event logs still have audit findings. Final gates pass: typecheck, build, full tests (4123 pass, 0 fail), test isolation, coverage statements 97.15%, branches 95.06%, functions 96.26%, lines 97.27%, dependency audit, gitleaks, and diff whitespace. Phase 38.2.5 later completed the consent/provenance governance substrate.
> **V5 PHASE 38.2.5 COMPLETE 2026-06-06** - Consent provenance and memory governance are implemented. Canonical fact events register governance provenance, governance/consent events replay into durable control state, `memory governance` exposes inspect/suppress/unsuppress/invalidate/expire/review/consent grant/revoke controls, and context assembly enforces blocked fact governance. Verification passed: focused governance/event-log/context tests (55 pass, 0 fail), typecheck, schema/completion/help tests, and full suite (4140 pass, 0 fail). Phase 38.3 later completed the remote sync service and Git transport substrate.
> **V5 PHASE 38.3 COMPLETE 2026-06-06** - Remote sync now has an application service and shell-safe Git transport adapter. `RemoteEventSyncService` validates durable machine identity, refs, URLs, explicit local-path consent, privacy preflight, transport orchestration, and projection rebuild. `GitRemoteEventTransport` uses argument-array Git calls with sanitized environment. The experimental sync path now delegates through the application service. Verification passed: focused Phase 38.3 tests (87 pass, 0 fail), typecheck, build, and diff whitespace. Phase 38.4 remote CLI/operations/backup/recovery is next.
> **V5 PHASE 38.4 COMPLETE 2026-06-06** - Remote sync now has a public operations surface. `memory remote` is registered; `memory sync --remote` is the explicit remote-egress command; plain `memory sync` skips configured remotes with an actionable warning. `remote set/remove/status/preflight/doctor` support stable JSON and readiness diagnostics, and `remote backup/restore/rollback` recover config plus event-log content with `--confirm` for mutations and `.git` internals excluded. Verification passed: focused Phase 38.4 tests, full `bun run quality`, coverage statements 97.13%, branches 95.13%, functions 96.09%, lines 97.25%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
> **V5 PHASE 38.5 COMPLETE 2026-06-06** - Secure capability interop is implemented without adding an authkey dependency or a raw-secret resolver. A typed capability-status port and infrastructure capability registry report optional provider availability, masked references, fingerprints, env-injection readiness, and future provider schemes. Provider default secret-env metadata is read from the existing provider registry instead of duplicating provider switches in capability diagnostics. `memory status` and `memory doctor` include capability diagnostics, JSON output masks `embedding.apiKeyRef`, and no resolved executable path or raw secret value is returned. Verification passed: focused provider-registry/capability/health/status/doctor tests (203 pass, 0 fail), full `bun run quality` (4,234 pass, 0 fail), coverage statements 97.14%, branches 95.09%, functions 96.14%, lines 97.26%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
> **V5 PHASE 38.6 COMPLETE 2026-06-06** - Durable friction query contract is implemented. `memory friction list` now exposes stable exact filters for status/severity/category/tool/project, inclusive UTC `--since`, privacy-safe description/context contains filters with redacted fingerprints, count/min threshold semantics, versioned JSON envelopes, and documented exit codes. Query counting is durable and limit-independent; contains filters use parameterized SQL and never echo raw filter strings. Verification passed: full `bun run quality` (4,250 pass, 0 fail), coverage statements 97.17%, branches 95.19%, functions 96.17%, lines 97.29%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
> **V5 PHASE 38.7 COMPLETE 2026-06-07** - The v5 evaluation harness is implemented. `bun run eval:v5` loads sanitized fixtures from `docs/evals/fixtures/v5`, emits a schema-versioned JSON report, covers privacy, leakage, supersedence, sync recovery, friction filters, persona, graph, ranking, and dreaming, and is now part of `bun run quality`. Initial behavior-backed fixtures exercised `PatternRedactor` and `SqliteFrictionRepository`; Phase 39 later promoted the persona fixture to behavior-backed coverage. Remaining later-phase graph/ranking/dreaming and adjacent contract fixtures still block `eval:v5:market`, so Phase 43 cannot confuse planned behavior with shipped behavior. Verification passed: focused eval tests, `bun run eval:v5`, `bun run typecheck`, and full `bun run quality` (4,254 pass, 0 fail).
> **V5 PHASE 39 COMPLETE 2026-06-07** - Persona and procedural memory is implemented as a governed derived surface. `PersonaEntry`, `IPersonaRepository`, `persona_entries`, `PersonaProfileService`, fact-event persona projection, `memory profile show/export/rebuild`, completion/help updates, and `memory context` persona injection are live. Persona entries include source ids/kinds, confidence, scope, review metadata, why text, and user controls; governance suppression is enforced before context/profile output. The `repeated_correction_to_persona` eval fixture is now behavior-backed through the real service. Verification passed: focused Phase 39 tests, `bun run typecheck`, `bun run eval:v5` (9/9; 3 behavior, 6 contract), full `bun run quality` (4,281 pass, 0 fail), coverage statements 97.2%, branches 95.19%, functions 96.19%, lines 97.31%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
> **INBOX RECONCILED 2026-05-28** - Stale bug reports for the Windows full-suite crash, orphaned friction test, and programmatic API real-DB pollution were validated against the current code and archived. The durable-friction-list filing was accepted into ROADMAP as post-v4 capacity, archived as planned, and counter-notified to conversations. No active memory-nexus inbox items remain.
> **REMOTE CONSUMER NOTES REVIEWED 2026-05-30** - The two remotely consumer-impact inbox notes were reviewed against current memory-nexus docs/scripts. No current raw SSH/rsync operating instructions or hard-coded remotely tunnel-state assumptions were found, so both notes were archived with disposition text. Future Phase 38 cross-machine work must still use current `remotely` conventions where applicable.
> **FIRST-PARTY INFRASTRUCTURE BROADCAST 2026-05-28** - User clarified that `memory` is a first-class first-party tool used by most/all projects. Canonical tool/package naming is `memory` / `@chude/memory`; the repository remains `memory-nexus`, and `nexus` is a legacy alias. Updated Codex/Claude rules and document-for-clear skills, added a Codex memory note, and filed notification inbox items to opted-in projects so consumers know about provider-secret, redaction/export, registry, and authkey-optional contract changes.
# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v5.0 market-leader execution is active. Phase 39 is complete; next is Phase 40 Temporal Semantic Graph. Relevant docs: `docs/prd/2026-06-05-v5-market-leader-memory-platform.md`, `docs/security/2026-06-05-v5-threat-model.md`, `docs/evals/2026-06-05-v5-evaluation-baseline.md`, `docs/evals/v5-evaluation-harness.md`, `docs/reviews/2026-06-05-v5-plan-review-request.md`, `docs/plans/2026-06-04-v5-market-leader-gsd-plan.md`, `docs/reference/friction-query-contract.md`, `docs/operations/remote-sync-runbook.md`, `.planning/phases/38.2.5-consent-provenance-governance/README.md`, `.planning/phases/38.3-remote-sync-service-git-transport/README.md`, `.planning/phases/38.4-remote-cli-operations-backup-recovery/README.md`, `.planning/phases/38.5-secure-capability-interop/README.md`, `.planning/phases/38.6-durable-friction-query-contract/README.md`, `.planning/phases/38.7-evaluation-harness-regression-fixtures/README.md`, `.planning/phases/39-persona-procedural-memory/README.md`, and `.planning/ROADMAP.md`.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: v5.0 ACTIVE - PHASE 40 NEXT
**Milestone:** v5.0 Market-Leader Memory Platform
**Status:** Phase 39 is complete. Phase 40 must implement temporal semantic graph extraction/projection/retrieval through governed derived memory paths and promote graph/supersedence/cross-project eval fixtures from contract-only where applicable.

```
v5.0 Progress: [##########------] 10/16 phases complete
  Phase 38.0: v5 Threat Model, PRD, Eval Baseline [done]
  Phase 38.1: Canonical Event Kernel and Projection Replay [done]
  Phase 38.2: Redaction, Privacy Governance, Audit Commands [done]
  Phase 38.2.5: Consent Provenance and Memory Governance [done]
  Phase 38.3: Remote Sync Service and Git Transport [done]
  Phase 38.4: Remote CLI, Operations, Backup, Recovery [done]
  Phase 38.5: Secure Capability Interop [done]
  Phase 38.6: Durable Friction Query Contract [done]
  Phase 38.7: Evaluation Harness and Regression Fixtures [done]
  Phase 39: Persona and Procedural Memory [done]
  Phase 40: Temporal Semantic Graph [planned]
  Phase 41: Importance, Utility, Recall Ranking [planned]
  Phase 42: Dreaming Consolidation [planned]
  Phase 42.5: Feature Completeness and UX Polish [planned]
  Phase 43: Market-Leader and Sales-Readiness Gate [planned]
  Phase 44: Release-Candidate Packaging and Publish Handoff [planned]
```

## v4.0 Published Baseline

Phase: v4.0 COMPLETE - PUBLISHED
Test-isolation cleanup arc - RESTORED as of 2026-05-27 (`bun run test:isolation` passes)
Architecture first-principles audit — COMPLETE (LOCKED 2026-05-13, recommendation A-prime)
**Milestone:** v4.0 Intelligence Layer - published 2026-05-30 as `@chude/memory@4.0.0`
**Status:** v4.0 is complete and published. Phase 36.8 removed the immediate secret-boundary blockers, Phase 36.9 restored the honest four-metric coverage gate, Phase 36.10 made legacy `~/.memory` / `MEMORY_HOME` sidecars explicit opt-in, and Phase 37 published and verified `@chude/memory@4.0.0`.

```
v4.0 Progress: [############################] 14/14 phases complete
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
  Phase 36.10: Legacy Memory File Hardening   [done] - legacy sidecars explicit opt-in
  Phase 37:   Publishing                      [done] - @chude/memory@4.0.0 published
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
- SmartContextService reads from SQLite fact tables, not legacy memory files
- Legacy `~/.memory` / `MEMORY_HOME` sidecars are deprecated and explicit opt-in only; v4 default knowledge storage is SQLite/facts
- [Phase 30]: Compressed JSDoc and consolidated imports to keep all sync modules under 200 lines
- [Phase 30]: Compressed JSDoc and consolidated imports to keep friction/index.ts under 200-line cap
- [Phase 31-bug-fixes]: Blacklist regex approach for FTS5 fallback (preserves symbols like C++, TCP/IP)
- [Phase 31-bug-fixes]: maxTotal tracking for download progress bar to defer display until non-zero total
- [Phase 31-02]: text-width utility (string-width lib); truncateForTerminal derives prefix width from string, not magic number
- [Test isolation cleanup, 2026-05-08]: deps parameter is canonical seam (not options.dbPath). options = user input; deps = operational deps.
- [Test isolation cleanup]: codex (gpt-5.5 high) review caught framing errors — codex review IS Stage 0 of any non-trivial architectural plan

### Blockers/Concerns

- sync.ts (928 lines) and friction.ts (638 lines): RESOLVED via Phase 30 SRP splits
- `@chude/memory@4.0.0` is published on npm; local development may still use source checkout/link workflows intentionally.
- Release gates restored as of 2026-05-27: `bun test --timeout 15000`, `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and `gitleaks detect --no-banner --redact --source .` pass.
- Secret boundary hardening is implemented for new sync persistence, extraction payloads/events, active facts used for embedding comparison, embedding payloads, CLI export, hook logs, friction logs, health readiness, status JSON config output, provider egress, and the explicitly gated remote-sync event-log egress preflight.
- Optional authkey interop is documented in `docs/plans/2026-05-27-authkey-optional-integration.md`; authkey must remain optional and must not be used as a raw secret resolver.
- Remote sync is public but remains explicit egress: `memory remote` manages configuration and recovery; `memory sync --remote` pushes/pulls canonical event logs; plain `memory sync` skips configured remotes with an actionable warning. Remote readiness still depends on privacy preflight, durable machine identity, safe URL/ref validation, and user-controlled private remote configuration.
- No active v4.0 release blocker remains. Future work moves to v5.0 Phase 38+.

## Session Continuity

### Current Resume Point - 2026-06-07

**Completed this review/update pass:**
- Promoted v5.0 to the active milestone in `.planning/STATE.md`, then advanced it through Phase 38.1 completion.
- Completed Phase 38.0 foundation artifacts: v5 PRD, threat model, evaluation baseline, ADRs, Phase 38.1 context, cross-AI review request, and Phase 38.0 summary.
- Expanded v5 roadmap from phases 38.0-43 to phases 38.0-44 to include consent/provenance governance, executable eval harness, feature-completeness/UX polish, and release-candidate packaging/publish handoff.
- Captured the user-confirmed feature-preservation invariant: no stated, inferred, documented, prototype, disabled, or partial feature may be removed to make v5 easier to ship.
- Updated requirements traceability so Phase 38.0 completes `V5-PRD-01` and `V5-EVAL-01`; executable eval harness requirements remain mapped to Phase 38.7.
- Completed Phase 38.1 with `MemoryEventEnvelope`, compatibility-preserving v2 event-log append/read/replay APIs, v1 fact-record adaptation, structured invalid-line reports, and `ProjectionRegistry`.
- Completed Phase 38.2 with hardened redaction findings, `memory audit-secrets`, database redaction with FTS rebuild, event-log quarantine, provider egress consent/allowlist enforcement, doctor/status egress reporting, missed log/friction/extraction redaction paths, and experimental remote-sync event-log audit preflight.
- Verified Phase 38.2 final gates: `bun run typecheck`, `bun run build`, `bun test --timeout 15000` (4123 pass, 0 fail), `bun run test:isolation`, `bun run test:coverage` (statements 97.15%, branches 95.06%, functions 96.26%, lines 97.27%), `bun audit`, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
- Kept remote sync disabled outside `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1`; Phase 38.2 added privacy preflight protection but did not make remote sync production-ready or skip the required consent/provenance, remote sync, operations, feature-completeness, or release-readiness phases.
- Updated `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` so `EVT-01` through `EVT-04` are complete without implying later persona/graph/ranking/dreaming projections are done.
- Updated `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` so `SEC-05`, `SEC-06`, `SEC-07`, and `SEC-09` are complete for current active surfaces without implying Phase 38.2.5 governance or Phase 38.3/38.4 remote sync readiness.
- Completed Phase 38.2.5 with consent/provenance governance events, durable governance controls, and context enforcement for blocked facts.
- Completed Phase 38.3 with `RemoteEventSyncService` and shell-safe Git transport behind application ports.
- Completed Phase 38.4 with public `memory remote` operations, explicit `memory sync --remote`, backup/restore/rollback, and remote runbook coverage.
- Completed Phase 38.5 with optional secure capability diagnostics for authkey/future providers without raw secret resolution or hard dependency.
- Completed Phase 38.6 with durable friction query filters, count/min threshold semantics, privacy-safe contains filters, versioned JSON envelopes, documented exit codes, and `docs/reference/friction-query-contract.md`.
- Verified Phase 38.6 final gates: full `bun run quality` (4,250 pass, 0 fail), coverage statements 97.17%, branches 95.19%, functions 96.17%, lines 97.29%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.
- Completed Phase 38.7 with the v5 eval harness, sanitized fixtures, schema-versioned reports, `eval:v5` quality-gate integration, and the stricter `eval:v5:market` gate.
- Completed Phase 39 with governed persona/procedural memory: `PersonaEntry`, `persona_entries`, repository port/adapter, profile compilation service, persona governance registration, fact-event projection, `memory profile show/export/rebuild`, completion/help updates, and context injection with why-included metadata.
- Promoted `repeated_correction_to_persona` from contract-only to behavior-backed by invoking `PersonaProfileService` in the v5 eval harness.
- `eval:v5` currently passes 9/9 fixtures with 3 behavior-backed fixtures and 6 contract fixtures. `eval:v5:market` intentionally fails until Phase 40-42 replace the remaining graph/ranking/dreaming contract fixtures with behavior-backed checks.
- Verified Phase 39 with focused Phase 39 tests, `bun run typecheck`, `bun run eval:v5`, full `bun run quality` (4,281 pass, 0 fail), coverage statements 97.2%, branches 95.19%, functions 96.19%, lines 97.31%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.

**Next step:**
- Execute Phase 40 Temporal Semantic Graph with TDD. The implementation must use canonical events/projections, governance/provenance controls, parameterized persistence, cross-project leakage prevention, and behavior-backed graph eval coverage before completion.

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
- Began Phase 37 audit and inserted Phase 36.10 because current source still indexed `~/.memory` during `memory sync` and wrote `MEMORY_HOME` daily logs during `memory backfill` by default. Historical publish blockers found at that point were npm auth E401, package not visible to unauthenticated `npm view`, placeholder repository URL, and absolute local path leakage in current bundles; all were resolved before the completed Phase 37 publish.
- Completed Phase 36.10: legacy memory files are default-off and explicit opt-in, PreCompact no longer tells agents to write `~/.memory`, package repository metadata is fixed, declaration maps are disabled, `dist` is cleaned before build, local package install smoke passes, and all release gates pass.
- Completed Phase 37: `@chude/memory@4.0.0` is published on npm with `latest` dist-tag. Registry visibility, package access status, owner listing, npm global install smoke, and Bun global install smoke passed. Added `bun run verify:published @chude/memory@4.0.0` to prevent future Windows Bun binary-name assumptions.

**Next step:**
- Historical next step at 2026-05-30 was v5.0 planning/execution starting with Phase 38.0. Current 2026-06-05 resume point supersedes this: Phase 38.0 is complete and Phase 38.1 is next. Phase 38 prototype code remains parked behind `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1`.
- Current inbox truth: zero active memory-nexus inbox items; only `docs/inbox/README.md` remains outside `docs/inbox/archived/` and `docs/inbox/rejected/`.
- Cross-project notification filed at `C:\Projects\conversations\docs\inbox\2026-05-28-memory-nexus-friction-list-durable-filters-roadmapped.md`.
- First-party infrastructure broadcast filed to opted-in project inboxes: ai-dev-environment, authkey, conversations, docTruth, ez-deploy, get-stuff-done, klakson, later, medesine-rx, prompter, tailscale, and watchtower. Frontmatter lint passed via `node C:\Projects\conversations\scripts\inbox-lint.cjs <files>`.
- Latest verification after Phase 37: `bun run test:coverage` runs 4,060 tests successfully and passes the honest coverage gate at statements 97.18%, branches 95.02%, functions 96.09%, and lines 97.33%. `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, `gitleaks detect --no-banner --redact --source .`, `npm pack --dry-run --json`, isolated tarball install smoke, `npm publish --dry-run --access public`, registry visibility, npm global install smoke, and Bun global install smoke pass.

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

*Last updated: 2026-06-07 (v5.0 active; Phase 39 complete; Phase 40 next)*
