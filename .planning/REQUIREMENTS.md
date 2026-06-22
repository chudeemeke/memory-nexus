# Requirements: @chude/memory

**Defined:** 2026-04-03
**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## v4.0 Requirements

Requirements for v4.0: Intelligence Layer -- automated knowledge extraction, intelligent context delivery, clean CLI surface, portability, and npm publish.

### Knowledge Extraction

- [x] **KNOW-01**: `IExtractionProvider` port in domain layer with extract method; adapters for Claude API (Anthropic SDK, API key auth), Ollama (local), and OpenAI
- [x] **KNOW-02**: `memory extract <project>` extracts atomic facts from session messages via configured provider and stores them in a `facts` SQLite table
- [x] **KNOW-03**: Each extracted fact carries `observed_at` (when the fact was first seen) and optional `superseded_at` / `superseded_by` fields for temporal tracking
- [x] **KNOW-04**: Extraction pipeline compares new candidate facts against existing facts using embedding similarity and decides ADD, UPDATE, DELETE (supersede), or NOOP per fact
- [x] **KNOW-05**: `memory extract` is idempotent -- re-running on already-extracted sessions skips them (tracked via `extraction_log` table)
- [x] **KNOW-06**: `extraction_log` table records each extraction run: session ID, mode, facts added/updated/superseded/skipped, LLM provider/model, tokens consumed
- [x] **KNOW-07**: `memory extract --all --since 7d` batch-extracts facts from all sessions in the last N days with progress reporting
- [x] **KNOW-08**: `memory facts <project>` displays extracted facts for a project; `--superseded` includes historical/invalidated facts

### Context Intelligence

- [x] **CTXT-01**: `memory context <project>` default output is an AI-optimized structured briefing built from extracted facts, friction entries, and recent session summaries (SmartContextService)
- [x] **CTXT-02**: `memory context <project> --global` returns cross-project context by querying all projects, not just the specified one
- [x] **CTXT-03**: `memory context` reads knowledge from SQLite fact tables instead of `~/.memory/` filesystem files
- [x] **CTXT-04**: `~/.memory/` / `MEMORY_HOME` legacy sidecars are not read or written by default; compatibility access requires explicit opt-in and `memory context` warns when a legacy `~/.memory/` directory exists

### CLI Surface

- [x] **CLI-01**: Help output groups commands under labeled categories (Query, Data, System, Feedback) using Commander.js help customization
- [x] **CLI-02**: All query commands (`search`, `context`, `show`, `list`, `related`, `stats`) support `--json` for structured output
- [x] **CLI-03**: All query commands support `--format` flag with at least `brief` and `ai` modes where applicable

### Portability

- [x] **PORT-01**: `memory migrate --from-windows` command checkpoints WAL, verifies integrity, re-installs hooks, and prints session summary by project
- [x] **PORT-02**: `memory doctor --portability` reports mixed-environment data (Windows vs Unix paths), extraction state pointing to non-existent paths, and sqlite-vec availability
- [x] **PORT-03**: Migration protocol documented as a user-facing guide in project documentation

### Bug Fixes

