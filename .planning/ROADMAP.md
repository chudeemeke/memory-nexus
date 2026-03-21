# Roadmap: @chude/memory (memory-nexus)

## Milestones

- SHIPPED **v1.0 Full Vision Implementation** -- Phases 1-12 (shipped 2026-02-16) -- [Archive](milestones/v1.0-ROADMAP.md)
- SHIPPED **v2.0 Hybrid Search and Rebrand** -- Phases 13-21 (shipped 2026-03-01)
- ACTIVE **v3.0 Knowledge Layer + Friction Logging** -- Phases 23-28

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

### v2.0 Hybrid Search and Rebrand (Phases 13-18)

**Overview:** Rename the package from `memory-nexus` to `@chude/memory`, add hybrid search combining vector similarity (sqlite-vec) with BM25 (FTS5) using Reciprocal Rank Fusion, implement a pluggable embedding provider architecture with local-first defaults, and stabilize the programmatic API for aidev integration.

**Depth:** Standard (6 phases)
**Total v2.0 Requirements:** 35 phase-mapped + 4 cross-cutting (QUAL) = 39

---

### Phase 13: Package Rename

**Goal:** Users install and run `@chude/memory` with the `memory` binary; the old `memory-nexus` name is deprecated and redirects to the new package.

**Depends on:** None (no v2 dependencies; builds on shipped v1.0)
**Plans:** 3 plans

Plans:
- [x] 13-01-PLAN.md -- Centralized XDG paths module and legacy migration with rollback
- [x] 13-02-PLAN.md -- Rename all internal identifiers and user-facing strings
- [x] 13-03-PLAN.md -- Deprecation stub, migration docs, CLAUDE.md updates

Requirements: RENAME-01, RENAME-02, RENAME-03, RENAME-04, RENAME-05


Success Criteria:
1. `bun add -g @chude/memory` installs the tool and the `memory` binary is available in PATH
2. All user-facing paths (`~/.config/memory/`, `~/.local/share/memory/`, log directories) use the new name, with automatic migration of existing data from `memory-nexus` paths
3. Existing hook scripts reference the `memory` binary and continue to trigger background sync
4. `bun add memory-nexus` installs a deprecation stub that prints a message directing users to `@chude/memory`
5. All existing tests pass with the renamed package (no behavioral regression)

---

### Phase 14: Embedding Infrastructure

**Goal:** The application can generate vector embeddings from text using a pluggable provider architecture, store them in sqlite-vec alongside existing FTS5 data, and lazy-load the ONNX runtime only when semantic search is invoked.

**Depends on:** Phase 13 (new package name determines config paths like `~/.config/memory/config.json`)
**Estimated Plans:** 4-5

Requirements: EMBED-01, EMBED-02, EMBED-03, EMBED-04, EMBED-05, EMBED-06, EMBED-07

Success Criteria:
1. `IEmbeddingProvider` port exists in domain layer with zero external dependencies; at least `TransformersJsProvider` implements it
2. `memory doctor` reports sqlite-vec extension loaded successfully and `message_embeddings` virtual table exists
3. Running `memory search "test"` (FTS5-only, no embeddings generated yet) does NOT load the ONNX runtime or download any model
4. On first semantic search invocation, user sees a progress indicator for model download (23 MB one-time) and the model is cached for subsequent runs
5. If onnxruntime-node fails to initialize, the system falls back to WASM backend with a warning and embedding still succeeds

---

### Phase 15: Embedding Pipeline

**Goal:** The sync workflow can generate embeddings for extracted messages, track embedding state per message, and process embeddings in the background without blocking the sync completion.

**Depends on:** Phase 14 (needs embedding providers, sqlite-vec schema, and provider factory)
**Estimated Plans:** 3-4

Requirements: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05

