---
phase: 32
slug: cli-surface
reviewers:
  - id: codex
    model: gpt-5.5
    reasoning_effort: high
    verdict: MEDIUM-HIGH (do not execute as written; amendments required)
  - id: gemini
    model: gemini-3-flash-preview
    fallback_from: gemini-3-pro-preview (quota exhausted)
    verdict: LOW
reviewed_at: 2026-05-14
plans_reviewed:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
prior_internal_checker: gsd-plan-checker (sonnet) — PASS on revision 2
gap_caught_by_external: yes (5 HIGH findings missed by sonnet)
status: needs_revision
---

# Phase 32 — Cross-AI Reviews

> External adversarial review of Phase 32 plans BEFORE `/gsd-execute-phase 32`.
> Two reviewers — Codex (gpt-5.5 high) and Gemini Flash — produced independent findings.
> Codex flagged 5 HIGH severity issues missed by the internal sonnet checker.
> Plans must be revised via `/gsd-plan-phase 32 --reviews` before execution.

---

## Convergence Summary

| Finding category | Codex | Gemini | Internal checker |
|---|---|---|---|
| Architecture sound | ✓ | ✓ | ✓ |
| Phase 32.5 forward-compat | needs `scope` semantics | ✓ | ✓ |
| TDD ordering | ✓ | ✓ | ✓ |
| JSON envelope shape | needs runtime consts + DTO extraction | docs missing | ✓ |
| Error-path completeness | **MISSING — HIGH** | not flagged | not flagged |
| Test seams (deps?) | **MISSING — HIGH** | not flagged | not flagged |
| `search --files --json` | **OMITTED — HIGH** | not flagged | not flagged |
| `--json --format ai` routing | **WRONG MENTAL MODEL — HIGH** | not flagged | not flagged |
| Backward compat (`--format default`) | **BREAKS SCRIPTS — MEDIUM** | not flagged | not flagged |
| Windows shell safety | **bash in plans — MEDIUM** | not flagged | not flagged |

**Net verdict:** External review caught 5 HIGH findings the internal review missed. This is exactly why cross-AI review is gated before execution.

---

## Codex (gpt-5.5, reasoning_effort=high) — Risk: MEDIUM-HIGH

**Summary:** The plan-set is directionally good, but I would not execute it as written. It has a solid architecture target, but several implementation assumptions do not match the current repo. The biggest misses are non-catch error paths, missing DB seams for `list`/`stats`, `search --files` being outside the envelope work, and a Plan 32-01 TypeScript export instruction that will not compile. These are fix-before-execute issues, not polish.

### Strengths

- Phase is correctly scoped to presentation-layer CLI behavior
- Splitting CLI-01/CLI-02/CLI-03 into serial plans is the right dependency shape
- Commander v14 `.commandsGroup()` is the right approach
- Shared envelope is a useful foundation for Phase 32.5
- `--json` stdout cleanliness as load-bearing is correctly identified
- Test placement co-located under `src/presentation/cli/` matches the repo convention

### Concerns

