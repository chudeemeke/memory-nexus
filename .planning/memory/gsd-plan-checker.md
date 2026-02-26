---
agent: gsd-plan-checker
updated: 2026-02-25
entries: 8
---

- finding: "Auto-migration on first run requires wiring in CLI entry point (cli/index.ts), not just creating a migration module. Plans that create migration.ts but never call migrateFromLegacy() on startup miss a locked decision."
  source: "Phase 13, Plan 01"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Hook transition needs LEGACY_MARKER for bidirectional detection (detect+remove old marker, install new marker). Plans that only add LEGACY_MARKER to settings-manager but do NOT wire migration to call uninstall+reinstall miss the locked decision 'Migration does a full re-install: removes old hooks, runs memory install to write fresh hooks with new binary name.'"
  source: "Phase 13, Plans 01-02, CONTEXT.md hook transition decision"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "RENAME-05 covers external files (~/.claude/rules/memory-nexus.md, ~/.claude/CLAUDE.md). Plans that only update in-repo CLAUDE.md miss the WoW rules file rename. This is a real gap that can cause phases to pass all tests yet still fail the requirement."
  source: "Phase 13, REQUIREMENTS.md RENAME-05, RESEARCH.md external files table"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "When plans add a 'bun run typecheck -- clean compilation' done criterion, always verify the baseline TypeScript compilation status first. Codebase may have pre-existing TS errors that make this criterion impossible to satisfy. Phase 13 had 86 pre-existing TS errors in files outside the plan's scope. Fix: either remove typecheck from done criteria, or qualify it as 'no new TS errors introduced by this phase'."
  source: "Phase 13, Plan 03 Task 2 done criterion vs baseline bun run typecheck"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "External files (files outside the project repo, like ~/.claude/ files) need not appear in the frontmatter files_modified list, but MUST appear in the <files> element of the task that modifies them, and MUST have corresponding verify steps. Plan 03 Task 2 correctly describes the external file operations in its <action> but omits them from <files>. The action text is sufficient for the executor to know what to do, but <files> should ideally list them for clarity."
  source: "Phase 13, Plan 03 Task 2 files element vs action for external WoW rules"
  confidence: MEDIUM
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Infrastructure-only phases (like Phase 14) may have requirements that specify user-visible behavior (progress indicators, error messages) that cannot be fully wired end-to-end in the infrastructure phase. When a requirement like EMBED-06 (progress indicator) is assigned to an infrastructure phase, verify whether the research defines 'coverage' as callback mechanism or as visible CLI output. If research maps it to a mocked unit test, that is the intended scope for the phase. Document this for the downstream pipeline phase planner."
  source: "Phase 14, Plan 14-03, EMBED-06 analysis"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "When a factory class references a DEFAULT_* constant from another module (e.g., DEFAULT_EMBEDDING_CONFIG from config-manager.ts), the import must be explicitly listed. Phase 14 Plan 14-04-A shows createFromConfig() using DEFAULT_EMBEDDING_CONFIG without showing its import. The executor will need to add this import or the code will fail with ReferenceError at runtime."
  source: "Phase 14, Plan 14-04, Task A, createFromConfig() implementation"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "Plans using TDD structure (Red/Green/Refactor) within autonomous:true plans use must_haves at plan level as acceptance criteria instead of per-task <done> elements. This is the established project pattern and is not a gap. The plan-level must_haves serve as the aggregated acceptance criteria for all tasks in the plan."
  source: "Phase 14, all plans, task structure analysis"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"