Success Criteria:
1. `memory sync --embed` extracts sessions AND generates embeddings for new messages, with a progress bar showing embedding progress
2. Running `memory sync --embed` a second time skips already-embedded messages (incremental embedding via `embedding_state` tracking)
3. Changing the configured embedding model triggers full re-embedding on next `memory sync --embed`, with a confirmation prompt before proceeding
4. `memory sync` (without `--embed`) completes immediately at the same speed as v1.0; embedding is opt-in, not default
5. Background embedding (`memory sync --embed --background`) returns control to the user immediately while embeddings generate asynchronously

---

### Phase 16: Hybrid Search and Graceful Degradation

**Goal:** Users can search sessions using keyword, semantic, or hybrid mode; the system automatically falls back to FTS5-only when embeddings are unavailable, so search always works regardless of embedding state.

**Depends on:** Phase 15 (needs embedded messages to search against)
**Estimated Plans:** 4-5

Requirements: HSRCH-01, HSRCH-02, HSRCH-03, HSRCH-04, HSRCH-05, HSRCH-06, DEGRADE-01, DEGRADE-02, DEGRADE-03, DEGRADE-04

Success Criteria:
1. `memory search "authentication patterns" --mode hybrid` returns results ranked by Reciprocal Rank Fusion combining BM25 and vector similarity scores
2. `memory search "authentication patterns"` (no explicit mode) uses hybrid when embeddings exist for the database, and silently falls back to FTS5-only when no embeddings are present
3. `memory search "auth" --mode vector` returns semantically similar messages even when the exact word "auth" does not appear in the result text
4. `memory search "query" --no-vector` forces FTS5-only search regardless of embedding availability
5. When only a subset of messages have embeddings, hybrid search uses vector results for embedded messages and FTS5 results for unembedded ones, merging via RRF

---

### Phase 16.1: Migration Race Condition Fix (urgent)

**Goal:** Fix race condition where `initializeDatabase()` creates an empty database at the XDG path before `migrateFromLegacy()` can move real data from the legacy path. Ensures migration always preserves the user's 266MB database over an empty 221KB stub, with defense-in-depth to prevent the race from recurring.

**Depends on:** Phase 16 (discovered during Phase 16 human verification)
**Estimated Plans:** 1-2

Plans:
- [x] 16.1-01-PLAN.md -- Size-aware migration conflict resolution with WAL/SHM cleanup and pending guard

Requirements: (cross-cutting infrastructure fix -- no dedicated requirement IDs; validates RENAME-02 migration correctness)

Success Criteria:
1. Running `memory search "authentication patterns" --mode hybrid` against a system with legacy data at `~/.memory-nexus/memory.db` (266MB) and an empty XDG database at `~/.local/share/memory/memory.db` returns real results (migration resolves conflict correctly)
2. `migrateFromLegacy()` detects when destination exists with less data than source and overwrites the empty stub
3. `initializeDatabase()` refuses to create a new database when `isMigrationPending()` returns true
4. Migration is idempotent: running it twice produces the same result
5. All existing tests pass with no regressions

---

### Phase 17: Provider Ecosystem

**Goal:** Users can configure alternative embedding providers (OpenAI API, local Ollama server) beyond the default local Transformers.js model, with automatic re-embedding when the provider or model changes.

**Depends on:** Phase 14 (needs `IEmbeddingProvider` port defined)
**Can run in parallel with:** Phases 15-16 (only needs the port, not the pipeline or search)
**Plans:** 3/3 plans complete

Plans:
- [x] 17-01-PLAN.md -- OpenAI and Ollama provider adapters with config and factory wiring
- [x] 17-02-PLAN.md -- Dimension-aware re-embedding on provider/model change
- [x] 17-03-PLAN.md -- Fix provider-specific default resolution in config loading (gap closure)

Requirements: PROV-01, PROV-02, PROV-03, PROV-04

Success Criteria:
1. Setting `"provider": "openai"` with a valid API key in `~/.config/memory/config.json` causes embedding generation to use OpenAI's text-embedding-3-small model
2. Setting `"provider": "ollama"` with a running Ollama server causes embedding generation to use the configured Ollama model
3. `memory doctor` reports the configured provider name, model, and readiness status (API key set, server reachable, etc.)
4. Changing from one provider/model to another is detected on next `memory sync --embed` and triggers a re-embedding confirmation prompt before proceeding

