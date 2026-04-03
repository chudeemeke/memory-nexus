# Requirements: @chude/memory v4.0

**Defined:** 2026-04-03
**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## v4.0 Requirements

Requirements for v4.0: Intelligence Layer -- automated knowledge extraction, intelligent context delivery, clean CLI surface, portability, and npm publish.

### Knowledge Extraction

- [ ] **KNOW-01**: `IExtractionProvider` port in domain layer with extract method; adapters for Claude API (Anthropic SDK, API key auth), Ollama (local), and OpenAI
- [ ] **KNOW-02**: `memory extract <project>` extracts atomic facts from session messages via configured provider and stores them in a `facts` SQLite table
- [ ] **KNOW-03**: Each extracted fact carries `observed_at` (when the fact was first seen) and optional `superseded_at` / `superseded_by` fields for temporal tracking
- [ ] **KNOW-04**: Extraction pipeline compares new candidate facts against existing facts using embedding similarity and decides ADD, UPDATE, DELETE (supersede), or NOOP per fact
- [ ] **KNOW-05**: `memory extract` is idempotent -- re-running on already-extracted sessions skips them (tracked via `extraction_log` table)
- [ ] **KNOW-06**: `extraction_log` table records each extraction run: session ID, mode, facts added/updated/superseded/skipped, LLM provider/model, tokens consumed
- [ ] **KNOW-07**: `memory extract --all --since 7d` batch-extracts facts from all sessions in the last N days with progress reporting
- [ ] **KNOW-08**: `memory facts <project>` displays extracted facts for a project; `--superseded` includes historical/invalidated facts

### Context Intelligence

- [ ] **CTXT-01**: `memory context <project>` default output is an AI-optimized structured briefing built from extracted facts, friction entries, and recent session summaries (SmartContextService)
- [ ] **CTXT-02**: `memory context <project> --global` returns cross-project context by querying all projects, not just the specified one
- [ ] **CTXT-03**: `memory context` reads knowledge from SQLite fact tables instead of `~/.memory/` filesystem files
- [ ] **CTXT-04**: `~/.memory/` directory is no longer written to or read from by any command; a deprecation warning is shown if the directory exists

### CLI Surface

- [ ] **CLI-01**: Help output groups commands under labeled categories (Query, Data, System, Feedback) using Commander.js help customization
- [ ] **CLI-02**: All query commands (`search`, `context`, `show`, `list`, `related`, `stats`) support `--json` for structured output
- [ ] **CLI-03**: All query commands support `--format` flag with at least `brief` and `ai` modes where applicable

### Portability

- [ ] **PORT-01**: `memory migrate --from-windows` command checkpoints WAL, verifies integrity, re-installs hooks, and prints session summary by project
- [ ] **PORT-02**: `memory doctor --portability` reports mixed-environment data (Windows vs Unix paths), extraction state pointing to non-existent paths, and sqlite-vec availability
- [ ] **PORT-03**: Migration protocol documented as a user-facing guide in project documentation

### Bug Fixes

- [ ] **FIX-01**: `memory search` handles Unicode characters in queries without FTS5 syntax errors (issue #14)
- [ ] **FIX-02**: CLI output respects terminal width and does not truncate content incorrectly (issue #15)
- [ ] **FIX-03**: Download progress bar shows correct file size instead of 0/0 MB (issue #163)

### Publishing

- [ ] **PUB-01**: `@chude/memory` published to npm registry with correct bin, files, and dependency configuration
- [ ] **PUB-02**: `bun add -g @chude/memory` installs successfully and the `memory` binary is available in PATH

### Code Quality (Refactoring)

- [ ] **REFAC-01**: `sync.ts` (928 lines) split into focused modules following SRP -- each module handles one concern
- [ ] **REFAC-02**: `friction.ts` (638 lines) split into focused modules following SRP -- each module handles one concern

### Quality (Cross-Cutting)

- [ ] **QUAL-01**: 95%+ coverage at EACH metric (functions, lines) for all new code
- [ ] **QUAL-02**: Domain layer maintains zero external dependencies
- [ ] **QUAL-03**: All new infrastructure adapters follow existing port/adapter patterns
- [ ] **QUAL-04**: TDD workflow (RED-GREEN-REFACTOR) for all new features

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
| KNOW-01 | - | Pending |
| KNOW-02 | - | Pending |
| KNOW-03 | - | Pending |
| KNOW-04 | - | Pending |
| KNOW-05 | - | Pending |
| KNOW-06 | - | Pending |
| KNOW-07 | - | Pending |
| KNOW-08 | - | Pending |
| CTXT-01 | - | Pending |
| CTXT-02 | - | Pending |
| CTXT-03 | - | Pending |
| CTXT-04 | - | Pending |
| CLI-01 | - | Pending |
| CLI-02 | - | Pending |
| CLI-03 | - | Pending |
| PORT-01 | - | Pending |
| PORT-02 | - | Pending |
| PORT-03 | - | Pending |
| FIX-01 | - | Pending |
| FIX-02 | - | Pending |
| FIX-03 | - | Pending |
| PUB-01 | - | Pending |
| PUB-02 | - | Pending |
| REFAC-01 | - | Pending |
| REFAC-02 | - | Pending |
| QUAL-01 | All | Pending |
| QUAL-02 | All | Pending |
| QUAL-03 | All | Pending |
| QUAL-04 | All | Pending |

**Coverage:**
- v4.0 requirements: 25 total (excluding QUAL cross-cutting)
- Cross-cutting: 4 QUAL requirements
- Total: 29
- Mapped to phases: 0
- Unmapped: 25

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after initial definition*
