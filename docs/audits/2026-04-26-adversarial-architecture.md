# Adversarial Architecture Review — 2026-04-26

**Reviewer angle:** Hexagonal architecture & SOLID principles

## Summary

The skeleton is hexagonal (`domain/`, `application/`, `infrastructure/`, `presentation/`) and the domain layer itself is genuinely clean — entities are immutable, pure, factory-validated. Below the surface the layering breaks down: the application layer imports `bun:sqlite` and `node:fs`, the presentation layer instantiates SQLite repositories directly and emits raw SQL, three infrastructure modules import from application, several ports live in the wrong layer, and an entire application service (`export-service.ts`) bypasses the repository contract to write hand-written SQL inline. There are 13 production files that mutate module-level `let testXxx = null` variables as test seams. The discipline is real at the domain centre and dissolves the further out you go.

## Findings (severity-ranked)

### CRITICAL — 6

#### CRIT-1: Application layer imports `bun:sqlite` (DIP violation, infrastructure leak across hexagonal boundary)
- **File(s):** `src/application/services/sync-service.ts:11`, `src/application/services/export-service.ts:8`
- **What's wrong:** Application services type their constructor / function arguments with `Database` from `bun:sqlite`. `SyncService` calls `this.db.transaction(() => { ... })` (line 455) and `ExportService` calls `db.query<...>(...)`, `db.prepare(...)`, `db.exec("DELETE FROM ...")` directly. The "depend on abstractions" rule is broken at the application/infrastructure boundary.
- **Why it matters:** The application layer is no longer driver-agnostic. Swapping SQLite for Postgres, libSQL, or an in-memory adapter requires changing every application service. Unit tests must instantiate a real `bun:sqlite` Database. The hexagonal architecture's primary promise (inversion of dependencies, testability, port replaceability) is null and void wherever this leak exists.
- **Recommended fix:** Introduce `IUnitOfWork` (or `ITransactionRunner`) port in `domain/ports/`: `interface IUnitOfWork { transaction<T>(fn: () => T): T }`. Inject it into `SyncService` instead of `Database`. The SQLite adapter wraps `db.transaction(...)`. `ExportService` is not really a service — see CRIT-2.