**HIGH-1 — Plan 32-01: impossible runtime exports (won't compile).**
In `envelope.ts`, `QueryCommandName` and `QueryResultKind` are TypeScript union types. The plan says to "export them directly (not as type-only)" so downstream tests can use them as values. That cannot compile unless you also define runtime constants, e.g. `QUERY_COMMAND_NAMES` (`as const` tuple of literals) with type aliases derived from them. **Fix before execution.**

**HIGH-2 — Plan 32-02: early-return JSON errors leak bespoke shapes.**
Current code has early validation/not-found returns BEFORE the catch path:
- `src/presentation/cli/commands/search.ts:190`
- `src/presentation/cli/commands/list.ts:108`
- `src/presentation/cli/commands/show.ts:155`
- `src/presentation/cli/commands/related.ts:149`
- `src/presentation/cli/commands/stats.ts:104`

Plan 32-02 only wires envelope emission through the catch block. Executed as written, several `--json` failures (validation errors, not-found cases) will still emit bespoke JSON or plain text. **CLI-02 success criterion partially unmet.**

**HIGH-3 — Plan 32-02: test isolation seams conflict with current code.**
- `list.ts:149` calls `getDefaultDbPath()` directly — no `dbPath`/`deps` parameter
- `stats.ts:97` calls `getDefaultDbPath()` directly — same gap
- `show.ts` uses `deps.dbPath` (not `options.dbPath` as Plan 02 assumes)

Plan 32-02 test instructions will either hit the real user DB (per inbox issue 2026-05-11 programmatic-api real DB pollution) or require code edits not described. The fallback `mock.module()` strategy for first-party modules violates the repo's test-isolation gate (which sits at 0 violations and must stay there). **Pre-execution amendment needed: "Normalize test seams" task.**

**HIGH-4 — `search --files --json` is omitted.**
`executeSearchCommand` short-circuits to `executeFileSearch` BEFORE the DB path at `search.ts:199`. That branch emits a bare array on `--json` at `search.ts:420`. Since it's still the `search` query command, CLI-02 ("all query commands accept `--json` and produce valid JSON") is not fully satisfied unless this is wrapped in the envelope or explicitly declared out of scope.

**HIGH-5 — `--json --format ai` precedence is not output formatting.**
In `context.ts:118`, `format === "ai"` changes ROUTING (uses `SmartContextService`) BEFORE JSON mode is considered. The plan says `--json` wins silently, but tests must assert the service route and payload are the same as `--json` alone — not merely that `JSON.parse` succeeds. The current mental model in Plan 03 treats this as a post-process layer; in reality `ai` mode forks the service used.

**MEDIUM-1 — Envelope may bypass existing JSON DTO/truncation behavior.**
Search's current JSON formatter strips markup, adds highlights/raw scores, and applies `CONTEXT_BUDGET` (50K char limit) in some paths. Plan 32-02 says "preserve current shape" but tells executors to inline or invent conversions. **Extract DTO helpers from existing formatters** instead, or this will regress output shape and large-output behavior.

**MEDIUM-2 — `--format default` removal is a backward-compat break.**
Plan 03 preserves no-flag default but rejects explicit `--format default` for search/list/show/stats. That breaks any script currently passing `--format default`. If `detailed` gets a one-minor deprecation alias, `default` should probably get the same treatment (or v4.0's breaking-change policy must explicitly permit this).

**MEDIUM-3 — Validation commands not Windows-safe.**
- Plans use `grep`, `head`, `tail` and bash-style snippets in `<verify>` blocks. Environment shell is PowerShell (Bash via Git Bash works, but plans should be agnostic).
- Inbox surfaces: `bun test` (full suite) crashes on Windows with integer overflow. Plans still treat `bun test` as a normal ~30s gate. Either encode the subdirectory workaround or make the blocker explicit in `<verify>`.

**MEDIUM-4 — `scope` is under-specified for Phase 32.5.**
A freeform optional `scope?: string` does not clearly compose with future `--scope <project|global>` plus project filters. At least define semantics now: `scope: "global"` or `scope: "project:<name>"`, or `{ type: "global" | "project", project?: string }`. Otherwise Phase 32.5 inherits ambiguity.

**LOW-1 — CHANGELOG.md does not exist in this worktree.**
Plan 32-03 assumes it exists for the `--format detailed` deprecation note. Verify the project's release-note convention first; create or skip accordingly.

### Suggestions

1. **Pre-execution amendment task:** "Normalize test seams for query commands." Add `deps?: { dbPath?: string }` to `list` and `stats`, update test calls accordingly. Do not use first-party `mock.module()`.
2. **Runtime constants in envelope.ts:** `QUERY_COMMAND_NAMES`, `QUERY_RESULT_KINDS` (as-const tuples), type aliases derived from them.
3. **Shared emission helpers:** `emitJsonEnvelope()` / `emitJsonErrorEnvelope()` + per-command DTO helpers. Require every success, not-found, validation-error, and catch branch to go through them.
4. **Explicit tests for:** `search --files --json`, invalid limit/date/projects in JSON mode, not-found `show/context/related`, `--json --format ai` routing equivalence to `--json`.
5. **Keep `--format default`** as a deprecated alias for one minor (parity with `detailed`) unless v4.0 explicitly allows the break.
6. **Replace verification commands** with PowerShell-safe or `bun`-only scripts. Encode the Windows `bun test` subdirectory workaround (or make the blocker explicit).
7. **Tighten `scope` shape** to `{ type: "global" | "project", project?: string }` (or string discriminant) — Phase 32 should define semantics, not just reserve a freeform field.

### Risk Assessment

**MEDIUM-HIGH.** The architecture is sound, but execution risk is high because the plans miss real repo control-flow branches and test seams. If amended before `/gsd-execute-phase 32`, the phase should become low-to-medium risk. Executed exactly as written, it likely produces partial CLI-02 compliance and test-isolation churn.

---

## Gemini (gemini-3-flash-preview, fallback from gemini-3-pro-preview) — Risk: LOW

> Note: Gemini 3 Pro Preview quota was exhausted (429); fell back to Flash per canonical skill. Flash review is shorter and less code-specific than Pro typically returns.

**Summary:** Plan-set is highly executable and robust. Correctly identifies native Commander v14 features to avoid over-engineering, establishes a forward-compatible JSON contract, and maintains strict adherence to project quality standards.

### Strengths

- Forward compatibility: `QueryResultEnvelope` carrying `kind` + `scope` aligns with Phase 32.5
- Deterministic testing: Strategy A (malformed FTS queries / invalid date ranges) more robust than filesystem errors
- CLI best practices: errors-to-stdout in JSON mode matches `gh`/`kubectl`
- Snapshot stability: version-line strip prevents CI churn on version bumps
- Type safety: Step 0 `OutputMode` grep prevents presentation-layer leaks
- Test co-location matches existing project convention

### Concerns

**MEDIUM — JSON Truncation Efficiency (Plan 02/03):**
Current `JsonOutputFormatter` performs iterative `JSON.stringify` to fit the 50K `CONTEXT_BUDGET`. With envelope wrapping and potentially larger payloads in v4.0, this O(N²) approach (in string operations) could spike on large result sets. Ensure envelope wrapping doesn't trigger multiple stringification passes. *(Overlaps with Codex MEDIUM-1.)*

**LOW — Search JSON Highlighting (Plan 02):**
`highlights` field relies on `extractHighlights` from a snippet containing `<mark>` tags. The refactored `search.ts` logic must calculate highlight offsets BEFORE stripping the tags for the final `data.snippet` payload — otherwise highlighting offsets for downstream consumers break.

**LOW — Stats `brief` Consistency (Plan 03):**
Plan allows `stats` up to 5 lines for brief mode. For "AI-optimized" consumption (`--format ai`), every line counts. Consider whether `stats --format brief` should eventually be a single-line summary (e.g., `<S> sessions, <M> messages, <P> projects`).

### Suggestions

1. **Envelope schema versioning:** Document in `envelope.ts` what constitutes a "breaking change" (e.g., renaming `data` to `payload`), clarifying when to bump `"1"` → `"2"`.
2. **Breaking change documentation:** `search --json` moves results from top-level `results` to a `data` key — explicitly flag this as a breaking change in `CHANGELOG.md` (per Plan 03).
3. **Commander `.optionsGroup()`:** Use to organize repetitive output flags (`--json`, `--format`, `--verbose`, `--quiet`) into an "Output Options:" category — improves CLI discoverability beyond current group structure.

### Risk Assessment

**LOW.** Risks predominantly tied to volume of files in Plan 03 (17), but shallow per-file edits and comprehensive TDD mitigate. Architectural alignment with Phase 32.5 removes technical-debt risk.

---

## Cross-Reviewer Convergence

| Theme | Codex | Gemini |
|---|---|---|
| Envelope schema_version docs | suggested | suggested |
| CONTEXT_BUDGET / large-output handling | MEDIUM (extract DTOs) | MEDIUM (perf) |
| `search --json` breaking-change disclosure | implicit (DTOs) | explicit (CHANGELOG) |
| `.optionsGroup()` for output flags | not raised | suggested (LOW) |
| Stats brief verbosity | not raised | LOW |
| Phase 32.5 `scope` semantics | MEDIUM (tighten) | not raised |
| Search highlights offset | not raised | LOW |

Codex's HIGH findings are unique to Codex; Gemini did not catch them. This is the asymmetry cross-AI review exists to surface.

---

## Recommended Disposition

**Status: NEEDS_REVISION.** Do NOT proceed to `/gsd-execute-phase 32` without addressing at minimum the 5 HIGH severity findings + MEDIUM-4 (`scope` semantics for Phase 32.5).

Suggested next step: `/gsd-plan-phase 32 --reviews` to feed this REVIEWS.md back into the planner for a third revision pass.

Minimum revision scope (HIGH-only):
1. **Plan 01:** Add runtime constants `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` (as-const tuples) and derive types from them. Tighten `scope` to discriminated shape.
2. **Plan 02:** Add a pre-task "Normalize test seams" (deps?: for list/stats; show uses deps.dbPath). Add `emitJsonEnvelope` / `emitJsonErrorEnvelope` helpers and route ALL early-return error paths through them (not just catch). Add `search --files --json` envelope coverage or explicitly scope it OUT with rationale. Add test for `--json --format ai` ROUTING equivalence (not just JSON.parse success).
3. **Plan 03:** Decide on `--format default` deprecation alias parity with `detailed` (or document v4.0 breaking-change policy explicitly).

Optional revision scope (MEDIUM/LOW):
- Plan 02: Extract DTO helpers from existing JSON formatter (preserves CONTEXT_BUDGET + highlights + raw_score behavior); document highlight-offsets-before-strip invariant
- Plan 03: PowerShell-safe `<verify>` blocks; encode Windows `bun test` subdirectory workaround (per inbox 2026-05-11)
- Plan 03: Verify CHANGELOG.md exists OR create it; document envelope schema_version bump policy in `envelope.ts` JSDoc
- Plan 01: Consider `.optionsGroup("Output Options:")` for `--json/--format/--verbose/--quiet`

After revision, re-run `/gsd-review --phase 32` for convergence before execution.
