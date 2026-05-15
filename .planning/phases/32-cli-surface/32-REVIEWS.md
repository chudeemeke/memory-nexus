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
status: revised
revision_3:
  date: 2026-05-14
  plans_revised:
    - 32-01-PLAN.md
    - 32-02-PLAN.md
    - 32-03-PLAN.md
  validation_updated: true
  findings_addressed:
    high:
      - id: HIGH-1
        title: "Plan 32-01 envelope.ts runtime constants"
        resolution: "QUERY_COMMAND_NAMES and QUERY_RESULT_KINDS exported as `as const` tuples; types derived. `file` added to QUERY_RESULT_KINDS for HIGH-4."
        plan: 32-01-PLAN.md
        section: "<interfaces> + Task 1 behavior + Task 2 action step A"
      - id: HIGH-2
        title: "All early-return paths route through envelope helpers"
        resolution: "Shared `emitJsonEnvelope` and `emitJsonErrorEnvelope` helpers added to envelope.ts (Plan 01). Plan 02 Tasks 4 and 5 mandate a pre-step audit enumerating every `return { exitCode }` site; every site routes through the appropriate helper. Per-command tests assert envelope on success, empty, validation, not-found, and catch paths (Task 2 behavior items A-E)."
        plan: 32-01-PLAN.md (helpers) + 32-02-PLAN.md (wiring)
      - id: HIGH-3
        title: "Test isolation seams for list and stats"
        resolution: "New Task 1 in Plan 02 normalizes `executeListCommand` and `executeStatsCommand` to accept `deps?: { dbPath?: string }` (parity with show/context/related/search). New `list.deps.test.ts` and `stats.deps.test.ts` verify the seam. NO mock.module() on first-party permitted."
        plan: 32-02-PLAN.md (Task 1)
      - id: HIGH-4
        title: "search --files --json envelope coverage"
        resolution: "Wrapped in envelope with `kind: 'file'` (added to QUERY_RESULT_KINDS in Plan 01). Plan 02 Task 4 action step 7 wires the --files branch. `search.json.test.ts` has a `describe('--files --json')` block (Task 2 behavior item I)."
        plan: 32-01-PLAN.md (kind tuple) + 32-02-PLAN.md (Task 2 tests, Task 4 wiring)
      - id: HIGH-5
        title: "--json --format ai routing precedence (context.ts)"
        resolution: "`useSmartContext()` in context.ts updated to bypass `--format ai` routing when `--json` is set. Precedence rule documented in code comment block. Every `.json.test.ts` has a `describe('--json --format ai routing')` block asserting `parsed_default` deep-equals `parsed_with_ai_format` (not just JSON.parse success). Plan 02 Task 4 action step 8."
        plan: 32-02-PLAN.md (Task 2 tests, Task 4 wiring)
    medium:
      - id: MEDIUM-1
        title: "Extract DTO helpers from JsonOutputFormatter"
        resolution: "New `dto-helpers.ts` module with 7 DTO functions extracted from existing JsonOutputFormatter behavior. `JsonOutputFormatter.formatResults` delegates to `toSearchResultDto`. CONTEXT_BUDGET truncation loop preserved in formatter (boundary documented in code). Highlights computed BEFORE `<mark>` strip (Gemini LOW invariant tested in `dto-helpers.test.ts`)."
        plan: 32-02-PLAN.md (Task 3)
      - id: MEDIUM-2
        title: "--format default deprecation parity"
        resolution: "`--format default` retained on search/list/show/stats as deprecated alias (parity with --format detailed on context/related). One-shot stderr warning; suppressed in --json mode. CHANGELOG documents removal in next minor."
        plan: 32-03-PLAN.md (Task 3 wiring; CHANGELOG entry)
      - id: MEDIUM-3
        title: "Windows shell safety in <verify> blocks"
        resolution: "All `<verify>` blocks now use `bun test <paths>` (cross-platform; works in PowerShell/cmd/bash). Replaced `grep | head` chains with `bun --print` snippets. Windows-specific gate (subdirectory bun test) documented in VALIDATION.md and each PLAN's <verification> section. Per-task verify uses `bun test src/presentation/cli` to avoid the bun-test full-suite integer-overflow crash documented in inbox 2026-05-11."
        plan: All three PLANs + 32-VALIDATION.md
      - id: MEDIUM-4
        title: "Tighten scope semantics for Phase 32.5"
        resolution: "`EnvelopeScope` is now a discriminated union: `{ type: 'global' } | { type: 'project'; project: string }` — not a freeform string. Maps 1:1 to Phase 32.5's `--scope global|project [--project <name>]`. Tested in envelope.test.ts (scope variant assertions)."
        plan: 32-01-PLAN.md (<interfaces> + Task 1/2)
    low:
      - id: LOW-1
        title: "CHANGELOG.md existence"
        resolution: "Plan 32-03 Task 3 has a pre-step that verifies CHANGELOG.md exists and creates it with canonical structure (Keep a Changelog 1.1.0 + SemVer) if absent. Establishes project release-note convention."
        plan: 32-03-PLAN.md (Task 3 pre-step)
      - id: LOW-2-gemini
        title: "stats --format brief verbosity for AI mode (Gemini)"
        resolution: "DEFERRED. Current spec is ≤5 lines (W5) for stats brief — sufficient for AI consumers without adding complexity. Future tightening to single-line for `--format ai` specifically is post-Phase-32 polish."
        plan: 32-03-PLAN.md (Open Questions)
      - id: LOW-3-gemini
        title: ".optionsGroup() for output flags (Gemini)"
        resolution: "Noted as optional polish in Plan 32-03 Task 3 action. Execute if context budget permits; otherwise defer to post-Phase-32 polish."
        plan: 32-03-PLAN.md (Task 3 action note)
      - id: LOW-4-gemini
        title: "Envelope schema-version bump policy documentation"
        resolution: "Comprehensive JSDoc block added to envelope.ts top-of-file (Plan 32-01 Task 2 action step A) documenting bump policy: rename/type-change/removal/semantics-change bumps; additive changes (new kinds, new scope variants) do not."
        plan: 32-01-PLAN.md (Task 2)
  task_count_change:
    plan_01: "2 → 2 (no change; expanded scope within tasks)"
    plan_02: "3 → 5 (added Task 1 seam-normalization + Task 3 DTO extraction)"
    plan_03: "3 → 3 (no change; Task 3 expanded scope)"
    total: "8 → 10"
  files_modified_change:
    plan_01: "5 → 5 (no change)"
    plan_02: "12 → 16 (added dto-helpers.ts + dto-helpers.test.ts + list.deps.test.ts + stats.deps.test.ts)"
    plan_03: "13 → 17 (no change in revision 3; was already at 17 in revision 2)"
  validation_md_updated: "yes — test-file list expanded to include dto-helpers.test.ts, list.deps.test.ts, stats.deps.test.ts; Windows-safe gate documented; cross-platform verify discipline stated"
