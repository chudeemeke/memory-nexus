---
phase: 32
slug: cli-surface
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-14
updated: 2026-05-14
approved: 2026-05-14
approver: gsd-plan-checker (revision 2 PASS); test-file list expanded in revision 3 per Codex HIGH-2/HIGH-3/HIGH-4/MEDIUM-1
revisions:
  - rev: 2
    date: 2026-05-14
    note: Approved by internal sonnet checker
  - rev: 3
    date: 2026-05-14
    note: Test list expanded for cross-AI review findings — added dto-helpers.test.ts, list.deps.test.ts, stats.deps.test.ts; expanded .json.test.ts coverage to include --files --json and --json --format ai routing equivalence
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 32-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (bundled with Bun 1.x) |
| **Config file** | bunfig.toml (coverage thresholds at 95% per metric) |
| **Quick run command** | `bun test src/presentation/cli` |
| **Full suite command** | `bun test src/presentation/cli` (Windows-safe subdirectory) — see Windows gate below |
| **Coverage command** | `bun test --coverage` |
| **Isolation gate** | `bun run test:isolation` (must remain at 0 violations) |
| **Type-check gate** | `bun --bun tsc --noEmit` (must exit 0) |
| **Estimated runtime** | ~5s (quick), ~30s (presentation tree full) |

**Windows gate (per Codex MEDIUM-3 + inbox 2026-05-11):** Bare `bun test` (full repo suite) crashes on Windows with integer overflow. ALWAYS use subdirectory invocations: `bun test src/presentation/cli` per task; for acceptance, split runs (`bun test src/`, etc.).

**Cross-platform discipline:** All `<verify>` blocks in PLAN files use `bun test <paths>` or `bun --print "..."` snippets that work in PowerShell, cmd.exe, Git Bash, Linux, and macOS. No `grep | head` pipe chains required by verification.

---

## Sampling Rate

- **After every task commit:** Run `bun test src/presentation/cli`
- **After every plan wave:** Run `bun test src/presentation/cli` + `bun run test:isolation` + `bun --bun tsc --noEmit`
- **Before `/gsd-verify-work`:** Presentation tree suite green; coverage ≥95% per metric on touched files; isolation gate at 0; type-check clean
- **Max feedback latency:** ~30 seconds (presentation tree full)

---

## Test Placement Convention

**All new `.test.ts` files in this phase are co-located with their source files under `src/presentation/cli/`** (resolves plan-check BLOCKER 1). The existing codebase has 14+ paired `<cmd>.ts` + `<cmd>.test.ts` siblings under `src/presentation/cli/commands/`. Phase 32 extends this pattern with multiple test variants per command:

- `<cmd>.test.ts` — existing per-command tests (extended with CLI-03 block in Plan 03)
- `<cmd>.json.test.ts` — new JSON envelope shape tests (Plan 02)
- `<cmd>.deps.test.ts` — new dependency-seam tests (Plan 02 Task 1, list + stats only)

Shared test helpers (e.g., `captureStreams`) go under `src/presentation/cli/commands/_helpers/` if extracted, or are inlined per file.

DTO helpers and their tests live under `src/presentation/cli/formatters/`.

Do NOT create a parallel `tests/` directory.

---

## Per-Task Verification Map

> Each automated test below maps to one or more Plan tasks.

