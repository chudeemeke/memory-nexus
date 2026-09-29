# Roadmap: @chude/memory (memory-nexus)

## Milestones

**Current execution priority (2026-09-19):** [Memory resilience workstream](memory-resilience/EXECUTION.md), with its dependency/acceptance ledger and persistent goal. Complete the accepted baseline repairs, then the approved bounded local embedding experiment; production local availability and desktop replication retain their decision gates. This workstream does not renumber or mark complete any v6 phase. Phase 45 remains unstarted.

- SHIPPED **v1.0 Full Vision Implementation** -- Phases 1-12 (shipped 2026-02-16) -- [Archive](milestones/v1.0-ROADMAP.md)
- SHIPPED **v2.0 Hybrid Search and Rebrand** -- Phases 13-22 (shipped 2026-03-01)
- SHIPPED **v3.0 Knowledge Layer + Friction Logging** -- Phases 23-29.1 (shipped 2026-04-02)
- SHIPPED **v4.0 Intelligence Layer** -- Phases 30-37 plus 32.5, 36.8, 36.9, and 36.10 (published 2026-05-30 as `@chude/memory@4.0.0`; architecture audit LOCKED 2026-05-13, recommendation A-prime; 2026-05-27 foundation review added pre-publish security hardening before GA; Phase 36.9 coverage gate restored 2026-05-30; Phase 36.10 hardened legacy memory-file defaults before publish)
- SHIPPED **v5.0 Market-Leader Memory Platform** -- Phases 38.0-44 plus urgent Phase 41.1 (started 2026-06-05; scoped local-first CLI/API release lane published as `@chude/memory@4.0.3`; broad category-leader claims still require future MCP/local-server and public benchmark parity work)
- ACTIVE **v6.0 Server Surface & Benchmark Parity** -- Phases 45-53 (started 2026-07-21; lifts the broad agentic-memory category-leader block via a local server surface -- MCP stdio + a 127.0.0.1 HTTP daemon + Streamable-HTTP streaming + `memory serve` -- built as a presentation adapter over a shared governance-enforced `MemoryQueryFacade`, plus a reproducible public benchmark suite (LongMemEval + LOCOMO). Read-only-first, local-first, no new mandatory egress. Server-side writes (SRVW-01) and the backward architecture audit (AUDIT-01) are out of scope.)

## Phases

<details>
<summary>SHIPPED v1.0 Full Vision Implementation (Phases 1-12) -- SHIPPED 2026-02-16</summary>

- [x] Phase 1: Project Setup and Domain Entities (2/2 plans)
- [x] Phase 2: Database Schema and Ports (4/4 plans)
- [x] Phase 3: JSONL Parsing and Extraction (4/4 plans)
- [x] Phase 4: Storage Adapters (4/4 plans)
- [x] Phase 5: Basic Sync Command (4/4 plans)
- [x] Phase 6: Search Command with FTS5 (3/3 plans)
- [x] Phase 7: Filtering and Output Formatting (6/6 plans)
- [x] Phase 8: Stats and List Commands (4/4 plans)
- [x] Phase 9: Context and Related Commands (4/4 plans)
- [x] Phase 10: Hook Integration (4/4 plans)
- [x] Phase 11: Session Navigation (5/5 plans)
- [x] Phase 12: Polish, Error Handling, Edge Cases (12/12 plans)

</details>

<details>
<summary>SHIPPED v2.0 Hybrid Search and Rebrand (Phases 13-22) -- SHIPPED 2026-03-01</summary>

- [x] Phase 13: Package Rename (3/3 plans)
- [x] Phase 14: Embedding Infrastructure (4/4 plans)
- [x] Phase 15: Embedding Pipeline (4/4 plans)
- [x] Phase 16: Hybrid Search and Graceful Degradation (3/3 plans)
- [x] Phase 16.1: Migration Race Condition Fix (1/1 plans)
- [x] Phase 17: Provider Ecosystem (3/3 plans)
- [x] Phase 18: API Stabilization and aidev Integration Readiness (2/2 plans)
- [x] Phase 19: Verification Closure (1/1 plans)
- [x] Phase 20: Public API Type Exports (1/1 plans)
- [x] Phase 21: Architecture Boundary Cleanup (1/1 plans)
- [x] Phase 22: Integration Checker Cleanup (ad-hoc)

</details>

<details>
<summary>SHIPPED v3.0 Knowledge Layer + Friction Logging (Phases 23-29.1) -- SHIPPED 2026-04-02</summary>

- [x] Phase 23: Foundation (4/4 plans)
- [x] Phase 24: Friction System (3/3 plans)
- [x] Phase 25: Intelligence (4/4 plans)
- [x] Phase 26: Hooks + Backfill (3/3 plans)
- [x] Phase 27: qmd Integration (2/2 plans)
- [x] Phase 28: Friction Universalization (6/6 plans)
- [x] Phase 29: Ambient Context (2/2 plans)
- [x] Phase 29.1: Test Determinism (2/2 plans)

</details>

### v4.0 Intelligence Layer (Phases 30-37, plus 32.5, 36.8, 36.9, and 36.10)

**Overview:** Transform memory from a data store into a knowledge system. Automated extraction of decisions, learnings, and patterns from sessions via LLM-powered pipeline. Intelligent context delivery from SQLite fact tables instead of filesystem. Clean CLI surface with labeled help groups. Cross-environment portability for WSL migration. npm publish to registry.

**Architecture audit recommendation (LOCKED 2026-05-13): A-prime.** Continue v4.0 with: NEW Phase 32.5 (surface consolidation), event-log SSOT requirement for Phase 33 (plain-text canonical events; DB tables as derived projection), supersedence-as-event-type in Phase 34, T7 plain-text canonical requirement in Phase 35, prerelease publishing with GA gated on §21 acceptance criteria of the audit doc.

**Depth:** Fine (10 phases)
**Total v4.0 Requirements:** 25 phase-mapped + 4 cross-cutting (QUAL) + 4 secret-boundary requirements = 33 (Phase 36.8 adds pre-publish security hardening; authkey remains optional interop, not a dependency)

- [x] **Phase 30: God File Cleanup** - Split sync.ts and friction.ts into focused SRP-compliant modules (completed 2026-04-03)
- [x] **Phase 31: Bug Fixes** - Unicode search, CLI truncation, download bar issues (completed 2026-05-14)
- [x] **Phase 32: CLI Surface** - Labeled help groups, uniform --json and --format flags (completed 2026-05-16)
- [x] **Phase 32.5: Surface Consolidation** (NEW, per audit A-prime) - Merge doctor/status/stats into one health surface with detail-flag selection; unify search/context/related/list/show behind one query primitive with shape flags; document unified surface in docs/04-ARCHITECTURE.md. (Completed 2026-05-23)
- [x] **Phase 32.6: TS Error Cleanup** (completed 2026-05-23)
- [x] **Phase 32.7: Friction Dashboard Test Cleanup + Envelope Adoption** (completed 2026-05-23)
- [x] **Phase 33: Knowledge Extraction Foundation** - Extraction provider port, facts schema, extraction_log, temporal tracking. Plain-text canonical event log (event-log SSOT) with DB tables as DERIVED projection. Event types: decision / learning / preference / friction / observation / supersedence. (Completed 2026-05-24)
- [x] **Phase 34: Extraction Pipeline** - The `memory extract` command with ADD/UPDATE/DELETE/NOOP operations. (Completed 2026-05-24)
- [x] **Phase 35: Context Intelligence** - Rewire SmartContextService to read from fact tables, deprecate ~/.memory/. **Every new typed memory kind in 33-35 must have plain-text canonical OR export-on-write before becoming default (T7) per audit §19 item 6.** (Completed 2026-05-24)
- [x] **Phase 36: Portability** - WSL migration command, doctor --portability, migration guide (completed 2026-05-25)
- [x] **Phase 36.8: Secret Boundary and Optional Provider Interop** (NEW, pre-publish hardening) - Redaction before persistence/provider egress; config stores env/ref metadata instead of plaintext API keys; authkey is supported as an optional `authkey run --env memory -- ...` execution path, never as a required dependency or raw-secret resolver. (Completed 2026-05-28)
- [x] **Phase 36.9: Coverage Runner Migration** (NEW, pre-publish hardening) - Replace the current Bun-only coverage gate with an honest runner/instrumentation path that reports statements, branches, functions, and lines for the release surface; no aliasing unmeasured metrics to measured ones. (Completed 2026-05-30; final gate: statements 97.18%, branches 95.00%, functions 96.09%, lines 97.32%)
- [x] **Phase 36.10: Legacy Memory File Publish Hardening** (NEW, pre-publish hardening) - Make legacy `~/.memory` / `MEMORY_HOME` reads and writes explicit opt-in instead of default behavior, preserving compatibility without contradicting Phase 35's SQLite/facts default. (Completed 2026-05-30; final gate: statements 97.18%, branches 95.02%, functions 96.09%, lines 97.33%)
- [x] **Phase 37: Publishing** - `@chude/memory@4.0.0` published to npm with `latest` dist-tag and verified by npm and Bun global install smoke tests. (Completed 2026-05-30)

### v5.0 Market-Leader Memory Platform (Phases 38.0-44)

**Overview:** Transition `@chude/memory` into a world-class, multi-device, local-first agentic memory platform governed by the Product North Star in `.planning/PROJECT.md`. Adds a canonical event kernel, projection replay, privacy governance, consent/provenance controls, Git-backed remote event synchronization, optional secure capability interop, durable friction contracts, executable eval harness, developer/persona memory, temporal semantic graph retrieval, utility-aware ranking, audited dreaming consolidation, feature-completeness/UX polish, final market/sales readiness gates, and release-candidate packaging/publish handoff.

