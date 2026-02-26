---
agent: gsd-executor
updated: 2026-02-26
entries: 24
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

- finding: "Bun resolves type-only imports from nonexistent .ts files without error at runtime. When writing TDD RED tests for interfaces (type-only imports), the test may pass even before creating the source file because bun treats missing type-only modules as structurally inferred. The GREEN phase still matters because it creates the actual typed contract."
  source: "Phase 14, Plan 01, Task B"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "Pre-existing flaky test in connection.test.ts (sqlite-vec extension loading) fails intermittently in full suite but passes in isolation. This is a test ordering/isolation issue, not a real regression. Document and skip rather than debugging."
  source: "Phase 14, Plan 01"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "sqlite-vec@0.1.6 loads successfully via require() in bun:sqlite on Windows MINGW64. The load(db) API is synchronous and compatible with initializeDatabase's sync design."
  source: "Phase 14, Plan 02, Task B"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "When adding entries to SCHEMA_SQL array, existing tests that assert array length must be updated. Always check for hardcoded length assertions in schema.test.ts."
  source: "Phase 14, Plan 02, Task A"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "Bun mock.module for dynamic imports: the returned object is resolved once and cached. Getter-based delegation (get prop() { return variable; }) does NOT work because bun evaluates the getter at registration time. Use a shared mutable state object where properties are mutated in place (never reassigned). For env-like objects, reset properties in beforeEach rather than replacing the whole object."
  source: "Phase 14, Plan 03, Task A"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "When plan specifies types/signatures that conflict with the domain port (e.g., async isReady(): Promise<boolean> vs synchronous isReady(): boolean), always follow the domain port. The port is the contract; the plan's implementation section is guidance."
  source: "Phase 14, Plan 03, Task A"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "When extending MemoryConfig with a nested object (e.g., embedding), loadConfig() needs deep-merge: { ...DEFAULT_CONFIG, ...loaded, nested: { ...DEFAULT_NESTED, ...(loaded.nested ?? {}) } }. Shallow spread replaces entire nested object. Existing tests asserting toEqual(customConfig) without the new field will fail."
  source: "Phase 14, Plan 04, Task A"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "When extending HealthCheckResult with new fields, all test fixtures that construct HealthCheckResult objects must be updated to include the new fields. The doctor.test.ts has multiple fixtures (healthyResult in formatHealthResult and attemptFixes describes) that need updating."
  source: "Phase 14, Plan 04, Task B"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-26"

- finding: "Float32Array passes directly to sqlite-vec vec_f32() in bun:sqlite without conversion. No Buffer.from(embedding.buffer) needed. The plan flagged this as MEDIUM confidence but it works correctly."
  source: "Phase 15, Plan 01, Task A"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When adding a new field to EmbeddingConfigData (e.g., batchSize), tests asserting toEqual on the full config object must include the new field. The 'loads all config values correctly' test and 'DEFAULT_CONFIG has embedding property' test both need updating."
  source: "Phase 15, Plan 01, Task B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Pre-existing EBUSY flaky test in export.test.ts on Windows -- rmSync fails with 'resource busy or locked' on tmpdir cleanup. Not related to any plan changes. Appears consistently now (not just intermittent). Consider fixing in a cleanup plan."
  source: "Phase 15, Plan 01"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "For testing async orchestration functions that use dynamic import(), prefer DI overrides (EmbeddingPassDeps pattern) over mock.module. Export the function and accept optional dependency parameters. This avoids bun's mock caching issues entirely and produces cleaner, faster tests."
  source: "Phase 15, Plan 02, Task B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When adding new options to Commander.js commands, tests must check both option existence AND help text. Integration tests that spawn the CLI process verify real help output. Unit tests verify option parsing via command.parse() with action override."
  source: "Phase 15, Plan 02, Task B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When extending StatusInfo (or any interface used in test fixtures), ALL existing test fixtures that construct the interface must be updated to include the new field. The formatStatusOutput function accesses status.embedding.active which crashes if embedding is undefined. Add embedding: { active: false } to all existing StatusInfo fixtures."
  source: "Phase 15, Plan 03, Task B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "For functions that spawn child processes, use DI overrides (BackgroundModeDeps pattern) rather than mock.module to test. Export the handler function separately and accept optional dependency parameters. This avoids actually spawning processes in tests and follows the same proven pattern as EmbeddingPassDeps."
  source: "Phase 15, Plan 03, Task B"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"