---

### Phase 18: API Stabilization and aidev Integration Readiness

**Goal:** The programmatic API surface is stable, typed, tested for library consumption, and documented so that aidev can depend on `@chude/memory` and expose it via `aidev memory` without surprises.

**Depends on:** Phase 16 (needs working hybrid search to expose in the API)
**Estimated Plans:** 2-3

Requirements: INTEG-01, INTEG-02, INTEG-03, INTEG-04

Success Criteria:
1. A consuming package can `import { executeSyncCommand, executeSearchCommand } from "@chude/memory"` and call them programmatically with typed options, receiving typed return values (not just exit codes)
2. Installing `@chude/memory` as an npm dependency (not globally) and calling execute functions from a test script produces correct results against a test database
3. Integration test suite exercises all public `execute*Command` functions with various option combinations and asserts on return value structure
4. API surface is documented with JSDoc and a concise API reference in the package README, listing every exported function, its parameters, and return type

---

### Gap Closure

- [x] Phase 19: Verification Closure (gap closure - 3 gaps)
- [x] Phase 20: Public API Type Exports (gap closure - 1 gap)
- [x] Phase 21: Architecture Boundary Cleanup (gap closure - 1 gap)

---

### Phase 19: Verification Closure

**Goal:** Close all administrative verification gaps blocking milestone sign-off: produce Phase 13 VERIFICATION.md, re-verify Phase 18, and formally verify cross-cutting quality requirements (QUAL-01 through QUAL-04).

**Depends on:** Phase 18 (all functional work complete)
**Type:** Gap closure (audit gaps 1, 2, 3)
**Plans:** 1/1 plans complete

Plans:
- [x] 19-01-PLAN.md -- Phase 13 verification, Phase 18 re-verification, QUAL formal verification

Requirements: RENAME-01, RENAME-03, RENAME-04, RENAME-05, INTEG-04, QUAL-01, QUAL-02, QUAL-03, QUAL-04

Success Criteria:
1. Phase 13 VERIFICATION.md exists and confirms all 5 RENAME requirements satisfied
2. Phase 18 VERIFICATION.md updated to reflect INTEG-04 fix (StatusOptions export)
3. QUAL-01 through QUAL-04 formally verified with evidence from codebase metrics
4. REQUIREMENTS.md QUAL checkboxes updated to [x] with coverage metrics documented
5. All 39 v2.0 requirements at 100% coverage in traceability table

---

### Phase 20: Public API Type Exports

**Goal:** Export all domain types used in the public API surface so TypeScript consumers can import them by name instead of relying on structural typing.

**Depends on:** Phase 18 (API surface defined)
**Type:** Gap closure (integration checker MISSING-01, MISSING-02)
**Plans:** 1/1 plans complete

Plans:
- [x] 20-01-PLAN.md -- Export domain port types and verify public API surface

Requirements: INTEG-01 (strengthened)

Success Criteria:
1. SearchMode and HybridSearchOptions exported from src/index.ts
2. IStatsService, StatsResult, ProjectStats exported from domain/ports barrel
3. All exported types documented in API reference
4. No new test failures

---

### Phase 21: Architecture Boundary Cleanup

**Goal:** Introduce IEmbeddingRepository port in the domain layer so EmbeddingService (application layer) depends on a domain port instead of importing infrastructure types directly.

**Depends on:** Phase 14 (embedding infrastructure)
**Type:** Gap closure (integration checker BOUNDARY-01)
**Plans:** 1/1 plans complete

Plans:
- [x] 21-01-PLAN.md -- Define IEmbeddingRepository port and fix application-to-infrastructure imports

Requirements: QUAL-03 (strengthened)