---

# Phase 32 — Cross-AI Reviews

> External adversarial review of Phase 32 plans BEFORE `/gsd-execute-phase 32`.
> Two reviewers — Codex (gpt-5.5 high) and Gemini Flash — produced independent findings.
> Codex flagged 5 HIGH severity issues missed by the internal sonnet checker.
> **Plans were revised via `/gsd-plan-phase 32 --reviews` (revision 3); all HIGH + MEDIUM findings addressed.**

---

## Revision 3 Response Summary (2026-05-14)

### HIGH (all 5 resolved)

| Finding | Resolution | Where |
|---|---|---|
| HIGH-1: envelope.ts runtime constants | `QUERY_COMMAND_NAMES` + `QUERY_RESULT_KINDS` as-const tuples; types derived. `"file"` added to kinds for HIGH-4. | 32-01-PLAN `<interfaces>` + Task 1/2 |
| HIGH-2: All exit paths through envelope helpers | New `emitJsonEnvelope` / `emitJsonErrorEnvelope` helpers in envelope.ts (Plan 01). Plan 02 Tasks 4+5 audit every exit point. Per-command tests cover success/empty/validation/not-found/catch. | 32-01 (helpers) + 32-02 (wiring + tests) |
| HIGH-3: Test seams for list + stats | New Plan 02 Task 1 adds `deps?: { dbPath? }` to both; `list.deps.test.ts` + `stats.deps.test.ts` verify; first-party `mock.module()` forbidden. | 32-02-PLAN Task 1 |
| HIGH-4: `search --files --json` envelope | Wrapped with `kind: "file"`; `search.json.test.ts` has dedicated test block whether qmd is installed or not. | 32-01 (kind) + 32-02 (wiring) |
| HIGH-5: `--json --format ai` routing | `useSmartContext()` bypasses `--format ai` routing when `--json` set; precedence rule in code comment; every `.json.test.ts` deep-equals payloads. | 32-02-PLAN Task 4 (wiring) + Task 2 (tests) |

### MEDIUM (all 4 resolved)