| Test File | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|-----------|------|-------------|-----------|-------------------|-------------|--------|
| src/presentation/cli/help-groups.test.ts | 0 | CLI-01 | unit (Command introspection + snapshot, version-line stripped) | `bun test src/presentation/cli/help-groups.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/formatters/envelope.test.ts | 0 | CLI-02 | unit (envelope tuples + builders + emitters) | `bun test src/presentation/cli/formatters/envelope.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/formatters/dto-helpers.test.ts | 0 | CLI-02 | unit (DTO shape stability; highlights-before-strip invariant) | `bun test src/presentation/cli/formatters/dto-helpers.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/list.deps.test.ts | 0 | CLI-02 | unit (seam parameter — Codex HIGH-3) | `bun test src/presentation/cli/commands/list.deps.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/stats.deps.test.ts | 0 | CLI-02 | unit (seam parameter — Codex HIGH-3) | `bun test src/presentation/cli/commands/stats.deps.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/search.json.test.ts | 0 | CLI-02, CLI-03 | integration (all exit paths + `--files --json` + routing equivalence) | `bun test src/presentation/cli/commands/search.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/context.json.test.ts | 0 | CLI-02, CLI-03 | integration (all exit paths + `--json --format ai` routing equivalence) | `bun test src/presentation/cli/commands/context.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/show.json.test.ts | 0 | CLI-02, CLI-03 | integration (all exit paths) | `bun test src/presentation/cli/commands/show.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/list.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/list.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/related.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/related.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/stats.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/stats.json.test.ts` | ❌ W0 | ⬜ pending |
| Existing per-command `.test.ts` (extend) | 1 | CLI-03 | unit (Commander Option introspection for `--format brief\|ai`; deprecation aliases) | `bun test src/presentation/cli/commands` | ✅ existing | ⬜ pending |
| src/presentation/cli/formatters/output-formatter.test.ts | 1 | CLI-03 (brief mode) | unit | `bun test src/presentation/cli/formatters/output-formatter.test.ts` | ✅ existing (extend) | ⬜ pending |
| src/presentation/cli/formatters/ai-formatter.test.ts | 1 | CLI-03 (ai mode, ANSI stripping) | unit | `bun test src/presentation/cli/formatters/ai-formatter.test.ts` | ✅ existing (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 establishes test scaffolding BEFORE Wave 1 implementation (TDD RED phase per `rules/tdd-workflow.md`):

**Plan 32-01 deliverables (Wave 1, but tests authored before implementation per TDD):**
- [ ] `src/presentation/cli/formatters/envelope.ts` — `QueryResultEnvelope<T>` + `QueryErrorEnvelope` types + runtime tuples `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` (Codex HIGH-1) + discriminated `EnvelopeScope` (Codex MEDIUM-4) + shared emission helpers `emitJsonEnvelope` / `emitJsonErrorEnvelope` (Codex HIGH-2 foundation)
- [ ] `src/presentation/cli/formatters/envelope.test.ts` — tests for tuples, builders, emitters, scope variants
- [ ] `src/presentation/cli/help-groups.test.ts` — 4 group headings + placement + snapshot (version line stripped per W1 policy)

**Plan 32-02 deliverables (Wave 0 RED scaffolding):**
- [ ] `src/presentation/cli/commands/list.deps.test.ts` — seam parameter verification (HIGH-3)
- [ ] `src/presentation/cli/commands/stats.deps.test.ts` — seam parameter verification (HIGH-3)
- [ ] `src/presentation/cli/formatters/dto-helpers.test.ts` — DTO shape stability + highlights-before-strip invariant (MEDIUM-1, Gemini LOW)
- [ ] `src/presentation/cli/commands/search.json.test.ts` — envelope on all exit paths + `--files --json` envelope coverage (HIGH-4) + `--json --format ai` routing equivalence (HIGH-5)
- [ ] `src/presentation/cli/commands/context.json.test.ts` — envelope on all exit paths + `--json --format ai` routing equivalence (HIGH-5; canonical fork test)
- [ ] `src/presentation/cli/commands/show.json.test.ts` — envelope on all exit paths
- [ ] `src/presentation/cli/commands/list.json.test.ts` — envelope on all exit paths
- [ ] `src/presentation/cli/commands/related.json.test.ts` — envelope on all exit paths (incl. NOT_FOUND error envelope)
- [ ] `src/presentation/cli/commands/stats.json.test.ts` — envelope on all exit paths + brief = top-line summary (≤5 lines, W5)

bun:test is bundled with Bun — no framework install needed.

All Wave 0 test files are co-located with their source per the existing codebase convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual readability of `memory --help` output (line breaks, indentation, color in terminal) | CLI-01 | Snapshot covers structure; visual aesthetics need human eye | `bun run memory --help` and confirm groups are visually distinct |
| Brief mode "feels brief" (subjective) | CLI-03 | Brief is a UX promise as much as a technical contract | Run `memory search foo --format brief` and confirm output is scannable |
| AI mode usability when piped to Claude | CLI-03 | Ultimate consumer is a downstream LLM | `memory search foo --format ai \| pbcopy`, paste to Claude, confirm context loads cleanly |

---

## Edge Cases Per Requirement

**CLI-01 (Help grouping):**
- Empty group (no commands assigned) — Commander v14 does not render empty groups (verified); covered by snapshot
- Command with no group assignment — must NOT leak to default "Commands:" heading (all 19+ commands assigned)
- Group order stability — Query → Data → System → Feedback (snapshot guards order)
- Version-line stability — snapshot strips `version X.Y.Z` lines before assertion

**CLI-02 (`--json` envelope):**
- Empty results — envelope with `data: []` and exitCode 0
- DB error before any results — envelope `{ schema_version, command, error: { code, message } }` to stdout, exitCode 1
- Validation error (early return) — envelope on stdout in `--json` mode, exitCode 1 (Codex HIGH-2)
- Not-found (show/context/related) — error envelope on stdout in `--json` mode, exitCode 1 (Codex HIGH-2)
- `search --files --json` — envelope with `kind: "file"`, NOT bare array (Codex HIGH-4)
- `--json --format ai` — same payload as `--json` alone (deep-equal assertion, Codex HIGH-5)
- Very large result set — `JSON.stringify(envelope, null, 2)` works; CONTEXT_BUDGET truncation preserved in JsonOutputFormatter via DTO helpers (MEDIUM-1)
- Special characters in snippets — JSON.stringify handles
- Stderr quiet when `--json` set; stdout = exactly one document
- Highlight offsets — computed BEFORE `<mark>` strip (Gemini LOW invariant in dto-helpers.test.ts)
- Error-trigger strategy: deterministic invalid input (FTS5 control chars / negative limit / nonexistent ID); NOT `dbPath: "/non/existent/..."` (Windows file-locking non-deterministic); NOT `mock.module()` on first-party (isolation gate)

**CLI-03 (`--format brief|ai`):**
- `--format brief` on stats — top-line counters, ≤5 lines total (W5)
- `--format ai` on every command — output contains no ANSI codes
- `--format brief` + `--quiet` — quiet wins (more aggressive trim); document precedence in code comment
- `--format <invalid>` — Commander default rejection
- `--json --format ai` — `--json` wins, no `formatForAi()` post-processing
- OutputMode union extension (W6) — `bun --bun tsc --noEmit` clean after Task 2; no stale callers
- `--format default` on search/list/show/stats — deprecated alias; stderr warning; suppressed in `--json` mode (Codex MEDIUM-2)
- `--format detailed` on context/related — deprecated alias; stderr warning; suppressed in `--json` mode

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (including new dto-helpers, list.deps, stats.deps)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (presentation tree subdirectory run)
- [x] Coverage ≥95% per metric maintained for all touched files
- [x] Isolation gate remains at 0 violations
- [x] All `.test.ts` files co-located under `src/presentation/cli/` (BLOCKER 1 resolved)
- [x] Cross-platform `<verify>` blocks (MEDIUM-3 resolved)
- [x] Windows-specific gate (subdirectory bun test) documented
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved on revision 3 (cross-AI review findings integrated)
</content>