Success Criteria:
1. IEmbeddingRepository port defined in domain/ports/
2. EmbeddingService imports only from domain layer
3. Infrastructure EmbeddingRepository implements the domain port
4. All existing tests pass with no behavioral regression
5. Architecture audit confirms no application-to-infrastructure imports

---

### Cross-Cutting: Quality (All Phases)

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

These are enforced in every phase, not assigned to a single phase:
- 95%+ coverage at EACH metric for all new code
- Domain layer maintains zero external dependencies
- All new infrastructure adapters follow existing port/adapter patterns
- TDD workflow (RED-GREEN-REFACTOR) for all new features

---

## Dependency Graph

```
Phase 13 (Package Rename)
    |
    +---> Phase 14 (Embedding Infrastructure)
              |
              +---> Phase 15 (Embedding Pipeline)
              |         |
              |         +---> Phase 16 (Hybrid Search + Degradation)
              |                   |
              |                   +---> Phase 16.1 (Migration Race Fix) [urgent]
              |                         |
              |                         +---> Phase 18 (API Stabilization)
              |                                   |
              |                                   +---> Phase 19 (Verification Closure) [gap closure]
              |                                   |         |
              |                                   |         +---> Phase 20 (Public API Type Exports) [gap closure]
              |                                   |
              |                                   +---> Phase 21 (Architecture Boundary) [gap closure]
              |
              +---> Phase 17 (Provider Ecosystem)
                    [parallel with Phases 15-16]
```

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
| 27 | v3.0 | Complete    | 2026-03-18 | 2026-03-18 |
| 28 | v3.0 | -- | Discussed | -- |
| 29 | v3.0 | Complete    | 2026-03-18 | 2026-03-18 |

---

---

### Phase 22: Integration Checker Cleanup (v2.0 gap closure)

**Goal:** Resolve 3 non-critical findings from the v2.0 milestone audit integration checker.

**Depends on:** Phase 21
**Type:** Gap closure (ad-hoc, no PLAN.md files)
**Status:** Complete (2 commits on main: eee5a25, 0f5a0eb)

Resolved:
- executeBrowseCommand integration test (INTEG-03)
- Orphaned presentation/index.ts barrel (BARREL-01)
- Application-to-infrastructure boundary violations in sync-service and recovery-service

---

### v3.0 Knowledge Layer + Friction Logging (Phases 23-27)

**Overview:** Ship the complete knowledge layer alongside a friction logging system. Agent-written memory (daily logs, decisions, learnings), smart context briefings, temporal decay, FTS5 reliability, friction capture with visual dashboards, session backfill via Agent SDK, and qmd markdown search integration.

**Depth:** Standard (5 phases)
**Design doc:** docs/plans/2026-03-07-knowledge-layer-friction-design.md

---

### Phase 23: Foundation

**Goal:** Establish the agent write protocol, global ~/.memory/ directory structure, memory file indexing in sync, and FTS5 search reliability fixes.

**Depends on:** v2.0 complete
**Discussion context:** .planning/phases/23-foundation/CONTEXT.md

Success Criteria:
1. ~/.memory/ directory structure created with encoded-path project subdirectories
2. `memory sync` discovers and indexes ~/.memory/**/*.md files in a new memory_files table
3. `memory search "SYNC-09"` returns results instead of FTS5 syntax error
4. Daily log, DECISIONS.md, and LEARNINGS.md format conventions documented
5. All existing tests pass with no behavioral regression

---

### Phase 24: Friction System

**Goal:** Build the complete friction logging system: domain entity, repository, CLI commands (log, list, resolve, dashboard), and visual dashboard (CLI + HTML).

**Depends on:** Phase 23 (schema infrastructure)
**Discussion context:** .planning/phases/24-friction-system/CONTEXT.md
**Plans:** 3 plans

Plans:
- [x] 24-01-PLAN.md -- FrictionEntry domain entity, IFrictionRepository port, schema, SqliteFrictionRepository
- [x] 24-02-PLAN.md -- FrictionService application service, CLI friction commands, programmatic API
- [x] 24-03-PLAN.md -- Dashboard formatters (CLI + HTML with Chart.js), rules file update