- [x] **Phase 38.0: v5 Threat Model, Product PRD, and Eval Baseline** - Lock v5 requirements, threat model, eval baseline, ADRs, and excellent-grade rubric before implementation. Completed 2026-06-05.
- [x] **Phase 38.1: Canonical Event Kernel and Projection Replay** - Schema-versioned memory event envelopes, machine identity, event ordering/integrity, migration, and projection registry. Completed 2026-06-05.
- [x] **Phase 38.2: Redaction, Privacy Governance, and Audit Commands** - Redaction before storage/indexing/egress, secret audit, provider egress policy, migration/quarantine. Completed 2026-06-06.
- [x] **Phase 38.2.5: Consent Provenance and Memory Governance** - User-visible consent, provenance, suppression, invalidation, review, and governance events for derived memory surfaces. Completed 2026-06-06.
- [x] **Phase 38.3: Remote Sync Application Service and Git Transport** - Private-Git-backed remote event synchronization through application ports and shell-safe transport adapter. Completed 2026-06-06.
- [x] **Phase 38.4: Remote CLI, Operations, Backup, and Recovery** - `memory remote` surface, preflight, doctor, backup/restore/rollback, cross-machine verification. Completed 2026-06-06.
- [x] **Phase 38.5: Secure Capability Interop** - Optional authkey readiness/status/fingerprint interop using handles, masked metadata, or proofs; no hard dependency and no plaintext secret resolution inside memory-nexus. Completed 2026-06-06.
- [x] **Phase 38.6: Durable Friction Query Contract** - Stable durable `memory friction list` filters, counts, exit codes, JSON schema, timezone semantics, and privacy-safe query handling. Completed 2026-06-06.
- [x] **Phase 38.7: Evaluation Harness and Regression Fixtures** - Executable eval runner, fixtures, report schema, and release-gate integration for v5 behavior checks. Completed 2026-06-07.
- [x] **Phase 39: Persona and Procedural Memory** - Centralized developer/agent profile projection with provenance, confidence, review, and scoped context injection. Completed 2026-06-07.
- [x] **Phase 40: Temporal Semantic Graph** - Entity-relationship extraction, temporal graph projection, and graph-enriched retrieval through governed temporal graph projection. Completed 2026-06-07.
- [x] **Phase 41: Importance, Utility, and Recall Ranking** - Utility metrics, memory-kind half-life policies, and explainable ranking. Completed 2026-06-07.
- [x] **Phase 42: Dreaming Consolidation** - Audited dreaming consolidation, promotion, supersedence, and rollback through canonical events and schema-versioned projection. Completed 2026-07-01.
- [x] **Phase 42.5: Feature Completeness and UX Polish** - Inventory all stated/inferred/prototype features, complete or explicitly own them, and polish CLI/API usability to excellent standard. Completed 2026-07-03.
- [x] **Phase 43: Market-Leader and Sales-Readiness Gate** - Final architecture/security/quality/product/competitive review and readiness proof. Completed 2026-07-05 for scoped local-first CLI/API market readiness.
- [x] **Phase 44: Release-Candidate Packaging and Publish Handoff** - Versioning, package smoke, changelog/release notes, npm dry-run, and OTP-backed publish handoff without publishing until user authorization. Completed 2026-07-06 after user-authorized direct npm publish and registry-backed npm/Bun verification.

### v6.0 Server Surface & Benchmark Parity (Phases 45-53)

**Overview:** Lift the broad agentic-memory category-leader block that Phase 43 gated on by shipping a full local server surface (MCP stdio + a 127.0.0.1 HTTP daemon + Streamable-HTTP streaming + `memory serve`) over a shared governance-enforced application-layer `MemoryQueryFacade`, and by proving public benchmark parity (LongMemEval + LOCOMO) with reproducible, judge-pinned, per-category reports. The server is a new presentation adapter over existing application ports: no business logic in the adapter and no parallel governance path. Local-first is preserved -- the daemon binds 127.0.0.1 by default and adds no new mandatory egress. v6.0 ships a READ-ONLY server surface (query, search, context, facts, related, friction-list); server-side writes (SRVW-01) are deferred to Future Requirements and the backward architecture audit (AUDIT-01) is a separately-gated future slice, not a v6.0 phase.

**Depth:** Fine (9 phases)
**Total v6.0 Requirements:** 21 enumerated, mapped 21/21 (SRV-01..04, SGOV-01..04, MCP-01..03, HTTP-01..03, STREAM-01, BENCH-01..04, MKT-01..02). Phase 45 is a de-risking concurrency spike and carries no mapped requirement; it validates SRV-01/02/03 empirically before Phase 46 implements them. (Note: the REQUIREMENTS.md summary line called this "20 total" -- an off-by-one; the enumerated set is 21.)

- [ ] **Phase 45: Server Concurrency Spike** - De-risk the long-lived-process SQLite/WAL lifecycle on Bun/Windows before any server code (highest technical risk; zero signal in the current open-per-invocation code)
- [ ] **Phase 46: Server Foundation & Concurrency Model** - `ServerDatabaseProvider` with periodic passive checkpoints, serialized writes, and graceful cross-platform shutdown (SRV-01, SRV-02, SRV-03)
- [ ] **Phase 47: Shared Query Facade & Governance Parity Seam** - `MemoryQueryFacade` returning DTOs, the CLI refactored onto it as a regression net, and an import-boundary lint (SGOV-01, SGOV-02, SGOV-03)
- [ ] **Phase 48: MCP stdio Server Adapter** - Curated read tools over stdio mapped 1:1 to the facade, with server-output governance proven (MCP-01, MCP-02, MCP-03, SGOV-04)
- [ ] **Phase 49: Local HTTP Daemon & Local Auth** - 127.0.0.1-bound daemon mirroring the MCP read tools with Origin/Host validation and a local auth token (HTTP-01, HTTP-02, HTTP-03)
- [ ] **Phase 50: Streamable-HTTP Live Streaming** - Live query/context streaming over Streamable-HTTP with a leak-free, checkpoint-safe lifecycle (STREAM-01)
- [ ] **Phase 51: `memory serve` CLI Command** - Start/stop/status for the server following the established CLI grammar (SRV-04)
- [ ] **Phase 52: Public Benchmark Suite (LongMemEval + LOCOMO)** - Reproducible, judge-pinned, per-category benchmark harness extending `scripts/eval-v5` (BENCH-01, BENCH-02, BENCH-03, BENCH-04)
- [ ] **Phase 53: Category-Leader Readiness & Market Gate** - Lift or evidence-re-scope the category-leader block, mirroring the Phase 43 exit gate (MKT-01, MKT-02)

## Phase Details

### Phase 30: God File Cleanup

**Goal**: sync.ts and friction.ts are decomposed into focused modules so future phases can modify sync and friction logic without navigating 900+ line files
**Depends on**: Nothing (first v4.0 phase; builds on shipped v3.0)
**Requirements**: REFAC-01, REFAC-02
**Success Criteria** (what must be TRUE):
  1. sync.ts is split into separate modules each handling one concern (session discovery, message extraction, embedding pass, ambient context, progress reporting) with no module exceeding 200 lines
  2. friction.ts is split into separate modules each handling one concern (CRUD operations, dashboard rendering, auto-ingest, pattern detection) with no module exceeding 200 lines
  3. All existing sync and friction tests pass without modification to test assertions (behavioral equivalence)
  4. `memory sync` and `memory friction *` commands produce identical output and behavior as before the refactor
**Plans:** 2/2 plans complete

Plans:
- [x] 30-01-PLAN.md -- Split sync.ts into sync/ subdirectory (6 modules + tests)
- [x] 30-02-PLAN.md -- Split friction.ts into friction/ subdirectory (7 modules + tests)

---

### Phase 31: Bug Fixes

**Goal**: Three user-reported bugs are resolved so search, output, and download operations work correctly across all input types
**Depends on**: Phase 30 (sync.ts cleanup simplifies the search fix context)
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. `memory search` with Unicode characters (CJK, emoji, accented) returns correct results without FTS5 syntax errors
  2. CLI output wraps or truncates cleanly at the terminal width boundary without cutting words or corrupting table alignment
  3. Download progress bar displays actual file sizes (e.g., "23/23 MB") instead of "0/0 MB" during model download
**Plans:** 2/2 plans complete

Plans:
- [x] 31-01-PLAN.md -- Fix Unicode FTS5 sanitization (FIX-01) and download progress bar 0/0 MB (FIX-03)
- [x] 31-02-PLAN.md -- Fix CLI output width-aware truncation and column alignment (FIX-02)

---

### Phase 32: CLI Surface

**Goal**: The help output is organized and all query commands support uniform output format flags so users can discover commands by category and consume output programmatically
**Depends on**: Nothing (independent of extraction work; can run in parallel with Phases 30-31)
**Requirements**: CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. `memory --help` groups commands under labeled categories (Query, Data, System, Feedback) instead of a flat alphabetical list
  2. All query commands (`search`, `context`, `show`, `list`, `related`, `stats`) accept `--json` and produce valid JSON to stdout
  3. All query commands support `--format brief` and `--format ai` where applicable, producing condensed or AI-optimized output respectively
**Plans:** 3/3 plans complete

Plans:
- [x] 32-01-PLAN.md -- Help-group registration (CLI-01) + QueryResultEnvelope contract (CLI-02 foundation)
- [x] 32-02-PLAN.md -- Apply QueryResultEnvelope --json output to all 6 query commands (CLI-02)
- [x] 32-03-PLAN.md -- Normalize --format brief|ai across all 6 query commands (CLI-03) + --format detailed deprecation alias

---

### Phase 32.6: TS Error Cleanup

**Goal**: All TypeScript errors in the CLI presentation layer are resolved so `bun --bun tsc --noEmit` exits 0 cleanly.
**Depends on**: Phase 32 (CLI Surface) — coverage and structure of the touched files affect what to clean up
**Requirements**: QUAL-04 (cleanup-aligned; no new functional reqs)
**Success Criteria** (what must be TRUE):
  1. `bun --bun tsc --noEmit` exits 0 with 0 errors (down from ~181 baseline carried forward from pre-v4.0 code)
  2. Coverage on touched files maintained at or above the value before the cleanup (no regression)
  3. No behavioral change to any command output (refactor-only)
