# Roadmap: @chude/memory (memory-nexus)

## Milestones

- SHIPPED **v1.0 Full Vision Implementation** -- Phases 1-12 (shipped 2026-02-16) -- [Archive](milestones/v1.0-ROADMAP.md)
- SHIPPED **v2.0 Hybrid Search and Rebrand** -- Phases 13-22 (shipped 2026-03-01)
- SHIPPED **v3.0 Knowledge Layer + Friction Logging** -- Phases 23-29.1 (shipped 2026-04-02)
- **v4.0 Intelligence Layer** -- Phases 30-37 (in progress)

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

### v4.0 Intelligence Layer (Phases 30-37)

**Overview:** Transform memory from a data store into a knowledge system. Automated extraction of decisions, learnings, and patterns from sessions via LLM-powered pipeline. Intelligent context delivery from SQLite fact tables instead of filesystem. Clean CLI surface with labeled help groups. Cross-environment portability for WSL migration. npm publish to registry.

**Depth:** Fine (8 phases)
**Total v4.0 Requirements:** 25 phase-mapped + 4 cross-cutting (QUAL) = 29

- [x] **Phase 30: God File Cleanup** - Split sync.ts and friction.ts into focused SRP-compliant modules (completed 2026-04-03)
- [ ] **Phase 31: Bug Fixes** - Unicode search, CLI truncation, download bar issues
- [ ] **Phase 32: CLI Surface** - Labeled help groups, uniform --json and --format flags
- [ ] **Phase 33: Knowledge Extraction Foundation** - Extraction provider port, facts schema, extraction_log, temporal tracking
- [ ] **Phase 34: Extraction Pipeline** - The `memory extract` command with ADD/UPDATE/DELETE/NOOP operations
- [ ] **Phase 35: Context Intelligence** - Rewire SmartContextService to read from fact tables, deprecate ~/.memory/
- [ ] **Phase 36: Portability** - WSL migration command, doctor --portability, migration guide
- [ ] **Phase 37: Publishing** - npm publish @chude/memory to registry

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
**Plans:** 1/2 plans executed

Plans:
- [x] 31-01-PLAN.md -- Fix Unicode FTS5 sanitization (FIX-01) and download progress bar 0/0 MB (FIX-03)
- [ ] 31-02-PLAN.md -- Fix CLI output width-aware truncation and column alignment (FIX-02)

---

### Phase 32: CLI Surface

**Goal**: The help output is organized and all query commands support uniform output format flags so users can discover commands by category and consume output programmatically
**Depends on**: Nothing (independent of extraction work; can run in parallel with Phases 30-31)
**Requirements**: CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. `memory --help` groups commands under labeled categories (Query, Data, System, Feedback) instead of a flat alphabetical list
  2. All query commands (`search`, `context`, `show`, `list`, `related`, `stats`) accept `--json` and produce valid JSON to stdout
  3. All query commands support `--format brief` and `--format ai` where applicable, producing condensed or AI-optimized output respectively
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

---

### Phase 36: Portability

**Goal**: Users can migrate their memory database between environments (Windows to WSL) and diagnose cross-environment data issues
**Depends on**: Nothing (independent; can run in parallel with Phases 33-35)
**Requirements**: PORT-01, PORT-02, PORT-03
**Success Criteria** (what must be TRUE):
  1. `memory migrate --from-windows` checkpoints WAL, verifies database integrity, re-installs hooks for the new environment, and prints a session summary by project
  2. `memory doctor --portability` reports mixed-environment data (Windows vs Unix paths in session records), extraction state pointing to non-existent paths, and sqlite-vec availability
  3. Migration protocol is documented as a user-facing guide with step-by-step instructions in the project documentation
**Plans**: TBD

---

### Phase 37: Publishing

**Goal**: `@chude/memory` is published to npm and installable globally by any user
**Depends on**: Phase 35 (all features complete before publishing)
**Requirements**: PUB-01, PUB-02
**Success Criteria** (what must be TRUE):
  1. `@chude/memory` is published to the npm registry with correct `bin`, `files`, and dependency configuration
  2. `bun add -g @chude/memory` installs successfully on a clean machine and the `memory` binary is available in PATH
  3. `memory --version` reports the published version; `memory doctor` passes all health checks on a fresh install
**Plans**: TBD

---

### Cross-Cutting: Quality (All v4.0 Phases)

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

These are enforced in every phase, not assigned to a single phase:
- 95%+ coverage at EACH metric for all new code
- Domain layer maintains zero external dependencies
- All new infrastructure adapters follow existing port/adapter patterns
- TDD workflow (RED-GREEN-REFACTOR) for all new features

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
                                  +---> Phase 37 (Publishing)

Phase 32 (CLI Surface)
    [independent, parallel with Phases 30-35]

Phase 36 (Portability)
    [independent, parallel with Phases 33-35]

Phase 37 (Publishing)
    depends on Phase 35 (all features in before publish)
    depends on Phase 31 (bugs fixed before publish)
    depends on Phase 32 (CLI surface clean before publish)
    depends on Phase 36 (portability in before publish)
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
| 31. Bug Fixes | v4.0 | 1/2 | In Progress|  |
| 32. CLI Surface | v4.0 | TBD | Not started | - |
| 33. Knowledge Extraction Foundation | v4.0 | TBD | Not started | - |
| 34. Extraction Pipeline | v4.0 | TBD | Not started | - |
| 35. Context Intelligence | v4.0 | TBD | Not started | - |
| 36. Portability | v4.0 | TBD | Not started | - |
| 37. Publishing | v4.0 | TBD | Not started | - |

---

*Last updated: 2026-04-03 (Phase 31 planned: 2 plans)*
