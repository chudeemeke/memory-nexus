# Plan for review: Standardise CLI command test isolation

You are reviewing a plan, not code. Be adversarial. Identify weaknesses, missed cases, alternative framings, and risks. The user asked specifically for first-principles validation — push back if any reasoning is weak.

## Context

`@chude/memory` is a TypeScript CLI tool (Bun runtime, hexagonal architecture). 41 tests fail when `bun test` runs the full suite, but 0 fail when files run in isolation. Same code, different ordering. This is test pollution.

## Root cause (claimed)

`browse.test.ts` calls `mock.module("./show.js", ...)`, `mock.module("./search.js", ...)`, `mock.module("./context.js", ...)`, `mock.module("./related.js", ...)` to mock dispatch targets. Bun's `mock.module()` is process-wide and persists across test files. When `browse.test.ts` runs first, the mocked exports replace the real implementations for all subsequent files in the same `bun test` invocation. The 4 affected test files (show/search/context/related) end up testing the no-op mocks (which return `exitCode: 0`) instead of the real code.

40 of 41 failures fall into this bucket. The 41st is `friction/dashboard.test.ts`, which doesn't pass a `dbPath` and so hits the real user database (slow, non-deterministic).

## Audit of the broader pattern

Three inconsistent approaches to the same concern (testable DB path) across 16 commands:

**Pattern A — DI via options (clean, used by 4):**
```ts
const dbPath = options.dbPath ?? getDefaultDbPath();
```
Files: context.ts, related.ts, search.ts, status.ts (partially), friction/index.ts (just added).

**Pattern B — Module-level `let testDbPath` + setter (smelly, used by 4):**
```ts
let testDbPath: string | null = null;
export function setTestDbPath(path: string | null) { testDbPath = path; }
const dbPath = testDbPath ?? getDefaultDbPath();
```
Files: browse.ts, purge.ts, show.ts, status.ts (also has options.dbPath, hybrid).

**Pattern C — No test seam at all (worst, used by 8):**
```ts
const dbPath = getDefaultDbPath();
```
Files: backfill.ts, doctor.ts, export.ts, import.ts, list.ts, stats.ts, sync/index.ts, doctor.ts (and friction/index.ts before this session).

## Proposed plan (the one I want validated)

### Stage 1 — Eliminate test pollution from `mock.module()` (in progress)

Refactor `browse.ts` to accept a `BrowseDispatchers` object via parameter (DI). Tests inject mocks per-call instead of using `mock.module()`. **Already done; reduced 41 → 1 failure.**

Audit other `mock.module()` usages:
- `transformers-js-provider.test.ts` mocks `@huggingface/transformers` (third-party). Verify it doesn't leak; the test file is the only consumer of that import.
- `sync/embedding-pass.test.ts` mocks `node:readline` (built-in). Same — verify scope.
- `sync/lazy-loaders.test.ts` mocks 4 internal modules. The file's own docstring says it's "Placed in a separate file to prevent mock.module leakage" — meaning the team already knows the pollution problem and has been working around it instead of solving it. Move to DI.

### Stage 2 — Standardise all 16 CLI commands on Pattern A

For every `executeXCommand`:
1. Add `dbPath?: string` to its options interface.
2. Replace `getDefaultDbPath()` with `options.dbPath ?? getDefaultDbPath()`.
3. Remove module-level `let testDbPath` + `setTestDbPath()`.
4. Update existing tests that called `setTestDbPath()` to pass `dbPath` via options.

For `browse.ts` specifically: it ALSO calls `setShowTestDbPath(path)` to propagate the test path to show. With DI, this propagation goes through the dispatchers parameter and the dbPath option, no setter needed.

### Stage 3 — Verify hermetic execution

Acceptance criteria:
- `bun test` produces 0 failures with the same set of tests, regardless of order.
- No test file uses `mock.module()` for first-party modules.
- No production module exports a `setX()` mutator that tests use to inject state.
- Test isolation does not require running files separately.

### Stage 4 — Document the convention

Add a section to project CLAUDE.md (or equivalent) documenting:
- DI via options is the canonical seam.
- `mock.module()` is forbidden for first-party modules.
- Module-level mutable state is forbidden in production code.

## What I'm explicitly asking codex to challenge

1. **Is the DI-via-options pattern the right canonical seam, or is there a better one?** Alternatives considered: a DependencyContainer/IoC system; environment variables; a global injector singleton. I rejected those as overkill for a CLI tool of this size, but is that judgment right?

2. **Are there test-pollution sources I'm missing?** `mock.module` is the obvious one, but also: process.env mutations, process.exitCode, file system state, time mocks (Date.now), shared in-memory caches in singletons.

3. **Is the audit complete?** I grep'd for `getDefaultDbPath()`, `mock.module(`, and `let testDbPath`. What other anti-patterns should I check?

4. **Is "all 16 commands standardised" too aggressive a scope?** The user's directive was "no excuses, no known issues." But I want a sanity check: is there any command where Pattern C is actually correct (e.g., a bootstrap command that legitimately can't accept an injected DB)?

5. **What's the right rollout?** All-at-once mega-PR or incremental per-command? I lean incremental (atomic commits per command, easier review), but the user values systems-level coherence which suggests all-at-once. Tradeoff?

6. **Beyond test isolation, what other architectural defects does this audit hint at?** When I see 3 inconsistent patterns for the same concern, what other concerns might have the same fragmentation? I should search for them now, not later.

## Constraints / non-goals

- This is a `@chude/memory` Bun TypeScript project, not Node. Some patterns differ.
- Hexagonal architecture: domain layer must stay pure (no DB).
- 95%+ coverage at each metric required.
- Git author: `Chude <chude@emeke.org>`, no AI attribution in commits, no emojis.
- The project ships as an OSS-quality CLI; "industry-standard" is the bar, not "good enough for solo".
