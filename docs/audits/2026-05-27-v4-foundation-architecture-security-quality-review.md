---
title: v4 Foundation Architecture, Security, and Quality Review
date: 2026-05-27
status: current-state-review
scope: v4.0 intelligence-layer foundation
source_of_truth: codebase inspection and live gates, not roadmap claims
---

# v4 Foundation Architecture, Security, and Quality Review

## Bottom line

The v4.0 foundation is not publication-grade yet.

The issue is not who or what implemented it. The issue is that the current code does not prove the properties the roadmap claims: strict hexagonal boundaries, event-log SSOT, secure memory ingestion, privacy-aware extraction, high-confidence release gates, and market-ready quality.

The implementation contains useful pieces: domain entities, ports, repository adapters, a broad CLI, SQLite projections, FTS/vector search, fact extraction, and context briefing. But several of the core v4 claims are only partially true. In particular:

- The code is partly hexagonal by folder naming, but application services still depend on infrastructure/runtime types.
- The event log is fact-shaped, not a robust canonical event model.
- The security boundary for sensitive transcript data is still weak.
- The quality gates are currently failing or too easy to bypass.
- The public API exports CLI command executors rather than a clean application API.
- The roadmap marks v4 phases as complete even though key acceptance criteria are not demonstrably enforced.

This should be treated as a foundation hardening phase before publishing, not as a small polish pass.

## Verified gate state

Commands were run from `C:\Projects\memory-nexus`.

| Gate | Result | Meaning |
| --- | --- | --- |
| `bun test --timeout 15000` | PASS, 3665 tests | Functional regression suite currently passes. |
| `bun test --coverage --timeout 15000` | PASS, 3665 tests | Coverage run completes, but file-level gaps remain and no hard 95%-each-metric enforcement was observed in the command. |
| `bun run typecheck` | FAIL | Release blocker. |
| `bun run test:isolation` | FAIL | Release blocker; first-party module mocking has reappeared. |
| `bun audit` | FAIL | Release blocker; dependency vulnerability surface is not market-ready. |
| `gitleaks detect --no-banner --redact --source .` | PASS | No literal secret leak found in the repository scan. |
| `bun run build` | Misleading PASS | `build:types` uses `tsc --project tsconfig.lib.json || true`, and `tsconfig.lib.json` weakens strict options. |

## Architecture Findings

### A1 - Application services depend on infrastructure/runtime details

Evidence:

- `src/application/services/sync-service.ts:11` imports `Database` from `bun:sqlite`.
- `src/application/services/sync-service.ts:116` stores the raw `Database`.
- `src/application/services/sync-service.ts:455-482` opens a SQLite transaction directly.
- `src/application/services/extraction-pipeline.ts:15` imports `Database` from `bun:sqlite`.
- `src/application/services/extraction-pipeline.ts:24` imports `appendEvent` and `rebuildProjections` from infrastructure.

Why this matters:

This violates the intended dependency direction. The application layer should orchestrate ports; it should not know the database engine, transaction primitive, or concrete event-log implementation.

Correct shape:

- Introduce an `IUnitOfWork` or `ITransactionRunner` port.
- Introduce an `IFactEventLog` / `IKnowledgeEventStore` port.
- Introduce an `IProjectionRebuilder` or event-applier port.
- Keep `bun:sqlite`, file IO, and event-log files in infrastructure adapters only.

### A2 - Event-log SSOT is too weak to be the durable canonical model

Evidence:

- `src/infrastructure/database/event-log.ts` serializes `Fact` objects directly.
- The event record lacks a first-class event id, event type, operation, schema version migration strategy, writer identity, sequence, causal parent/hash, redaction metadata, and conflict metadata.
- `src/application/services/extraction-pipeline.ts:185-196` represents supersedence by creating a synthetic fact of type `supersedence` with UUIDs stored in untyped metadata.
- `src/domain/entities/fact.ts:26`, `35`, and `45` use `Record<string, any>` for metadata.

Why this matters:

Fact records and domain events are not the same thing. A fact is a projection-friendly domain object. A canonical event needs to describe what happened, who/what wrote it, how to replay it deterministically, and how to resolve or audit conflicts later.

Correct shape:

