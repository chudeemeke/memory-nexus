# Memory-Nexus

## What This Is

Cross-project context persistence for Claude Code sessions. Extracts JSONL session files into a searchable SQLite database with full-text search, relationship tracking, entity extraction, and graph-like traversal capabilities. Ships as a standalone CLI with 16 commands covering sync, search, navigation, statistics, hooks, health checks, data management, and shell completion.

## Core Value

Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## Product North Star

This section is normative, not aspirational. Future planning, implementation, review, and release decisions must preserve this end state unless the user explicitly changes it.

I understand the ideal end state as this:

`@chude/memory` becomes your first-class, first-party memory infrastructure layer for the whole project portfolio, not just a Claude-log search CLI. It should be the durable, auditable, local-first memory substrate that lets every project and agent carry forward verified context, decisions, user preferences, friction, facts, and derived knowledge without depending on stale chat summaries or scattered docs.

The finished product should be:

- **Local-first and private by default**, with explicit consent for provider egress, remote sync, profile/persona use, graph enrichment, and dream promotion.
- **Cross-project intelligent**, so knowledge from one repo is available elsewhere only when scoped, relevant, explainable, and safe.
- **Event-sourced and auditable**, where raw sessions, extracted facts, derived memories, graph edges, rankings, and dream consolidations can be traced back to source events and replayed.
- **Provider-flexible**, using registries/configuration/capabilities instead of hardcoded OpenAI/Ollama/Anthropic assumptions or fixed paths.
- **Secure enough to trust**, with redaction before storage, FTS, embedding, extraction, export, logs, provider egress, and remote sync; no raw secret resolution through AI-visible flows.
- **Excellent as a CLI/API product**, with reliable `doctor`, `status`, `sync`, `search`, `context`, `governance`, `remote`, `audit`, and recovery surfaces that are clear for humans and stable for agents.
- **Market-ready**, meaning SOLID/hexagonal architecture, strong tests, 95%+ per coverage metric, package smoke tests, dependency/security/gitleaks checks, eval harnesses, onboarding verification, backup/restore/upgrade checks, and no known unowned blockers.
- **Agentic, but controlled**, with persona/procedural memory, temporal graph retrieval, utility-aware ranking, and audited dreaming consolidation that proposes/promotes/supersedes through events rather than silently mutating truth.

The sharper version: your ideal end state is the operating memory layer for your entire AI development environment, comparable to or better than the best agentic memory tools, but with your priorities baked in: local-first, first-party, verifiable, privacy-governed, cross-project aware, loosely coupled, tightly integrated, and independently shippable as `@chude/memory`.

My pushback line is also clear: it is not done if it merely "works." It is not done if docs overstate implementation, if provider behavior is hardcoded, if consent is bolted on, if dreams mutate hidden state, if `conversations` becomes a stale truth proxy, or if passing isolated tests masks full-suite instability.

## What This Is Not

- Not a cloud service - fully local, no network access
- Not a replacement for Claude's context window - a complement to it
- Not a cloud memory SaaS, remote vector service, or hosted analytics product

## Current State

v4.0 is shipped, and the latest verified patch on npm/local install is `@chude/memory@4.0.2`. v5.0 Market-Leader Memory Platform execution is active. Phase 42 dreaming consolidation and Phase 42.5 safe local maintenance workflows are implemented and verified. Phase 43 market-leader sales/readiness gate is active; its first implementation slice promoted the last contract-only v5 eval fixture to behavior-backed coverage, so `eval:v5:market` now passes. The remaining Phase 43 work is the readiness audit, competitive market report, Claude critique disposition, final gates, and Phase 44 release-candidate handoff.

**Tech stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, cli-progress, chrono-node, @huggingface/transformers v3

**Architecture:** Hexagonal (Domain-Application-Infrastructure-Presentation) with strict layer separation. Domain layer has zero external dependencies. 99%+ domain coverage.

**Commands:** sync, search, list, stats, context, related, show, browse, install, uninstall, status, doctor, purge, export, import, completion, facts, extract, remote, governance, profile, friction, dream

**Test suite:** Current Phase 42 gate passes typecheck, build, full tests, test isolation, eval, coverage, dependency audit, focused inbox lint, gitleaks, and diff whitespace. Full tests pass with 4,366 tests and zero failures. The Istanbul-backed coverage gate measures all four metrics independently and passes at statements 97.35%, branches 95.01%, functions 96.59%, and lines 97.45%.

## Problem Statement