#### CRIT-2: `ExportService` and `ImportService` bypass repositories entirely, emitting hand-written SQL from the application layer
- **File(s):** `src/application/services/export-service.ts:195-272, 409-601`
- **What's wrong:** `exportToJson(db, ...)` and `importFromJson(db, ...)` are exported as top-level functions in the application layer that take a raw `Database`, run hand-coded `db.query<SessionExport, []>("SELECT id, project_path_encoded as projectPathEncoded, ... FROM sessions")` for every table, and on import issue `db.exec("DELETE FROM session_entities;")`, `db.exec("DELETE FROM messages_meta;")`, etc. Schema column names, FTS5 table names (`messages_fts`, `sessions_fts`), `PRAGMA foreign_keys = OFF`, and table semantics live inside the application layer.
- **Why it matters:** This is the worst kind of leak — every schema rename now causes shotgun surgery across both `infrastructure/database/schema.ts` AND `src/application/services/export-service.ts`. The `ISessionRepository`, `IMessageRepository`, `IToolUseRepository` ports already exist and could provide the data; export simply chose not to use them. There are also functions instead of a class (no DI), and no tests can substitute the persistence boundary.
- **Recommended fix:** Move `exportToJson` / `importFromJson` to `infrastructure/database/services/export-service.ts` (it's an infrastructure concern — JSON-to-SQLite serialization). Or, keep an `ExportService` in application that depends on `ISessionRepository`, `IMessageRepository`, `IToolUseRepository`, `ILinkRepository`, `IEntityRepository`, `IExtractionStateRepository`, `IUnitOfWork`, and `IFileWriter`. Either way: zero raw SQL in `application/`.

#### CRIT-3: Presentation layer instantiates infrastructure concretes and emits raw SQL
- **File(s):** `src/presentation/cli/commands/show.ts:11-29, 122-128, 153-155`; `src/presentation/cli/commands/sync/index.ts:13-16, 83-94`; `src/presentation/cli/commands/context.ts:18-31`; `src/presentation/cli/commands/purge.ts:11-16`; `src/presentation/cli/commands/friction/index.ts:11, 117-121`; and 17 other presentation files
- **What's wrong:** 22 presentation-layer files import directly from `infrastructure/database/repositories/...` and `infrastructure/database/services/...`, then `new SqliteSessionRepository(db)`, `new SqliteMessageRepository(db)` etc. inline. `show.ts:122-128` goes further — it bypasses its own repository and runs `db.prepare<{ id: string }, [string]>("SELECT id FROM sessions WHERE id LIKE ? ORDER BY start_time DESC LIMIT 1")` from the CLI handler. The presentation layer knows about the `sessions` table, the `id` column, and the `start_time` column.
- **Why it matters:** Hexagonal expects presentation to call application use cases, not to wire infrastructure. The cost: 22 places to edit when adding a new repository, 22 places to edit when adding a new search index, 22 implicit composition roots. There is no central composition root, no DI container, no factory. Every command is its own ad-hoc wiring. Every repository concrete is `export`ed from `infrastructure/database/index.ts` (lines 42-56) so presentation can grab any of them.
- **Recommended fix:** A single composition root (`src/presentation/cli/composition-root.ts`) that builds an object graph keyed by use case (`{ syncUseCase, searchUseCase, showSessionUseCase, ... }`). Each command receives its use case(s) only. Move the partial-id session lookup into `ISessionRepository.findByIdPrefix(prefix: string)` so presentation never sees SQL. Stop exporting `SqliteXxxRepository` from `infrastructure/database/index.ts`.

#### CRIT-4: Infrastructure imports from application — inverted dependency cycle
- **File(s):** `src/infrastructure/database/services/search-service.ts:12`, `src/infrastructure/database/repositories/memory-file-repository.ts:12`, `src/infrastructure/database/repositories/session-repository.ts:15`, `src/infrastructure/database/services/hybrid-search-service.ts:38`, `src/infrastructure/database/services/context-service.ts:10`, `src/infrastructure/hooks/hook-runner.ts:23`
- **What's wrong:** Three infrastructure modules import `sanitizeFtsQuery` from `src/application/services/fts-sanitizer.ts`. `HybridSearchService` (infra) imports `reciprocalRankFusion` and types from `src/application/services/rrf-fusion.js`. `SqliteContextService` (infra) imports the `IProjectResolver` interface from `src/application/services/smart-context-service.js`. `hook-runner.ts` (infra) imports `LlmExtractor` from application. The dependency graph has cycles between application and infrastructure.
- **Why it matters:** The whole point of hexagonal is `infrastructure -> domain (only)`. Cycles defeat module-boundary tooling, complicate ordered initialization, and signal that the layering is decorative — there are no real boundaries being enforced. They also make extraction (treating infrastructure as a separable package) impossible.
- **Recommended fix:** Move `fts-sanitizer.ts` to `infrastructure/database/fts/` (it encodes FTS5-specific syntax — there is no domain meaning in "what FTS5 treats as an operator"). Move `rrf-fusion.ts` either to a domain service (it's pure ranking math) or to infrastructure where it's consumed. Move `IProjectResolver` from `application/services/smart-context-service.ts` into `domain/ports/sources.ts`. Make `LlmExtractor` a port (`ILlmExtractor` in domain, adapter in infrastructure that calls Claude).

#### CRIT-5: Application services import `node:fs` and `process.stderr` directly
- **File(s):** `src/application/services/friction-service.ts:16, 223-256`; `src/application/services/export-service.ts:9`
- **What's wrong:** `FrictionService.ingestFallbackFile(path)` calls `existsSync`, `readFileSync`, `unlinkSync` from `node:fs` directly, then writes diagnostics to `process.stderr.write(...)`. `ExportService` imports `existsSync`. There is no `IFileSystem` or `IDiagnosticLogger` port between the service and the OS.
- **Why it matters:** Application services should orchestrate via ports, not call `fs`. Tests can't substitute the file system without monkey-patching modules. The `process.stderr.write` calls are an implicit IO contract embedded in business logic — not configurable, not testable, not silenceable.
- **Recommended fix:** Introduce `IFallbackFileReader` (or generic `IFileSystem`) in `domain/ports/`. Inject into `FrictionService` constructor. Move stderr emission to a pluggable `IDiagnosticLogger` (or an `onWarning?: (msg: string) => void` callback) — the application service should not pick stderr.

#### CRIT-6: 13 production files use mutable module-level `let testXxx = null` test-seam
- **File(s):** `src/presentation/cli/commands/show.ts:35-45`, `purge.ts:23-32, 140-156`, `status.ts`, `install.ts`, `browse.ts`, `pickers/session-picker.ts`, `infrastructure/paths.ts:28-47`, `infrastructure/hooks/config-manager.ts:21-30`, `infrastructure/hooks/settings-manager.ts:113-148`, `infrastructure/hooks/log-writer.ts`, `infrastructure/database/health-checker.ts`, `infrastructure/signals/checkpoint-manager.ts`
- **What's wrong:** Production code has top-level `let testDbPath: string | null = null` (and similar for `testConfigPath`, `testPathOverrides`, `askConfirmationFn`, etc.) plus exported `setTestDbPath(path)` / `resetTestPaths()` mutators. Tests flip the global to redirect production code paths. This is the explicit symptom that DI was missing — the seam was added because there was nowhere to inject.
- **Why it matters:** Three concrete harms: (1) tests cannot run in parallel safely — global mutation creates ordering dependencies; (2) production carries a permanent backdoor that any future code can exploit; (3) the surface area grows linearly with every new "thing that needs a test fake" because each file invents its own seam. This is a pure DIP failure made visible.
- **Recommended fix:** Replace each `let testXxx` + `setTestXxx()` pair with constructor injection through a port. `getDefaultDbPath()` becomes `IPathProvider.getDbPath()`. The composition root in production wires the real `PathProvider`; tests wire a fake. Delete every `setTestXxx` export.

### HIGH — 8

#### HIGH-1: Multiple ports defined inside application service files instead of `domain/ports/`
- **File(s):** `src/application/services/smart-context-service.ts:77-88` (`IProjectResolver`); `src/application/services/backfill-service.ts:59` (`IDailyLogWriter`)
- **What's wrong:** Ports live in the same file as one of their consumers. `IProjectResolver` is implemented by `SqliteProjectResolver` (infra, line `infrastructure/database/services/context-service.ts:255`) which then imports the interface back from `application/`.
- **Why it matters:** Reverse import cycle (already counted in CRIT-4 for the import direction) plus port ownership confusion — the contract's "home" is the consumer file, not a contract directory. New consumers cannot find ports without `grep`.
- **Recommended fix:** Move all `I*` interfaces under `src/domain/ports/` next to `repositories.ts`, `services.ts`, `sources.ts`, `signals.ts`. Re-export from `domain/ports/index.ts`.

#### HIGH-2: `IEntityRepository` defined but not exported from `domain/ports/index.ts`; not consumed via interface anywhere
- **File(s):** `src/domain/ports/repositories.ts:296-373`; `src/domain/ports/index.ts` (no export)
- **What's wrong:** `IEntityRepository` is a fat interface (8 methods including graph helpers `linkToSession`, `linkEntities`) that is never imported by an application service. Only `SqliteEntityRepository` (infra) and `hook-runner.ts` (infra) reference it; both could use the concrete class. The port has no consumer that benefits from the inversion.
- **Why it matters:** Premature abstraction. A port without a consumer is dead weight: future maintainers can't tell whether to update the port or the concrete first; inconsistencies pile up between the two.
- **Recommended fix:** Either delete the interface and use the concrete class (until a real second adapter arrives), OR add it to `domain/ports/index.ts` AND have the application layer that needs entity persistence depend on it via constructor injection.

#### HIGH-3: `IFrictionRepository.deleteByPattern(pattern)` leaks SQL LIKE syntax through the domain port
- **File(s):** `src/domain/ports/repositories.ts:655-661`; `src/infrastructure/database/repositories/friction-repository.ts:330-331`; `src/presentation/cli/commands/friction/index.ts:98`
- **What's wrong:** Port doc reads `Uses SQL LIKE matching (% for wildcard)`. Adapter implements as `WHERE description LIKE $pattern`. CLI help text reads `Description pattern (SQL LIKE: % for wildcard)`. The domain layer's port is encoding SQLite's LIKE dialect; the CLI is teaching end users a SQL operator.
- **Why it matters:** The port is no longer technology-neutral — switching to Postgres or Elasticsearch changes the wildcard semantics; switching to a NoSQL store doesn't have LIKE at all. End-user help text is also leaking infrastructure to the surface.
- **Recommended fix:** Define `deleteByDescriptionGlob(glob: string)` on the port (using `*` as wildcard, or a typed `DescriptionPattern` value object). Adapter compiles glob to LIKE. CLI shows `*` to users.

#### HIGH-4: `EmbeddingProviderFactory` switch-on-string violates OCP
- **File(s):** `src/infrastructure/embedding/embedding-provider-factory.ts:46-72`
- **What's wrong:** `switch (config.provider) { case "local": ...; case "openai": ...; case "ollama": ...; default: throw }`. Every new provider requires editing this method.
- **Why it matters:** OCP failure that compounds: tests for the factory grow O(N×providers), the factory becomes a known edit-point on every provider PR, and the file imports every provider class — so adding a provider means dragging that import into the factory module forever.
- **Recommended fix:** Provider registry. `register(name: string, factoryFn: (config) => IEmbeddingProvider)`. Each provider module self-registers at import time, or the composition root does the registration.

#### HIGH-5: `SyncService.wrapError` does string-matching error classification — fragile and untestable
- **File(s):** `src/application/services/sync-service.ts:300-343`
- **What's wrong:** Catches generic `Error`, then `if (message.includes("ENOENT"))` -> `SOURCE_INACCESSIBLE`; `if (message.includes("locked") || message.includes("SQLITE_BUSY"))` -> `DB_LOCKED`; etc. Application service is parsing error messages from `bun:sqlite` and `node:fs`.
- **Why it matters:** Error messages are not contracts. A SQLite version bump or a Node major can change "no such file" to "ENOENT: ENOENT" and the classification silently regresses. Also the DIP leak — application is reasoning about SQLite/Node-specific error text.
- **Recommended fix:** Each adapter (parser, source, repository) catches its own infra errors and re-throws as `MemoryError` with a typed code. Application sees only `MemoryError` from below and re-throws or annotates without inspecting messages.

#### HIGH-6: `SyncService.extractEntities` switch-on-event-type — domain logic dispatch as switch
- **File(s):** `src/application/services/sync-service.ts:528-617`
- **What's wrong:** 90-line `switch (event.type)` with `case "user"`, `case "assistant"`, `case "tool_use"`, `case "tool_result"`, `case "summary"`, `case "system"`. Each case knows the precise shape of the event data, mutates the same `messages`/`toolUses`/`toolUseMap` collections, and times out timestamps inline.
- **Why it matters:** OCP — adding a new event type means editing this method (already an OCP smell). SRP — `SyncService` is now also "the place where parsed events become entities." The extraction logic should belong to a domain service or a per-event-type adapter.
- **Recommended fix:** `IEventToEntityMapper` (or a `Map<EventType, Mapper>`) in domain. Each event type gets its own mapper. `SyncService` iterates events, dispatches via map lookup, accumulates results. The switch becomes a registry.

#### HIGH-7: `health-checker.ts` is a god module — 564 lines, six unrelated checks, no port
- **File(s):** `src/infrastructure/database/health-checker.ts:1-564`
- **What's wrong:** One file does database-integrity check, directory permissions, hooks installation, config validity, embedding config, sqlite_vec availability. Each is a different concern with different failure modes, different domains, different test surfaces. There is no `IHealthCheck` port; the doctor command imports each checker function directly.
- **Why it matters:** SRP violation — six reasons to change. ISP violation — anyone wanting just `checkConfigValidity` drags in DB and FS deps. The doctor command can't compose health checks at runtime (e.g., skip embedding check if disabled) without knowing about each.
- **Recommended fix:** `IHealthCheck { name: string; run(): Promise<HealthResult> }` port. Each concern is a separate adapter (`DbIntegrityCheck`, `PermissionsCheck`, `HooksInstallationCheck`, ...). `HealthChecker` is a composite that runs `IHealthCheck[]`.

#### HIGH-8: `domain/services/content-extractor.ts` parses the Claude Code JSONL schema in the domain layer
- **File(s):** `src/domain/services/content-extractor.ts:1-40+`
- **What's wrong:** Domain layer hosts a service that knows about `tool_use_id`, `is_error`, `content` blocks — the precise shape of an externally-defined JSONL event from Claude Code. The same parsing concern is also re-implemented in `infrastructure/parsers/event-classifier.ts`.
- **Why it matters:** Domain should not encode an external system's transport format. If Claude changes the JSONL shape, the domain is forced to change. Plus duplication: `ContentExtractor` (domain) and `EventClassifier` (infra) both turn raw JSON into structured events.
- **Recommended fix:** Treat JSONL parsing as infrastructure-only. Move `ContentExtractor` to `infrastructure/parsers/` or merge into `EventClassifier`. The domain receives `ParsedEvent[]` (already a port type) — that's the right level of abstraction.

### MEDIUM — 7

#### MED-1: `LlmExtractor` is dead code shipped as if it works
- **File(s):** `src/application/services/llm-extractor.ts:103-131`
- **What's wrong:** `extract()` always returns `{ topics: [], terms: [], decisions: [], summary: "" }`. The comment says "actual extraction happens in hook context." The `_prompt = LlmExtractor.createExtractionPrompt(messages)` is computed and discarded.
- **Why it matters:** YAGNI / dead code. Anyone reading `index.ts` (`export { LlmExtractor }`) is mislead about the system's capability. Tests assert empty results — which is meaningless verification.
- **Recommended fix:** Either delete it, or define `ILlmExtractor` port and a real adapter. Stop exporting from the application barrel until it works.

#### MED-2: Static-method-only "service" classes used as namespaces
- **File(s):** `src/application/services/llm-extractor.ts:93` (`class LlmExtractor` with `static extract` and `static createExtractionPrompt`); `src/application/services/pattern-extractor.ts` (similar)
- **What's wrong:** Classes with only static methods — no state, no injection point, no replaceability. They're modules pretending to be classes.
- **Why it matters:** Cannot mock or substitute. Adding a dependency later means a breaking API change.
- **Recommended fix:** Convert to module-level functions, OR convert to instance classes with constructor injection if dependencies are coming.

#### MED-3: Composition root duplicated across every CLI command
- **File(s):** `src/presentation/cli/commands/sync/index.ts:81-94`; `src/presentation/cli/commands/show.ts:149-155`; `src/presentation/cli/commands/context.ts`; `src/presentation/cli/commands/friction/index.ts:117-121`; ~20 more
- **What's wrong:** Each command opens the DB, builds its own repositories, builds its own service. There is no shared composition root. `executeShowCommand`, `executeSyncCommand`, `executeFrictionCommand` etc. each `initializeDatabase` and wire by hand.
- **Why it matters:** Shotgun surgery whenever a service gains/loses a dependency. No single place to swap implementations for an alternate runtime (e.g., MCP server, library use). The "programmatic API" exported from `src/index.ts` is each `executeXCommand` function — meaning any consumer pays the per-command DB-init cost.
- **Recommended fix:** `CompositionRoot.create({ dbPath })` returns a typed bundle of use cases. Commands receive use cases via parameter. Tests construct an `InMemoryCompositionRoot`.

#### MED-4: `infrastructure/database/services/` mixes services with and without ports
- **File(s):** `src/infrastructure/database/services/`
- **What's wrong:** `Fts5SearchService implements ISearchService` — port-implementing. But `SqliteContextService`, `SqliteStatsService`, `SqliteProjectResolver`, `HybridSearchService` either implement no port (`SqliteContextService`) or implement a port that lives in the wrong layer (`SqliteProjectResolver` from application). Naming the directory "services" hides that they're not all the same thing.
- **Why it matters:** Loss of conceptual integrity. Future readers can't tell whether a class has a port. The presentation layer ends up importing `SqliteContextService` directly because there is no port to depend on.
- **Recommended fix:** Define `IContextService`, `IStatsService` (already exists for `IStatsService`!), `IProjectResolver`, etc., in `domain/ports/`. Make every "service" in this directory implement a port.

#### MED-5: `IStatsService` exists in domain but the doctor command depends on `SqliteStatsService` concrete
- **File(s):** `src/domain/ports/services.ts:96-104` (port); `src/infrastructure/database/index.ts:64` (export of concrete); presentation imports concrete
- **What's wrong:** The port exists — and is correctly defined — but consumers depend on the concrete instead.
- **Why it matters:** Half-finished abstraction. A port that nobody depends on is dead weight; its existence implies inversion that isn't actually achieved.
- **Recommended fix:** Make presentation depend on `IStatsService` (provided by composition root), not on `SqliteStatsService`.

#### MED-6: Domain `parseDuration` lives in presentation/`purge.ts`
- **File(s):** `src/presentation/cli/commands/purge.ts:74-107`
- **What's wrong:** `parseDuration("90d" | "6m" | "1y") -> Date` is pure domain logic — calendrical arithmetic that only depends on a cutoff date. It lives in a CLI command file alongside Commander wiring.
- **Why it matters:** Reuse and testing — any other entry (MCP server, programmatic API) that wants the same duration grammar must reimplement or import from a CLI file.
- **Recommended fix:** Extract to `domain/value-objects/duration.ts` as a `Duration` value object with `parse(spec: string): Duration` and `cutoff(from: Date): Date`. Presentation keeps the Commander shell only.

#### MED-7: `DEFAULT_EMBEDDING_CONFIG` and the embedding factory share configuration shape across layers
- **File(s):** `src/infrastructure/hooks/config-manager.ts:38-50` (`EmbeddingConfigData`); `src/domain/ports/repositories.ts:411-420` (`EmbeddingServiceConfig`)
- **What's wrong:** Two near-identical config types: domain has 4 fields (`provider`, `model`, `dimensions`, `batchSize`); infra adds `enabled`, `apiKey`, `baseUrl`. The doc on `EmbeddingServiceConfig` calls out that `EmbeddingConfigData` "structurally satisfies" it. This is a type-level workaround for a missing abstraction.
- **Why it matters:** Structural compatibility is fragile under refactor — rename a field in infra and the domain port silently no longer matches. Two configs to keep in sync.
- **Recommended fix:** One `EmbeddingConfig` type lives in domain (with the application-relevant fields). Infrastructure carries an extension type (`InfraEmbeddingConfig extends EmbeddingConfig` adding the credentials/baseURL).

### LOW — 6

#### LOW-1: Broken / suspicious import in `hook-runner.ts`
- **File(s):** `src/infrastructure/hooks/hook-runner.ts:26`
- **What's wrong:** `import { LogWriter } from "../config/log-writer.js";` — but `src/infrastructure/config/` does not exist. The actual file is `src/infrastructure/hooks/log-writer.ts` (sibling, not under `config/`). Either the path resolves through some shadow mechanism, or this is a latent bug.
- **Recommended fix:** Change to `from "./log-writer.js"`. Verify there's no compile error being silently ignored.

#### LOW-2: Generic / namespace-y service names ("service", "manager", "extractor", "helper")
- **File(s):** `src/application/services/sync-service.ts`, `embedding-service.ts`, `friction-service.ts`, `pattern-extractor.ts`, `llm-extractor.ts`, `recovery-service.ts`, `smart-context-service.ts`, `infrastructure/hooks/config-manager.ts`, `infrastructure/hooks/settings-manager.ts`, `presentation/cli/commands/sync/helpers.ts`
- **What's wrong:** Names tell you the file's category (service/manager) without telling you what it does. `pattern-extractor` extracts what patterns? `recovery-service` recovers what? `helpers` helps with what?
- **Recommended fix:** Replace with intent. `SessionSyncOrchestrator`, `FilePathPatternMiner`, `CheckpointRecoverer`, `SyncResultReporter`. The renames are mechanical and the readability gain is permanent.

#### LOW-3: Long parameter lists / large constructor in `SyncService`
- **File(s):** `src/application/services/sync-service.ts:108-119`
- **What's wrong:** 9 constructor parameters (`sessionSource`, `eventParser`, `sessionRepo`, `messageRepo`, `toolUseRepo`, `extractionStateRepo`, `db`, `abortSignal`, `checkpointManager`).
- **Why it matters:** Beyond ~5, parameter lists become hard to read at the call site and hard to maintain. New collaborators (`linkRepo`, `entityRepo`) keep getting tacked on.
- **Recommended fix:** Group into a `SyncDeps` interface (or split `SyncService` into smaller orchestrators — e.g., a `Discover-Filter-Extract` pipeline of three classes). The latter also addresses HIGH-6.

#### LOW-4: `SyncService.sync()` body is 140 lines of sequential prose
- **File(s):** `src/application/services/sync-service.ts:134-272`
- **What's wrong:** Single method walks: checkpoint load -> session discovery -> filter -> skip-by-checkpoint -> recompute skip count -> initialize-or-extend checkpoint -> per-session loop with abort/extract/checkpoint-update.
- **Recommended fix:** Decompose into `loadCheckpointIfPresent`, `planWork`, `processSessions`. Each takes one paragraph of comments instead of seven.

#### LOW-5: `result.sessionsSkipped` is recomputed twice with conditional reset (line 196-200)
- **File(s):** `src/application/services/sync-service.ts:196-200`
- **What's wrong:** `result.sessionsSkipped = result.sessionsDiscovered - sessionsToProcess.length - completedSessionIds.size; if (result.sessionsSkipped < 0) { result.sessionsSkipped = result.sessionsDiscovered - sessionsToProcess.length; }`. The negative-fallback hides an arithmetic invariant violation.
- **Recommended fix:** Compute the invariant explicitly: `skipped = max(0, discovered - toProcess - alreadyDone)`. Comment why it can underflow (extraction state cleared between sync runs?). Better — write a property-based test that asserts the invariant.

#### LOW-6: CLI help text leaks SQL syntax to end users
- **File(s):** `src/presentation/cli/commands/friction/index.ts:98`
- **What's wrong:** `.argument("<pattern>", "Description pattern (SQL LIKE: % for wildcard)")` — end user is told about SQL.
- **Recommended fix:** Use `*` as wildcard in CLI surface; translate at the adapter. Help reads "Description pattern (use * as wildcard)".

## What's Done Well

- **Domain layer is genuinely clean.** Entities (`Message`, `Session`, `ToolUse`, etc.) are immutable, factory-validated, defensively copied. Zero infrastructure imports in `src/domain/` (modulo test files importing `bun:test`). The interior of the hexagon is correct.
- **Ports for sync workflow are well-shaped.** `ISessionSource`, `IEventParser`, `ICheckpointManager`, `ISyncAbortSignal`, `IEmbeddingProvider`, `IEmbeddingRepository` are the right abstractions, sized correctly (no fat interfaces), with intent-revealing names.
- **JSDoc discipline is high.** Repository ports (`src/domain/ports/repositories.ts`) document intent, return shapes, and constraints. This is the rare codebase where reading the port interface tells you what the adapter must do.

## Open Questions

- I did not run the test suite or `tsc --noEmit`, so I cannot say whether the broken-looking import in `hook-runner.ts:26` (LOW-1) actually fails at build time or whether a path-mapping resolves it.
- I did not measure the runtime test-isolation impact of the 13 module-level `let testXxx` seams — whether any tests actually fail under parallel execution today is unknown without running the suite with `--bail=false --parallel`.
- I did not exhaustively read every infrastructure repository (12 files); I sampled 4. Patterns observed in the sample (constructor takes `Database`, prepares statements, maps rows to entities) appear consistent, but I cannot rule out additional violations in unread repos.
- `src/presentation/cli/db-startup.ts` (207 lines) was not read. It plausibly hosts shared composition logic — if so, MED-3 may be partially addressed there.
- Whether `SqliteVecAvailability` and `Embedding` infrastructure has additional ports or whether it's all concrete-coupled was not investigated past the factory.