Define an explicit event envelope, for example:

```ts
interface KnowledgeEvent {
  eventId: string;
  schemaVersion: 1;
  eventType: "fact.added" | "fact.superseded" | "fact.redacted" | "fact.corrected";
  aggregateId: string;
  writer: { machineId: string; agent?: string };
  occurredAt: string;
  observedAt: string;
  project: string;
  payload: unknown;
  privacy: { classification: "public" | "internal" | "sensitive"; redactionVersion: string };
  causality?: { previousEventId?: string; contentHash?: string };
}
```

Then make facts a projection of those events, not the event format itself.

### A3 - Projection rebuild semantics are incomplete

Evidence:

- `rebuildProjections` only deletes and rebuilds the `facts` table from fact events.
- v4/v5 roadmap features involve sessions, facts, friction, links, ambient context, and future remote sync, but the projection rebuild is named generally while only rebuilding one surface.

Why this matters:

If the plain-text log is the canonical store, every derived projection affected by canonical events must have explicit replay semantics. A partial rebuild function creates false confidence and will fail once remote sync, graph relations, persona profiling, or dreaming exists.

Correct shape:

- Rename the current function to `rebuildFactProjection` if kept narrow.
- Add a projection registry.
- Make each projection declare the event types it consumes.
- Add replay contract tests for empty log, duplicate event, supersedence, redaction, out-of-order events, and corrupted line handling.

### A4 - The public API is CLI-shaped, not product/API-shaped

Evidence:

- `src/index.ts:16-36` exports `execute*Command` functions from presentation CLI modules.
- Programmatic API consumers therefore inherit CLI options, stdout/stderr behavior, process-like exit codes, and presentation dependencies.

Why this matters:

This is fine for internal test seams, but weak for a published package. A serious memory tool needs stable application-level APIs such as `syncSessions`, `searchMemory`, `getContext`, `extractFacts`, `exportMemory`, and `auditSecrets`.

Correct shape:

- Keep CLI executors internal or explicitly mark them as presentation API.
- Export stable application services/use cases with typed request/response DTOs.
- Preserve CLI as an adapter over the same application use cases.

### A5 - Smart context is useful but not yet an elite memory retrieval policy

Evidence:

- `SmartContextService` groups active facts by type and priority.
- Cross-project context in `src/application/services/smart-context-service.ts:197-236` pulls all global active facts and filters by broad type.
- Budgeting is character-estimate based.

Why this matters:

This is useful but shallow. Top memory systems distinguish durable identity/preferences, project-specific decisions, active tasks, stale/invalidated facts, provenance, confidence, recency, and retrieval reason. v4 currently has buckets, not a high-confidence retrieval policy.

Correct shape:

- Add provenance to every surfaced fact.
- Add retrieval reasons and confidence/recency scoring.
- Add stronger global-vs-project scoping.
- Add tests proving irrelevant cross-project facts do not leak into briefings.
- Add "why included" metadata for AI-consumable context.

## Security Findings

### S1 - Transcript ingestion still has no first-class redaction boundary

Evidence:

- `src/infrastructure/parsers/event-classifier.ts:214-232` extracts user/tool-result content directly.
- `src/infrastructure/parsers/event-classifier.ts:351-361` stores tool result content directly or JSON-stringified.
- `src/application/services/sync-service.ts:531-535`, `579-585`, and `606-608` turn parsed content into persisted messages/tool results.
- `src/infrastructure/database/repositories/message-repository.ts:87-90` and `117-125` insert message content into SQLite as-is.
- `src/infrastructure/database/schema.ts:35-43` stores message content, and `53-59` indexes it via FTS.
- `src/infrastructure/database/schema.ts:84-93` stores tool input/result.

Why this matters:

This is the largest security issue in the foundation. The product ingests agent transcripts, tool inputs, and tool outputs. Those often include secrets, credentials, private file contents, proprietary source, API responses, and personal data. A memory tool that indexes that without redaction is not market-ready.

Correct shape:

- Add an `IRedactor` domain/application port.
- Run redaction before storage, FTS indexing, embedding, extraction, export, and remote sync.
- Persist redaction rule version and redaction counts.
- Add `memory audit-secrets`.
- Make `--no-redact` an explicit, noisy, per-run override, not a silent default.

