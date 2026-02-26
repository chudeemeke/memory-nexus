---
agent: gsd-project-researcher
updated: 2026-02-18
entries: 12
---

- finding: "Transformers.js v3 works with Bun -- Issue #558 was closed Oct 2025. The fix was adding onnxruntime-node as optional dependency."
  source: "v2.0 semantic search research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "onnxruntime-node had a Windows-specific regression in Bun 1.2.5 (UTF-8/UTF-16 path corruption). Fixed in PR #18107. Pin Bun >= 1.2.6 on Windows."
  source: "v2.0 semantic search research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "sqlite-vec works with bun:sqlite via sqliteVec.load(db). Platform packages exist: sqlite-vec-windows-x64, etc. Same macOS setCustomSQLite requirement as FTS5."
  source: "v2.0 semantic search research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "sqlite-vec is brute-force only. Practical limit: 100K-200K vectors at <75ms for 384d. 1M vectors at 384d takes ~200ms+. ANN index planned but no timeline."
  source: "v2.0 semantic search research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "OpenClaw uses 70% vector / 30% BM25 linear combination with sqlite-vec. memory-nexus should use RRF instead -- avoids score normalization issues."
  source: "v2.0 semantic search research"
  confidence: MEDIUM
  phase: "research"
  date: "2026-02-18"

- finding: "all-MiniLM-L6-v2 quantized ONNX is 23MB (uint8), 384 dimensions. nomic-embed-text-v1.5 quantized is 137MB, 768 dimensions with Matryoshka truncation. Default should be all-MiniLM for CLI speed."
  source: "v2.0 semantic search research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "aidev has a dual architecture: bash CLI (src/cli/aidev.sh, 3500+ lines) for shell features and a full TypeScript CLI (cli/src/) with hexagonal architecture for complex features like 'agent'"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "aidev's TypeScript CLI uses a custom ArgParser and CommandRegistry pattern (not commander.js). Commands implement ICommand interface with meta/execute/showHelp. Registration is via COMMAND_MANIFEST array in cli/src/presentation/commands/index.ts"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "memory-nexus exports execute*Command functions from each CLI command (e.g., executeSearchCommand, executeSyncCommand) that accept options objects and return { exitCode }. These are the ideal integration surface for aidev -- no need to rewrite commands"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "aidev's TS CLI is NOT wired through the bash dispatcher. There is no reference to cli/dist in aidev.sh. The TS CLI (cli/dist/index.js) runs as a standalone bun binary. The bash cmd_memory() currently just forwards to cmd_server start/test/logs memory"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "Both codebases use bun:sqlite. aidev has SqliteConnection wrapper in cli/src/infrastructure/db/. memory-nexus uses bun:sqlite directly. They manage separate databases and SHOULD continue to do so"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"

- finding: "Recommended integration: Option E (Hybrid). Add memory-nexus as npm dependency of cli/package.json. Create MemoryCommand following AgentCommand pattern. Bash cmd_memory delegates to bun cli/dist/index.js memory. memory-nexus keeps independent architecture"
  source: "aidev integration research"
  confidence: HIGH
  phase: "research"
  date: "2026-02-18"