Claude Code sessions are:
- Per-directory (context doesn't transfer between projects)
- Deleted after 30 days (configurable but still ephemeral)
- Not searchable across projects
- Invisible to work in other directories

This creates context silos. Patterns learned in project A are forgotten when working on project B.

## Solution

Extract session JSONL files into SQLite + FTS5 database accessible via CLI commands:
- `memory-nexus sync` - Extract sessions to database (auto via hooks or manual)
- `memory-nexus search "query"` - Full-text search across all sessions
- `memory-nexus context <project>` - Get project context
- `memory-nexus related <id>` - Find related sessions via topic/entity links
- `memory-nexus show <id>` - View session conversation thread
- `memory-nexus stats` - Database statistics
- Plus 10 more commands for hooks, health, data management, and completion

Both Claude and humans use the same commands. No special formatting needed.

## Requirements

### Validated

- SETUP-01 through SETUP-04: Project scaffolding, bun:sqlite, schema, CLI entry point -- v1.0
- DOM-01 through DOM-12: All domain entities, value objects, ports, and services -- v1.0
- PARSE-01 through PARSE-10: Streaming JSONL parser, event classification, timestamps -- v1.0
- STOR-01 through STOR-08: All repository implementations, batch writes, WAL checkpoint -- v1.0
- SYNC-01 through SYNC-08: Sync command with all options -- v1.0
- SRCH-01 through SRCH-09: Search with FTS5, filters, ranking -- v1.0
- OUT-01 through OUT-06: Output formatting, JSON mode, verbose/quiet -- v1.0
- STAT-01 through STAT-04: Stats with per-project breakdown -- v1.0
- NAV-01 through NAV-05: List, show, browse, session picker -- v1.0
- CTX-01 through CTX-04: Context aggregation with filters -- v1.0
- REL-01 through REL-05: Related command with graph traversal -- v1.0
- HOOK-01 through HOOK-05: Hook integration with background sync -- v1.0
- EXTR-01 through EXTR-04: Entity extraction, tool tracking -- v1.0
- ERR-01 through ERR-05: Error handling, exit codes, signal handling -- v1.0
- QUAL-02 through QUAL-05: Unit, integration, and concurrent tests -- v1.0
- QUAL-01: Coverage threshold -- v1.0 initially near-pass; current all-four-metric gate is measurable and passes the 95% WoW threshold for statements, branches, functions, and lines
- Hybrid search (FTS5 + sqlite-vec + RRF), embedding providers, embedding pipeline -- v2.0
- Package rename to @chude/memory, programmatic API, aidev integration readiness -- v2.0
- Agent-written memory, smart context, friction system, backfill, qmd integration -- v3.0
- Friction universalization (tool column, pattern detection, auto-ingest, de-branded dashboard) -- v3.0
- Ambient context (context.md + MEMORY.md marker merge on sync) -- v3.0
- Test determinism (DB path injection, dispatch mock isolation) -- v3.0

### Active

## Current Milestone: v5.0 Market-Leader Memory Platform

**Goal:** Make `@chude/memory` a local-first, privacy-governed, cross-project, event-sourced memory substrate with governed persona/procedural memory, temporal graph retrieval, utility-aware ranking, audited dreaming consolidation, excellent CLI/API usability, and demonstrable market readiness.

**Active work:** Phase 43 market-leader sales/readiness gate. Phase 43 must prove the current implementation against the product north star, competitive market baseline, security and quality gates, and release-candidate criteria before Phase 44 publish/release work.

**Target features:**
- Consent/provenance governance for derived memory and provider egress
- Canonical event kernel and deterministic projection replay
- Remote sync operations with explicit egress and recovery controls
- Optional secure capability interop without raw secret resolution
- Durable friction query contract and cross-project issue flow
- Persona/procedural memory, temporal graph, utility ranking, and audited dreaming
- Feature completeness, excellent CLI/API UX, market-readiness gate, and release-candidate handoff

## Historical Milestone: v4.0 Intelligence Layer

**Goal:** Transform memory from a data store into a knowledge system -- automated extraction of decisions/learnings/patterns from sessions, intelligent context delivery instead of raw retrieval, a clean CLI surface, and cross-environment portability.

**Target features:**
- CLI surface audit (review all commands for overlaps, gaps, rename/merge/kill)
- Knowledge extraction pipeline (heuristic + LLM-based, into SQLite tables)
- Rewire `memory context` to SmartContextService (kill old metadata, add `--global`)
- Deprecate `~/.memory/` directory convention (SQLite-only knowledge storage)
- Bug fixes (unicode search, CLI truncation, download bar 0/0 MB)
- npm publish @chude/memory to registry
- God file cleanup (sync.ts, friction.ts SRP violations)
- Cross-environment portability audit (WSL migration readiness, dynamic path resolution)

### Out of Scope

- Web UI -- CLI-only tool
- Cross-machine sync -- Local only; iCloud/git handles backup
- Multi-user support -- Personal productivity tool
- Session editing -- Read-only extraction
- Real-time streaming -- Sessions are batch files

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite + FTS5 | Embedded, no server, full-text search built-in, portable | Good |
| bun:sqlite over better-sqlite3 | ABI compatibility issues with Bun; bun:sqlite is 3-6x faster | Good |
| Direct aidev integration | Consistent with user's existing tooling, not standalone | Good |
| Hexagonal architecture | User's WoW standard; clear layer separation | Good |
| Streaming JSONL parser | Session files can exceed 10,000 lines; memory exhaustion risk | Good |
| FTS5 MATCH only | = operator causes full table scan; must enforce MATCH | Good |
| BM25 ranking default | Lower (more negative) scores indicate better relevance | Good |
| readline.createInterface | Node's built-in streaming for JSONL parsing | Good |
| Post-filter for case sensitivity | FTS5 is inherently case-insensitive; post-filter with 2x fetch limit | Good |
| Strategy pattern for formatters | OutputFormatter, ListFormatter, ShowFormatter enable clean output modes | Good |
| WITH RECURSIVE CTE | Multi-hop graph traversal in SQLite for relationship discovery | Good |
| Detached process for hooks | spawn() with detached:true, stdio:ignore + unref() for background | Good |
| Native shell completion | Self-contained bash/zsh/fish scripts; no external dependency like Carapace | Good |
| Commander.js v14 | Mature CLI framework with built-in conflicts(), argParser, and help | Good |
| Design for embeddings | Schema accommodates future vector column without current complexity | Good |
| Standalone + platform integration | Docker model: memory is standalone product, aidev integrates as platform; keeps independent utility | Good |
| Rename to @chude/memory | Package: @chude/memory, binary: memory, matches aidev subcommand; memory-nexus deprecated | Pending |
| TypeScript for CLI migration | TS over Go/Rust: existing ecosystem, Bun runtime already required, maintainable by user, highest proficiency | Good |
| Option E hybrid integration | memory-nexus as npm dep in aidev TS CLI, not full source merge; discover integration surface before committing to merge | Pending |
| Transformers.js v3 over v4 | v3 is stable, v4 is preview-only; migrate to v4 when stable for 4x embedding speedup | Pending |
| sqlite-vec brute-force over ANN | Under 200K messages, brute-force is <75ms; ANN unnecessary at current scale | Pending |
| RRF over linear combination | BM25 and cosine scores are incompatible scales; RRF works with ranks, avoids normalization | Pending |
| all-MiniLM-L6-v2 default model | 23MB quantized, fastest inference, 384d; hybrid search compensates for moderate quality | Pending |

## Resolved Questions

All open questions from pre-implementation were resolved:

1. **Session encoding** -- Claude Code encodes as C--Users-Destiny-Projects-wow-system (forward slashes and colons replaced with hyphens)
2. **Session boundaries** -- Each JSONL file is one session; no need for boundary detection within files
3. **Incremental sync** -- mtime + fileSize comparison with per-session transaction boundaries for atomicity
4. **Subagent sessions** -- Stored in `<session-uuid>/subagents/` directories; discoverable via glob

## Constraints

- **Local-first** -- No mandatory network access. Optional API embedding providers require user-configured API keys
- **TypeScript** -- Matches aidev ecosystem
- **bun** -- Package manager per WoW standards
- **95%+ coverage at EACH metric** -- Statements, branches, functions, lines individually via the Istanbul-backed Bun coverage harness
- **Hexagonal architecture** -- Domain-Application-Infrastructure-Presentation layers
- **TDD** -- Tests before implementation

## Related Projects

| Project | Relationship |
|---------|--------------|
| ai-dev-environment | Integration target (aidev memory subcommand) |
| wow-system | Where this idea originated |
| get-stuff-done | Development methodology |
| OpenClaw | Research reference for v2 semantic search patterns |

## Quality Standards

Per WoW (Ways of Working):
- TDD: RED-GREEN-REFACTOR
- Coverage: 95%+ at EACH metric (statements, branches, functions, lines)
- Architecture: Hexagonal
- SOLID principles
- Git author: Chude <chude@emeke.org>
- No emojis in commits/docs
- No AI attribution

---

*Last updated: 2026-02-18 after v2.0 milestone questioning*
