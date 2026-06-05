---
title: v5 Market-Leader GSD Plan
created: 2026-06-04
status: ready-for-execution
scope: memory-nexus v5.0 and sales-readiness closure
---

# v5 Market-Leader GSD Plan

This plan turns the post-v4 roadmap into an execution-ready GSD framework. It is intentionally stricter than the existing v5 sketch because `memory` is first-class first-party infrastructure used across the user's project portfolio.

## Intent

Build `@chude/memory` until a fresh architecture, security, quality, implementation-completeness, product-roadmap, and sales-readiness review can honestly grade it excellent.

This does not mean "add every possible memory feature." It means the product is coherent, robust, secure, observable, recoverable, well-packaged, and competitive with top agent-memory systems for its local-first developer-memory niche.

## First Principles

1. A memory tool is a trust product.
   It ingests transcripts, tool output, source paths, decisions, preferences, and mistakes. Privacy, redaction, provenance, and recovery are not optional features.

2. Memory must be replayable.
   If the event log is the canonical store, every derived projection must have explicit replay semantics and tests. A partial rebuild function is not enough.

3. Sync is transport, not memory.
   Git-backed remote sync only becomes valuable after canonical event semantics, conflict handling, redaction, durable identity, and projection replay exist.

4. Top-tier memory is typed, scoped, temporal, and explainable.
   Current leaders emphasize graph/entity context, temporal invalidation, context assembly, scoped namespaces, and update strategy. `memory` must support project, global, persona, graph, procedural, and episodic distinctions without leaking irrelevant facts across scopes.

5. Local-first must remain a product advantage.
   The product should work fully without authkey, cloud providers, remote sync, or a hosted graph database. Optional integrations may improve workflows, but must not become hidden dependencies.

6. The CLI is a contract.
   Cross-project consumers need stable JSON schemas, exit codes, and privacy-safe filters. Presentation commands should be adapters over application use cases, not the product architecture.

7. Sales-ready means operations-ready.
   Install, upgrade, doctor, audit, backup, restore, rollback, dependency security, docs, and evals must all pass. A feature that works only on the maintainer's machine is not sales-ready.

## Research Baseline

The current market points to these non-negotiable capabilities:

- Mem0 Graph Memory persists entities and relationships alongside embeddings, then adds related graph context to vector results.
- Zep uses temporal knowledge graphs, fact invalidation, and context strings that include relevant facts, entities, and valid date ranges.
- Letta separates persisted state from in-context memory blocks, so important memory is pinned while older state remains retrievable from storage.
- LangGraph frames long-term memory by semantic, episodic, and procedural memory, scoped across namespaces, and updated either on the hot path or asynchronously.

Implication for `memory`: the correct roadmap is not "Git sync, then graph, then decay." The correct roadmap is "canonical event kernel and governance, then sync, then typed context layers and evals."

## Architecture Target

### Required Modules

- `MemoryEventKernel`
  - Deep module for event envelopes, validation, append, read, replay ordering, idempotency, and integrity.
  - Interface includes schema version, event id, machine id, sequence, kind, operation, provenance, privacy, causality, payload, and integrity hash.

- `ProjectionRegistry`
  - Deep module for registering projections and replay contracts.
  - Facts, entities, links, friction, search indexes, extraction audit, persona profile, and dream logs must declare consumed event types.

- `RedactionPolicyEngine`
  - Deep module for classification and redaction before storage, indexing, embedding, extraction, export, remote sync, and logs.
  - Stores redaction version, classes, counts, and explicit override evidence.

- `RemoteEventSyncService`
  - Application service behind ports. CLI must not orchestrate Git, config mutation, database replay, or projection rebuilds directly.
  - Ports: event store, remote transport, projection registry, machine identity, redactor, config store, clock, logger.

- `MemoryContextAssembler`
  - Product-level context assembly, not just grouped facts.
  - Returns why-included metadata, provenance, confidence, recency, scope, and redaction status.