**Plans**: Implemented in Phase 32.6 completion pass; current `bun run typecheck` gate is clean.

Pre-existing scope: db-startup.ts, context-formatter.ts, friction-dashboard.ts, output-formatter.ts, related-formatter.ts, stats-formatter.ts, and adjacent files surfaced during Phase 32 verification. The 181 errors all pre-date v4.0; Phase 32 confirmed via stash baseline that none were introduced by the CLI surface work.

---

### Phase 32.7: Friction Dashboard Tests + Envelope Adoption

**Goal**: The friction subsystem is brought into the `QueryResultEnvelope` contract and the 8 pre-existing friction-dashboard test failures are resolved.
**Depends on**: Phase 32 (CLI Surface) — the envelope contract from 32-01 is consumed here
**Requirements**: QUAL-04, QUAL-02 (cleanup-aligned)
**Success Criteria** (what must be TRUE):
  1. The 8 failing tests in `src/presentation/cli/formatters/friction-dashboard.test.ts` pass cleanly (`generateFrictionHtml` rendering + `--html` action path)
  2. `memory friction list --json` produces a `QueryResultEnvelope`-shaped document on stdout, consistent with the 6 query commands from Phase 32
  3. The deferred Open Q7 from Plan 32-01 is closed (friction adoption no longer deferred)
**Plans**: See `.planning/phases/32-cli-surface/32-VERIFICATION.md` (complete; Phase 32.7 closure verified as part of v4 surface cleanup)

Rationale: Phase 32 explicitly deferred friction envelope adoption per audit §14.A. The dashboard test failures co-locate with that decision because the underlying surface changes when friction joins the envelope contract.

---

### Phase 33: Knowledge Extraction Foundation

**Goal**: The domain model, database schema, and provider infrastructure for knowledge extraction are in place so the extraction pipeline has everything it needs to store and compare facts
**Depends on**: Phase 30 (clean sync modules make it easier to integrate extraction)
**Requirements**: KNOW-01, KNOW-03, KNOW-05, KNOW-06
**Success Criteria** (what must be TRUE):
  1. `IExtractionProvider` port exists in domain layer with an `extract(messages): Promise<CandidateFact[]>` method; adapters exist for Claude API (Anthropic SDK), Ollama, and OpenAI
  2. `facts` table exists in SQLite schema with `observed_at`, `superseded_at`, and `superseded_by` columns for temporal tracking
  3. `extraction_log` table records each extraction run with session ID, mode, fact counts (added/updated/superseded/skipped), provider/model, and tokens consumed
  4. Re-running extraction on an already-extracted session is a no-op (idempotency tracked via extraction_log)
  5. `memory doctor` reports extraction provider configuration and readiness
**Plans**: Implemented in Phase 33 completion pass; see `.planning/SESSION_LOG.md` entry for 2026-05-24 and current code in extraction provider, fact repository, and extraction log paths.

---

### Phase 34: Extraction Pipeline

**Goal**: Users can extract structured knowledge from sessions into the facts table, compare candidates against existing facts, and view extracted knowledge per project
**Depends on**: Phase 33 (needs provider port, schema, and extraction_log)
**Requirements**: KNOW-02, KNOW-04, KNOW-07, KNOW-08
**Success Criteria** (what must be TRUE):
  1. `memory extract <project>` processes session messages through the configured provider and stores extracted facts in the `facts` table
  2. Each candidate fact is compared against existing facts using embedding similarity; the pipeline decides ADD, UPDATE, DELETE (supersede), or NOOP per fact
  3. `memory extract --all --since 7d` batch-extracts from all sessions in the last 7 days with a progress bar showing sessions processed
  4. `memory facts <project>` displays current (non-superseded) facts for a project; `--superseded` includes historical/invalidated facts
  5. Running `memory extract <project>` a second time on already-processed sessions skips them and reports "N sessions already extracted"
**Plans**: Implemented in Phase 34 completion pass; see `.planning/SESSION_LOG.md` entry for 2026-05-24 and current `extract` / `facts` command code.

---

### Phase 35: Context Intelligence

**Goal**: `memory context` delivers AI-optimized structured briefings built from extracted facts instead of raw filesystem data, and the ~/.memory/ directory convention is deprecated
**Depends on**: Phase 34 (needs facts in the database to build context from)
**Requirements**: CTXT-01, CTXT-02, CTXT-03, CTXT-04
**Success Criteria** (what must be TRUE):
  1. `memory context <project>` default output is a structured briefing built from extracted facts, friction entries, and recent session summaries (SmartContextService reads from SQLite fact tables)
  2. `memory context <project> --global` returns cross-project context by querying facts from all projects, not just the specified one
  3. No command reads from or writes to the `~/.memory/` directory; all knowledge storage is in SQLite
  4. If `~/.memory/` directory exists, a deprecation warning is printed once per session advising the user that the directory is no longer used
**Plans**: `.planning/phases/35-context-intelligence/35-01-PLAN.md` (complete)

---

### Phase 36: Portability

**Goal**: Users can migrate their memory database between environments (Windows to WSL) and diagnose cross-environment data issues
**Depends on**: Nothing (independent; can run in parallel with Phases 33-35)
**Requirements**: PORT-01, PORT-02, PORT-03
**Success Criteria** (what must be TRUE):
  1. `memory migrate --from-windows` checkpoints WAL, verifies database integrity, re-installs hooks for the new environment, and prints a session summary by project
  2. `memory doctor --portability` reports mixed-environment data (Windows vs Unix paths in session records), extraction state pointing to non-existent paths, and sqlite-vec availability
  3. Migration protocol is documented as a user-facing guide with step-by-step instructions in the project documentation
**Plans**: `.planning/phases/36-portability/36-01-PLAN.md` (complete)

---

### Phase 36.8: Secret Boundary and Optional Provider Interop

**Goal**: memory-nexus no longer stores or encourages plaintext provider secrets, and secret-bearing provider workflows can be run through optional environment injection without making authkey a required dependency.
**Depends on**: Phase 36; blocks Phase 37 GA
**Requirements**: SEC-01, SEC-02, SEC-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Redaction/classification runs before durable storage, FTS indexing, embeddings, extraction, export, and future remote sync.
  2. Plaintext `embedding.apiKey` config is deprecated or migrated; supported config uses environment-variable references or non-resolving metadata references such as `apiKeyRef`.
  3. `memory doctor` / `memory status` report secret-source readiness without printing secret values.
  4. Docs include optional dogfood commands such as `authkey run --env memory -- memory sync --embed` and explicitly forbid `authkey get` integration.
  5. memory-nexus passes all local workflows with no authkey installed.
**Plans**: `.planning/phases/36.8-secret-boundary-optional-provider-interop/36.8-01-PLAN.md` (complete; summary in `36.8-01-SUMMARY.md`)

---

### Phase 36.9: Coverage Runner Migration

**Goal**: the release gate measures and enforces all four WoW coverage metrics honestly: statements, branches, functions, and lines.
**Depends on**: Phase 36.8; blocks Phase 37 GA
**Requirements**: QUAL-01, QUAL-04
**Success Criteria** (what must be TRUE):
  1. `bun run test:coverage` or its replacement emits statements, branches, functions, and lines for production source.
  2. The coverage checker fails if any metric is unavailable or below 95%; it does not map statements to lines, branches to functions, or otherwise synthesize false confidence.
  3. Test files, generated `dist`, dependency folders, and pure type/barrel files are excluded by explicit, reviewable rules only.
  4. The normal Bun test suite still runs successfully; any Node/Vitest path must either cover the same release surface or be documented as insufficient and rejected.
  5. `bun run typecheck`, `bun run build`, `bun run test:isolation`, `bun audit`, and the final coverage gate all pass before Phase 37 starts.
**Plans**: `.planning/phases/36.9-coverage-runner-migration/36.9-01-PLAN.md` (complete; summary in `36.9-01-SUMMARY.md`)

**Final verification (2026-05-30):**
  - `bun run test:coverage`: PASS, 4,050 tests; statements 97.18% (7103/7309), branches 95.00% (4049/4262), functions 96.09% (1303/1356), lines 97.32% (6805/6992)
  - `bun run typecheck`: PASS
  - `bun run build`: PASS
  - `bun run test:isolation`: PASS
  - `bun audit`: PASS, no vulnerabilities
  - `gitleaks detect --no-banner --redact --source .`: PASS, no leaks

---

### Phase 36.10: Legacy Memory File Publish Hardening

**Goal**: v4 default behavior no longer treats legacy `~/.memory` / `MEMORY_HOME` markdown files as active storage, while explicit compatibility paths remain available for users who need to import or maintain old sidecar files.
**Depends on**: Phase 36.9; blocks Phase 37 GA
**Requirements**: QUAL-04, CTXT-03, CTXT-04
**Success Criteria** (what must be TRUE):
  1. `memory sync` does not read or index `~/.memory` / `MEMORY_HOME` by default.
  2. Legacy memory-file indexing is available only behind an explicit opt-in flag, env var, or config setting.
  3. `memory backfill` does not write to `~/.memory` / `MEMORY_HOME` by default; any legacy write path requires explicit opt-in and labels itself as legacy.
  4. README and release notes describe legacy memory-file behavior honestly.
  5. Typecheck, build, test isolation, full coverage, audit, and gitleaks remain green.
**Plans**: `.planning/phases/36.10-legacy-memory-file-publish-hardening/36.10-01-PLAN.md` (complete; summary in `36.10-01-SUMMARY.md`)

