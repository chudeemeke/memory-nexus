# Subagent B — Search / Context Surface Audit

**Stage:** 1a · **Scope:** `search/context/related/list/show/browse` · **Lens:** Stage 0 T1–T8, C1–C3.

> User worry (verbatim): "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."

## 1. Inventory

| Cmd | Entry | Service wired |
|---|---|---|
| search | `search.ts:115` | `HybridSearchService` (775 LoC) |
| context | `context.ts:70` | `SqliteContextService` OR `SmartContextService` (flag-gated `context.ts:118`) |
| related | `related.ts:59` | `SqliteLinkRepository.findRelatedWithHops` |
| list | `list.ts:57` | `SqliteSessionRepository.findFiltered` |
| show | `show.ts:65` | session+message+toolUse repos |
| browse | `browse.ts:60` | dispatches to show/search/context/related (`browse.ts:119-144`), TTY-only (`browse.ts:85`) |

## 2. Composition vs fragmentation

`browse` is the only composition point, and it is TTY-gated — unavailable to non-interactive Claude sessions. The other five are parallel surfaces with independent option interfaces (`SearchCommandOptions`, `ContextCommandOptions`, etc.). No shared query value object. `search` has 16 flags; `list` duplicates 7 (`--limit/--project/--since/--before/--days/--json/--format`). [inference] Accretion, not unified design.

## 3. Semantic recall (T2) — does `context` use it?

**No.** Grep of `context-service.ts` AND `smart-context-service.ts` for `embedding|vector|cosine|similarity|HybridSearch` → zero matches. `SqliteContextService.getProjectContext` (`context-service.ts:110-220`) does exact-or-LIKE project lookup + SQL aggregation over sessions/messages/tool_uses/links. `SmartContextService` (`smart-context-service.ts:1-80`) composes MemoryFile rows + Friction rows + a legacy session-summary string. Both: project-name match + SQL, no vector recall. `HybridSearchService` is wired ONLY by `search` (`search.ts:219`). The command named "context" — whose intent is "what matters in this project" — has no semantic recall. The infrastructure exists; it isn't wired through.

## 4. Truth-by-truth

| Truth | Status | Evidence |
|---|---|---|
| T1 typed queries | partial | `search` queries messages (FTS+vector); `context` queries `memory_files` by `file_type`. No unified taxonomy across decisions/learnings/preferences/friction/observations as queryable types — only section labels. |
| T2 context-driven recall | **fails** in `context` | §3. Only `search` has semantic mode, requires explicit query. No ambient recall path. |
| T3 project + cross-project | partial | `--project` / `--cross-project` flags (`context.ts:95`); `crossProject` pulls global DECISIONS.md/LEARNINGS.md (`smart-context-service.ts:8-13`). Flag-gated, not first-class scope. |
| T4 supersedence | **absent** at recall | No "exclude superseded" filter anywhere. Raw sessions/messages returned. |
| T5 agent integration | weak | All recall is explicit CLI. No SessionStart hook auto-calls `memory context`. Hook infra (`hook-runner.ts`) is sync/extract only. |
| T6 scale 10k–100k | likely OK | `idx_sessions_project`, `idx_messages_*`, `idx_links_*` (`schema.ts:26-114`); FTS5 + sqlite-vec (`schema.ts:54, 217`). [inference] sub-second at 100k plausible, not benchmarked here. |
| T7 recovery | partial | `memory_files.file_path` points to source markdown (`memory-file-repository.ts:32`) — user can `cat` source without the tool. Lost on uninstall: links, topics, embeddings, FTS, session JSONL extraction. |
| T8 reconciliation | **absent** at recall | No dedup at query time. [inference] Boundary to sync-stage dedup unclear. |
| C2 local-first | OK | SQLite + filesystem. |
| C3 non-fragmentation | **fails** (§5) | |

## 5. Surface fragmentation (C3)

Inside this subsystem alone, C3 fails. Five parallel read surfaces for overlapping intent. The agent must pre-pick: keyword? project? graph hop? raw list? session detail? Only `browse` composes them, and only in a TTY. No unified query model. [inference] User-worry fingerprint inside the recall surface.

## 6. Recovery (T7)

Uninstall today: user keeps source markdown (SoT for `memory_files.content`); sessions live in `~/.claude/projects/` until Claude Code's 30-day rotation. Lost: link graph, topics, FTS, embeddings. Cost low for canonical, high for derived. `memory export` snapshots but requires the tool.

## 7. Would I build this differently?

**Local-confidence-high:** Unify behind ONE query primitive with shape flags (`--scope project|cross|all`, `--kind decision|learning|friction|session|message`, `--mode fts|vector|hybrid|ambient`); demote `list/show/related/context` to thin views. Current 5 parallel shells with overlapping flags is accretion.

**Context-dependent-medium:** Bigger gap is T2/T5 — `context`'s name promises ambient recall; it delivers SQL aggregation. [inference] Fresh build would default `context` to vector-driven ambient recall over the projection (Stage 0 §16.0.5), with SQL-aggregation as a `--format brief` legacy mode. Wiring-vs-rewrite cost is a Stage 3 question.

The infrastructure for the right shape exists (HybridSearchService, sqlite-vec, embedding repo, FTS5); it is not wired through `context`. Capability present, surface not using it — this mismatch matches the user's "right things, not quite done right" framing exactly.
