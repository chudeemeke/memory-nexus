---
agent: gsd-phase-researcher
updated: 2026-03-08
entries: 28
---

- finding: "When researching package renames, always read every infrastructure file that constructs paths -- path definitions are often scattered across multiple modules. Grep for the old name is not sufficient; you need to categorize each reference as (a) tool identity, (b) filesystem path, (c) test data."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "CONTEXT.md can contain inaccurate descriptions of current state (e.g., 'was ~/.config/memory-nexus/' when actual current path is ~/.memory-nexus/). Always verify CONTEXT claims against actual source code. The user's INTENT is usually correct even when the description of current state is wrong."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Distinguish test data from tool identity during rename research. Test files using 'memory-nexus' as a PROJECT NAME in path decoding tests (e.g., ProjectPath.fromDecoded('C:\\Users\\Test\\Projects\\memory-nexus')) should NOT be renamed -- they test the path decoder with a project that happens to be named 'memory-nexus', which is valid test data."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2022-02-22"

- finding: "npm 'latest' dist-tag does not always point to stable releases. sqlite-vec has latest=0.1.7-alpha.2 while 0.1.6 is the last stable. Always check dist-tags AND version list to identify true stable versions. Pin explicit stable versions rather than using ^ ranges for extension packages."
  source: "Phase 14, Embedding Infrastructure"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "@huggingface/transformers bundles onnxruntime-node and onnxruntime-web as regular dependencies (not optional or peer). Do NOT install them separately -- version conflicts will occur. transformers.js@3.8.1 pins onnxruntime-node@1.21.0."
  source: "Phase 14, Embedding Infrastructure"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "For phases adding SQLite extensions (sqlite-vec), verify the synchronous vs async nature of the extension loading API against the existing initializeDatabase() signature. sqlite-vec's load() is synchronous but import() is async. Decide whether to make initializeDatabase async or use top-level import. The existing pattern is synchronous -- top-level import of the lightweight loader module preserves this."
  source: "Phase 14, Embedding Infrastructure"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "When a phase builds on top of existing infrastructure (Phase 15 on Phase 14), the most valuable research is mapping the exact join points: which interfaces to call, which DB columns to read/write, which patterns to reuse verbatim. The codebase IS the primary source -- Context7 and web searches add little value when the domain is project-internal wiring."
  source: "Phase 15, Embedding Pipeline"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "messages_meta uses rowid INTEGER PRIMARY KEY AUTOINCREMENT as the join key for FTS5 (messages_fts), embedding_state, and message_embeddings (vec0). The message's TEXT id field is NOT the key for embedding operations. Always SELECT rowid alongside content when preparing messages for embedding."
  source: "Phase 15, Embedding Pipeline"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "The existing EmbeddingConfigData interface lacks a batchSize field. Phase 15 will need to extend it. The config manager's deep-merge in loadConfig() handles new fields gracefully -- existing config files without batchSize will get the default value."
  source: "Phase 15, Embedding Pipeline"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"
  status: superseded
  superseded_by: "Phase 15 added batchSize to EmbeddingConfigData. Already complete."

