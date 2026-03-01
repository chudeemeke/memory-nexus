---
agent: gsd-plan-checker
updated: 2026-03-01
entries: 26
---

- finding: "Auto-migration on first run requires wiring in CLI entry point. Plans that create migration.ts but never call migrateFromLegacy() on startup miss a locked decision."
  source: "Phase 13, Plan 01"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Plans using TDD structure within autonomous:true plans use must_haves at plan level as acceptance criteria instead of per-task done elements. This is the established project pattern."
  source: "Phase 14, all plans, task structure analysis"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "When a locked decision specifies a UX message format with human-readable names, verify the type carries those names not just computed hash values."
  source: "Phase 15, Plan 15-02, Task 15-02-B, handleModelChange() prompt"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When a locked decision specifies a status display with dynamic count, verify the plan queries the data source at display time rather than relying on a stale lock file value."
  source: "Phase 15, Plan 15-03, Task 15-03-B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Gap-closure plans that acknowledge a new file is needed in the action body but do not add it to files_modified frontmatter create executor ambiguity. Flag as warning: files_modified must match what the executor will actually create."
  source: "Phase 15, Plan 15-04, Task 15-04-B, sync-lazy-loaders.test.ts discrepancy"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Gap-closure plans covering only Phase-N code paths in a file with pre-existing low coverage should explicitly state the per-file metric target applies ONLY to Phase-N additions, not the full file. Otherwise bun test --coverage showing the full file at 50% looks like a failure even though Phase-N paths are now covered."
  source: "Phase 15, Plan 15-04, sync.ts coverage scoping"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When a plan introduces a new optional config field (e.g., hintShown) that extends an interface defined in a prior plan, the executor for the later plan can safely add it without breaking earlier plan outputs — sequential waves make this non-issue."
  source: "Phase 16, Plan 16-03, Task A: hintShown added to SearchConfigData from 16-01"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "files_modified frontmatter may have minor naming discrepancies (health-check.ts vs health-checker.ts) that do not block execution when the action body imports via a stable index. Flag as non-blocking observation, not a blocker."
  source: "Phase 16, Plan 16-03: health-check.ts vs health-checker.ts"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "A locked decision saying a command 'benefits automatically via shared infrastructure' may refer to the CLI command pipeline (memory search using hybrid) rather than a code-level refactor of every service. Verify whether the upstream service (e.g., SqliteContextService) actually uses ISearchService. If it does direct SQL, auto-benefit does not require a refactor — search just works via the search command."
  source: "Phase 16, Plan 16-03, Task A: context/related auto-benefit analysis"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "When a phase's ROADMAP success criteria includes a defense-in-depth measure (e.g., 'initializeDatabase refuses when isMigrationPending') and the research explicitly recommends omitting it to avoid module coupling, this divergence is a warning not a blocker -- the primary fix still achieves the phase goal. Check whether the omission leaves any unaddressed failure scenario."
  source: "Phase 16.1, Plan 16.1-01, Research Option A vs Success Criterion 3"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "For TDD plans, the red-phase verify block runs tests expecting FAIL (non-zero exit). This is not a broken verify -- it confirms the RED state. Do not flag as missing-verify."
  source: "Phase 16.1, Plan 16.1-01, Task A verify block"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "When a plan lists a file in files_modified frontmatter but no task in the plan body touches that file, flag as a warning (executor confusion risk). Check the schema.ts pattern: Plan 17-02 lists schema.ts but recreateVecTable() uses inline SQL (not schema constants), so schema.ts does not need modification."
  source: "Phase 17, Plan 17-02: schema.ts listed but not touched by any task"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "When a ROADMAP success criterion says doctor shows 'server reachable' readiness status for Ollama, but the research explicitly recommends deferring connectivity check to initialize() to avoid live network calls during doctor, this is a warning not a blocker. The phase goal (Ollama provider works when configured) is still achievable. Doctor showing static config readiness (API key present, baseUrl configured) is sufficient for the UX criterion."
  source: "Phase 17, Plan 17-01 T2: Ollama readiness in doctor"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "In iteration 2 verification: both prior warnings cleanly resolved -- schema.ts removed from 17-02 files_modified AND Ollama readyReason text added to 17-01 must_haves + task tests + doctor output pattern. A plan that addresses both warnings simultaneously passes without new issues when the rest of the architecture is sound."
  source: "Phase 17, iteration 2 verification"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "Gap-closure plan for config-layer fix (provider defaults): Task 2 modifies health-checker.test.ts to verify downstream propagation but that file is absent from files_modified frontmatter. This is the same warning pattern as Phase 15-04 sync-lazy-loaders.test.ts. Non-blocking since health-checker.test.ts is a test-only file and executor reads the task <files> element, but flags executor ambiguity."
  source: "Phase 17, Plan 17-03, Task 2: health-checker.test.ts missing from frontmatter"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "When an existing test in the modified file uses a config with provider: openai AND explicit model/dimensions (both fields present), the new resolveProviderDefaults logic must correctly preserve those explicit values. Always trace existing tests against the new resolution logic to confirm no regression. In Plan 17-03, existing test 'loadConfig() returns undefined for apiKey/baseUrl when not present in file' writes provider:openai without model/dimensions -- after fix this config gets openai defaults applied, but the test only checks apiKey/baseUrl (undefined), so no assertion fails."
  source: "Phase 17, Plan 17-03: existing test regression analysis"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "When a ROADMAP success criterion says 'exercises all public execute*Command functions' but the plan's must_haves says 'exercises at minimum' a named subset, this is a deliberate scope reduction that should be flagged as a warning. Plans that only test 8 of 16 functions against a 'all functions' criterion leave the other 8 without behavioral test coverage."
  source: "Phase 18, Plan 18-02, Task 1: test coverage scope discrepancy"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "High file counts in files_modified (18-20 files) can be misleading when the majority are one-line mechanical changes (export keyword, JSDoc annotations). Evaluate the COMPLEXITY of each file change, not just the count. 16 one-liners + 2 substantive files is not the same risk as 18 algorithmically complex file changes."
  source: "Phase 18, Plans 18-01 and 18-02: file count vs actual complexity analysis"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "When a phase success criterion says 'typed return values (not just exit codes)', this contrasts raw process.exit() integer calls (no return value) with typed CommandResult objects. It does NOT necessarily require richer return objects beyond { exitCode: number }. Verify the interpretation by checking if the execute* functions already avoid process.exit() and return typed values — if they do, the criterion is met."
  source: "Phase 18, ROADMAP success criterion 1 vs CommandResult { exitCode: number } design"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "Iteration 2 resolution pattern: when prior iteration flags 'minimum subset tested' as a warning, the fix is to expand must_haves to explicitly name ALL non-interactive commands + document exclusions with clear reasoning (TTY dependency). The revised plan also adds numbered test groups (1-16) mapping to each command, making coverage auditable. This pattern works cleanly for API surface testing phases."
  source: "Phase 18, iteration 2 verification: both warnings resolved"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "When a plan excludes executeBrowseCommand from automated integration tests due to TTY dependency, this is a valid and documented scoping decision -- not a coverage gap. The exclusion must be explicitly documented in the must_haves with the reason (requires interactive TTY, will hang). ROADMAP criterion 'all public execute*Command functions' is satisfied because un-automatable functions are a recognized exception class."
  source: "Phase 18, Plan 18-02, must_haves: executeBrowseCommand exclusion"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "Administrative gap-closure plans (evidence collection + doc updates only) pass all dimensions easily. The main risk is underspecified evidence documentation: if <done> says 'results documented' but <files> only lists the top-level target file and <action> doesn't specify WHERE in that file the evidence goes, executors may check boxes without recording metrics. Flag as warning, not blocker."
  source: "Phase 19, Plan 19-01, Task 3: QUAL evidence documentation scope"
  confidence: HIGH
  phase: "19-verification-closure"
  date: "2026-03-01"