Requirements: FRIC-01, FRIC-02, FRIC-03, FRIC-04, FRIC-05, FRIC-06

Success Criteria:
1. `memory friction log "description" --severity high --category search` creates a friction entry
2. `memory friction list` shows open items; `memory friction list --all` shows all
3. `memory friction resolve 42 --resolution "fixed"` closes an item with resolution
4. `memory friction dashboard` renders rich terminal stats matching Claude Code /stats aesthetic
5. `memory friction dashboard --html` generates and opens a Chart.js HTML report
6. ~/.claude/rules/memory.md updated with friction logging protocol

---

### Phase 25: Intelligence

**Goal:** Rewrite smart context to produce structured briefings from memory files, add temporal decay to search, implement AI-first output mode, and enable cross-project intelligence.

**Depends on:** Phase 23 (memory file indexing), Phase 24 (friction in context)
**Discussion context:** .planning/phases/25-intelligence/CONTEXT.md
**Plans:** 4/4 plans complete

Plans:
- [x] 25-01-PLAN.md -- AI formatter, temporal decay extension, cross-project query, uniform search decay
- [x] 25-02-PLAN.md -- SmartContextService and budget allocator
- [x] 25-03-PLAN.md -- CLI integration (--format ai, --budget, --cross-project)
- [x] 25-04-PLAN.md -- Fix flaky vector-only temporal decay test (gap closure)

Success Criteria:
1. `memory context kanbanflow --format ai --budget 1500` returns structured briefing within token budget
2. Search results weighted by recency (30-day half-life); curated files exempt from decay
3. `--format ai` available on all commands, outputs token-efficient text
4. Learnings tagged "Applies to: cross-project" surfaced in `memory context --cross-project`

---

### Phase 26: Hooks + Backfill

**Goal:** Install PreCompact hook for memory flush reminders, and build the backfill command that generates daily logs from historical sessions via the Agent SDK.

**Depends on:** Phase 23 (memory file indexing)
**Discussion context:** .planning/phases/26-hooks-and-backfill/CONTEXT.md
**Plans:** 3 plans

Plans:
- [x] 26-01-PLAN.md -- PreCompact flush reminder in sync hook script
- [x] 26-02-PLAN.md -- BackfillState domain entity, IBackfillStateRepository port, schema, SqliteBackfillStateRepository
- [x] 26-03-PLAN.md -- BackfillService, ClaudeSummaryGenerator, backfill CLI command with dry-run and progress

Success Criteria:
1. `memory install` installs both SessionEnd and PreCompact hooks
2. PreCompact hook outputs memory flush reminder before context compression
3. `memory backfill --dry-run` shows session count and estimated cost
4. `memory backfill` generates daily log entries from historical sessions
5. Backfill is idempotent (tracks state, skips already-processed sessions)

---

### Phase 27: qmd Integration

**Goal:** Integrate qmd as an optional peer dependency for semantic markdown file search via `memory search --files`.

**Depends on:** Phase 23 (files to search exist in ~/.memory/)
**Discussion context:** .planning/phases/27-qmd-integration/CONTEXT.md
**Plans:** 2/2 plans complete

Plans:
- [x] 27-01-PLAN.md -- IExternalSearchProvider domain port, QmdRunner infrastructure adapter with detection utilities
- [x] 27-02-PLAN.md -- Search command --files flag with qmd delegation, doctor qmd status check

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

Success Criteria:
1. `memory search "query" --files` delegates to qmd when installed
2. If qmd not installed, prints helpful install instructions
3. `memory doctor` reports qmd availability status
4. All existing search functionality works without qmd installed

---

### v3.0 Dependency Graph