### S2 - External embedding/extraction can exfiltrate sensitive content

Evidence:

- `src/infrastructure/embedding/openai-provider.ts:60-70` sends raw text to OpenAI embeddings.
- `src/infrastructure/embedding/openai-provider.ts:105-115` sends raw text batches to OpenAI embeddings.
- `src/infrastructure/embedding/openai-provider.ts:42` accepts `baseUrl` override.
- `src/presentation/cli/commands/extract.ts` selects providers from env/config and can use Anthropic/OpenAI/Ollama/Claude CLI extraction paths.

Why this matters:

Without redaction, egress policy, and explicit provider consent, the tool can send the user's memory corpus to third parties or arbitrary endpoints.

Correct shape:

- Default to local/private providers.
- Require explicit first-use consent for remote providers.
- Validate/allowlist remote provider hosts.
- Redact before embedding/extraction.
- Add doctor/status warnings when remote providers are configured.

### S3 - Secrets are allowed in plain config

Evidence:

- `src/infrastructure/hooks/config-manager.ts:37-40` supports `apiKey` and `baseUrl` in config.
- `src/infrastructure/hooks/config-manager.ts:331-344` merges and preserves user embedding config.
- Health checks reference `config.embedding.apiKey`.

Why this matters:

Plain JSON config is not a secret store. This conflicts with the project's secrets-management expectations.

Correct shape:

- Config should reference environment variable names or secret aliases, not raw values.
- Migrate/warn if `apiKey` exists in config.
- Never print configured secret material.

### S4 - Export has no sensitivity boundary

Evidence:

- `src/presentation/cli/commands/export.ts:37-40` exposes full database export.
- `src/presentation/cli/commands/export.ts:65-88` exports without sensitivity warning, redaction mode, or scoped export confirmation.

Why this matters:

Export is a legitimate feature, but with unredacted memory data it becomes a bulk exfiltration path.

Correct shape:

- Add scoped export by default.
- Add `--include-sensitive` or `--raw` explicit confirmation after redaction exists.
- Add export manifest with redaction version and data classes.

## Quality Findings

### Q1 - Release gates are not trustworthy yet

Evidence:

- `bun run typecheck` fails.
- `bun run test:isolation` fails.
- `bun audit` fails.
- `bun run build` exits 0 even though `build:types` uses `|| true`.
- `tsconfig.lib.json` disables several strict checks relative to `tsconfig.json`.

Why this matters:

The project can appear built while type safety is broken. That is incompatible with publish readiness.

Correct shape:

- Remove `|| true`.
- Align `tsconfig.lib.json` with strict release expectations.
- Add a single `bun run quality` gate that fails on typecheck, tests, isolation, coverage thresholds, audit, and docs truth checks.

### Q2 - Coverage exists, but quality enforcement is not at WoW level

Evidence:

- `bun test --coverage --timeout 15000` passes.
- Several production files show file-level coverage below 95% in the text report, including remote/sync/status/db-startup/export-adjacent surfaces.
- No command observed enforcing statements, branches, functions, and lines each at >=95%.

Why this matters:

High aggregate coverage can hide weak coverage in the exact surfaces that matter: CLI orchestration, migration, export/import, sync, provider failure paths, and security controls.

Correct shape:

- Enforce all four coverage metrics independently.
- Add targeted coverage thresholds for security-sensitive modules.
- Treat CLI command happy-path coverage as insufficient unless error/privacy paths are tested.

### Q3 - Too many `any` escapes remain in production

Evidence:

- `Fact` metadata uses `Record<string, any>`.
- CLI query delegation forwards via `as any`.
- Provider parsing catches `err: any`.
- Status/sync/formatter paths use `any` in production files.

Why this matters:

Some `any` at infrastructure edges is acceptable. `any` in domain facts, command DTOs, and result shaping weakens the exact contracts that should make memory replay, context retrieval, and public API behavior reliable.

Correct shape:

- Replace fact metadata with discriminated metadata types by event/fact kind.
- Replace CLI delegation `as any` with explicit command request DTOs.
- Use `unknown` and schema validation at provider boundaries.

### Q4 - The roadmap/state files are stale against current code truth