- `EvaluationHarness`
  - Replayable fixtures and rubric tests for recall precision, cross-project leakage, supersedence, graph traversal, privacy, and persona usefulness.

## Security Target

Required before any v5 feature is considered complete:

- No raw secret retrieval through AI-visible command paths.
- No plaintext provider API keys stored or recommended.
- Redaction before durable storage and every egress path.
- Remote-provider consent, allowlist, and warnings.
- Remote sync preflight showing sensitive-event counts before first push.
- Validated remote URLs and sanitized Git environment.
- Durable machine identity with validation and refusal on non-persistence.
- Audit command for existing database/event-log secret exposure.
- Dependency audit blocks high/critical production-impact vulnerabilities unless documented and explicitly accepted with scope.
- Existing events can be migrated, redacted, or quarantined without data loss.

## GSD Phase Plan

### Phase 38.0 - v5 Threat Model, Product PRD, and Eval Baseline

Goal: lock the product definition and risk model before implementation.

Tasks:
- Write v5 PRD with user stories for local-first memory, remote sync, persona, graph, ranking, dreaming, and consumer contracts.
- Write remote-sync threat model covering data egress, plaintext vs encrypted remote logs, local-path remotes, conflicts, rollback, durable identity, Git helper trust, and provider trust.
- Create v5 requirements and traceability entries.
- Build initial eval fixtures from sanitized transcripts and synthetic cases.
- Define excellent-grade rubric for architecture, security, quality, implementation completeness, product readiness, and sales readiness.

Exit gates:
- PRD, threat model, eval plan, requirements, and roadmap are committed.
- Cross-AI review requested for the plan before implementation.
- Existing Phase 38 prototype remains disabled behind `MEMORY_EXPERIMENTAL_REMOTE_SYNC=1`.

### Phase 38.1 - Canonical Event Kernel and Projection Replay

Goal: make the event log a real source of truth.

Tasks:
- Introduce `MemoryEventEnvelope` value object and validators.
- Introduce `MachineId`, `EventId`, `EventSequence`, and `EventHash` value objects.
- Replace fact-shaped event records with schema-versioned event envelopes.
- Add event migration for existing v1 fact-shaped records.
- Replace generic `rebuildProjections` with a projection registry.
- Add replay tests for empty logs, duplicate events, out-of-order events, supersedence, corrupted lines, redaction metadata, and migration.

Exit gates:
- Domain layer remains dependency-free.
- Projection replay can rebuild derived state from event logs in a fresh database.
- No presentation command imports infrastructure event-log implementation directly.

### Phase 38.2 - Redaction, Privacy Governance, and Audit Commands

Goal: make privacy controls load-bearing before remote sync.

Tasks:
- Promote redaction to an application port and policy engine.
- Ensure redaction runs before message/tool-result storage, FTS, embeddings, extraction, export, remote sync, and logs.
- Add `memory audit-secrets` for database and event logs.
- Add redaction migration/quarantine path for existing stored content.
- Add provider egress policy: consent, host allowlist, and status/doctor warnings for remote LLM/embedding providers.

Exit gates:
- Tests prove secrets are redacted before every persistence and egress path.
- `memory export` remains redacted by default.
- `gitleaks detect --redact --source .` passes.

### Phase 38.3 - Remote Sync Application Service and Git Transport

Goal: implement remote sync through a deep application module and shell-safe transport adapter.

Tasks:
- Create `RemoteEventSyncService` and ports.
- Implement `GitRemoteEventTransport` as an adapter only.
- Validate remote refs and URLs.
- Enforce durable machine identity before sync.
- Define conflict semantics and deterministic merge ordering.
- Add integration tests with temporary bare repositories.
- Use current first-party `remotely` conventions for cross-machine verification where needed.

Exit gates:
- Remote sync does not run unless explicitly enabled by product config.
- No raw shell interpolation.
- Sync can recover from fetch failure, push failure, conflict, missing identity, corrupt event line, and projection rebuild failure.

### Phase 38.4 - Remote CLI, Operations, Backup, and Recovery

Goal: make remote sync usable and supportable.