**Final verification (2026-05-30):**
  - `bun run test:coverage`: PASS, 4,060 tests; statements 97.18%, branches 95.02%, functions 96.09%, lines 97.33%
  - `bun run typecheck`: PASS
  - `bun run build`: PASS
  - `bun run test:isolation`: PASS
  - `bun audit`: PASS, no vulnerabilities
  - `gitleaks detect --no-banner --redact --source .`: PASS, no leaks
  - `npm pack --dry-run --json`: PASS
  - local tarball install smoke: PASS, `memory --version` returned `4.0.0`

---

### Phase 37: Publishing

**Goal**: `@chude/memory` is published to npm and installable globally by any user
**Depends on**: Phase 35 (all features complete before publishing), Phase 36.8 (secret boundary and provider interop hardening), Phase 36.9 (four-metric coverage enforcement), Phase 36.10 (legacy memory-file hardening)
**Requirements**: PUB-01, PUB-02
**Success Criteria** (what must be TRUE):
  1. `@chude/memory` is published to the npm registry with correct `bin`, `files`, and dependency configuration
  2. `bun add -g @chude/memory` installs successfully on a clean machine and the `memory` binary is available in PATH
  3. `memory --version` reports the published version; `memory doctor` passes all health checks on a fresh install
**Plans**: `.planning/phases/37-publishing/37-01-PLAN.md` (complete; summary in `37-01-SUMMARY.md`)

**Final verification (2026-05-30):**
  - `npm whoami`: PASS, `chude`
  - `npm view @chude/memory version dist-tags --json`: PASS, version `4.0.0`, latest `4.0.0`
  - `npm access get status @chude/memory --json`: PASS, public
  - isolated npm global install from registry: PASS
  - isolated Bun global install from registry: PASS; on Windows the binary is `memory.exe` under `bun pm bin -g`
  - reusable post-publish smoke command added: `bun run verify:published @chude/memory@4.0.0`

---

### Phase 38.0: v5 Threat Model, Product PRD, and Eval Baseline

**Goal**: Lock v5 product intent, threat model, evaluation baseline, and excellent-grade rubric before implementation.
**Depends on**: Phase 37
**Requirements**: V5-PRD-01, V5-EVAL-01
**Success Criteria** (what must be TRUE):
  1. v5 PRD, threat model, eval baseline, ADRs, and review request exist and are committed.
  2. Phase 38.1 context exists and can be planned/executed without chat context.
  3. Phase 38 prototype code remains disabled behind `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1`.
**Plans**: `.planning/phases/38.0-v5-threat-model-product-prd-eval-baseline/38.0-01-PLAN.md` (complete; summary in `38.0-01-SUMMARY.md`)

---

### Phase 38.1: Canonical Event Kernel and Projection Replay

**Goal**: Make the event log a real source of truth with schema-versioned envelopes, identity, ordering, migration, and projection replay contracts.
**Depends on**: Phase 38.0
**Requirements**: EVT-01, EVT-02, EVT-03, EVT-04
**Success Criteria** (what must be TRUE):
  1. `MemoryEventEnvelope` and related value objects validate event identity, machine identity, sequence, causality, privacy, provenance, and integrity.
  2. Existing v1 fact-shaped records can be migrated or replayed without data loss.
  3. Projection registry can rebuild applicable derived state from canonical events.
  4. Replay tests cover duplicates, out-of-order events, supersedence, corrupted lines, redaction metadata, and migrated records.
**Plans**: `.planning/phases/38.1-canonical-event-kernel-projection-replay/38.1-01-PLAN.md` (complete; summary in `38.1-01-SUMMARY.md`)

---

### Phase 38.2: Redaction, Privacy Governance, and Audit Commands

**Goal**: Make privacy controls load-bearing before remote sync or external provider egress.
**Depends on**: Phase 38.1
**Requirements**: SEC-05, SEC-06, SEC-07, SEC-09
**Success Criteria** (what must be TRUE):
  1. Redaction/classification runs before storage, FTS, embeddings, extraction, export, remote sync, logs, and provider egress.
  2. `memory audit-secrets` scans database and event logs without printing raw secrets.
  3. Existing stored sensitive content can be migrated, redacted, or quarantined with audit evidence.
  4. Remote provider egress policy is explicit and visible through doctor/status.
**Plans**: `.planning/phases/38.2-redaction-privacy-governance-audit/38.2-01-PLAN.md` (complete; summary in `38.2-01-SUMMARY.md`)

---

### Phase 38.2.5: Consent Provenance and Memory Governance

**Goal**: Make consent, provenance, suppression, invalidation, review, and user-control state load-bearing before derived memory surfaces are built.
**Depends on**: Phase 38.2
**Requirements**: CONSENT-01, CONSENT-02, CONSENT-03, CONSENT-04
**Success Criteria** (what must be TRUE):
  1. Consent/provenance event types exist for provider egress, remote sync, persona/profile use, graph enrichment, ranking exemptions, and dream promotion.
  2. Every derived memory entry can cite source event ids, transformation method, actor, confidence, redaction state, consent state, and scope.
  3. Users can inspect, suppress, invalidate, expire, or review derived memory entries.
  4. Suppression/invalidation state is enforced by context assembly, graph enrichment, ranking, and dreaming.
**Status**: Completed 2026-06-06.
**Completion Evidence**:
  - `memory_governance` and `memory_governance_events` tables persist governance state and auditable consent/control events.
  - `MemoryGovernanceService`, `SqliteMemoryGovernanceRepository`, and event-log projections register fact provenance and apply governance/consent events deterministically.
  - `memory governance list/show/suppress/unsuppress/invalidate/expire/review/consent-grant/consent-revoke` exposes user-visible inspection and controls with JSON support.
  - `SmartContextService` enforces governance suppression/invalidation for fact context now; later persona, graph, ranking, and dreaming phases must use the same governance policy instead of inventing parallel controls.
  - Verification: focused governance/event-log/context tests passed (55 pass, 0 fail), typecheck passed, schema/completion/help tests passed, and full suite passed (4140 pass, 0 fail).

---

### Phase 38.3: Remote Sync Application Service and Git Transport

**Goal**: Synchronize canonical event logs through an application service and shell-safe Git transport adapter.
**Depends on**: Phase 38.2.5
**Requirements**: SEC-08, SYNC-05, SYNC-06
**Success Criteria** (what must be TRUE):
  1. `RemoteEventSyncService` orchestrates sync through ports; CLI does not construct infrastructure sync adapters directly.
  2. Remote refs/URLs are validated, Git environment is sanitized, and machine identity must be durable.
  3. Git-backed sync commits, fetches, merges, replays, and pushes deterministically.
  4. Integration tests cover temp bare repositories and failure paths.
**Status**: Completed 2026-06-06.
**Completion Evidence**:
  - `RemoteEventSyncService` validates durable machine identity, remote refs, supported remote URLs, and explicit local-path consent before transport calls.
  - `GitRemoteEventTransport` implements the application transport port with argument-array Git subprocesses and sanitized environment.
  - Experimental `memory sync` remote path now delegates privacy preflight, transport orchestration, and projection rebuild to the application service instead of constructing `GitSyncer` directly.
  - Integration tests cover a temp bare repository with two machine event logs and rebuild-on-pull behavior; failure tests cover privacy blocking, invalid remotes, pull abort, and disabled automation.
  - Verification: focused Phase 38.3 tests passed (87 pass, 0 fail), typecheck passed, build passed, and diff whitespace passed.

---

### Phase 38.4: Remote CLI, Operations, Backup, and Recovery

**Goal**: Make remote sync usable, diagnosable, and recoverable.
**Depends on**: Phase 38.3
**Requirements**: SYNC-07, SYNC-08
**Success Criteria** (what must be TRUE):
  1. `memory remote set/remove/status/preflight/doctor` expose stable JSON output and documented exit codes.
  2. `memory sync --remote` or an equivalent named command calls the application service.
  3. Backup, restore, rollback, cross-machine verification, and failure recovery are documented and tested.
  4. First-party `remotely` conventions are used where cross-machine verification is needed.
**Plans**: 1/1 complete.
**Status**: Completed 2026-06-06.
**Completion Evidence**:
  - `memory remote` is registered publicly; `memory sync --remote` is the explicit remote-egress path and plain `memory sync` warns/skips configured remotes.
  - `memory remote set/remove/status/preflight/doctor` support stable JSON output, readiness diagnostics, URL validation, local-path consent, machine identity validation, and event-log privacy preflight.
  - `memory remote backup/restore/rollback` snapshot and restore remote config plus event-log content; restore and rollback require `--confirm`; `.git` internals are excluded.
  - Shell completions and CLI help expose the new remote surface.
  - Operational recovery runbook: `docs/operations/remote-sync-runbook.md`.
  - Verification: focused Phase 38.4 tests passed (140 pass, 0 fail) and typecheck passed before final release-gate run.

---

### Phase 38.5: Secure Capability Interop

**Goal**: Optional authkey/capability interop improves diagnostics without creating a dependency or raw-secret path.
**Depends on**: Phase 36.8 and Phase 38.4
**Requirements**: INTEG-01, INTEG-02, INTEG-03
**Success Criteria** (what must be TRUE):
  1. authkey absence is handled as optional provider unavailable, never as memory-nexus failure.
  2. Readiness/status checks return only masked metadata, handles, proofs, or fingerprints.
  3. `authkey://...` references are diagnostics/documentation references, not resolver inputs.
  4. Tests prove no AI-facing path can print or return raw secrets through capability interop.
**Plans**: `.planning/phases/38.5-secure-capability-interop/README.md` (complete)
**Completion Summary**:
  - Added a typed capability-status port and infrastructure registry for optional capability providers.
  - Capability diagnostics now read provider default secret-env metadata from the provider registry instead of duplicating provider switches in the health/capability layer.
  - Added non-executing authkey availability diagnostics; memory does not call `authkey get` or expose raw secret retrieval paths.
  - Masked capability references and fingerprints are included in status/doctor; deprecated plaintext config and injected env values are never returned.
  - Future schemes such as `vault://...` are parsed as reference-only diagnostics without adding hard dependencies.
  - Verification: focused Phase 38.5 tests passed (203 pass, 0 fail), full `bun run quality` passed (4,234 pass, 0 fail), coverage passed at statements 97.14%, branches 95.09%, functions 96.14%, lines 97.26%, `gitleaks detect --no-banner --redact --source .` passed, and `git diff --check` passed.

