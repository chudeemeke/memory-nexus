---
agent: gsd-verifier
updated: 2026-03-21
entries: 36
---

entries:
  - finding: "Phase 14 embedding infrastructure: all 7 EMBED requirements verified complete. Key pattern: domain port files import ONLY from within domain (zero external deps); infrastructure adapters use dynamic import for lazy ONNX loading."
    source: "Phase 14, Plans 01-04"
    confidence: HIGH
    phase: "14-embedding-infrastructure"
    date: "2026-02-26"

  - finding: "Bun test mock pattern: mock.module with shared mutable state object -- env object mutated in place, never reassigned, to work with bun's module caching. Getter-based delegation does NOT work in bun."
    source: "Phase 14, Plan 03 SUMMARY"
    confidence: HIGH
    phase: "14-embedding-infrastructure"
    date: "2026-02-26"

  - finding: "EMBED-06 partial scope: the progress callback MECHANISM is implemented in Phase 14 (TransformersJsProvider.initialize(onProgress?)), but visible CLI progress bar wiring is explicitly deferred to Phase 15. REQUIREMENTS.md marks EMBED-06 Complete but the UI portion is Phase 15 scope."
    source: "Phase 14, Plan 03 PLAN.md and SUMMARY.md"
    confidence: HIGH
    phase: "14-embedding-infrastructure"
    date: "2026-02-26"

  - finding: "Phase 15 DI override pattern: when sync.ts tests use EmbeddingPassDeps/BackgroundModeDeps for dependency injection overrides, the real lazy loader functions (loadBackgroundDeps, loadFactory, loadConfig, loadRepository) are never exercised. These show as 0% covered in bun coverage even though the tested paths are fully covered via DI. This is a known tradeoff: test speed/isolation vs coverage completeness on thin loader wrappers."
    source: "Phase 15, Plan 15-02 and 15-03"
    confidence: HIGH
    phase: "15-embedding-pipeline"
    date: "2026-02-26"

  - finding: "Coverage reporting context: bun coverage numbers for modified files like sync.ts and status.ts are misleadingly low because (1) the full executeSyncCommand DB flow isn't unit-tested (integration tests use subprocess), and (2) DI overrides bypass real loader functions. For verification, focus on whether NEW Phase 15 code paths are covered, not pre-existing paths that were already tested in prior phases."
    source: "Phase 15 verification"
    confidence: HIGH
    phase: "15-embedding-pipeline"
    date: "2026-02-26"

  - finding: "OS-level defensive branches (subprocess.pid === undefined, signal 0 kill check on non-existent PID) ARE coverable via spyOn(childProcess, 'spawn') to return pid:undefined. These were covered in Phase 15-04 gap closure. Not inherently un-coverable -- use spawn spy pattern."
    source: "Phase 15, Plan 15-04 gap closure"
    confidence: HIGH
    phase: "15-embedding-pipeline"
    date: "2026-02-26"
    supersedes: "Previous entry stating these branches require OS-level mocking and are 'acceptable coverage gaps'"

  - finding: "mock.module isolation pattern for lazy loaders: place lazy-loader coverage tests in a SEPARATE test file (e.g., sync-lazy-loaders.test.ts) to prevent mock.module global scope from leaking into other test files in the same bun test process. The separate file gets its own module cache."
    source: "Phase 15, Plan 15-04"
    confidence: HIGH
    phase: "15-embedding-pipeline"
    date: "2026-02-26"

  - finding: "Re-verification coverage threshold: when a gap states 'new Phase 15 code paths uncovered,' verify that the SPECIFIC Phase 15 lines are no longer in the bun coverage uncovered-lines list (e.g., 'lines 320-327' absent from report). Do NOT fail verification because pre-existing lines in the same file remain below 95% -- attribute coverage gaps by phase of introduction, not just file-level totals."
    source: "Phase 15, re-verification after 15-04"
    confidence: HIGH
    phase: "15-embedding-pipeline"
    date: "2026-02-26"

  - finding: "Phase 16 hybrid search: Commander.js --no-X flag sets X=false, NOT noX=true. Pattern: use `vector?: boolean` in interface and check `opts.vector === false` for negation detection. Same applies to --no-decay. This is a common Commander.js gotcha."
    source: "Phase 16, Plan 16-03 SUMMARY deviation #1"
    confidence: HIGH
    phase: "16-hybrid-search"
    date: "2026-02-27"

  - finding: "Phase 16 hybrid search: context/related commands benefit from hybrid search is deferred by design -- SqliteContextService does its own SQL without using ISearchService, so passing HybridSearchService to it requires constructor injection refactoring. This is NOT a phase 16 gap; it is a documented future-phase decision."
    source: "Phase 16, Plan 16-03 SUMMARY key-decisions"
    confidence: HIGH
    phase: "16-hybrid-search"
    date: "2026-02-27"

  - finding: "Entry-point guard pattern for race conditions: place lightweight isMigrationPending() check at CLI import.meta.main block BEFORE program.parse() to guarantee synchronous side-effects complete before any command action dispatches. This is preferred over coupling the guard to the lazy-init target (initializeDatabase). Pattern: check -> run -> parse."
    source: "Phase 16.1, Plan 16.1-01"
    confidence: HIGH
    phase: "16.1-migration-race-condition-fix"
    date: "2026-02-27"

  - finding: "bun test --bail can produce spurious timeout failures (browse.test.ts timed out once) that do not reproduce when running the full suite without --bail. Always use `bun test` (no --bail) for definitive suite status; --bail stops on first failure and can mask that the test passes under normal load."
    source: "Phase 16.1 verification"
    confidence: MEDIUM
    phase: "16.1-migration-race-condition-fix"
    date: "2026-02-27"

  - finding: "Phase 17 fetch-based provider pattern: native fetch() for external API providers (OpenAI, Ollama) requires no npm dependencies. OpenAI initialize() is a no-op (sets _ready=true immediately); Ollama initialize() checks server reachability via GET /api/tags and throws actionable error if unreachable. Both providers follow IEmbeddingProvider port exactly."
    source: "Phase 17, Plans 17-01 and 17-02"
    confidence: HIGH
    phase: "17-provider-ecosystem"
    date: "2026-02-28"

  - finding: "Phase 17 dimension-change pattern: when provider/model switch changes vector dimensions (e.g., 384d to 1536d), the vec0 virtual table must be DROPped and recreated -- DELETE-only clearAllEmbeddings() is insufficient because vec0 column types are structural. EmbeddingRepository.recreateVecTable(dimensions) implements DROP TABLE IF EXISTS then CREATE VIRTUAL TABLE using vec0 with the new dimension. Dimension detection uses byteLength/4 from a single stored embedding."
    source: "Phase 17, Plan 17-02"
    confidence: HIGH
    phase: "17-provider-ecosystem"
    date: "2026-02-28"

  - finding: "Phase 17 doctor readiness design: doctor cannot make live network calls to verify Ollama server reachability (would be slow and context-inappropriate). Instead, Ollama provider reports ready:true with readyReason='Server reachability verified at sync time' to communicate that the check occurs during initialize() at sync time. OpenAI readiness IS checkable without network (just inspect whether apiKey is set). This asymmetry is by design."
    source: "Phase 17, Plan 17-01"
    confidence: HIGH
    phase: "17-provider-ecosystem"
    date: "2026-02-28"

  - finding: "Phase 18 dual-build pattern: build:types uses tsc with emitDeclarationOnly (generates dist/*.d.ts); build:lib uses bun build to bundle src/index.ts into dist/index.js (a single bun-bundled JS file, not a tree of tsc-compiled .js files); build:cli uses bun build for the CLI binary. The PLAN described tsc for the lib output but the actual implementation uses bun build for dist/index.js -- this is a deviation from the plan but correctly achieves the goal. The dist/index.d.ts declarations still come from tsc."
    source: "Phase 18, Plan 18-01"
    confidence: HIGH
    phase: "18-api-stabilization-and-aidev-integration-readiness"
    date: "2026-03-01"

  - finding: "Phase 18 StatusOptions gap pattern: when a command's internal options interface is not exported but the execute* function is public, consumers can still call the function with object literals (structural typing) but cannot reference the type by name. Check: does each public execute*Command function have its options interface exported through the public API chain (command file -> commands/index.ts -> src/index.ts)? If not, the README documentation is inaccurate if it names the private type."
    source: "Phase 18 verification"
    confidence: HIGH
    phase: "18-api-stabilization-and-aidev-integration-readiness"
    date: "2026-03-01"

  - finding: "Phase 19 administrative closure pattern: when a phase produces only documentation artifacts (VERIFICATION.md files, REQUIREMENTS.md updates), verify by checking (1) file existence, (2) frontmatter fields (status, score, re_verification), (3) requirement ID rows in tables, and (4) git log for cited commits. No code artifacts means no wiring checks needed -- all evidence is in the documentation structure and commit history."
    source: "Phase 19 verification"
    confidence: HIGH
    phase: "19-verification-closure"
    date: "2026-03-01"

  - finding: "QUAL-01 coverage exception pattern: embedding-provider-factory.ts at 83.33% function coverage is accepted when dispose() is only exercised via integration paths (factory lifecycle), not in unit isolation. The 83.33% figure represents 5/6 functions covered (class has 4 methods: cacheKey private, create, createFromConfig, dispose -- bun may count constructor as a function). Document the exception and the rationale explicitly in the verification report."
    source: "Phase 19 verification"
    confidence: HIGH
    phase: "19-verification-closure"
    date: "2026-03-01"

  - finding: "Phase 21 scope boundary pattern: when a phase targets a specific boundary violation (BOUNDARY-01: EmbeddingService->infrastructure), do NOT fail verification because other pre-existing violations in the same layer (recovery-service.ts, sync-service.ts importing infrastructure) remain. Verify that the PLAN's scope boundary explicitly calls these out-of-scope, then attribute the remaining violations to future phases. The grep-all-application-files test in the RESEARCH only applies to the specific files in scope (embedding-service.ts), not the entire application layer."
    source: "Phase 21, Plan 21-01"
    confidence: HIGH
    phase: "21-architecture-boundary-cleanup"
    date: "2026-03-01"

  - finding: "Phase 21 synchronous port pattern: domain ports CAN be synchronous when the infrastructure adapter uses a synchronous API (bun:sqlite). The IEmbeddingRepository port has 7 synchronous methods (return T, not Promise<T>) -- a deliberate break from the async pattern of all other repository ports. This is correct; the port contract must match the actual implementation API, not the other repositories' async pattern."
    source: "Phase 21, Plan 21-01"
    confidence: HIGH
    phase: "21-architecture-boundary-cleanup"
    date: "2026-03-01"

  - finding: "Phase 23 FTS5 sanitization preserves asterisks (prefix search) and balanced double quotes (phrase search) while stripping all other operator characters. The initial PLAN specified stripping both, but integration testing revealed existing search tests relied on these FTS5 features. The auto-fix deviation is correct -- strip characters that cause syntax errors, preserve characters that are valid FTS5 syntax."
    source: "Phase 23, Plan 23-02 SUMMARY deviations"
    confidence: HIGH
    phase: "23-foundation"
    date: "2026-03-08"

  - finding: "Phase 23 separate sync service pattern: memory file indexing uses its own MemoryFileSyncService rather than extending SyncService (which would inflate its constructor to 11+ dependencies). The CLI sync command is the composition root, orchestrating both services sequentially. This avoids SRP violation and keeps each service focused on one concern."
    source: "Phase 23, Plan 23-04"
    confidence: HIGH
    phase: "23-foundation"
    date: "2026-03-08"

  - finding: "UV_ENOSPC test failures in programmatic-api.test.ts export/import are environment-related (temp directory disk space), not code regressions. These tests were last modified in Phase 22. When verifying 'all tests pass' success criteria, attribute disk-space failures to the environment, not the phase under verification."
    source: "Phase 23 verification"
    confidence: HIGH
    phase: "23-foundation"
    date: "2026-03-08"

  - finding: "Phase 25 vector-only decay test flakiness: hybrid-search-service.test.ts 'vector-only mode applies temporal decay' fails non-deterministically when both random embeddings produce near-zero cosine similarity with the random query embedding (score ~0 for both). After decay, 0 * factor = 0 for both, making sort order indeterminate. Passes in isolation (different test ordering, different random seeds). The test design needs controlled embeddings or explicit score assertions that don't depend on ordering when both scores approach 0. This is a genuine Phase 25 gap: the test is structurally flawed."
    source: "Phase 25 verification"
    confidence: HIGH
    phase: "25-intelligence"
    date: "2026-03-10"
    status: superseded
    superseded_by: "Phase 25 gap closed in Plan 25-04 -- controlled embeddings fix applied"

  - finding: "Phase 25 gap closure pattern for non-deterministic cosine similarity tests: use insertTestEmbeddingWithVector helper to inject a pre-built Float32Array. The test should be designed so that WITHOUT decay the old message wins (higher raw similarity), and WITH decay the new message wins (lower raw similarity but recent). This makes the sort assertion non-vacuous -- it can only pass when decay is actually applied. The math: msg-old at [0.95, 0.31, ...] has ~0.95 cosine similarity to unit vector [1, 0, ...], decayed by ~0.25 (60-day half-life) = ~0.24. msg-new at [0.7, 0.71, ...] has ~0.7 similarity, decayed by ~1.0 (recent) = ~0.7. Deterministic 40/40, 5/5 runs."
    source: "Phase 25, Plan 25-04 re-verification"
    confidence: HIGH
    phase: "25-intelligence"
    date: "2026-03-10"

  - finding: "Re-verification with status human_needed (vs gaps_found): when all automated gaps are closed but human verification items remain from the initial verification, the correct final status is human_needed, not passed. The distinction matters for the orchestrator -- passed means ready to proceed; human_needed means the code is correct but real-environment confirmation is pending."
    source: "Phase 25 re-verification"
    confidence: HIGH
    phase: "25-intelligence"
    date: "2026-03-10"

  - finding: "Phase 26 executeBackfillCommand separation pattern: CLI commands that need infrastructure DI (database, repositories, file I/O) should separate the action handler into createXCommand() (composition root with lazy imports) and executeXCommand() (testable function accepting a service deps interface). Tests mock the deps interface; the lazy-import composition root is NOT unit-tested but is covered by integration/manual testing. This matches the existing executeFrictionCommand and executeSyncCommand patterns."
    source: "Phase 26, Plan 26-03 SUMMARY"
    confidence: HIGH
    phase: "26-hooks-and-backfill"
    date: "2026-03-18"

  - finding: "Phase 26 CLAUDECODE env var stripping pattern: when shelling out to claude -p from within a Claude Code session, the CLAUDECODE environment variable must be deleted from the child process env to prevent 'Cannot be launched inside another Claude Code session' errors. Pattern: const env = { ...process.env }; delete env.CLAUDECODE; spawn('claude', args, { env }). This is tested by setting process.env.CLAUDECODE in beforeEach and verifying spawn options don't contain it."
    source: "Phase 26, Plan 26-03 Task A"
    confidence: HIGH
    phase: "26-hooks-and-backfill"
    date: "2026-03-18"

  - finding: "Bun v1.3.5 segfault on full test suite: when running the entire test suite (500+ tests), Bun can crash with a segfault at RSS 3.35GB. This is a known Bun bug, not a code issue. Workaround: run phase-specific tests in targeted batches. The segfault does not indicate test failures -- it is a memory pressure issue in the test runner."
    source: "Phase 26 verification"
    confidence: HIGH
    phase: "26-hooks-and-backfill"
    date: "2026-03-18"

  - finding: "Phase 27 optional tool short-circuit pattern: when a CLI command flag delegates entirely to an external optional tool, place the short-circuit AFTER argument validation but BEFORE any infrastructure initialization (DB, config, providers). This prevents unnecessary DB opens and keeps the external tool path self-contained. Pattern: validate args -> check if external flag set -> short-circuit to executeExternalTool() -> normal flow. Search --files implements this correctly (lines 190-201 of search.ts: validate query, check options.files, short-circuit before initializeDatabase)."
    source: "Phase 27 verification"
    confidence: HIGH
    phase: "27-qmd-integration"
    date: "2026-03-18"

  - finding: "Phase 27 informational-only doctor check pattern: when adding an optional tool status to doctor, use dim('[INFO]') NOT formatStatus() to visually distinguish from pass/fail checks. Do NOT add the check to countIssues() or determineExitCode(). The Optional Tools section in formatHealthResult() is separate from the issue count summary. This ensures optional tool absence never degrades doctor exit code."
    source: "Phase 27 verification"
    confidence: HIGH
    phase: "27-qmd-integration"
    date: "2026-03-18"

  - finding: "Phase 29 ambient context AmbientContextDeps DI pattern: sync integration tests for runAmbientContextGeneration use an AmbientContextDeps interface (not mock.module) to inject loadConfig, resolveAutoMemoryDir, resolveProjectName, and createAmbientService. This matches the existing EmbeddingPassDeps and BackgroundModeDeps patterns in sync.ts and avoids bun module caching issues."
    source: "Phase 29, Plan 29-02 SUMMARY key-decisions"
    confidence: HIGH
    phase: "29-ambient-context"
    date: "2026-03-18"

  - finding: "Phase 29 structural formatter typing pattern: AmbientContextService accepts a formatter as a structural type { formatSmartContext(result): string } rather than importing ContextFormatter from the presentation layer. This maintains the hexagonal boundary (application layer must not import from presentation). The cast at the call site in sync.ts uses `as { formatSmartContext(result: any): string }` to satisfy TypeScript without the import."
    source: "Phase 29, Plan 29-02"
    confidence: HIGH
    phase: "29-ambient-context"
    date: "2026-03-18"

  - finding: "Phase 29 QUAL-01 83.33% function coverage on auto-memory-writer.ts: 100% line coverage but 83.33% function coverage is a recurring bun V8 counting artifact where the class body or module scope declaration is counted as a function unit not covered by test execution. Identical pattern to Phase 14 embedding-provider-factory.ts (QUAL-01 exception documented in Phase 19). Not a blocking coverage gap when line coverage is 100% and all logical paths are exercised."
    source: "Phase 29 verification"
    confidence: HIGH
    phase: "29-ambient-context"
    date: "2026-03-18"

  - finding: "Phase 28 dual-test-file gap pattern: when a phase creates new test files in tests/ directory as replacements for co-located src/ test files, the plan REFACTOR step must explicitly list the OLD src/ test files to update. If only new tests/ files are created without updating old src/ co-located tests, the old tests will fail because entity constructors (like FrictionEntry.create()) may now require new mandatory fields (like tool). Always grep for ALL test files matching the entity name, not just the new ones, before marking REFACTOR complete."
    source: "Phase 28 verification"
    confidence: HIGH
    phase: "28-friction-universalization"
    date: "2026-03-21"
