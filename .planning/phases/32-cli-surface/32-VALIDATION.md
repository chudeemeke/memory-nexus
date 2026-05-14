---
phase: 32
slug: cli-surface
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-14
updated: 2026-05-14
approved: 2026-05-14
approver: gsd-plan-checker (revision 2 PASS)
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
| **Full suite command** | `bun test` |
| **Coverage command** | `bun test --coverage` |
| **Isolation gate** | `bun run test:isolation` (must remain at 0 violations) |
| **Estimated runtime** | ~5s (quick), ~30s (full) |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/presentation/cli`
- **After every plan wave:** Run `bun test` + `bun run test:isolation`
- **Before `/gsd-verify-work`:** Full suite must be green; coverage ≥95% per metric; isolation gate at 0
- **Max feedback latency:** ~30 seconds (full suite)

---

## Test Placement Convention

**All new `.test.ts` files in this phase are co-located with their source files under `src/presentation/cli/`** (resolves plan-check BLOCKER 1). The existing codebase has 14+ paired `<cmd>.ts` + `<cmd>.test.ts` siblings under `src/presentation/cli/commands/`. Phase 32 extends this pattern with a second test variant (`<cmd>.json.test.ts`) per command, keeping test discovery in one tree and matching what Plans 32-01 and 32-03 also do. Do NOT create a parallel `tests/` directory.

Shared test helpers (e.g., `captureStreams`) go under `src/presentation/cli/commands/_helpers/` if extracted, or are inlined per file.

---

## Per-Task Verification Map

> Per-task entries are filled in by gsd-planner during PLAN.md creation. Each automated test below maps to one or more Plan tasks.

| Test File | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|-----------|------|-------------|-----------|-------------------|-------------|--------|
| src/presentation/cli/help-groups.test.ts | 0 | CLI-01 | unit (Command introspection + snapshot, version-line stripped) | `bun test src/presentation/cli/help-groups.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/formatters/envelope.test.ts | 0 | CLI-02 | unit (envelope helpers) | `bun test src/presentation/cli/formatters/envelope.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/search.json.test.ts | 0 | CLI-02, CLI-03 | integration (capture stdout, JSON.parse) | `bun test src/presentation/cli/commands/search.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/context.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/context.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/show.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/show.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/list.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/list.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/related.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/related.json.test.ts` | ❌ W0 | ⬜ pending |
| src/presentation/cli/commands/stats.json.test.ts | 0 | CLI-02, CLI-03 | integration | `bun test src/presentation/cli/commands/stats.json.test.ts` | ❌ W0 | ⬜ pending |
| Existing per-command `.test.ts` (extend) | 1 | CLI-03 | unit (Commander Option introspection for `--format brief\|ai`) | `bun test src/presentation/cli/commands` | ✅ existing | ⬜ pending |
| src/presentation/cli/formatters/output-formatter.test.ts | 1 | CLI-03 (brief mode) | unit | `bun test src/presentation/cli/formatters/output-formatter.test.ts` | ✅ existing (extend) | ⬜ pending |
| src/presentation/cli/formatters/ai-formatter.test.ts | 1 | CLI-03 (ai mode, ANSI stripping) | unit | `bun test src/presentation/cli/formatters/ai-formatter.test.ts` | ✅ existing (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 establishes test scaffolding BEFORE Wave 1 implementation (TDD RED phase per `rules/tdd-workflow.md`):

- [ ] `src/presentation/cli/formatters/envelope.ts` — `QueryResultEnvelope<T>` + `QueryErrorEnvelope` types + helpers
- [ ] `src/presentation/cli/formatters/envelope.test.ts` — tests for envelope shape, schema_version, kind/scope fields
- [ ] `src/presentation/cli/help-groups.test.ts` — assert 4 group headings (Query/Data/System/Feedback), command placement, snapshot stability (version-line stripped per W1 policy)
- [ ] `src/presentation/cli/commands/search.json.test.ts` — `--json` envelope shape + error path + empty result
- [ ] `src/presentation/cli/commands/context.json.test.ts` — same shape contract
- [ ] `src/presentation/cli/commands/show.json.test.ts` — same
- [ ] `src/presentation/cli/commands/list.json.test.ts` — same
- [ ] `src/presentation/cli/commands/related.json.test.ts` — same
- [ ] `src/presentation/cli/commands/stats.json.test.ts` — same (plus brief = top-line summary, ≤5 lines per W5)

bun:test is bundled with Bun — no framework install needed.

All Wave 0 test files are co-located with their source per the existing codebase convention (resolves plan-check BLOCKER 1).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual readability of `memory --help` output (line breaks, indentation, color in terminal) | CLI-01 | Snapshot covers structure; visual aesthetics need human eye | `bun run memory --help` and confirm groups are visually distinct, indentation reads cleanly |
| Brief mode "feels brief" (subjective) | CLI-03 | Brief is a UX promise as much as a technical contract | Run `memory search foo --format brief` and confirm output is scannable (≤3 lines per record) |
| AI mode usability when piped to Claude | CLI-03 | Ultimate consumer is a downstream LLM | `memory search foo --format ai \| pbcopy`, paste to Claude, confirm context loads cleanly |

---

## Edge Cases Per Requirement

**CLI-01 (Help grouping):**
- Empty group (no commands assigned) — Commander v14 does not render empty groups (verified); covered by snapshot
- Command with no group assignment — must NOT leak to default "Commands:" heading (all 19+ commands assigned)
- Group order stability — Query → Data → System → Feedback (snapshot guards order)
- Version-line stability — snapshot strips `version X.Y.Z` lines before assertion (W1 policy); package version bumps do NOT churn the snapshot

**CLI-02 (`--json`):**
- Empty results — envelope with `data: []` and exitCode 0
- DB error before any results — envelope `{ schema_version, command, error: { code, message } }` to stdout, exitCode 1
- Very large result set — `JSON.stringify(envelope, null, 2)` works; preserve or revisit existing CONTEXT_BUDGET handling
- Special characters in snippets — JSON.stringify handles; verify no double-escaping
- Stderr quiet when `--json` set; stdout carries everything (industry pattern — gh/kubectl)
- Error-trigger strategy: deterministic (FTS-control-char query OR `mock.module()` injection); NOT `dbPath: "/non/existent/..."` per W3 resolution

**CLI-03 (`--format brief|ai`):**
- `--format brief` on stats — top-line counters, ≤5 lines total (W5 resolution; was ≤3, softened for formatter breathing room), not error (per Pitfall 4 Option A)
- `--format ai` on every command — output contains no ANSI codes
- `--format brief` + `--quiet` — quiet wins (more aggressive trim); document precedence in code comment
- `--format <invalid>` — Commander default rejection (`error: option '--format <type>' argument '<invalid>' is invalid`); no custom handling
- `--json --format ai` — `--json` wins, no `formatForAi()` post-processing; tested in each `.json.test.ts`
- OutputMode union extension (W6) — `bun --bun tsc --noEmit` clean after Task 2; no stale callers

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] Coverage ≥95% per metric maintained for all touched files
- [ ] Isolation gate remains at 0 violations
- [ ] All `.test.ts` files co-located under `src/presentation/cli/` (BLOCKER 1 resolved)
- [ ] `nyquist_compliant: true` set in frontmatter when checker approves

**Approval:** pending
</content>
</invoke>