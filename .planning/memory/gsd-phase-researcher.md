---
agent: gsd-phase-researcher
updated: 2026-03-01
entries: 18
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

- finding: "bun build does not emit .d.ts TypeScript declaration files. For a package to be properly typed when imported as a library, tsc must be used for the library build. Use dual build: tsc for library (with declarations), bun build for CLI binary (without declarations but bundled). Run bun build second so it overwrites tsc's unbundled CLI output with the proper bun-bundled binary."
  source: "Phase 18, API Stabilization"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"
