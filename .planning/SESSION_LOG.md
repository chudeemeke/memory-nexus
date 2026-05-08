# Session Log

Append-only log of work sessions on memory-nexus. Most recent entries first.

---

## 2026-05-08 — Test Isolation Cleanup (out-of-roadmap)

**Resumed from:** parking-time baseline (last commit 2026-04-10) where `bun test` showed 41 failures in full suite but 0 in isolation.

**Arc:** Diagnosed test pollution → codex review → 13 atomic commits over multiple sessions → 41 → 0 failures, 28 → 3 gate violations.

**Key commits (chronological):**
- e7f9e34 — test isolation gate (`scripts/check-test-isolation.ts`)
- 5903692 — show.ts → ShowCommandDeps
- efab4c0 — status.ts → StatusCommandDeps
- 40aff2f — purge.ts → PurgeCommandDeps (+ askConfirmation injection)
- 1db73fe — install.ts → InstallCommandDeps
- ee40d3f — browse.ts → unified BrowseCommandDeps (consolidated dispatchers + dbPath)
- daa9389 — friction dashboard test uses temp DB
- 79300b1 — inbox opt-in (cross-project-issues convention)
- 47b1912 — sync/lazy-loaders.test.ts deleted (duplicate coverage)
- 8e73e15 — checkpoint-manager → per-call path
- 1f6f006 — health-checker → DoctorCommandDeps.healthOverrides
- 09f3a31 — log-writer → per-call path
- 3f0ff49 — config-manager → per-call path
- c8838c3 — settings-manager → per-call PathOverrides

**Decisions captured (see test_isolation_cleanup.md for full reasoning):**
- deps parameter is canonical seam, not options.dbPath
- Infrastructure functions accept optional path argument directly (not nested in deps object)
- Override derivation pattern: health-checker derives `logPath` from `overrides.logsDir`, etc.
- Lazy-loaders.test.ts deleted — duplicate behavior coverage, mock.module pollution not worth it

**Outstanding:**
- paths.ts module-state migration (3 violations) — final gate violator. Three design options documented.
- ai-dev-environment/docs/inbox/2026-04-27-medesine-rx-cross-project-issues-tooling-integration.md — inbox item filed during this session arc

**Test suite:** 3096/3096 passing in full src/ suite. CLI startup verified.

---

## 2026-04-10 — Phase 31 plan 02 (CLI output width)

Implemented width-aware column padding (`padToWidth` over `padEnd`) and snippet truncation (`truncateForTerminal`) to handle CJK/emoji content correctly. New `text-width.ts` utility module with `string-width` dependency. CJK alignment test in list-formatter, snippet truncation tests in output-formatter (default/quiet/verbose modes).

Refactor caught: derived test padding from `measureWidth(cjkName)` rather than hardcoded 8 spaces — eliminates coupling between test data and assertion math.

Gate: not yet existed.

Commits: 13086ea (failing tests), 23ef0eb (text-width utility), 5b629ef (Unicode FTS5), 1ac0bae (download progress), c1180ac (width-aware formatting), a6a099b (test decoupling refactor), 006b4a3 (summary), d536c9b (docs).

---

## 2026-04-03 — v4.0 milestone created + Phase 30 + Phase 31-01

(Earlier sessions; see git log for detail.)
