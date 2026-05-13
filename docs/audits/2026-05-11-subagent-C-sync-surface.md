# Subagent C — Sync / Ingestion Subsystem (Stage 1a)

**Scope:** `memory sync`, `backfill`, `purge`, `export`, `import`. No standalone `memory extract` command exists (verified by `ls src/presentation/cli/commands/`); extraction is a phase inside `sync`.

## 1. Subsystem inventory

| Command | Presentation | Application service |
|---|---|---|
| `memory sync` | `src/presentation/cli/commands/sync/index.ts:25-42` (7 subfiles: `ambient.ts`, `background.ts`, `embedding-pass.ts`, `helpers.ts`, `memory-files.ts`, `index.ts`, `types.ts`) | `src/application/services/sync-service.ts:108` (`SyncService`) |
| `memory backfill` | `src/presentation/cli/commands/backfill.ts:1` | `src/application/services/backfill-service.ts:71` (`BackfillService`) |
| `memory purge` | `src/presentation/cli/commands/purge.ts:1` | direct repository (no service) |
| `memory export` | `src/presentation/cli/commands/export.ts:1` | `src/application/services/export-service.ts:1` |
| `memory import` | `src/presentation/cli/commands/import.ts:1` | `export-service.ts` (`importFromJson`) |
| Hook | `src/infrastructure/hooks/sync-hook-script.ts:32-34` — Claude Code `SessionEnd`/`PreCompact` → `spawnBackgroundSync` |

Source: `src/infrastructure/sources/session-source.ts:43-50` (`FileSystemSessionSource` scans `~/.claude/projects/<encoded>/*.jsonl`, including subagent subtree). Parser: `JsonlEventParser`.

## 2. Data flow

`sync/index.ts:82-119`: `FileSystemSessionSource.discoverSessions()` → `JsonlEventParser.parse(path)` → `SyncService.extractSession()` (`sync-service.ts:422-492`) → per-session transaction writes `Session` + `Message[]` + `ToolUse[]` + `ExtractionState` to SQLite. **After session extraction**, `runMemoryFileSync` (`memory-files.ts:24-49`) indexes `~/.memory/*.md` files. **Then** `runAmbientContextGeneration` writes back to `~/.memory/MEMORY.md` and `context.md` (`auto-memory-writer.ts:31-50`, marker-merge). Optional `--embed` pass runs vector indexing (`embedding-pass.ts`).

A separate `LlmExtractor` (`llm-extractor.ts:1-44`) extracts typed `Entity` objects (topics, terms, decisions, summary) — but it is NOT wired into the `sync` path. `grep extractSession` returns only the message/tool-use extractor at `sync-service.ts:422`. `[inference: 2-hop]` LlmExtractor appears orphaned in the sync flow.

## 3. Lifecycle coherence

**Accreted, not designed.** Five commands operate on three different data domains with three different lifecycles:

- `sync` ingests **sessions → messages/tool_uses** (incremental, mtime/size diff via `ExtractionState`).
- `backfill` generates **daily-log markdown summaries** via `claude -p` for sessions already in DB (`backfill-service.ts:14-78`) — separate state table (`BackfillState`), separate output (`~/.memory/daily/*.md`).
- `purge` deletes **whole sessions** by age (`purge.ts:38-46`); no awareness of backfill state, embeddings, or extraction state.
- `export`/`import` round-trip **the entire DB** as JSON (`export-service.test.ts:359-516` confirms round-trip preserves sessions, entities, links, extraction states). No support for partial export, no event-stream semantics.

Three lifecycles share a DB but do not compose: `purge` can orphan a `BackfillState` row; `backfill` re-runs are gated by `BackfillState` (idempotent) but `sync` does not know about backfill output; `export` snapshot does not include `~/.memory/` markdown sidecar.

## 4. Truth-by-truth

