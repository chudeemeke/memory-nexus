# Architecture Evidence Map (Stage 1b)

**Audit:** memory-nexus first-principles architecture audit (kicked off 2026-05-11).
**Stage:** 1b — architecture-evidence pass per audit §6.5.
**Owner:** main session (rationale: A-D outputs converged on themes; single voice synthesizes across them).
**Output type:** EVIDENCE MAP. No verdict, no recommendation, no outcome-mapping. Stage 3 owns synthesis.
**Inputs:** Stage 1a outputs (subagents A-D), `src/`, `docs/01-VISION.md`, `docs/04-ARCHITECTURE.md`, `docs/05-IMPLEMENTATION.md`, `.planning/ROADMAP.md`, `src/infrastructure/database/schema.ts`.

> User worry (verbatim, load-bearing): "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."

Evidence standards per §8: file:line citations or "Not found" markers. Inferences labeled `[inference]`. Inference chains >2 hops flagged.

---

## 1. Storage model + source of truth

**Tables (18 in `src/infrastructure/database/schema.ts`):** `sessions`, `messages_meta`, `messages_fts` (FTS5), `tool_uses`, `links`, `topics`, `extraction_state`, `entities`, `session_entities`, `entity_links`, `embedding_state`, `message_embeddings` (vec0), `memory_files`, `memory_files_fts` (FTS5), `friction_log`, `friction_log_new` (schema migration artifact — verify), `backfill_state`, `sessions_fts` (FTS5).

**Sources of truth:**
- **Sessions / messages / tool_uses:** canonical = Claude Code's `~/.claude/projects/<encoded>/*.jsonl`. SQLite copy is a derived projection — `memory sync` re-builds from JSONL. [verified per Subagent C: 30-day retention upstream means re-extract has a window.]
- **memory_files:** canonical = `~/.memory/*.md` (filesystem). DB rows reference `file_path` per `memory-file-repository.ts:32`. [Subagent B]
- **friction_log:** canonical = SQLite DB. `~/.claude/friction.jsonl` is transient ingestion channel auto-deleted on next `memory friction *` invocation [per friction-primacy disposition 2026-05-11, archived in `docs/inbox/archived/`].
- **entities / session_entities / entity_links / topics:** canonical = SQLite DB (no plain-text counterpart). [inference, Subagent C convergent]
- **embeddings / embedding_state / extraction_state / backfill_state:** canonical = SQLite DB. Pure coordinator state.

**Finding:** the system has FIVE distinct canonicity stances depending on memory kind. No unified SoT rule. Three kinds round-trip through plain text (sessions via JSONL, memory_files via markdown, friction via inbox-style JSONL during ingestion); two are DB-locked (entities, friction-DB-post-ingest).

## 2. Memory taxonomy + lifecycle

**Domain entities (`src/domain/entities/`):** `backfill-state`, `entity`, `extraction-state`, `friction-entry`, `link`, `memory-file`, `message`, `session`, `tool-use`. Only `friction-entry` maps to a memory KIND in the Stage 0 sense — the others are infrastructure (sessions are Claude Code records; memory-file is a markdown shell; link is a relationship; backfill/extraction are coordinator state).

**Stage 0 truth T1 calls for decisions / learnings / preferences / friction / observations / episodes as typed kinds.** Of those 6, only `friction` is a first-class domain entity. The others currently flow through `messages` (untyped content) or `memory_files` (markdown sections of a document — section LABEL, not typed query target). [Subagent A, confirmed local high-confidence.]

**Lifecycle vocabulary in production code:** grep `supersede|invalidate|deprecate|tombstone` (case-insensitive) across `src/`: **zero matches** in production code (only one false positive in `fts-sanitizer.test.ts` — keyword coincidence). T4 absent at the data layer. [verified, local high-confidence.]

**Planned remedy (NOT yet shipped):** ROADMAP Phase 33 introduces "facts schema, extraction_log, temporal tracking" and Phase 34 introduces "ADD/UPDATE/DELETE/NOOP operations" — supersedence semantics. These are v4.0 work, paused pending this audit's recommendation.

## 3. Capture-to-retrieval data flow

**Write path:** Claude Code session → JSONL → `memory sync` → SQLite (`sessions` + `messages_meta` + `tool_uses`) + FTS5 indexes + embedding pipeline (Phase 15) → `message_embeddings` (vec0). Friction writes go directly via `executeFrictionCommand` → `SqliteFrictionRepository` → `friction_log` table. memory_files updated by Claude Code's auto-memory hook (`src/infrastructure/hooks/auto-memory-writer.ts`) writing markdown to `~/.memory/`, picked up by sync.

**Read paths (per Subagent B):**
- `memory search` → `HybridSearchService` → FTS5 + vec0 + score blend.
- `memory context` → `SqliteContextService` (or flag-gated `SmartContextService`) → exact-or-LIKE project match + SQL aggregation. **No vector recall.** [Subagent B local high-confidence.]
- `memory friction list` → `SqliteFrictionRepository.list` → SQL only.
- `memory related` → `SqliteLinkRepository.findRelatedWithHops` → graph hop.

**Latency claim T6:** indexes exist for sessions/messages/links (`schema.ts:26-114`). Sub-second at 100k entries is plausible but unbenchmarked here. [inference, Stage 2 may verify against adjacent systems.]