Evidence:

- `.planning/STATE.md` says test isolation cleanup is complete and gate is PASS.
- Current `bun run test:isolation` fails.
- ROADMAP marks v4 phases complete through Phase 36, but current typecheck/audit/isolation gates fail.

Why this matters:

Planning docs are useful, but the current truth layer is code + gates. The state files need to be corrected after remediation planning, otherwise future sessions will resume from false confidence.

Correct shape:

- Mark v4 as foundation-hardening required before publish.
- Move remote-sync dirty work out of v4 publish path.
- Add explicit gate truth to `.planning/STATE.md` once fixes begin.

## What Is Actually Solid

The review is not saying "throw everything away." The stronger parts worth preserving are:

- Broad domain/entity/port structure exists.
- SQLite repositories consistently use prepared statements in the hot paths inspected.
- FTS5 and vector-search infrastructure are present.
- The sync service has incremental extraction, checkpointing, and per-session transaction intent.
- Smart context reads from fact tables rather than the deprecated memory-file convention.
- The test suite is broad enough to catch many regressions.

But those strengths are below the bar if the security boundary, event contract, and release gates remain weak.

## Correct Remediation Order

### R0 - Freeze publication and dirty feature expansion

Do not publish v4, and do not continue remote sync, until the foundation gates are restored.

Acceptance:

- Typecheck passes.
- Isolation gate passes.
- Dependency audit either passes or has documented, time-bound, justified exceptions.
- Build fails on type errors.
- Scratch/debug artifacts are removed or moved to an intentional ignored location.

### R1 - Security boundary first

Implement redaction/classification as a first-class pipeline boundary.

This maps to new roadmap Phase 36.8: Secret Boundary and Optional Provider Interop. authkey may be documented as an optional `authkey run --env memory -- ...` execution path, but memory-nexus must remain usable without authkey and must not call `authkey get` or resolve raw secrets through authkey.

Acceptance:

- Redaction occurs before message/tool storage.
- Redaction occurs before FTS indexing, embeddings, extraction, export, and future remote sync.
- Tests cover common API keys, bearer tokens, JWTs, PEM blocks, env assignments, and high-entropy values.
- `memory doctor` reports redaction readiness and rule version.

### R2 - Fix architecture boundaries

Move runtime/database/event-log details out of application services.

Acceptance:

- Application services do not import `bun:sqlite`.
- Application services do not import infrastructure modules.
- Transactions run through a port.
- Event append/replay runs through a port.

### R3 - Replace fact-shaped event log with a canonical event envelope

Do this before remote sync or dreaming.

Acceptance:

- Events have explicit event id, event type, schema version, writer identity, timestamp semantics, payload type, privacy metadata, and optional causality.
- Facts are projections.
- Supersedence is a typed event, not metadata hidden inside a synthetic fact.

### R4 - Strengthen retrieval quality

Make context output explainable and scoped.

Acceptance:

- Every surfaced fact includes provenance and retrieval reason in AI/JSON mode.
- Cross-project context has explicit filters and tests preventing irrelevant leakage.
- Budgeting prioritizes by utility, recency, confidence, and task relevance, not only fixed section order.

### R5 - Build a real release gate

Create one release-quality command and make publish depend on it.

Acceptance:

- `bun run quality` or equivalent runs typecheck, tests, isolation, coverage threshold enforcement, audit, gitleaks, and doc truth checks.
- Coverage thresholds enforce statements, branches, functions, and lines independently.
- Build uses strict type settings and fails on errors.

## Pushback

The wrong next move would be to "clean up v4 just enough to publish." That would preserve the fragile architecture and push the security debt into v5, exactly when remote sync and multi-device replication make the blast radius larger.

The right move is a short but serious foundation-hardening phase. It should be framed as making v4 honest, not adding v5 features. Remote sync, persona profiling, graph extraction, decay, and dreaming depend on this foundation being correct.

The standard should be:

- Local-first by default.
- Redaction before persistence and egress.
- Event-sourced where claimed, not just append-file-shaped.
- Application layer free of infrastructure details.
- CLI as adapter, not product core.
- Explainable retrieval, not just "facts grouped by type."
- Release gates that fail when quality is not true.