- finding: "When a phase-scoped requirement list omits a requirement that IS in the phase's historical plans (RENAME-02 omitted from Phase 19 while Phase 13 has it), cross-check whether that requirement was already satisfied in a prior phase's VERIFICATION.md before flagging. Phase 19 correctly excludes RENAME-02 because it was already verified in Phase 16.1."
  source: "Phase 19, Plan 19-01, RENAME-02 exclusion analysis"
  confidence: HIGH
  phase: "19-verification-closure"
  date: "2026-03-01"

- finding: "When a task action has a mid-action course correction (first proposes approach X with aliases, then says 'Actually, a cleaner approach'), flag as a warning for executor clarity. The final instruction is correct but the pivot language may cause executor hesitation. Recommend rewriting as a single clear instruction."
  source: "Phase 21, Plan 21-01, Task 2, Step C: alias approach vs re-export approach"
  confidence: HIGH
  phase: "21-architecture-boundary-cleanup"
  date: "2026-03-01"

- finding: "For single-plan phases with no intra-phase dependencies, depends_on: [] is correct even when the ROADMAP shows inter-phase dependencies (e.g., Phase 21 depends on Phase 14). The inter-phase dependency is already satisfied since prior phases are complete. Only flag depends_on issues for multi-plan phases where plan ordering within a phase matters."
  source: "Phase 21, Plan 21-01, dependency correctness analysis"
  confidence: HIGH
  phase: "21-architecture-boundary-cleanup"
  date: "2026-03-01"

- finding: "verify blocks that check for ABSENCE of a pattern (grep returning 0 lines = success) create ambiguous exit codes when piped to grep -c. The count 0 is correct but grep exits 1 (no matches). The done criteria must explicitly state the expected count=0. This is a minor executor confusion risk, not a blocker, as long as done criteria are clear."
  source: "Phase 21, Plan 21-01, Task 2 verify: grep -c . returning 0 exit 1"
  confidence: HIGH
  phase: "21-architecture-boundary-cleanup"
  date: "2026-03-01"