---

### Phase 38.6: Durable Friction Query Contract

**Goal**: Extend `memory friction list` into a stable durable signal without consumer-specific coupling.
**Depends on**: Phase 38.1, Phase 38.2, and Phase 38.2.5
**Requirements**: FRIC-01, FRIC-02
**Success Criteria** (what must be TRUE):
  1. Stable JSON schema covers durable friction list output.
  2. `--since`, exact severity/project/tool/status filters, privacy-safe contains filters, `--count`, and `--min` are documented and tested.
  3. Exit codes distinguish threshold met, threshold not met, argument/config error, and execution error.
  4. Query strings are not logged unsafely.
**Plans**: 1/1 plan complete. See `.planning/phases/38.6-durable-friction-query-contract/README.md`.

**Completion (2026-06-06):**
  - `memory friction list` now supports stable exact filters for status, severity, category, tool, and project; inclusive UTC `--since`; privacy-safe description/context contains filters; `--count`; and `--min`.
  - JSON output uses the common `schema_version: "1"` query envelope and documents count/list metadata in `docs/reference/friction-query-contract.md`.
  - Counts are total-match counts independent of returned row limits, enabling durable watcher/reminder thresholds.
  - Verification passed: full `bun run quality` (4,250 pass, 0 fail), coverage statements 97.17%, branches 95.19%, functions 96.17%, lines 97.29%, `gitleaks detect --no-banner --redact --source .`, and `git diff --check`.

---

### Phase 38.7: Evaluation Harness and Regression Fixtures

**Goal**: Turn the v5 evaluation baseline into an executable regression harness with fixtures and release-gate evidence.
**Depends on**: Phase 38.6 and Phase 38.2.5
**Requirements**: EVAL-02, EVAL-03. EVAL-04 is enabled by this phase but remains a Phase 43 consumption gate.
**Success Criteria** (what must be TRUE):
  1. `bun run eval:v5` or equivalent loads fixtures and emits schema-versioned JSON results.
  2. Fixtures cover privacy, leakage, supersedence, sync recovery, friction filters, persona, graph, ranking, and dreaming.
  3. Phase 43 can consume eval output as readiness evidence.
  4. Eval fixtures are sanitized and do not store secrets or private raw transcripts.
**Plans**: 1/1 complete. See `.planning/phases/38.7-evaluation-harness-regression-fixtures/README.md`.
**Status**: Completed 2026-06-07.
**Completion Evidence**:
  - `bun run eval:v5` loads 9 sanitized fixtures from `docs/evals/fixtures/v5` and emits `schema_version: "1"` JSON.
  - Fixture coverage includes privacy, cross-project leakage, supersedence, sync recovery, friction filters, persona, graph, ranking, and dreaming.
  - Initial behavior-backed fixtures exercise `PatternRedactor` and `SqliteFrictionRepository`; Phase 39 later promoted persona coverage through `PersonaProfileService`.
  - Remaining graph, ranking, dreaming, and adjacent future-surface fixtures are explicit contract fixtures until their phases replace them with behavior-backed checks.
  - `bun run eval:v5` is part of `bun run quality`; `bun run eval:v5:market` fails while contract fixtures remain so Phase 43 cannot treat planned behavior as shipped behavior.
  - Verification: focused eval tests passed, `bun run eval:v5` passed, `bun run typecheck` passed, and full `bun run quality` passed (4,254 pass, 0 fail).

---

### Phase 39: Persona and Procedural Memory

**Goal**: Create a high-density developer/agent profile projection with provenance, confidence, scope, review, and user controls.
**Depends on**: Phase 38.5 and Phase 38.7
**Requirements**: PERS-01, PERS-02, PERS-03
**Success Criteria** (what must be TRUE):
  1. Profile projection compiles preferences, repeated corrections, friction, decisions, and validated behavior patterns.
  2. Entries include provenance, confidence, scope, expiry/review metadata, and edit/suppress/invalidate controls.
  3. `memory context` can include persona/procedural memory with why-included metadata and no cross-project leakage.
**Plans**: 1/1 complete. See `.planning/phases/39-persona-procedural-memory/README.md`.
**Status**: Completed 2026-06-07.
**Completion Evidence**:
  - Added `PersonaEntry`, `IPersonaRepository`, `persona_entries`, and `SqlitePersonaRepository` with parameterized SQL and context-aware filters.
  - Added `PersonaProfileService` to derive governed entries from active preferences, corrections, validated procedures, decision patterns, and recurring friction patterns.
  - Registered persona governance entries and added fact-event persona projection through the projection registry.
  - Added `memory profile show/export/rebuild` plus shell completion/help snapshot coverage.
  - Integrated persona/procedural memory into `memory context` with governance filtering, scoped inclusion, confidence, review, controls, and why-included metadata.
  - Promoted `repeated_correction_to_persona` to behavior-backed eval coverage; `bun run eval:v5` now passes 9/9 with 3 behavior fixtures and 6 contract fixtures.
  - Verification: focused Phase 39 tests passed, `bun run typecheck` passed, `bun run eval:v5` passed, full `bun run quality` passed (4,281 pass, 0 fail), coverage statements 97.2%, branches 95.19%, functions 96.19%, lines 97.31%, `gitleaks detect --no-banner --redact --source .` passed, and `git diff --check` passed.

---

### Phase 40: Temporal Semantic Graph

**Goal**: Add graph traversal where it improves recall, context assembly, and explanation.
**Depends on**: Phase 39
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04
**Success Criteria** (what must be TRUE):
  1. Entity/relation taxonomy covers projects, tools, people, decisions, errors, plans, files, commands, and capabilities.
  2. Extraction emits candidate entities/relationships with confidence and temporal validity.
  3. Search/context can use graph enrichment with reasons while preserving vector/reranker baseline.
  4. Pruning and stale-edge policy prevent unbounded noisy relationship growth.
**Plans**: 1/1 complete. See `.planning/phases/40-temporal-semantic-graph/README.md`.
**Status**: Completed 2026-06-07.
**Completion Evidence**:
  - Added `GraphEdge`, graph node taxonomy, `IGraphRepository`, `graph_edges`, and `SqliteGraphRepository`.
  - Added `TemporalGraphService` to derive graph edges from active fact metadata with confidence, validity windows, provenance, scope, and why text.
  - Added graph replay projection from canonical memory events and governance entries for `surface='graph'`.
  - Wired `memory context` to include governed temporal semantic graph entries while preserving existing fact/persona/friction/session sections.
  - Tightened cross-project context so unrelated project-private facts do not appear unless explicitly global.
  - Promoted graph, supersedence, and cross-project leakage eval fixtures to behavior-backed checks; `bun run eval:v5` now passes 9/9 with 6 behavior fixtures and 3 later-phase contract fixtures.
  - Verification: focused Phase 40 tests passed, `bun run typecheck` passed, `bun run eval:v5` passed, full `bun run quality` passed (4,300 pass, 0 fail), coverage statements 97.28%, branches 95.17%, functions 96.36%, lines 97.38%, `gitleaks detect --no-banner --redact --source .` passed, and `git diff --check` passed.

---

### Phase 41: Importance, Utility, and Recall Ranking

**Goal**: Prioritize useful current truth without losing evergreen decisions.
**Depends on**: Phase 40
**Requirements**: RANK-03, RANK-04, RANK-05
**Success Criteria** (what must be TRUE):
  1. Facts, links, profiles, and dreams track access/utility metrics.
  2. Ranking applies memory-kind half-life policies, evergreen exemptions, and supersedence filtering.
  3. Retrieval output can explain why each result was ranked or included.
**Plans**: 1/1 plan complete. See `.planning/phases/41-importance-utility-recall-ranking/README.md`.
**Status**: Complete 2026-06-07.
**Implemented**:
  - Added `MemoryUtilityMetric`, `IMemoryUtilityRepository`, `memory_utility_metrics`, and `SqliteMemoryUtilityRepository` for surface-agnostic utility/access tracking across `fact`, `persona`, `graph`, `link`, and future `dream` targets.
  - Added `MemoryRankingService` with per-kind/type half-life policies, evergreen/pinned exemptions, utility/access scoring, supersedence/governance/temporal filtering, and deterministic why-ranked explanations.
  - Integrated ranking into `SmartContextService`, `memory context`, and ambient context after governance filtering for facts, persona entries, and graph edges.
  - Promoted `ranking_evergreen_preference` to behavior-backed eval coverage through the real ranking service and utility metric entity; `bun run eval:v5` now passes 9/9 with 7 behavior fixtures and 2 remaining contract fixtures.
**Verification**: Focused Phase 41 tests passed, `bun run typecheck` passed, `bun run eval:v5` passed, and full `bun run quality` passed (4,316 pass, 0 fail; coverage statements 97.29%, branches 95.11%, functions 96.47%, lines 97.40%; test isolation passed; `bun audit` found no vulnerabilities). `gitleaks detect --no-banner --redact --source .` passed, and `git diff --check` passed. `bun run eval:v5:market` still intentionally fails because the two remaining contract fixtures are owned by Phase 42 and Phase 43 readiness work.

---

### Phase 41.1: Embedding Pipeline Resilience for Ollama 413 and Resume Safety