Tasks:
- Implement `memory remote set/remove/status/preflight`.
- Integrate `memory sync --remote` or a clearly named equivalent through `RemoteEventSyncService`.
- Add `memory remote doctor` diagnostics.
- Add backup, restore, and rollback documentation.
- Add Windows, WSL, Linux POSIX, and macOS path/runtime verification notes.

Exit gates:
- CLI JSON output is schema-versioned.
- Exit codes are documented and tested.
- Remote sync preflight reports privacy and transport risk before first push.

### Phase 38.5 - Secure Capability Interop

Goal: make authkey and future secure tools optional capability providers, never hard dependencies.

Tasks:
- Add optional capability-status port.
- Support masked readiness/status/handle/proof metadata only.
- Treat `authkey://...` as references for diagnostics and documentation, never resolver input.
- Add tests proving absence of authkey is not failure.
- Add tests proving no AI-facing path can print or return a raw secret through capability interop.

Exit gates:
- All local workflows pass with no authkey installed.
- Capability interop improves diagnostics but does not change the core dependency graph.

### Phase 38.6 - Durable Friction Query Contract

Goal: turn friction into a stable durable signal without overfitting to one consumer.

Tasks:
- Extend `memory friction list` with `--since`, exact severity/project/tool/status filters, privacy-safe contains filters, `--count`, `--min`, and documented exit codes.
- Define UTC/local/inclusive date semantics.
- Add stable JSON schema.
- Add tests for filters, count, min threshold, DB unavailable/corrupt behavior, and privacy-safe query handling.

Exit gates:
- Conversations can optionally replace transient JSONL scanning, but no consumer-specific coupling is introduced.
- JSON schema and exit codes are stable and documented.

### Phase 39 - Persona and Procedural Memory

Goal: create a high-density developer/agent profile that is useful without becoming unreviewed self-reinforcing bias.

Tasks:
- Define persona/profile event types and projection.
- Build profile compiler from preferences, repeated corrections, friction, decisions, and validated behavior patterns.
- Add confidence, provenance, scope, and expiry/review metadata.
- Add `memory profile show/export/rebuild`.
- Integrate profile into `memory context` with explicit why-included metadata.

Exit gates:
- Persona entries are traceable to source events.
- Users can inspect, edit, suppress, or invalidate profile facts.
- Cross-project profile injection is scoped and does not leak project-private facts.

### Phase 40 - Temporal Semantic Graph

Goal: add graph traversal where it improves recall and explanation.

Tasks:
- Define entity and relation taxonomy for developer projects, tools, people, decisions, errors, plans, files, commands, and capabilities.
- Extend extraction to emit candidate entities and relationships with confidence.
- Store graph events and project them into `entities` and `links`.
- Add graph-aware search/context enrichment with reasons.
- Add pruning and stale-edge policies.

Exit gates:
- Vector search remains the primary ranking baseline; graph augments and explains.
- Graph extraction has confidence thresholds and does not create noisy edges unchecked.
- Temporal invalidation is represented in links/facts.

### Phase 41 - Importance, Utility, and Recall Ranking

Goal: make retrieval prioritize useful current truth without losing evergreen decisions.

Tasks:
- Add access/utility metrics for facts, links, profiles, and dreams.
- Extend temporal decay beyond message rowids into memory facts.
- Add half-life policies by memory kind.
- Add explicit exemptions for evergreen decisions and durable user preferences.
- Add evaluation tests for stale facts, superseded facts, high-utility older decisions, and recent low-quality noise.

Exit gates:
- Retrieval includes why-ranked metadata.
- Superseded facts are not returned as active truth unless explicitly requested.
- Ranking improvements are measured against eval fixtures.

### Phase 42 - Dreaming Consolidation

Goal: add asynchronous consolidation without hidden mutation or unreviewed data loss.

Tasks:
- Implement `memory dream` as explicit command first.
- Produce `dreams.jsonl` with schema-versioned audit entries.
- Generate proposed promotions/supersedences, then apply through event kernel.
- Add idle hook only after explicit command is safe.
- Add guardrails for rate limits, provider policy, redaction, and rollback.

