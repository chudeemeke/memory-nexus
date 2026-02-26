---
agent: gsd-phase-researcher
updated: 2026-02-26
entries: 9
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