| Finding | Resolution | Where |
|---|---|---|
| MEDIUM-1: DTO extraction | New `dto-helpers.ts` module; JsonOutputFormatter delegates; CONTEXT_BUDGET preserved; highlights-before-strip invariant. | 32-02-PLAN Task 3 |
| MEDIUM-2: `--format default` deprecation parity | Retained as deprecated alias on search/list/show/stats (one-minor cadence, parity with `detailed`). | 32-03-PLAN Task 3 |
| MEDIUM-3: Windows shell safety | All `<verify>` blocks use cross-platform `bun test`/`bun --print`. Subdirectory gate documented. | All PLANs + VALIDATION.md |
| MEDIUM-4: `scope` discriminated shape | `EnvelopeScope = { type: "global" } | { type: "project"; project: string }`. | 32-01-PLAN `<interfaces>` |

### LOW (3 addressed; 2 deferred)

| Finding | Resolution | Where |
|---|---|---|
| LOW-1 Codex: CHANGELOG.md existence | Verified-or-created in Plan 32-03 Task 3 pre-step (canonical Keep a Changelog 1.1.0 + SemVer structure). | 32-03-PLAN Task 3 |
| LOW Gemini: schema-version bump policy doc | JSDoc block in envelope.ts. | 32-01-PLAN Task 2 |
| LOW Gemini: highlights before strip | Invariant tested in `dto-helpers.test.ts`. | 32-02-PLAN Task 2/3 |
| LOW Gemini: stats brief single-line for `--format ai` | DEFERRED — post-Phase-32 polish (current ≤5 lines suffices). | 32-03-PLAN Open Questions |
| LOW Gemini: `.optionsGroup()` for output flags | OPTIONAL — Plan 32-03 Task 3 includes if context budget permits; else defer. | 32-03-PLAN Task 3 |

### Structural changes

- Task count: 8 → 10 (Plan 02 gained Task 1 seam-normalization and Task 3 DTO extraction)
- Files modified: 30 → 38 across all 3 plans (4 new test files + 1 new dto-helpers module + 1 new test for dto-helpers + 2 new deps test files)
- VALIDATION.md: test-file list expanded; Windows-safe gate documented; cross-platform verify discipline stated; revision_3 entry added to frontmatter
- REVIEWS.md frontmatter: `status: needs_revision` → `status: revised`; `revision_3:` block added with full audit trail

### Architecture preserved

Per the reviews mode brief: the architecture is sound; no redesign. All findings were tactical fixes (additional helpers, additional tests, additional code comments, additional seams). The 3-plan / 3-wave structure, hexagonal layering, TDD ordering, 95% coverage requirement, atomic commits, threat models, Phase 32.5 forward-compat all preserved.

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

**Net verdict:** External review caught 5 HIGH findings the internal review missed. This is exactly why cross-AI review is gated before execution. **Revision 3 addresses all 9 HIGH+MEDIUM findings and 3 of 5 LOW findings.**

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

**Status: REVISED (revision 3 complete).** All 5 HIGH findings + 4 MEDIUM findings + 3 LOW findings addressed. 2 LOW findings deferred (Gemini stats brief AI-mode single-line; `.optionsGroup()` optional polish).

Suggested next step: `/gsd-review --phase 32` for convergence pass, then `/gsd-execute-phase 32`.

Minimum revision scope (HIGH-only) — COMPLETED:
1. **Plan 01:** ✅ Added runtime constants `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` (as-const tuples) and derived types from them. Tightened `scope` to discriminated shape. Added shared emission helpers.
2. **Plan 02:** ✅ Added pre-task "Normalize test seams" (deps?: for list/stats). Added shared `emitJsonEnvelope` / `emitJsonErrorEnvelope` helpers and routed ALL early-return error paths through them. Added `search --files --json` envelope coverage (kind: "file"). Added test for `--json --format ai` ROUTING equivalence in each `.json.test.ts`.
3. **Plan 03:** ✅ Kept `--format default` deprecation alias parity with `detailed` (one-minor cadence). Verify-or-create CHANGELOG.md.

Optional revision scope (MEDIUM/LOW) — COMPLETED:
- Plan 02: ✅ Extracted DTO helpers from existing JSON formatter (preserves CONTEXT_BUDGET + highlights + raw_score behavior); documented highlight-offsets-before-strip invariant
- Plan 03: ✅ PowerShell-safe `<verify>` blocks; encoded Windows `bun test` subdirectory workaround
- Plan 03: ✅ Verified/created CHANGELOG.md task; documented envelope schema_version bump policy in `envelope.ts` JSDoc
- Plan 01: Deferred — `.optionsGroup("Output Options:")` for `--json/--format/--verbose/--quiet`; optional in Plan 03

After revision (this file at status: revised), suggested next step: `/gsd-review --phase 32` for second-pass convergence before `/gsd-execute-phase 32`.
</content>