Exit gates:
- Dreaming is replayable and auditable.
- Promotions/supersedences are event-sourced.
- Background operation cannot silently corrupt or delete canonical memory.

### Phase 43 - Market-Leader and Sales-Readiness Gate

Goal: prove the product is excellent rather than merely feature-complete.

Tasks:
- Run architecture review against hexagonal/SOLID/deep-module criteria.
- Run security review against secrets, privacy, egress, dependency, audit, and recovery criteria.
- Run quality review: typecheck, build, full tests, test isolation, 95% coverage at every metric, dependency audit, gitleaks, published-package smoke.
- Run product review: onboarding, docs, examples, upgrade/migration, doctor, errors, supportability, consumer contracts.
- Run competitive review against local-first niche and leading agent-memory patterns.
- Write final readiness report with grades and any remaining blockers.

Exit gates:
- Every review grades excellent or lists blocking fixes.
- `@chude/memory` can be installed, configured, audited, backed up, restored, upgraded, and verified by a fresh user.
- No active roadmap blocker, inbox blocker, or hidden known defect remains unowned.

## Execution Order

1. Phase 38.0
2. Phase 38.1
3. Phase 38.2
4. Phase 38.2.5
5. Phase 38.3
6. Phase 38.4
7. Phase 38.5
8. Phase 38.6
9. Phase 38.7
10. Phase 39
11. Phase 40
12. Phase 41
13. Phase 42
14. Phase 42.5
15. Phase 43
16. Phase 44

Do not start remote sync implementation before Phase 38.0 threat model, Phase 38.1 event kernel, Phase 38.2 privacy controls, and Phase 38.2.5 consent/provenance controls are accepted. Do not start graph/persona/dreaming until event replay, redaction, consent, and eval fixtures are stable.

## 2026-06-05 Amendment: Feature Preservation and Release Controls

The execution plan is amended after Phase 38.0 research and user clarification:

- Feature preservation is a hard invariant. No stated, inferred, prototype, documented, disabled, or partial feature may be removed to make v5 easier to ship. If a feature is incomplete, it must be completed, explicitly scoped to a later owned phase, or blocked with evidence.
- Phase 38.2.5 is required for consent provenance, suppression, invalidation, review, and governance events before remote sync can ship.
- Phase 38.7 is required for an executable evaluation harness and regression fixtures before persona, graph, ranking, or dreaming can claim production readiness.
- Phase 42.5 is required for feature-completeness inventory, UX polish, CLI/API ergonomics, and fresh-user usability before the final readiness gate.
- Phase 44 is required for release-candidate packaging, package smoke, npm dry-run, changelog/release notes, and OTP-backed publish handoff. Real publish remains user-authorized only.

## Verification Standard

Every phase must include:

- TDD plan: red tests first.
- Unit, application, adapter, CLI, and integration tests proportional to risk.
- `bun run typecheck`
- `bun run build`
- `bun test --timeout 15000`
- `bun run test:isolation`
- `bun run test:coverage`
- `bun audit`
- `gitleaks detect --no-banner --redact --source .`
- Explicit manual/UAT smoke where CLI, install, sync, or cross-machine behavior changes.

## Definition of Excellent

The final application can be graded excellent only if:

- Architecture: domain/application/presentation/infrastructure seams are clear, modules are deep, CLI is an adapter, and event replay is canonical.
- Security: no hidden secret paths, no unredacted egress by default, remote sync is consented and inspectable, and audit/recovery paths exist.
- Quality: gates pass, coverage is honest at each metric, tests are isolation-safe, and mutation/eval checks cover core algorithms.
- Implementation completeness: every roadmap feature has code, tests, docs, migration, and operational diagnostics.
- Product readiness: a fresh user can install, configure, understand, recover, and trust it.
- Sales readiness: the product has a crisp local-first value proposition, competitive comparison, onboarding, support docs, and no known unowned blocker.