- **T1 (typed kinds):** PARTIAL. `messages`, `tool_uses`, `entities` exist as schemas (`repositories/` dir). But sync ingests only message/tool_use level — typed extraction (decisions, terms via `LlmExtractor`) is implemented but unwired. `[inference]` no production caller invokes it during `sync`.
- **T2 (context-driven recall):** sync emits an ambient-context block to `MEMORY.md` after each run (`memory-files.ts` + `ambient.ts`), satisfying the **write side** of T2.
- **T3 (project scope):** PRESERVED. `project_path_encoded` + `project_name` per session (`session-source.ts:43`, `SessionExport` shape `export-service.ts:18-27`).
- **T4 (supersedence):** ABSENT. No supersedence event type. `purge` is bulk delete by age; not invalidation.
- **T5 (agent integration):** YES. `sync-hook-script.ts` wires SessionEnd/PreCompact; `memory install` registers it.
- **T6 (scale):** Incremental via mtime/size + checkpoint recovery (`sync-service.ts:149-243`). Indexing via FTS5 + SQLite. Plausibly OK to 100k.
- **T7 (self-evident recovery):** WEAK. SQLite DB is canonical; `.jsonl` source files are Claude Code's, not ours, and expire at 30d. `export` produces JSON, not plain-text-readable markdown. `~/.memory/*.md` sidecar IS plain text but is a projection of DB, not canonical.
- **T8 (reconciliation):** Per-session, via `ExtractionState` mtime/size diff (`sync-service.ts:422-432`). No cross-session content dedup (same decision said twice in two sessions = two rows).

**C1** low-friction: YES (hook auto-fires). **C2** local-first: YES. **C3** not-another-surface: FAILS — sync produces 5 storage layers (sessions DB, entities DB, memory-files DB index, daily logs MD, ambient context MD).

## 5. Storage model

**Canonical: SQLite DB.** `~/.claude/projects/*.jsonl` is upstream (Claude Code-owned, transient). `~/.memory/*.md` is projection output (T2 write side). This **diverges from the friction primacy decision's "DB canonical + JSONL transient ingestion channel"** only in that JSONL here is not project-controlled — Claude Code owns it and deletes at 30d. There is no append-only project-owned event log (Stage 0 §16.0.5 provisional structure's canonical layer).

## 6. Doc/code/roadmap drift

- `docs/04-ARCHITECTURE.md:458-479` and `docs/01-VISION.md:157` reference `aidev memory sync` — binary is `memory` per `CLAUDE.md:9`. The `aidev` integration is unimplemented; docs predate the renaming.
- `CLAUDE.md:127` lists `memory sync/search/context/related/list/show/install/uninstall/doctor/status` — omits `backfill`, `purge`, `export`, `import`, `browse`, `stats`, `friction`. Doc lags code.
- `LlmExtractor` (`llm-extractor.ts:1`) "Designed to run during SessionStop hook" — not wired. Code lags design.

## 7. Would I build this differently?

**Yes [context-dependent, medium-confidence].** From scratch, the canonical layer would be a project-owned append-only event log (Stage 0 truth-derived) with `decision`/`learning`/`supersedence` event types from day 1. Current sync extracts only message/tool_use granularity and leaves typed extraction unwired (`LlmExtractor` orphan). The DB-canonical + JSONL-as-upstream model accidentally inherits Claude Code's 30-day retention as the project's effective recovery horizon — T7 is weaker than the user likely assumes [local-confidence-high — verifiable via `ls ~/.claude/projects` retention].

The five-command surface (sync/backfill/purge/export/import) plus three projection sidecars (entities, memory-files, ambient MD) IS the fragmentation the user worry names. Five surfaces for one ingestion lifecycle.

---

**Path:** `docs/audits/2026-05-11-subagent-C-sync-surface.md`

**50-word load-bearing finding:** Sync ingests at message/tool_use granularity; the typed `LlmExtractor` (decisions, terms) exists but is unwired into the sync path. Five ingestion-adjacent commands write three storage shapes with non-composing lifecycles. No supersedence (T4), weak no-tool recovery (T7), DB-canonical reliance on Claude Code's 30-day JSONL retention.
