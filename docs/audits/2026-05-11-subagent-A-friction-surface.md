# Subagent A — Friction subsystem evaluation against Stage 0 truths

**Date:** 2026-05-13
**Lens:** Stage 0 provisional truths T1-T8 + C1-C3 (per §16.0 of audit doc).
**Verification discipline:** every path/file claim verified via `ls` / `Read` / `Grep`. Inferences labeled `[inference]`.

---

## 1. Subsystem inventory

Six subcommands under `memory friction`, all defined in `src/presentation/cli/commands/friction/index.ts:28-106`:

| Command | Handler | File |
|---|---|---|
| `log` | `handleLog` | `friction/log.ts` |
| `list` | `handleList` | `friction/list.ts` |
| `resolve` | `handleResolve` | `friction/resolve.ts` |
| `wont-fix` | `handleWontFix` | `friction/wontfix.ts` |
| `dashboard` | `handleDashboard` | `friction/dashboard.ts` |
| `purge` | `handlePurge` | `friction/purge.ts` |

Layer breakdown:

- Domain: `FrictionEntry` immutable entity, 196 LoC (`src/domain/entities/friction-entry.ts`).
- Application: `FrictionService`, 290 LoC (`src/application/services/friction-service.ts`).
- Infrastructure: `SqliteFrictionRepository`, 354 LoC (`src/infrastructure/database/repositories/friction-repository.ts`).
- Schema: `friction_log` table with 13 columns (`schema.ts:291-310`); migration `FRICTION_LOG_UNIVERSALIZE_MIGRATION` at `schema.ts:319-344`.

## 2. Help-text vs behavior verification

Ran each `--help` (output captured 2026-05-13):

- `friction --help` reports 6 commands; CLI registers exactly 6 (`index.ts:28-106`) — matches.
- `friction log --help` reports 6 flags; matches handler definition (`index.ts:29-42`).
- `friction list --help` reports 6 flags including `--tool` and `--limit`; matches `index.ts:44-57`.
- `friction dashboard --help` reports `--html` and `--tool`; matches `index.ts:83-93`.

**Vestigial / undocumented surface:**

- `tags` column exists in schema (`schema.ts:297`), entity (`friction-entry.ts:71,86,164-166`), repository (serialized JSON, `friction-repository.ts:58`) — **but no CLI flag exposes tags on log or list** (`grep -n "tags" src/presentation/cli/commands/friction/*.ts` returns no matches). Dead schema field for CLI users.
- `last_reviewed_at` column exists (`schema.ts:304`); `markReviewed` is called as a side-effect of `friction list --tool <name>` (`list.ts:95-97`). Undocumented in help text; not invokable directly.
- `detectPatterns` exists on service (`friction-service.ts:268`); only exposed via `dashboard.ts` rendering; no `friction patterns` CLI verb.

## 3. Truth-by-truth evaluation

| # | Truth | Friction subsystem position | Evidence |
|---|---|---|---|
| T1 | Distinguish memory kinds | **Helps partially.** Friction IS one typed kind, with its own table and entity. But it is the ONLY typed kind — decisions / learnings / preferences / observations have no analogous entity (`ls src/domain/entities/` shows `entity`, `link`, `memory-file`, `message`, `session`, `tool-use`, plus `friction-entry` — no `decision`, `learning`, `preference`). Friction satisfies T1 for itself; the broader system does not. |
| T2 | Context-driven recall | **Ignores.** No embedding/vector path on friction (`grep -c "embedding\|vector"` returns 0 for service + repo). All retrieval is keyword/filter via SQL `WHERE` (`friction-repository.ts:103-140`). |
| T3 | Project scope + cross-project rollup | **Helps.** `source_project` column (`schema.ts:300`); `findAll({ sourceProject })` filter (`friction-repository.ts:125-128`); aggregations group by tool not project (`friction-repository.ts:204-211`). Cross-project rollup is feasible at SQL layer but CLI exposes no `--source-project` filter on `list` (only `--tool`) — partial gap. |
| T4 | Lifecycle semantics | **Works against.** Status transitions are flat: open → resolved or open → wont-fix (`friction-entry.ts:42-46`). No supersedence (`grep -rn "supersed" src/domain/entities/friction-entry.ts src/application/services/friction-service.ts src/infrastructure/database/schema.ts` returns 0). `purge` is permanent SQL DELETE (`friction-repository.ts:330-335`) — erasure, not invalidation. Re-occurring friction creates a new row; no merge with prior. |
| T5 | Agent integration | **Helps partially.** `smart-context-service.ts:23,96,221-223,301-318` composes friction into ambient context output. `ambient-context-service.ts:130,138` surfaces open-friction count. Auto-ingest of `~/.claude/friction.jsonl` runs on every `memory friction *` invocation (`friction/index.ts:124-128`). But no SessionStart hook auto-surfaces friction; integration is pull-shape, not ambient-push. |
| T6 | Scale 10k-100k+ | **Helps.** Four indexes on status/severity/category/tool (`schema.ts:306-309`). SQL aggregations are O(scan) but indexed. `[inference]` should remain sub-second to ~100k. |
| T7 | Self-evident recovery | **Works against.** Canonical store is SQLite (per `docs/inbox/archived/2026-05-08-conversations-friction-primacy-decision.md`); JSONL is transient ingestion only and auto-deleted (`friction-service.ts:251-257`). If the tool dies, friction is locked behind SQLite. No periodic export to plain text. |
| T8 | Reconciliation across concurrent sessions | **Works against.** `log()` always INSERTs (`friction-repository.ts:49-67`); no dedup-by-description, no merge-by-tool-category. Two sessions logging "memory sync slow" create two rows. Patterns are detected post-hoc by grouping (`findPatterns`, `friction-repository.ts:300-328`) — discovery, not reconciliation. |
| C1 | Low-friction capture | **Helps.** Single command `memory friction log "<desc>"` with sane defaults (`friction-service.ts:72-85`). JSONL fallback ingestion path closes the gap when CLI unavailable. |
| C2 | Local-first | **Helps.** SQLite file at `~/.local/share/memory/memory.db` (per CLAUDE.md); no network calls. |
| C3 | NOT another fragmented surface | **Works against (load-bearing).** See §5. |