- finding: "For composition phases (Phase 16 builds on Phases 14+15), the research should focus on mapping exact join points between existing components, not re-investigating external libraries. The Fts5SearchService, EmbeddingRepository, EmbeddingProviderFactory, and vec0 schema are the primary sources. External research (Context7, web) adds minimal value when all building blocks are internal."
  source: "Phase 16, Hybrid Search"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "sqlite-vec MATCH returns 'distance' (lower = more similar), not 'similarity'. For RRF, this does not matter because only rank position is used, but for raw score metadata in JSON output, the distance value should be stored as cosine_distance and labeled accordingly to avoid confusion."
  source: "Phase 16, Hybrid Search"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "The gsd-tools.cjs commit command has quoting issues on Windows when the commit message contains spaces. Use direct git commands as fallback: git add <files> && git commit --author='Chude <chude@emeke.org>' -m 'message'."
  source: "Phase 16, Hybrid Search"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "When SQLite databases are opened in WAL mode and then the main .db file is replaced (e.g., during migration), stale .db-wal and .db-shm sidecar files MUST be deleted before the replacement. Otherwise SQLite applies old WAL transactions to the new database, causing corruption. Always clean up WAL/SHM files as part of any database file replacement operation."
  source: "Phase 16.1, Migration Race Condition Fix"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "For bug-fix phases where the root cause is a race condition or ordering issue, the most valuable research is tracing the exact execution sequence through the code: which function calls which, in what order, and what filesystem side effects each produces. Theoretical analysis of the race condition is less valuable than reading the actual code paths and identifying every place that creates/opens the contested resource."
  source: "Phase 16.1, Migration Race Condition Fix"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "sqlite-vec vec0 virtual tables have dimensions baked into the CREATE statement (e.g., float[384]). You cannot ALTER the dimension -- changing embedding dimensions requires DROP TABLE + CREATE TABLE with new dimensions. The existing clearAllEmbeddings() only DELETEs rows; a dimension change needs a separate recreateVecTable(newDimensions) method. This is the critical non-obvious requirement when adding providers with different default dimensions."
  source: "Phase 17, Provider Ecosystem"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "For phases that add external API integrations (OpenAI, Ollama), do NOT default to installing SDK packages. Both OpenAI and Ollama embedding APIs are single-POST-endpoint services. Native fetch() in Bun handles all needed functionality (headers, JSON, status codes) with zero dependency cost. SDKs add weight, version coupling, and Node.js runtime assumptions for no tangible benefit on simple endpoints."
  source: "Phase 17, Provider Ecosystem"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "For library packaging phases, always check what the build script actually produces vs what package.json declares as 'main' and 'types'. The dist/ directory is the ground truth. A mismatch between declared entry point and actual output is a silent distribution bug that only surfaces when a consumer tries to install the package."
  source: "Phase 18, API Stabilization"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "When execute*Command functions are designed to never call process.exit() (returning CommandResult instead), they are library-safe by design. The pattern of returning { exitCode: number } and setting process.exitCode in the CLI action wrapper is the correct pattern for dual-mode functions (standalone CLI + library import). Verify compliance with: grep -r 'process.exit(' src/presentation/cli/commands/ should find no direct calls."
  source: "Phase 18, API Stabilization"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "For verification closure phases (administrative gap closure), the research domain is the project's own planning artifacts, not external technology. The most valuable research output maps each gap to its evidence source (plan summaries, git commits, coverage reports, import audits) and specifies the exact commands or file reads the executor needs. No external research (Context7, WebSearch) adds value -- all evidence is internal."
  source: "Phase 19, Verification Closure"
  confidence: HIGH
  phase: "19-verification-closure"
  date: "2026-03-01"

- finding: "For TypeScript barrel export gap-closure phases, the critical research is tracing the full export chain upward from the leaf type definition to the public entry point (src/index.ts). A type defined in domain/ports/services.ts requires: (1) named export in domain/ports/index.ts, (2) domain/index.ts to include ports via export * from './ports/index.js', and (3) src/index.ts to export * from './domain/index.js'. Missing any link in this chain means the type is unreachable from the package name. Always trace the complete chain, not just the immediate file."
  source: "Phase 20, Public API Type Exports"
  confidence: HIGH
  phase: "20-public-api-type-exports"
  date: "2026-03-01"

- finding: "For architecture boundary cleanup phases, the most valuable research is identifying EXACTLY which methods the application layer calls on the infrastructure class, then defining a MINIMAL port interface (ISP). Do not include all methods of the concrete class in the port -- only what crosses the boundary. Infrastructure-to-infrastructure imports are legal in hexagonal architecture and do not need ports. Also watch for config type dependencies: define a minimal domain type with only the fields the application layer reads, not the full infrastructure config shape."
  source: "Phase 21, Architecture Boundary Cleanup"
  confidence: HIGH
  phase: "21-architecture-boundary-cleanup"
  date: "2026-03-01"

