# Requirements: @chude/memory v4.0

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

## Out of Scope

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

**Coverage:**
- v4.0 requirements: 25 total (excluding QUAL cross-cutting)
- Cross-cutting: 4 QUAL requirements
- Total: 29
- Mapped to phases: 25/25
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-05-30 after Phase 37 publish verification; PUB-01 and PUB-02 complete*