## 4. Coherence assessment

The subsystem is **internally coherent** (DDD layering — domain entity, port, service, repo, CLI handlers — is clean; Phase 30 god-file split is visible in the per-verb `friction/*.ts` co-located tests). But it is **architecturally orphan**:

- `friction` is unmentioned in `docs/01-VISION.md`, `docs/04-ARCHITECTURE.md`, `docs/05-IMPLEMENTATION.md` (`grep -l "friction" docs/0*.md` returns nothing). The architecture narrative ignores it.
- Schema vestigial: `tags` column unused by CLI; `last_reviewed_at` only mutated as list-side-effect; `detectPatterns` not surfaced as a verb.
- Status enum {open, resolved, wont-fix} is friction-specific; not aligned with a generic memory lifecycle model.

This is the fingerprint of accretion: the layering is clean because it was refactored cleanly (Phase 30), but the SUBSYSTEM SHAPE was never derived from a broader memory model — it was bolted on as a tool-self-improvement journal.

## 5. Surface-fragmentation answer to C3

**Friction is a separate journal, not one event type in a unified event stream.** Evidence:

- Dedicated `friction_log` table (`schema.ts:291`); no shared `events` / `memories` table that friction is a row in.
- Dedicated `IFrictionRepository` port; no shared `IMemoryRepository`.
- Schema has parallel tables `sessions`, `messages_meta`, `tool_uses`, `links`, `topics`, `entities`, `memory_files`, `friction_log` (`schema.ts` line numbers 14, 35, 85, 103, 121, 152, 240, 291) — eight parallel concerns, no unifying event stream.
- `friction-service.ts` shares no abstractions with `extraction-service` or `ambient-context-service` beyond DI plumbing.

This is exactly the shape Stage 0's provisional minimum structure rejects: parallel typed journals instead of an event log + projection. C3 fails by the user's own definition — the friction subsystem ADDS a memory surface; it does not consolidate one.

## 6. Would I build this differently?

**Yes — but the divergence is at the model level, not the friction-feature level.** [context-dependent, medium-confidence]

What's worth keeping: friction is one of the few WoW concepts that has a real materialized data path. The CLI surface is usable; capture is one tool call (C1 satisfied); the SQL layer scales (T6). The Phase 30 layering is clean.

What I would change: friction would not be its own table. It would be one `kind` field on a unified event-log row. Status, supersedence, dedup, semantic recall, and cross-kind rollup would all be derived projection concerns — solved once for ALL memory kinds, not re-solved per kind. The current shape forces every new memory kind (decisions, learnings, preferences) to duplicate this 644-LoC stack. That is exactly the "lots of similar but different solutions, none exact fit" worry from §0 — manifested here as: friction is the only kind that got built; the architectural absence of the other kinds is the load-bearing finding. [local-confidence high on absence; context-dependent on whether unified event log is the right replacement]

**Word count: ~600.**