**Goal**: Make embedding generation monotonic and provider-limit-aware so oversized provider or transport requests cannot wedge cross-project re-embedding.
**Requirements**: EMBED-RES-01, EMBED-RES-02, EMBED-RES-03, EMBED-RES-04, EMBED-RES-05
**Depends on**: Phase 41
**Success Criteria** (what must be TRUE):
  1. Embedding work is bounded by provider/transport payload budget, not only by fixed message count.
  2. Multi-item provider payload-too-large failures are retried by splitting work without losing input/result order.
  3. A single oversized item is persisted as a safe current-model skip/quarantine with provider/model/reason/hash/size metadata and no raw content in logs or CLI output.
  4. Resume excludes current-model quarantined items, reports skipped counts honestly, and continues embedding later rows instead of re-hitting the same deterministic failure.
  5. CLI errors and sync output distinguish retryable provider failure from handled skip state, and tests prove the behavior.
**Plans**: 1/1 plan complete. See `.planning/phases/41.1-embedding-pipeline-resilience-for-ollama-413-and-resume-safety/41.1-01-SUMMARY.md`.
**Status**: Complete 2026-06-22.
**Implemented**:
  - Added typed provider payload-too-large errors and Ollama 413 split/retry while preserving input/result order.
  - Added `embedding.maxBatchBytes`, byte-bounded embedding sub-batches, and durable model-scoped skip/quarantine state.
  - Updated resume filtering and `memory sync --embed` output so handled skips are reported safely in text and JSON.
  - Remediated dependency-audit blockers by updating `@anthropic-ai/claude-code`, `vitest`, `vite`, and `protobufjs` resolution.
**Verification**: Focused Dream/embedding contract tests passed, `bun run typecheck` passed, `bun run build` passed, `bun run test:isolation` passed, `bun run eval:v5` passed 9/9 fixtures, `bun run test:coverage` passed (4,364 pass, 0 fail; statements 97.35%, branches 95.00%, functions 96.59%, lines 97.45%), `bun test --timeout 15000` passed (4,364 pass, 0 fail), `bun audit` found no vulnerabilities, `git diff --check` passed, and inbox lint passed. `eval:v5` still reports market readiness ineligible because two contract fixtures remain owned by Phase 42/43.

Plans:
- [x] 41.1-01 Embedding resilience and durable skip state

### Phase 42: Dreaming Consolidation

**Goal**: Add audited asynchronous consolidation without hidden mutation or unreviewed data loss.
**Depends on**: Phase 41
**Requirements**: DREAM-01, DREAM-02, DREAM-03
**Success Criteria** (what must be TRUE):
  1. `memory dream` produces schema-versioned audited dream entries.
  2. Dream proposals promote/supersede through canonical events, not hidden mutation.
  3. Background dreaming remains disabled until explicit command path is safe, audited, redacted, and rollback-capable.
**Plans**: Phase complete. See `.planning/phases/42-dreaming-consolidation/README.md`.
**Status**: Complete 2026-07-01.
**Implemented**:
  - Added explicit `memory dream propose-supersedence/list/show/approve/reject/apply/rollback` commands.
  - Added `DreamEntry`, `dream_entries`, `SqliteDreamRepository`, canonical dream events, projection replay, and governance registration.
  - Redacts proposal content before persistence, requires explicit confirmation for apply/rollback, and keeps background dreaming disabled.
  - Reconciled the original `dreams.jsonl` wording by using the canonical `MemoryEventEnvelope` log plus schema-versioned `dream_entries` projection instead of a parallel log.
**Verification**: Focused Phase 42 tests passed (39 pass, 0 fail), completion tests passed (47 pass, 0 fail), `bun run typecheck` passed, `bun run build` passed, `bun test --timeout 15000` passed (4,366 pass, 0 fail), `bun run test:isolation` passed, `bun run eval:v5` passed 9/9 fixtures with 8 behavior-backed and 1 contract fixture, `bun run test:coverage` passed (statements 97.35%, branches 95.01%, functions 96.59%, lines 97.45%), `bun audit` found no vulnerabilities, `gitleaks detect --no-banner --redact --source .` found no leaks, scoped inbox lint passed, and `git diff --check` passed. `eval:v5:market` still intentionally fails until Phase 43 handles `remote_sync_conflict`.

---

### Phase 42.5: Feature Completeness and UX Polish

**Goal**: Ensure no stated/inferred/prototype feature is removed or left half-built, and make CLI/API usability excellent before final readiness audit.
**Depends on**: Phase 42
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Feature inventory covers current code, docs, roadmap, requirements, inbox, tests, and disabled prototype surfaces.
  2. Every incomplete feature is completed or explicitly owned by a later requirement with a concrete gate; no feature is silently removed.
  3. CLI help, errors, preflights, JSON schemas, docs, onboarding, backup/restore, audit, and recovery flows are polished for excellent usability.
  4. Fresh-user UAT confirms install, configure, sync/search/context/audit/backup/restore, and feature discovery are clear.
  5. Every Product North Star claim in `.planning/PROJECT.md` is traced to implemented behavior, an explicit later owner, or a documented non-goal with rationale.
**Plans**: 1/1 complete. See `.planning/phases/42.5-feature-completeness-and-ux-polish/42.5-01-SUMMARY.md`.
**Status**: Complete 2026-07-03.
**Implemented**:
  - Added local `memory backup create/verify` and `memory restore` compatibility surfaces with JSON, quiet, dry-run, confirmation, manifest verification, and rollback-backup behavior.
  - Added `memory projections rebuild --verify/--confirm/--json`.
  - Hardened `memory migrate` with `--dry-run`, `--json`, and `--confirm`.
  - Added `memory doctor --upgrade --json` upgrade readiness diagnostics.
  - Updated completion/help/README/programmatic exports and tightened qmd executable discovery.
  - Tightened `MemoryEventEnvelope` validation so invalid metadata arrays are rejected instead of coerced.
**Verification**: `bun run typecheck`, `bun run build`, full tests (4,451 pass, 0 fail), `bun run test:isolation`, `bun run eval:v5` (9/9; 8 behavior-backed, 1 contract), `bun run test:coverage` (statements 97.30%, branches 95.02%, functions 96.51%, lines 97.39%), `bun audit`, `gitleaks detect --no-banner --redact --source .`, `git diff --check`, `npm pack --dry-run --json`, and isolated dist smoke passed. `eval:v5:market` remains intentionally ineligible until Phase 43 handles `remote_sync_conflict`.

---

### Phase 43: Market-Leader and Sales-Readiness Gate

**Goal**: Prove architecture, security, quality, product readiness, competitive positioning, and sales readiness are excellent.
**Depends on**: Phase 42.5
**Requirements**: READY-01, READY-02, READY-03, READY-04, READY-05, READY-06
**Success Criteria** (what must be TRUE):
  1. Architecture review grades excellent against hexagonal/SOLID/deep-module criteria.
  2. Security review grades excellent against secrets, privacy, egress, remote sync, dependency, audit, and recovery criteria.
  3. Quality review passes typecheck, build, full tests, test isolation, 95% coverage at every metric, dependency audit, gitleaks, and package smoke.
  4. Product review proves fresh-user install, onboarding, configure, audit, backup, restore, upgrade, and verification flows.
  5. Competitive review demonstrates a crisp local-first value proposition and no known unowned blocker.
  6. Product North Star conformance audit passes with no unowned mismatch.
**Plans**: 1/1 complete. See `.planning/phases/43-market-leader-sales-readiness-gate/43-VERIFICATION.md`.
**Status**: Complete 2026-07-05.
**Implemented**:
  - Promoted `remote_sync_conflict` from the final market-blocking contract fixture to behavior-backed eval coverage.
  - Added final architecture, security, quality, product, competitive, and Product North Star readiness reports.
  - Added interactive HTML market report with competitor positioning and explicit owned gaps.
  - Refreshed `CLAUDE.md` to remove stale downstream-agent guidance and encode the scoped readiness boundary.
  - Fixed Windows hook background sync launcher behavior so hooks resolve and launch `memory sync` directly instead of assuming `aidev memory sync` through a shell.
**Verification**: `bun run typecheck`, `bun run build`, full tests (4,455 pass, 0 fail), `bun run test:isolation`, `bun run eval:v5`, `bun run eval:v5:market`, `bun run test:coverage` (statements 97.31%, branches 95.00%, functions 96.51%, lines 97.39%), `bun audit`, `gitleaks detect --no-banner --redact --source .`, `git diff --check`, `npm pack --dry-run --json`, and package privacy check passed.
**Decision**: Scoped local-first CLI/API market readiness approved. Broad agentic-memory category-leader claims remain blocked until MCP/local-server support and public benchmark parity are implemented or explicitly dispositioned.

---

### Phase 44: Release-Candidate Packaging and Publish Handoff

**Goal**: Prepare the v5 release candidate for publication without performing real npm publish until the user explicitly authorizes and completes OTP.
**Depends on**: Phase 43
**Requirements**: REL-01, REL-02, REL-03
**Success Criteria** (what must be TRUE):
  1. Version, changelog, release notes, package contents, npm pack, install smoke, and publish dry-run pass.
  2. Release runbook documents OTP publish steps, rollback, dist-tag handling, and post-publish verification.
  3. Real `npm publish` is not run until user authorization and OTP are available.
**Plans**: 1/1 plan prepared. See `.planning/phases/44-release-candidate-packaging-publish-handoff/44-PLAN.md`.
**Status**: Complete 2026-07-06.
**Verification**: Typecheck, build, full tests, test isolation, eval:v5, eval:v5:market, coverage, dependency audit, gitleaks, diff whitespace, npm pack dry-run, package privacy scan, npm publish dry-run, isolated npm tarball install smoke, direct npm publish, registry metadata, registry-backed Bun global install, and `bun run verify:published @chude/memory@4.0.3` passed. Local Bun tarball/path install is excluded as a trustworthy gate on Bun 1.3.5 due to a dependency-loop failure and Bun crash.
**Release execution**: Published manually/directly with `npm publish --access public --otp=<code>`, not through `aidev release`.

---

### Phase 45: Server Concurrency Spike

