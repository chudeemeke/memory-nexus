---
status: complete
phase: 13-package-rename
source: 13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md
started: 2026-02-25T21:30:00Z
updated: 2026-02-25T22:15:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: complete
name: All tests completed
awaiting: none

## Tests

### 1. Package identity in package.json
expected: package.json shows name "@chude/memory", version "2.0.0", bin "memory"
result: PASS -- name "@chude/memory", version "2.0.0", bin "memory" all confirmed

### 2. CLI help shows new identity
expected: Running CLI --help shows "memory" in program name and description, no "memory-nexus" references
result: PASS -- `bun run src/presentation/cli/index.ts --help` shows "memory" program name. Note: `bunx --bun .` doesn't work for local package testing; use `bun run` instead.

### 3. Doctor reports XDG paths
expected: Doctor shows paths under ~/.config/memory/ (config) and ~/.local/share/memory/ (data, logs, hooks, backups)
result: PASS -- `doctor` output shows config at ~/.config/memory/ and data at ~/.local/share/memory/ with subdirectories for logs, hooks, backups

### 4. Migration runs on CLI startup
expected: CLI startup does not error with migrateFromLegacy() wired in before program.parse()
result: PASS -- doctor output showed "partial migration" status, startup proceeded normally without errors

### 5. Deprecation stub prints migration message
expected: Running `node deprecation-stub/index.js` prints migration message to stderr and exits with code 1
result: PASS -- prints message directing users to @chude/memory with install command

### 6. Install command detects stale hooks
expected: Install command warns about stale "memory-nexus" references in hooks
result: PASS -- `install --force` showed stale hook warning about memory-nexus references. Without --force, reports "already installed" (expected behavior).

### 7. Migration guide covers all changes
expected: MIGRATION.md covers package rename, binary rename, path migration, hook update
result: PASS -- comprehensive guide covering all four areas plus troubleshooting and rollback instructions

### 8. Full test suite passes
expected: 2060+ tests pass, 0 failures
result: PASS -- 2064 pass, 0 fail across 83 files after fixing 3 db-startup.test.ts tests that lacked non-TTY enforcement (commit c1641d4). Coverage: 94.81% functions, 95.84% lines.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Notes

- bunx does not reliably invoke local package for testing; use `bun run src/presentation/cli/index.ts` instead
- 3 db-startup.test.ts failures found during UAT -- tests assumed non-TTY but never enforced it. Fixed in c1641d4.
- doctor --json output omits actual path strings; use `doctor` (no --json) to see formatted paths