- [x] **FIX-01**: `memory search` handles Unicode characters in queries without FTS5 syntax errors (issue #14)
- [x] **FIX-02**: CLI output respects terminal width and does not truncate content incorrectly (issue #15)
- [x] **FIX-03**: Download progress bar shows correct file size instead of 0/0 MB (issue #163)

### Publishing

- [x] **PUB-01**: `@chude/memory` published to npm registry with correct bin, files, and dependency configuration
- [x] **PUB-02**: `bun add -g @chude/memory` installs successfully and the `memory` binary is available in PATH

### Code Quality (Refactoring)

- [x] **REFAC-01**: `sync.ts` (928 lines) split into focused modules following SRP -- each module handles one concern
- [x] **REFAC-02**: `friction.ts` (638 lines) split into focused modules following SRP -- each module handles one concern

### Quality (Cross-Cutting)

- [x] **QUAL-01**: 95%+ coverage at EACH metric (statements, branches, functions, lines) for the release surface
- [x] **QUAL-02**: Domain layer maintains zero external dependencies
- [x] **QUAL-03**: All new infrastructure adapters follow existing port/adapter patterns
- [x] **QUAL-04**: TDD workflow (RED-GREEN-REFACTOR) for all new features

## v5.0 Requirements

Requirements for v5.0: market-leader memory platform readiness. Source plan: `docs/plans/2026-06-04-v5-market-leader-gsd-plan.md`.

### Product and Evaluation

- [x] **V5-PRD-01**: v5 PRD, threat model, eval baseline, ADRs, review request, readiness rubric, and traceability table are written before implementation.
- [x] **V5-EVAL-01**: Evaluation baseline covers recall precision, cross-project leakage, supersedence, graph traversal, persona usefulness, privacy, and recovery.

### Canonical Event Kernel

- [x] **EVT-01**: `MemoryEventEnvelope` is schema-versioned and includes event id, machine id, sequence, kind, operation, provenance, privacy, causality, payload, and integrity metadata.
- [x] **EVT-02**: Existing fact-shaped event records can be migrated or replayed without data loss.
- [x] **EVT-03**: Projection registry rebuilds facts, entities, links, friction, search indexes, extraction audit, persona, and dream projections from canonical events where applicable.
- [x] **EVT-04**: Replay is deterministic for duplicates, out-of-order events, supersedence, corrupted lines, redaction metadata, and migrated records.

Phase 38.1 completed the current applicable projection path: facts plus facts FTS via existing SQLite triggers. Future entity, link, friction, extraction audit, persona, graph, ranking, and dream projections remain mapped to their later phase requirements and must use the registry instead of removing or bypassing stated features.

### Privacy and Security Governance

- [x] **SEC-05**: Redaction/classification runs before storage, FTS indexing, embedding, extraction, export, remote sync, logs, and provider egress.
- [x] **SEC-06**: `memory audit-secrets` scans database and event logs and reports redacted findings without printing raw secrets.
- [x] **SEC-07**: Remote provider egress requires explicit consent, allowlist policy, and doctor/status warnings.
- [x] **SEC-08**: Remote sync validates remote refs/URLs, uses sanitized Git environment, and refuses to run without durable validated machine identity.
- [x] **SEC-09**: Existing stored sensitive content can be migrated, redacted, or quarantined with audit evidence.

Phase 38.2 completed SEC-05, SEC-06, SEC-07, and SEC-09 for current active surfaces: sync persistence, FTS-backed stored fields, embedding payloads, extraction payloads/events, export defaults, hook/friction logs, provider readiness/creation, and the remote-sync privacy preflight substrate. Phase 38.3 and Phase 38.4 completed the application service, transport, public CLI operations, explicit `memory sync --remote` egress model, and recoverability controls.

### Consent Provenance and Memory Governance

- [x] **CONSENT-01**: Consent/provenance events exist for provider egress, remote sync, persona/profile use, graph enrichment, ranking exemptions, and dream promotion.
- [x] **CONSENT-02**: Every derived memory entry cites source event ids, transformation method, actor, confidence, redaction state, consent state, and scope.
- [x] **CONSENT-03**: Users can inspect, suppress, invalidate, expire, or review derived memory entries.
- [x] **CONSENT-04**: Suppression/invalidation state is enforced by context assembly, graph enrichment, ranking, and dreaming.

Phase 38.2.5 completed the governance substrate for current and future derived surfaces. Fact projection now registers provenance-backed governance entries, governance/consent events replay into durable control state, `memory governance` exposes inspection and suppression/invalidation/review/expiry/consent controls, and context assembly enforces blocked fact governance state. Future remote sync, persona, graph, ranking, and dreaming work must integrate through this governance policy rather than creating parallel consent/provenance controls.

### Remote Sync and Operations

- [x] **SYNC-05**: `RemoteEventSyncService` orchestrates remote sync through application ports; presentation commands do not directly construct infrastructure adapters.
- [x] **SYNC-06**: Git-backed remote event sync commits, fetches, merges, replays, and pushes deterministically without losing past entries.
- [x] **SYNC-07**: Conflict semantics, failure policy, rollback, backup, restore, and recovery are documented and tested.
- [x] **SYNC-08**: `memory remote set/remove/status/preflight/doctor` expose stable JSON output, documented exit codes, and privacy preflight.

Phase 38.3 completed the application-service and Git-transport substrate. Phase 38.4 made the public `memory remote` surface available, kept remote egress explicit through `memory sync --remote`, added stable JSON for status/preflight/doctor/recovery commands, documented exit codes, implemented backup/restore/rollback with `--confirm`, excluded `.git` internals from recovery snapshots, and added the operational runbook at `docs/operations/remote-sync-runbook.md`.

### Secure Capability Interop

- [x] **INTEG-01**: authkey and future capability providers are optional and absence never breaks core workflows.
- [x] **INTEG-02**: Capability interop consumes only masked metadata, handles, proofs, readiness, or fingerprint inventory; no raw secret resolution inside memory-nexus.
- [x] **INTEG-03**: Tests prove no AI-facing path can print or return a raw secret through capability interop.

### Durable Friction Contract

- [x] **FRIC-01**: `memory friction list` has stable JSON schema and exact filter semantics for since, severity, project, tool, status, and privacy-safe contains filters.
- [x] **FRIC-02**: `memory friction list --count --min <n>` has documented exit codes and tests for threshold met, threshold not met, argument errors, and execution errors.

Phase 38.6 completed the durable friction contract. `memory friction list` now exposes exact status/severity/category/tool/project filters, inclusive UTC `--since`, privacy-safe contains filters with redacted metadata fingerprints, stable `schema_version: "1"` JSON envelopes, count/min threshold semantics, and documented exit codes in `docs/reference/friction-query-contract.md`.

### Evaluation Harness

- [x] **EVAL-02**: Executable v5 eval command loads sanitized fixtures and emits schema-versioned JSON results.
- [x] **EVAL-03**: Eval fixtures cover privacy, leakage, supersedence, sync recovery, friction filters, persona, graph, ranking, and dreaming.
- [ ] **EVAL-04**: Phase 43 consumes eval output as readiness evidence and fails on privacy, leakage, or supersedence regressions.

Phase 38.7 completed the executable harness and fixture coverage. `bun run eval:v5` is part of `bun run quality`, and `bun run eval:v5:market` already fails while contract-only fixtures remain. Phase 39 promoted the persona fixture, Phase 40 promoted graph, supersedence, and cross-project leakage fixtures, and Phase 41 promoted ranking to behavior-backed checks. EVAL-04 remains pending until Phase 43 actually consumes the report as final readiness evidence.

### Persona and Procedural Memory

- [x] **PERS-01**: Developer/persona profile projection is generated from preferences, repeated corrections, friction, decisions, and validated behavior patterns.
- [x] **PERS-02**: Persona entries include provenance, confidence, scope, expiry/review metadata, and user-edit/suppress/invalidate controls.
- [x] **PERS-03**: `memory context` can include scoped persona/procedural memory with why-included metadata and no cross-project leakage.

Phase 39 completed the governed persona/procedural memory surface. `PersonaProfileService` derives entries from active facts and recurring friction patterns, `persona_entries` persists scoped profile entries, governance entries enforce suppression/review state, `memory profile show/export/rebuild` exposes inspection/rebuild controls, context assembly includes only governed scoped persona entries with why metadata, and the persona eval fixture is behavior-backed.

### Temporal Semantic Graph

- [x] **GRAPH-01**: Entity and relation taxonomy covers projects, tools, people, decisions, errors, plans, files, commands, and capabilities.
- [x] **GRAPH-02**: Extraction emits candidate entities/relationships with confidence and temporal validity.
- [x] **GRAPH-03**: Search/context can use graph enrichment with reasons while preserving vector/reranker baseline.
- [x] **GRAPH-04**: Graph pruning and stale-edge policy prevent unbounded noisy relationship growth.

Phase 40 completed temporal semantic graph projection. `GraphEdge`, `IGraphRepository`, `graph_edges`, `SqliteGraphRepository`, `TemporalGraphService`, event-log graph projection, graph governance registration, and context graph enrichment are implemented. Graph candidates are derived from fact metadata with confidence and validity windows, current-edge queries enforce `valid_from` / `valid_to` / confidence / scope, graph context includes why-included metadata, and stale/noisy edges are pruned or excluded. Phase 40 also tightened cross-project context so unrelated project facts must be explicitly global before appearing in another project's context.

### Importance, Utility, and Recall Ranking

- [x] **RANK-03**: Facts, links, profiles, and dreams track access/utility metrics.
- [x] **RANK-04**: Ranking applies memory-kind half-life policies, evergreen exemptions, and supersedence filtering.
- [x] **RANK-05**: Retrieval output can explain why each result was ranked or included.

Phase 41 completed the utility-aware ranking surface. `MemoryUtilityMetric` and `memory_utility_metrics` track `fact`, `persona`, `graph`, `link`, and future `dream` targets without provider or network coupling. `MemoryRankingService` applies per-kind/type half-life policies, supersedence/governance/temporal exclusion, evergreen and pinned exemptions, access utility, and deterministic why-ranked explanations. `SmartContextService`, `memory context`, and ambient context now rank allowed facts/persona/graph entries after governance filtering. The ranking eval fixture is behavior-backed through the real ranking service. Dream proposal production remains Phase 42, but it uses the same metric surface instead of a separate ranking schema.

### Embedding Pipeline Resilience

- [x] **EMBED-RES-01**: Embedding batches are bounded by both configured item count and a conservative provider/transport payload budget.
- [x] **EMBED-RES-02**: Provider payload-too-large failures on multi-item batches are retried through deterministic splitting while preserving input/result order.
- [x] **EMBED-RES-03**: Provider payload-too-large failures on a single item create a durable, model-scoped skip/quarantine record with safe metadata only.
- [x] **EMBED-RES-04**: Resume excludes current-model skipped rows, continues later rows, and reports embedded/skipped/failure counts honestly in CLI and JSON surfaces.
- [x] **EMBED-RES-05**: Tests cover Ollama 413 behavior, repository skip filtering, application resume semantics, and privacy-safe error reporting without raw transcript content.

Phase 41.1 was inserted after Phase 41 because Kanbanflow re-embedding surfaced a deterministic 413 failure against the Tailscale Ollama sidecar. This is an all-consumer memory reliability issue, not a Kanbanflow-specific workaround. The fix must keep provider choice loosely coupled: Ollama gets concrete 413 coverage, but the application behavior must work for any provider that signals payload-too-large or equivalent request-size failure.

Phase 41.1 completed the memory-side source fix. Embedding now has typed provider payload-too-large errors, Ollama 413 split/retry, byte-bounded service batches, durable model-scoped skip/quarantine state, resume filtering, and safe skipped-count CLI/JSON reporting. Verification passed typecheck, build, full tests, isolation, coverage, dependency audit, inbox lint, and diff whitespace. The installed global `memory@4.0.0` binary is not claimed fixed until a fixed install or publish smoke is run.

### Dreaming Consolidation

- [ ] **DREAM-01**: `memory dream` produces schema-versioned audited dream entries.
- [ ] **DREAM-02**: Dream proposals promote/supersede through canonical events, not hidden mutation.
- [ ] **DREAM-03**: Background dreaming is disabled until explicit command path is safe, audited, redacted, and rollback-capable.

### Feature Completeness and UX

- [ ] **UX-01**: Feature inventory covers current code, docs, roadmap, requirements, inbox, tests, and disabled prototype surfaces.
- [ ] **UX-02**: Every stated, implemented, documented, inferred, disabled, or prototype feature is completed or explicitly owned by a later gate; no feature is silently removed.
- [ ] **UX-03**: CLI help, errors, preflights, JSON schemas, docs, onboarding, backup/restore, audit, and recovery flows meet excellent usability standards.
- [ ] **UX-04**: Phase 42.5 traces every Product North Star claim in `.planning/PROJECT.md` to implemented behavior, an explicit later owner, or a documented non-goal with rationale.

### Market and Sales Readiness

- [ ] **READY-01**: Architecture review grades excellent against hexagonal/SOLID/deep-module criteria.
- [ ] **READY-02**: Security review grades excellent against secrets, privacy, egress, remote sync, dependency, audit, and recovery criteria.
- [ ] **READY-03**: Quality review passes typecheck, build, full tests, test isolation, 95% coverage at each metric, dependency audit, gitleaks, and published-package smoke.
- [ ] **READY-04**: Product review proves fresh-user install, onboarding, configure, audit, backup, restore, upgrade, and verification flows.
- [ ] **READY-05**: Competitive review demonstrates a crisp local-first value proposition and no known unowned blocker.
- [ ] **READY-06**: Phase 43 includes a Product North Star conformance audit and blocks market-ready approval on any unowned mismatch.

### Release Candidate and Publish Handoff

- [ ] **REL-01**: Versioning, changelog, release notes, package contents, npm pack, install smoke, and publish dry-run pass.
- [ ] **REL-02**: Release runbook documents OTP publish steps, rollback, dist-tag handling, and post-publish verification.
- [ ] **REL-03**: Real npm publish is not run until the user explicitly authorizes and completes OTP.

## Future Requirements

Deferred. Tracked for context, not in current roadmap.

### Consolidation

- **CONSOL-01**: `memory consolidate` background command merges near-duplicate facts (0.95 cosine threshold)
- **CONSOL-02**: Periodic summary generation from fact clusters

### Optimization

- **OPT-01**: Binary quantization option for large databases (32x storage reduction)
- **OPT-02**: Matryoshka dimension reduction for nomic-embed-text-v1.5
- **OPT-03**: Transformers.js v4 migration when stable (4x embedding speedup)

### aidev Integration

- **AIDEV-01**: Create MemoryCommand in aidev's TS CLI
- **AIDEV-02**: Wire `cmd_memory()` in bash dispatcher to delegate to TS CLI

### Advanced Portability

- **PORT-04**: Project alias table mapping different encoded paths to same logical project across environments

## v4.0 Out of Scope (Historical)

| Feature | Reason |
|---------|--------|
| Graph database (Neo4j, etc.) | Overkill for single-developer tool; SQLite + foreign keys suffice per Mem0/Zep research |
| Real-time extraction (per-message) | We extract retrospectively from completed JSONL sessions |
| Entity-relationship triplets (Zep-style) | Natural language facts are simpler and sufficient for our use case |
| Multi-user scoping | Single-user tool; project-level scoping is the equivalent |
| Command restructuring/renaming | Research confirms current names follow industry conventions; labeled help groups solve discoverability |
| Factory pattern for storage backends | Only target SQLite; indirection adds complexity without benefit |
| Community detection / label propagation | Requires graph infrastructure we don't have |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KNOW-01 | Phase 33 | Complete |
| KNOW-02 | Phase 34 | Complete |
| KNOW-03 | Phase 33 | Complete |
| KNOW-04 | Phase 34 | Complete |
| KNOW-05 | Phase 33 | Complete |
| KNOW-06 | Phase 33 | Complete |
| KNOW-07 | Phase 34 | Complete |
| KNOW-08 | Phase 34 | Complete |
| CTXT-01 | Phase 35 | Complete |
| CTXT-02 | Phase 35 | Complete |
| CTXT-03 | Phase 35 | Complete |
| CTXT-04 | Phase 35 | Complete |
| CLI-01 | Phase 32 | Complete |
| CLI-02 | Phase 32 | Complete |
| CLI-03 | Phase 32 | Complete |
| PORT-01 | Phase 36 | Complete |
| PORT-02 | Phase 36 | Complete |
| PORT-03 | Phase 36 | Complete |
| FIX-01 | Phase 31 | Complete |
| FIX-02 | Phase 31 | Complete |
| FIX-03 | Phase 31 | Complete |
| PUB-01 | Phase 37 | Complete |
| PUB-02 | Phase 37 | Complete |
| REFAC-01 | Phase 30 | Complete |
| REFAC-02 | Phase 30 | Complete |
| QUAL-01 | All + Phase 36.9 | Complete |
| QUAL-02 | All | Complete |
| QUAL-03 | All | Complete |
| QUAL-04 | All | Complete |
| V5-PRD-01 | Phase 38.0 | Complete |
| V5-EVAL-01 | Phase 38.0 | Complete |
| EVT-01 | Phase 38.1 | Complete |
| EVT-02 | Phase 38.1 | Complete |
| EVT-03 | Phase 38.1 | Complete |
| EVT-04 | Phase 38.1 | Complete |
| SEC-05 | Phase 38.2 | Complete |
| SEC-06 | Phase 38.2 | Complete |
| SEC-07 | Phase 38.2 | Complete |
| SEC-08 | Phase 38.3 | Complete |
| SEC-09 | Phase 38.2 | Complete |
| CONSENT-01 | Phase 38.2.5 | Complete |
| CONSENT-02 | Phase 38.2.5 | Complete |
| CONSENT-03 | Phase 38.2.5 | Complete |
| CONSENT-04 | Phase 38.2.5 | Complete |
| SYNC-05 | Phase 38.3 | Complete |
| SYNC-06 | Phase 38.3 | Complete |
| SYNC-07 | Phase 38.4 | Complete |
| SYNC-08 | Phase 38.4 | Complete |
| INTEG-01 | Phase 38.5 | Complete |
| INTEG-02 | Phase 38.5 | Complete |
| INTEG-03 | Phase 38.5 | Complete |
| FRIC-01 | Phase 38.6 | Complete |
| FRIC-02 | Phase 38.6 | Complete |
| EVAL-02 | Phase 38.7 | Complete |
| EVAL-03 | Phase 38.7 | Complete |
| EVAL-04 | Phase 43 | Pending |
| PERS-01 | Phase 39 | Complete |
| PERS-02 | Phase 39 | Complete |
| PERS-03 | Phase 39 | Complete |
| GRAPH-01 | Phase 40 | Complete |
| GRAPH-02 | Phase 40 | Complete |
| GRAPH-03 | Phase 40 | Complete |
| GRAPH-04 | Phase 40 | Complete |
| RANK-03 | Phase 41 | Complete |
| RANK-04 | Phase 41 | Complete |
| RANK-05 | Phase 41 | Complete |
| EMBED-RES-01 | Phase 41.1 | Complete |
| EMBED-RES-02 | Phase 41.1 | Complete |
| EMBED-RES-03 | Phase 41.1 | Complete |
| EMBED-RES-04 | Phase 41.1 | Complete |
| EMBED-RES-05 | Phase 41.1 | Complete |
| DREAM-01 | Phase 42 | Pending |
| DREAM-02 | Phase 42 | Pending |
| DREAM-03 | Phase 42 | Pending |
| UX-01 | Phase 42.5 | Pending |
| UX-02 | Phase 42.5 | Pending |
| UX-03 | Phase 42.5 | Pending |
| UX-04 | Phase 42.5 | Pending |
| READY-01 | Phase 43 | Pending |
| READY-02 | Phase 43 | Pending |
| READY-03 | Phase 43 | Pending |
| READY-04 | Phase 43 | Pending |
| READY-05 | Phase 43 | Pending |
| READY-06 | Phase 43 | Pending |
| REL-01 | Phase 44 | Pending |
| REL-02 | Phase 44 | Pending |
| REL-03 | Phase 44 | Pending |

**Coverage:**
- v4.0 requirements: 25 total (excluding QUAL cross-cutting)
- Cross-cutting: 4 QUAL requirements
- v5.0 requirements: 53 total
- v5.0 complete: 36/53
- v5.0 pending: 17/53
- v5.0 mapped to phases: 53/53
- v5.0 unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-06-22 after Phase 41.1 embedding resilience completed source verification*