**Goal**: De-risk the long-lived-process SQLite/WAL lifecycle on Bun/Windows before any server code is written, proving or disproving the single-long-lived-connection + WAL + tuned `busy_timeout` + write-serialization model under concurrent readers and a concurrent external `memory sync` writer.
**Depends on**: Phase 44 (v5.0 shipped baseline)
**Requirements**: None (de-risking spike; empirically validates the SRV-01/SRV-02/SRV-03 concurrency assumptions before Phase 46 implements them). This is the milestone's highest technical risk and has zero signal in the current 100%-open-per-invocation code.
**Success Criteria** (what must be TRUE):
  1. A committed decision doc records whether a single long-lived SQLite connection with WAL and a tuned `busy_timeout` survives a soak test of concurrent reads plus a concurrent external `memory sync` writer on Windows, with no corruption and no unbounded WAL growth.
  2. The doc empirically confirms or refutes the Bun-on-Windows `journal_mode` DELETE-on-close FD-hold quirk, using a reproducible test script committed alongside it.
  3. WAL size is measured to stay bounded when periodic passive checkpoints run and to grow unbounded when they do not, with both cases recorded.
  4. The doc states an explicit go/no-go decision and the concrete connection, checkpoint-interval, and `busy_timeout` parameters that Phase 46 will implement.
**Plans**: TBD

---

### Phase 46: Server Foundation & Concurrency Model

**Goal**: A long-lived server process holds one SQLite connection open across many requests, serves concurrent reads safely, serializes writes without corruption, and shuts down cleanly releasing the database lock on every platform.
**Depends on**: Phase 45
**Requirements**: SRV-01, SRV-02, SRV-03
**Success Criteria** (what must be TRUE):
  1. A `ServerDatabaseProvider` opens the database once and performs periodic passive WAL checkpoints, keeping the WAL bounded over a long-running process without depending on the per-command TRUNCATE checkpoint.
  2. Concurrent reads succeed while an external `memory sync` writer runs, and any writes are serialized through application-layer write serialization plus WAL and `busy_timeout` so no corruption or unhandled `SQLITE_BUSY` reaches a caller.
  3. Sending SIGINT or SIGTERM drains in-flight work, runs a final checkpoint, closes the connection exactly once, and releases the database lock on both Windows and Unix.
  4. The existing per-command `connection.ts` lifecycle is unchanged; tests confirm the CLI open-per-invocation behavior still holds and the server provider is a separate path.
**Plans**: TBD

---

### Phase 47: Shared Query Facade & Governance Parity Seam

**Goal**: A single application-layer read seam exists that both the CLI and the future server route through, so redaction, consent/suppression, and cross-project scope isolation are enforced in exactly one governance-enforced path.
**Depends on**: Phase 46
**Requirements**: SGOV-01, SGOV-02, SGOV-03
**Success Criteria** (what must be TRUE):
  1. A `MemoryQueryFacade` in the application layer returns DTOs with no stdout side-effects for the read operations (query, search, context, facts, related, friction-list).
  2. The existing CLI query commands are refactored to route through the facade with byte-identical output, serving as a regression net that proves no behavior change.
  3. Redaction, consent/suppression, and cross-project scope isolation are enforced inside the facade, so every consumer inherits identical governance -- this is the mechanism guaranteeing server output will match CLI output.
  4. An import-boundary check fails the build when presentation or server code imports repositories or `bun:sqlite` directly instead of the application layer.
**Plans**: TBD

---

### Phase 48: MCP stdio Server Adapter

**Goal**: An MCP server over stdio exposes curated read tools to agents (Claude Code, Claude Desktop, Cursor), each a thin wrapper over the shared facade, with governance proven on the server output.
**Depends on**: Phase 47
**Requirements**: MCP-01, MCP-02, MCP-03, SGOV-04
**Success Criteria** (what must be TRUE):
  1. An MCP stdio server exposes curated read tools (search, context, related, show, list, stats, facts, friction-list, status) each mapped one-to-one to a facade method, with stdout reserved strictly for JSON-RPC frames and all diagnostics on stderr.
  2. MCP tool inputs are schema-validated and each tool's output matches the CLI's `--json` contract for the same operation.
  3. The MCP surface exposes no free-text memory-write tool and no operation that bypasses governance.
  4. Poisoned-corpus tests seed known secrets and multi-project rows and assert redaction and cross-project scope isolation on MCP tool output, proving governance cannot be bypassed on the server surface.
**Note**: SGOV-04 lands here with the first read tool (governance-on-server evals ship with MCP, not after). The same server-governance suite is extended to HTTP output in Phase 49 once the HTTP surface exists.
**Plans**: TBD

---

### Phase 49: Local HTTP Daemon & Local Auth

**Goal**: A localhost-bound HTTP daemon offers the same read tools as MCP to a second concurrent client, secured against LAN exposure and DNS-rebinding, validating the Phase 45/46 concurrency model under real multi-client load.
**Depends on**: Phase 48
**Requirements**: HTTP-01, HTTP-02, HTTP-03
**Success Criteria** (what must be TRUE):
  1. The HTTP daemon binds 127.0.0.1 by default and refuses to bind a non-loopback interface without explicit, documented opt-in.
  2. HTTP endpoints mirror the MCP read tools with consistent request/response JSON contracts and matching error and exit semantics.
  3. The daemon validates Origin and Host headers (DNS-rebinding protection) and requires a local bearer token for any opt-in non-loopback exposure.
  4. The Phase 48 server-governance suite is extended to assert redaction and cross-project scope isolation on HTTP output, completing SGOV-04 coverage across both server surfaces.
**Plans**: TBD

---

### Phase 50: Streamable-HTTP Live Streaming

**Goal**: Live query/context streaming is delivered over Streamable-HTTP (not the deprecated legacy SSE transport) with a connection lifecycle that leaks no readers and never pins the WAL checkpoint.
**Depends on**: Phase 49
**Requirements**: STREAM-01
**Success Criteria** (what must be TRUE):
  1. Live query/context subscriptions stream over the Streamable-HTTP transport; the deprecated legacy SSE transport is not used.
  2. Client disconnects tear down the subscription and release readers, verified by a test that opens and drops many subscriptions with no reader leak.
  3. Streaming uses snapshot-then-stream and never holds a read transaction open across a subscription lifetime, so periodic WAL checkpointing is never pinned.
**Plans**: TBD

---

### Phase 51: `memory serve` CLI Command

**Goal**: Operators can start, stop, and inspect the server through the established CLI grammar.
**Depends on**: Phase 50
**Requirements**: SRV-04
**Success Criteria** (what must be TRUE):
  1. `memory serve` starts the server (MCP and/or HTTP transports per flags) and a stop path shuts it down, releasing the database lock cleanly.
  2. `memory serve status --json` reports running state, bound transports, and address using the established query/JSON envelope.
  3. The command follows existing CLI grammar, flag conventions, help grouping, and documented exit codes, and shell completion covers the new subcommand.
**Plans**: TBD

---

### Phase 52: Public Benchmark Suite (LongMemEval + LOCOMO)

**Goal**: A reproducible, judge-pinned, per-category benchmark suite produces defensible parity numbers against leading agentic-memory tools without vendoring non-commercial data.
**Depends on**: Phase 47 (runs against the shared facade/CLI; independent of the server adapters and can run in parallel with Phases 48-51)
**Requirements**: BENCH-01, BENCH-02, BENCH-03, BENCH-04
**Success Criteria** (what must be TRUE):
  1. A benchmark harness extending `scripts/eval-v5` runs LongMemEval (MIT-licensed) and emits a reproducible, schema-versioned, per-category report.
  2. The harness runs LOCOMO as a comparison point by fetching the dataset at runtime into a gitignored cache, and `npm pack --dry-run` output asserts the dataset (CC BY-NC 4.0) never ships in the package.
  3. Every benchmark report records the pinned judge model and full run configuration, and documents where methodology differs from competitor-cited numbers.
  4. Reports include all categories with no cherry-picking and clearly distinguish measured numbers from any contextual or estimated ones.
**Plans**: TBD

---

### Phase 53: Category-Leader Readiness & Market Gate

**Goal**: The broad agentic-memory category-leader block is lifted or evidence-re-scoped, mirroring the Phase 43 exit-gate pattern, once server surfaces are governance-verified and benchmark numbers are reproducible.
**Depends on**: Phase 52 and Phases 48-51
**Requirements**: MKT-01, MKT-02
**Success Criteria** (what must be TRUE):
  1. A readiness report demonstrates the server surface shipped (MCP + HTTP + streaming + `memory serve`), governance verified on the new surfaces, and reproducible public benchmark numbers published.
  2. The broad category-leader block in PROJECT.md is either lifted with evidence or explicitly re-scoped with documented rationale, with no unowned blocker remaining.
  3. The readiness gate reuses the Phase 43 exit-gate structure (architecture, security, quality, product, and competitive review) applied to the new server and benchmark surfaces.
**Plans**: TBD

---

### Cross-Cutting: Quality (All v4.0 Phases)

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

These are enforced in every phase, not assigned to a single phase:
- 95%+ coverage at EACH metric for all new code
- Domain layer maintains zero external dependencies
- All new infrastructure adapters follow existing port/adapter patterns
- TDD workflow (RED-GREEN-REFACTOR) for all new features
- Secret-bearing provider workflows use environment injection or references; memory-nexus must not store plaintext API keys or call another tool for raw secret values inside AI-visible command paths

---

## v4.0 Dependency Graph