```
Phase 23 (Foundation)
    |
    +---> Phase 24 (Friction System)
    |         |
    |         +---> Phase 25 (Intelligence)
    |         |         |
    |         |         +---> Phase 29 (Ambient Context)
    |         |               [parallel with Phase 27-28]
    |         |
    |         +---> Phase 28 (Friction Universalization)
    |
    +---> Phase 26 (Hooks + Backfill)
    |     [parallel with Phase 24]
    |
    +---> Phase 27 (qmd Integration)
          [parallel with Phase 24-26]
```

---

### Cross-Cutting: Quality (All Phases)

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

These are enforced in every phase, not assigned to a single phase:
- 95%+ coverage at EACH metric for all new code
- Domain layer maintains zero external dependencies
- All new infrastructure adapters follow existing port/adapter patterns
- TDD workflow (RED-GREEN-REFACTOR) for all new features

### Phase 28: Friction Universalization

**Goal:** Upgrade the Phase 24 friction system from memory-specific to universal tool tracking. Add a `tool` column as the primary dimension, generalize categories beyond memory-specific values, add source/tool filtering to queries, implement seen/unseen tracking with `last_reviewed_at`, auto-ingest the `~/.claude/friction.jsonl` fallback, de-brand the dashboard with a "By Tool" chart, and add recurrence/pattern detection for auto-escalation.

**Depends on:** Phase 24 (friction system exists)
**Discussion context:** .planning/phases/28-friction-universalization/CONTEXT.md
**Plans:** 4 plans

Plans:
- [x] 28-01-PLAN.md -- Domain entity, port interface, and schema migration for universal friction
- [x] 28-02-PLAN.md -- SqliteFrictionRepository tool filtering, markReviewed, findPatterns, byTool stats
- [x] 28-03-PLAN.md -- FrictionService auto-ingest, tool parameter threading, pattern detection
- [ ] 28-04-PLAN.md -- CLI --tool flags, dashboard de-branding, By Tool chart, pattern alerts

Requirements: SC-01, SC-02, SC-03, SC-04, SC-05, SC-06, SC-07, SC-08


Success Criteria:
1. `memory friction log "desc" --tool aidev --severity high` stores friction with tool as a first-class field
2. `memory friction list --tool aidev` returns only aidev friction; `--tool memory` returns only memory friction
3. Categories are not limited to the 6 memory-specific values -- any string accepted, validated in app layer
4. `memory friction dashboard` shows "By Tool" chart alongside existing severity/category/status charts
5. Dashboard title is "Friction Dashboard" (not "Memory Friction Dashboard")
6. On any `memory friction *` invocation, `~/.claude/friction.jsonl` is auto-ingested if present, then deleted
7. `memory friction list` shows a "new" indicator on entries not yet reviewed (based on `last_reviewed_at` per tool)
8. When 3+ open entries share the same tool+category, dashboard surfaces a "pattern detected" alert

### Phase 29: Ambient Context

**Goal:** Generate memory CLI context into Claude Code's auto memory directory so cross-project awareness is ambient at session start, not query-dependent. Two artifacts per project: a full `context.md` file owned by the CLI, and a demarcated summary block in the project's MEMORY.md.

**Depends on:** Phase 25 (SmartContextService, --format ai, budget allocator)
**Discussion context:** .planning/phases/29-ambient-context/CONTEXT.md
**Plans:** 2/2 plans complete

Plans:
- [x] 29-01-PLAN.md -- IAmbientContextWriter domain port, config extension, AutoMemoryWriter infrastructure adapter
- [x] 29-02-PLAN.md -- AmbientContextService application service, sync command integration

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

Success Criteria:
1. After `memory sync`, the current project's auto memory directory contains a `context.md` file with structured cross-project context
2. The project's MEMORY.md contains a `<!-- memory-cli:start/end -->` demarcated block with a summary (decisions, friction, learnings counts)
3. The MEMORY.md block is updated on each sync without touching content outside the markers
4. `memory install` wires context generation into the sync hook
5. `context.md` budget is configurable in `~/.config/memory/config.json` (default 800-1000 tokens)

---

*Last updated: 2026-03-18 (Phase 29 complete: ambient context pipeline operational, 2/2 plans)*