**Wiring gap (load-bearing):** `LlmExtractor` exists at `src/application/services/llm-extractor.ts:1-44` but is unwired from sync per Subagent C. Same pattern: typed extraction infrastructure exists, capture path doesn't use it. Phase 33-34 planned to wire this through.

## 4. Consolidation, supersedence, deletion, export guarantees

- **Supersedence:** absent at data layer. See §2. [verified.]
- **Consolidation:** absent. No "merge facts" code path. T8 reconciliation absent at recall per Subagent B (no dedup-at-query); sync-level dedup unclear. [inference, low confidence — needs Stage 2 cross-check.]
- **Deletion:** `memory purge` exists for sessions. Friction has `resolve` / `wontfix` as soft-state transitions. No hard delete with audit trail.
- **Export:** `memory export` writes a JSON snapshot. Round-trippability via `memory import` exists. [Subagent C surface, not deeply verified — would Phase 33's `extraction_log` round-trip too?]

## 5. AI-readability + no-tool recovery (T7)

**Cost of uninstall today:**
- Sessions: low cost — `~/.claude/projects/*.jsonl` until 30-day rotation. **But:** the DB's "canonical" status for queries is accidentally dependent on the upstream retention window. [Subagent C, sharp insight.]
- memory_files: zero cost — markdown survives uninstall.
- friction: HIGH cost — DB-locked. JSONL is transient and is consumed at next CLI invocation. Without the tool, the user has no friction-history. Per friction-primacy disposition: an `export-on-write` or `memory export friction` would close this. Currently neither exists.
- entities / topics / links: HIGH cost — DB-locked, no markdown counterpart.

T7 partial across the system. Friction is the worst case.

## 6. Cross-project + cross-machine boundary model

**Project scope (T3):** `--project` flag in CLI + `--cross-project` flag (`context.ts:95`). `crossProject` pulls global DECISIONS.md / LEARNINGS.md per `smart-context-service.ts:8-13`. Project IS a column, not a sharded boundary — flag-gated query, not first-class scope. [Subagent B.]

**Cross-machine model:** **none.** Searched for `remote|tailscale|s3|cloud|sync.*from|migrate.*from` — 75 file matches but inspection shows keyword coincidence (`removed`, etc.). No remote sync, no replication, no merge-on-conflict. Phase 36 (Portability) plans a "WSL migration command + doctor --portability" — implying current state is single-machine, single-DB, one-way migration only. [verified high-confidence.]

The user's stated worry was about fragmentation, not cross-machine specifically — but Stage 0 §16.0 didn't enumerate "single-machine constraint" as either truth or constraint. C2 (local-first) is satisfied; multi-device sync is silent in Stage 0. [inference: this may be a Stage 3 question about whether T-set is complete.]

## 7. Doc / code / roadmap drift

**Cumulative drift count in canonical docs (`docs/01-VISION.md`, `docs/04-ARCHITECTURE.md`, `docs/05-IMPLEMENTATION.md`):**
- `friction`: 0 matches across all 3 docs. [verified.] Phase 24 shipped. Doc never updated.
- `ambient`: 0 matches across all 3 docs. [verified.] Phase 29 shipped. Doc never updated.
- `smart.context|smartcontext`: 0 matches across all 3 docs. [verified.] SmartContextService landed during v3.0. Doc never updated.

The canonical docs describe **v1.0 vision**. v2.0, v3.0, and the v4.0 plan have not been folded back into the doc set. CLAUDE.md (project root) reflects current state better than the `01-05` doc set. [verified.]

**Roadmap-vs-code coherence:**
- Phase 30 (god-file cleanup) completed — confirmed by `src/presentation/cli/commands/friction/` subdirectory existing.
- Phase 31 (bug fixes) — open. v4.0 paused per `.planning/STATE.md` and this audit.
- Phases 33-35 (Knowledge Extraction Foundation / Extraction Pipeline / Context Intelligence) would close the gaps Stage 1a surfaced. They are the planned remedies for exactly the wiring gaps B and C identified. **The audit must weigh whether Phase 33-35 close the gaps in the right shape (outcome A) or whether the gaps are structural enough that a different architecture is required (outcomes C/E).**

**Schema migration artifact:** `friction_log_new` table coexists with `friction_log` in `schema.ts`. Mid-migration state. [verified existence; semantics unclear without deeper read.]

---

## Cross-dimensional pattern (consolidated, not verdict)

Across all 7 dimensions, one shape recurs:

> **Capability infrastructure exists; capture/retrieval surfaces don't use it.**

Concrete instances:
- `HybridSearchService` + `sqlite-vec` exist; `memory context` doesn't use them. (§3, Subagent B.)
- `LlmExtractor` exists; sync doesn't call it. (§3, Subagent C.)
- `AmbientContextService` exists; not in any vision/architecture doc. (§7.)
- `SmartContextService` exists; not in any vision/architecture doc. (§7.)
- Domain entities for friction exist; equivalents for decisions/learnings/preferences/observations do not. (§2, Subagent A.)
- Export round-trip exists for some kinds; friction-export does not.

This is the user-worry fingerprint at architecture-evidence level. **The right things ARE built; they are not coherently wired through to the surfaces the user actually touches.**

Stage 2 (adjacent-system research) will test whether Hermes / OpenClaw / Mem0 / MemPalace face the same wiring gap or have closed it. Stage 3 (synthesis) decides whether the gap is closeable inside v4.0 (Phase 33-35 plan) or whether closing it requires a different architectural shape.

**No verdict in this evidence map.** Stage 3 owns the classification.