```
Phase 30 (God File Cleanup)
    |
    +---> Phase 31 (Bug Fixes)
    |
    +---> Phase 33 (Knowledge Extraction Foundation)
              |
              +---> Phase 34 (Extraction Pipeline)
                        |
                        +---> Phase 35 (Context Intelligence)
                                  |
                                  +---> Phase 36.8 (Secret Boundary)
                                            |
                                            +---> Phase 36.9 (Coverage Runner)
                                                  |
                                                  +---> Phase 36.10 (Legacy Memory Files)
                                                        |
                                                  +---> Phase 37 (Publishing)

Phase 32 (CLI Surface)
    [independent, parallel with Phases 30-35]

Phase 36 (Portability)
    [independent, parallel with Phases 33-35]

Phase 36.8 (Secret Boundary and Optional Provider Interop)
    depends on Phase 36
    blocks Phase 36.9 and Phase 37 GA
    does not require authkey to be installed

Phase 36.9 (Coverage Runner Migration)
    depends on Phase 36.8
    blocks Phase 37 GA
    must prove statements, branches, functions, and lines independently

Phase 36.10 (Legacy Memory File Publish Hardening)
    depends on Phase 36.9
    blocks Phase 37 GA
    must make legacy ~/.memory reads/writes explicit opt-in

Phase 37 (Publishing)
    depends on Phase 35 (all features in before publish)
    depends on Phase 31 (bugs fixed before publish)
    depends on Phase 32 (CLI surface clean before publish)
    depends on Phase 36 (portability in before publish)
    depends on Phase 36.8 (secret boundary before publish)
    depends on Phase 36.9 (coverage runner before publish)
    depends on Phase 36.10 (legacy memory-file hardening before publish)

v5.0
    Phase 38.0 (Threat Model, PRD, Eval Baseline) depends on Phase 37
    Phase 38.1 (Canonical Event Kernel) depends on Phase 38.0
    Phase 38.2 (Redaction and Privacy Governance) depends on Phase 38.1
    Phase 38.2.5 (Consent Provenance and Memory Governance) depends on Phase 38.2
    Phase 38.3 (Remote Sync Service and Transport) depends on Phase 38.2.5
    Phase 38.4 (Remote CLI and Operations) depends on Phase 38.3
    Phase 38.5 (Secure Capability Interop) depends on Phase 36.8 and Phase 38.4
    Phase 38.6 (Durable Friction Query Contract) depends on Phase 38.1, Phase 38.2, and Phase 38.2.5
    Phase 38.7 (Evaluation Harness and Regression Fixtures) depends on Phase 38.6 and Phase 38.2.5
    Phase 39 (Persona and Procedural Memory) depends on Phase 38.5 and Phase 38.7
    Phase 40 (Temporal Semantic Graph) depends on Phase 39
    Phase 41 (Importance, Utility, and Recall Ranking) depends on Phase 40
    Phase 42 (Dreaming Consolidation) depends on Phase 41
    Phase 42.5 (Feature Completeness and UX Polish) depends on Phase 42
    Phase 43 (Market-Leader and Sales-Readiness Gate) depends on Phase 42.5
    Phase 44 (Release-Candidate Packaging and Publish Handoff) depends on Phase 43
```

---

## v6.0 Dependency Graph

```
Phase 45 (Server Concurrency Spike)   [de-risking spike; no mapped requirement]
    |
    +---> Phase 46 (Server Foundation & Concurrency Model)   [SRV-01, SRV-02, SRV-03]
              |
              +---> Phase 47 (Shared Query Facade & Governance Parity Seam)   [SGOV-01, SGOV-02, SGOV-03]
                        |
                        +---> Phase 48 (MCP stdio Server Adapter)   [MCP-01, MCP-02, MCP-03, SGOV-04]
                        |         |
                        |         +---> Phase 49 (Local HTTP Daemon & Local Auth)   [HTTP-01, HTTP-02, HTTP-03]
                        |                   |
                        |                   +---> Phase 50 (Streamable-HTTP Live Streaming)   [STREAM-01]
                        |                             |
                        |                             +---> Phase 51 (memory serve CLI Command)   [SRV-04]
                        |
                        +---> Phase 52 (Public Benchmark Suite: LongMemEval + LOCOMO)   [BENCH-01..04]
                                  [depends only on the facade; runs in parallel with Phases 48-51]

Phase 53 (Category-Leader Readiness & Market Gate)   [MKT-01, MKT-02]
    depends on Phase 52 (reproducible benchmark numbers)
    depends on Phases 48-51 (governance-verified server surfaces shipped)
    mirrors the Phase 43 exit-gate pattern

Scope guardrails: READ-ONLY server (query/search/context/facts/related/friction-list).
Server-side writes (SRVW-01) are deferred to Future Requirements.
The backward architecture/implementation audit (AUDIT-01) is a separately-gated future slice, not a v6.0 phase.
```

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-12 | v1.0 | 56 | Complete | 2026-02-06 |
| 13 | v2.0 | 3/3 | Complete | 2026-02-25 |
| 14 | v2.0 | 4/4 | Complete | 2026-02-26 |
| 15 | v2.0 | 4/4 | Complete | 2026-02-26 |
| 16 | v2.0 | 3/3 | Complete | 2026-02-27 |
| 16.1 | v2.0 | 1/1 | Complete | 2026-02-27 |
| 17 | v2.0 | 3/3 | Complete | 2026-02-28 |
| 18 | v2.0 | 2/2 | Complete | 2026-03-01 |
| 19 | v2.0 | 1/1 | Complete | 2026-03-01 |
| 20 | v2.0 | 1/1 | Complete | 2026-03-01 |
| 21 | v2.0 | 1/1 | Complete | 2026-03-01 |
| 22 | v2.0 | ad-hoc | Complete | 2026-03-07 |
| 23 | v3.0 | 4/4 | Complete | 2026-03-08 |
| 24 | v3.0 | 3/3 | Complete | 2026-03-08 |
| 25 | v3.0 | 4/4 | Complete | 2026-03-10 |
| 26 | v3.0 | 3/3 | Complete | 2026-03-08 |
| 27 | v3.0 | 2/2 | Complete | 2026-03-18 |
| 28 | v3.0 | 6/6 | Complete | 2026-03-22 |
| 29 | v3.0 | 2/2 | Complete | 2026-03-18 |
| 29.1 | v3.0 | 2/2 | Complete | 2026-03-22 |
| 30. God File Cleanup | v4.0 | 2/2 | Complete    | 2026-04-03 |
| 31. Bug Fixes | v4.0 | 2/2 | Complete | 2026-05-14 |
| 32. CLI Surface | v4.0 | 3/3 | Complete | 2026-05-16 |
| 32.5. Surface Consolidation | v4.0 | 1/1 | Complete | 2026-05-23 |
| 32.6. TS Error Cleanup | v4.0 | 1/1 | Complete | 2026-05-23 |
| 32.7. Friction Dashboard Tests | v4.0 | 1/1 | Complete | 2026-05-23 |
| 33. Knowledge Extraction Foundation | v4.0 | 1/1 | Complete | 2026-05-24 |
| 34. Extraction Pipeline | v4.0 | 1/1 | Complete | 2026-05-24 |
| 35. Context Intelligence | v4.0 | 1/1 | Complete | 2026-05-24 |
| 36. Portability | v4.0 | 1/1 | Complete | 2026-05-25 |
| 36.8. Secret Boundary and Optional Provider Interop | v4.0 | 1/1 | Complete | 2026-05-28 |
| 36.9. Coverage Runner Migration | v4.0 | 1/1 | Complete | 2026-05-30 |
| 36.10. Legacy Memory File Publish Hardening | v4.0 | 1/1 | Complete | 2026-05-30 |
| 37. Publishing | v4.0 | 1/1 | Complete | 2026-05-30 |
| 38.0. Threat Model, PRD, Eval Baseline | v5.0 | 1/1 | Complete | 2026-06-05 |
| 38.1. Canonical Event Kernel and Projection Replay | v5.0 | 1/1 | Complete | 2026-06-05 |
| 38.2. Redaction, Privacy Governance, and Audit Commands | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.2.5. Consent Provenance and Memory Governance | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.3. Remote Sync Service and Git Transport | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.4. Remote CLI, Operations, Backup, and Recovery | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.5. Secure Capability Interop | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.6. Durable Friction Query Contract | v5.0 | 1/1 | Complete | 2026-06-06 |
| 38.7. Evaluation Harness and Regression Fixtures | v5.0 | 1/1 | Complete | 2026-06-07 |
| 39. Persona and Procedural Memory | v5.0 | 1/1 | Complete | 2026-06-07 |
| 40. Temporal Semantic Graph | v5.0 | 1/1 | Complete | 2026-06-07 |
| 41. Importance, Utility, and Recall Ranking | v5.0 | 1/1 | Complete | 2026-06-07 |
| 41.1. Embedding Pipeline Resilience | v5.0 | 1/1 | Complete | 2026-06-22 |
| 42. Dreaming Consolidation | v5.0 | 2026-07-01 | Complete | Explicit `memory dream`; audited/event-sourced proposal, apply, rollback; behavior-backed eval |
| 42.5. Feature Completeness and UX Polish | v5.0 | 1/1 | Complete | 2026-07-03 |
| 43. Market-Leader and Sales-Readiness Gate | v5.0 | 1/1 | Complete | 2026-07-05 |
| 44. Release-Candidate Packaging and Publish Handoff | v5.0 | 1/1 | Complete | 2026-07-06 |
| 45. Server Concurrency Spike | v6.0 | — | Not started | - |
| 46. Server Foundation & Concurrency Model | v6.0 | — | Not started | - |
| 47. Shared Query Facade & Governance Parity Seam | v6.0 | — | Not started | - |
| 48. MCP stdio Server Adapter | v6.0 | — | Not started | - |
| 49. Local HTTP Daemon & Local Auth | v6.0 | — | Not started | - |
| 50. Streamable-HTTP Live Streaming | v6.0 | — | Not started | - |
| 51. memory serve CLI Command | v6.0 | — | Not started | - |
| 52. Public Benchmark Suite (LongMemEval + LOCOMO) | v6.0 | — | Not started | - |
| 53. Category-Leader Readiness & Market Gate | v6.0 | — | Not started | - |

---

*Last updated: 2026-07-21 (v6.0 Server Surface & Benchmark Parity roadmapped: Phases 45-53; 21 requirements mapped 21/21)*