- finding: "For foundation phases that add new entity types alongside new infrastructure (Phase 23: MemoryFile entity + memory_files table + file scanner + FTS5 fix), the most valuable research is mapping every existing analog in the codebase: Entity->MemoryFile, SqliteSessionRepository->SqliteMemoryFileRepository, FileSystemSessionSource->MemoryFileScanner, messages_fts triggers->memory_files_fts triggers. When every new component has a 1:1 existing analog, external research adds zero value -- the codebase IS the documentation."
  source: "Phase 23, Foundation"
  confidence: HIGH
  phase: "23-foundation"
  date: "2026-03-08"

- finding: "When a phase adds FTS5 sanitization that modifies existing search services (Fts5SearchService, HybridSearchService), the sanitizer must be a pure function in the application layer with no infrastructure dependencies. Placing it in the domain layer (e.g., SearchQuery value object) would violate the principle that the value object preserves the user's original input. Placing it in infrastructure would scatter the logic across multiple service files. Application layer utility is the correct location -- called at the boundary between domain query objects and infrastructure FTS5 execution."
  source: "Phase 23, Foundation"
  confidence: HIGH
  phase: "23-foundation"
  date: "2026-03-08"

- finding: "For subsystem phases (Phase 24: Friction System) where every component has a 1:1 codebase analog (FrictionEntry->MemoryFile, SqliteFrictionRepository->SqliteMemoryFileRepository, friction commands->stats command), the research is almost entirely codebase analysis. External research only needed for two things: Commander.js subcommand nesting (addCommand pattern for memory friction <sub>) and Chart.js UMD inline embedding for HTML dashboards. Both are small, well-documented patterns."
  source: "Phase 24, Friction System"
  confidence: HIGH
  phase: "24-friction-system"
  date: "2026-03-08"

- finding: "CONTEXT.md can describe implementation approaches that are technically impossible. Phase 26 CONTEXT.md described using @anthropic-ai/claude-code as a programmatic library ('agentSdk.complete(prompt)'), but the package has no main/exports field -- it is CLI-only with just a bin entry. Always verify CONTEXT.md's technical claims by reading the actual package.json and attempting import before committing to the described approach. The user's INTENT (use Claude for summarization) is correct; the MECHANISM (library import vs CLI invocation) needs correction."
  source: "Phase 26, Hooks + Backfill"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "When a phase modifies an existing hook script to add new behavior (PreCompact reminder), the most critical research is determining the full existing state of the infrastructure. Phase 26 CONTEXT.md described changes to hook installer, install/uninstall commands, and doctor as if they needed to be built, but all of these were already implemented. The settings-manager already handles both hooks, install already checks both, uninstall already removes both, and health-checker already requires both for 'installed' status. The only actual change needed is in the hook script itself (sync-hook-script.ts) to output the reminder message."
  source: "Phase 26, Hooks + Backfill"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "For intelligence/composition phases that wire existing components into new application services (Phase 25: SmartContextService composing MemoryFileRepository + FrictionRepository + SqliteContextService), the critical research finding is identifying the project-name-to-encoded-path resolution gap. Memory files use encoded paths (from ~/.claude/projects/ convention) but CLI accepts human-readable names. The existing SqliteContextService already resolves this via sessions table LIKE queries -- the new service must reuse this resolution, not reinvent it."
  source: "Phase 25, Intelligence"
  confidence: HIGH
  phase: "25-intelligence"
  date: "2026-03-08"

- finding: "When a Commander.js codebase already has per-command --format with different choices per command (context: brief|detailed, search: none, list: none), adding a global --format ai is better done by extending each command's choices individually rather than using root-level option inheritance. Commander.js root options and subcommand options with the same name can create precedence confusion. The per-command approach matches the existing codebase pattern and avoids inheritance edge cases."
  source: "Phase 25, Intelligence"
  confidence: HIGH
  phase: "25-intelligence"
  date: "2026-03-08"
