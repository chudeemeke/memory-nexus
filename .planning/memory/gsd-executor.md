---
agent: gsd-executor
updated: 2026-02-25
entries: 9
---

- finding: "Bun test spyOn mock leakage: when mocking nodeFs.renameSync, must restore before assertions, not in afterEach. Mock affects subsequent tests in same file if not restored promptly."
  source: "Phase 13, Plan 01, Task 1"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Windows MINGW64 environment: gsd-tools.js init/state commands fail. Manual STATE.md updates required."
  source: "Phase 13, Plan 01"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Config-manager test pattern: tests override process.env.HOME to redirect homedir(). When paths change (e.g., .memory-nexus to .config/memory), ALL path constructions in tests must update, not just assertions on function return values."
  source: "Phase 13, Plan 01, Task 2"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Project test baseline: 2005 tests pre-plan, 2061 after plan 01. Full suite runs in ~20-40s on this machine."
  source: "Phase 13, Plan 01"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Git author must be: Chude <chude@emeke.org>. No AI attribution, no emojis."
  source: "Phase 13, Plan 01"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "When renaming identifiers used in external config files (e.g., hook markers in settings.json), implement dual detection (old + new) for backward compatibility. Don't break users with existing configs."
  source: "Phase 13, Plan 02, Task 1"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Test data project names (ProjectPath.fromDecoded, projectName in test fixtures) should NOT be renamed during package renames - they represent external project directory names, not the tool's identity."
  source: "Phase 13, Plan 02"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "When changing hardcoded paths in user-facing messages to dynamic function calls, update test assertions to call the same function (import getLogDir) rather than hardcoding the new path, making tests resilient to XDG env differences."
  source: "Phase 13, Plan 02, Task 2"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Test fixture paths containing old product names (e.g., .memory-nexus in directory names) can trigger false positives in stale-reference detection. When adding detection for old names in hook commands, update test fixture paths to use new naming so the installed hooks don't contain the old name in their command strings."
  source: "Phase 13, Plan 03, Task 1"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-25"
