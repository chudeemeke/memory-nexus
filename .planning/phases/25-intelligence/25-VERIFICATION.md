---
phase: 25-intelligence
verified: 2026-03-10T12:00:00Z
status: gaps_found
score: 3/4 must-haves verified
re_verification: false
gaps:
  - truth: "Search results weighted by recency (30-day half-life); curated files exempt from decay"
    status: partial
    reason: "The implementation is correct but the test verifying vector-only decay is structurally flawed and fails non-deterministically. 'vector-only mode applies temporal decay' passes in isolation but fails ~2/3 of the time in the full suite because both random embeddings produce near-zero cosine similarity scores with a random query embedding, making post-decay sort order indeterminate."
    artifacts:
      - path: "src/infrastructure/database/services/hybrid-search-service.test.ts"
        issue: "Test at line 1103 uses random Float32Array embeddings for both msg-old and msg-new. When cosine distances are approximately equal (both ~0 similarity), multiplying by decay factor gives 0 * factor = 0 for both, making sort non-deterministic. Isolation run passes; full-suite run fails ~2/3 of the time."
    missing:
      - "Refactor the vector-only decay test to use controlled embeddings or to insert the new message with a significantly higher explicit similarity score. One approach: embed the query text in both messages (identical strings ensure high cosine similarity for the newer message when the query embedding matches), or use spy on vectorKnnSearch to return controlled scores."
human_verification:
  - test: "Run memory context kanbanflow --format ai --budget 1500 against a populated database"
    expected: "Returns a structured briefing with section headers (## Project context, ### Active Decisions, etc.) within the 1500-token budget. Sections truncated with [truncated] markers if over budget."
    why_human: "SmartContextService requires actual memory files in the DB. No test data for kanbanflow exists in the test environment. End-to-end CLI integration can only be verified with real data."
  - test: "Run memory search 'authentication' --format ai and compare with memory search 'authentication'"
    expected: "The --format ai output contains no ANSI escape sequences (no \\x1b[ sequences). Content is identical but decoration stripped."
    why_human: "Automated tests use mocked formatters; real terminal output with actual DB data should be verified."
  - test: "Run memory context someproject --cross-project after tagging a learning entry with 'Applies to: cross-project'"
    expected: "Cross-Project Learnings section appears with the tagged content from other projects."
    why_human: "Requires real memory file state with cross-project tagged content."
---

# Phase 25: Intelligence Verification Report

**Phase Goal:** Rewrite smart context to produce structured briefings from memory files, add temporal decay to search, implement AI-first output mode, and enable cross-project intelligence.
**Verified:** 2026-03-10T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `memory context kanbanflow --format ai --budget 1500` returns structured briefing within token budget | ? UNCERTAIN | SmartContextService, SqliteProjectResolver, AiContextFormatter, budget/cross-project flags all wired correctly. Integration requires real DB data -- flagged for human verification. |
| 2 | Search results weighted by recency (30-day half-life); curated files exempt from decay | PARTIAL | `applyDecayToResults` in HybridSearchService.ts:272 correctly implements pipeline-exit decay for all modes. FTS and hybrid decay tests pass (39/40). The vector-only decay test is structurally flawed and fails non-deterministically (~2/3 full-suite runs). Core logic is correct but test coverage is insufficient. |
| 3 | `--format ai` available on all commands, outputs token-efficient text | VERIFIED | `--format ai` wired in context.ts, search.ts, list.ts, show.ts, stats.ts, friction.ts, related.ts. All 222 tests in those 6 non-context command files pass. 49 context-formatter tests pass. `formatForAi()` pipe pattern confirmed in each command. |
| 4 | Learnings tagged "Applies to: cross-project" surfaced in `memory context --cross-project` | VERIFIED | `findCrossProjectLearnings()` defined in IMemoryFileRepository port (repositories.ts:539), implemented in SqliteMemoryFileRepository.ts:127 using SQL LIKE. SmartContextService queries this method when `crossProject: true` (smart-context-service.ts:211). Context command wires `--cross-project` flag (context.ts:93, :198). 7 repository tests and 29 SmartContextService tests pass. |

**Score:** 2/4 truths fully verified (3/4 partially -- SC-2 partial due to flaky test, SC-1 needs human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/presentation/cli/formatters/ai-formatter.ts` | stripAnsi, estimateTokens, formatForAi utilities | VERIFIED | 60 lines, 3 exported functions, 100% coverage |
| `src/presentation/cli/formatters/ai-formatter.test.ts` | 16 tests | VERIFIED | 16 pass, 0 fail, 100% coverage |
| `src/application/services/temporal-decay.ts` | CURATED_FILE_TYPES, applyTemporalDecayWithExemptions | VERIFIED | Both exported, 100% coverage |
| `src/application/services/budget-allocator.ts` | allocateBudget pure function | VERIFIED | 134 lines, full interface exports, 100% coverage |
| `src/application/services/budget-allocator.test.ts` | 19 tests | VERIFIED | 19 pass, 0 fail, 100% coverage |
| `src/application/services/smart-context-service.ts` | SmartContextService, 7-section assembly | VERIFIED | 358 lines, full interface exports, 100% coverage |
| `src/application/services/smart-context-service.test.ts` | 29 tests | VERIFIED | 29 pass, 0 fail |
| `src/domain/ports/repositories.ts` | findCrossProjectLearnings in IMemoryFileRepository | VERIFIED | Method at line 539 with full JSDoc |
| `src/infrastructure/database/repositories/memory-file-repository.ts` | findCrossProjectLearnings implementation | VERIFIED | Lines 127-155, SQL LIKE with excludeProject |
| `src/infrastructure/database/services/hybrid-search-service.ts` | applyDecayToResults, pipeline-exit decay | VERIFIED | Lines 272-311, called at line 190 for all modes |
| `src/infrastructure/database/services/hybrid-search-service.test.ts` | 5 new uniform decay tests | PARTIAL | 39/40 pass. Test "vector-only mode applies temporal decay" flaky. |
| `src/infrastructure/database/services/context-service.ts` | SqliteProjectResolver class | VERIFIED | Lines 255-335, resolveProjectEncoded and resolveProjectName |
| `src/presentation/cli/formatters/context-formatter.ts` | AiContextFormatter, "ai" ContextOutputMode | VERIFIED | Line 17 type union includes "ai"; AiContextFormatter at line 357 |
| `src/presentation/cli/commands/context.ts` | --budget, --cross-project, --format ai flags | VERIFIED | All flags at lines 72-93; SmartContextService wired at lines 178-199 |
| `src/presentation/cli/commands/search.ts` | --format ai option, formatForAi pipe | VERIFIED | Lines 149 (option), 336 (pipe) |
| `src/presentation/cli/commands/list.ts` | --format ai option, formatForAi pipe | VERIFIED | Lines 80, 189 |
| `src/presentation/cli/commands/show.ts` | --format ai option, formatForAi pipe | VERIFIED | Lines 74, 187 |
| `src/presentation/cli/commands/stats.ts` | --format ai option, formatForAi pipe | VERIFIED | Lines 59, 144 |
| `src/presentation/cli/commands/friction.ts` | --format on parent command, formatForAi in dashboard | VERIFIED | Lines 97, 469 |
| `src/presentation/cli/commands/related.ts` | --format ai option, formatForAi pipe | VERIFIED | Lines 85, 215 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| context.ts | SmartContextService | direct instantiation | WIRED | Lines 178-199: SmartContextService constructed with SqliteProjectResolver, SqliteMemoryFileRepository, SqliteFrictionRepository |
| context.ts | AiContextFormatter | createContextFormatter("ai") | WIRED | Line 223: `formatter.formatSmartContext(result)` called when format=ai |
| SmartContextService | IMemoryFileRepository | constructor injection | WIRED | smart-context-service.ts:21 imports port; context.ts:23 passes concrete adapter |
| SmartContextService | IFrictionRepository | constructor injection | WIRED | Lines 182-195 in context.ts |
| SmartContextService | findCrossProjectLearnings | crossProject option | WIRED | smart-context-service.ts:211: `this.memoryFileRepo.findCrossProjectLearnings(projectEncoded)` |
| SmartContextService | allocateBudget | direct import | WIRED | smart-context-service.ts:24 imports; called at line 335 |
| HybridSearchService.search() | applyDecayToResults | pipeline exit | WIRED | Line 190: called after all mode branches |
| search/list/show/stats/friction/related commands | formatForAi | conditional pipe | WIRED | Each command imports formatForAi from ai-formatter.ts and applies when format==="ai" |
| SqliteProjectResolver | IProjectResolver port | implements | WIRED | context-service.ts:255 declares `implements IProjectResolver` |
| application services barrel | allocateBudget, SmartContextService, IProjectResolver | re-export | WIRED | index.ts lines 99, 106, 111 |
| formatters barrel | stripAnsi, estimateTokens, formatForAi | re-export | WIRED | index.ts lines 84-86 |
| infrastructure barrel | SqliteProjectResolver | re-export | WIRED | services/index.ts:13, database/index.ts:66 |

### Requirements Coverage

No requirement IDs specified for Phase 25 (plans declare `requirements: []`). Phase 25 is delivered against ROADMAP.md success criteria rather than REQUIREMENTS.md IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| hybrid-search-service.test.ts | 1103-1140 | Non-deterministic test using random embeddings for decay ordering assertion | Warning | Test passes ~1/3 of full-suite runs; fails ~2/3. Decay implementation is correct but test cannot reliably verify it. |

No placeholder implementations, TODO comments, or stub returns found in any Phase 25 source files.

### Architecture Boundary Verification

SmartContextService imports only from:
- `../../domain/ports/repositories.js` (IMemoryFileRepository, IFrictionRepository)
- `../../domain/entities/memory-file.js` (MemoryFile)
- `../../domain/entities/friction-entry.js` (FrictionEntry)
- `./budget-allocator.js` (same application layer)

Zero imports from infrastructure or presentation layers. Hexagonal boundary maintained.

### Human Verification Required

#### 1. End-to-End Context Briefing

**Test:** Run `memory context kanbanflow --format ai --budget 1500` against a database that has been synced with memory files.
**Expected:** A structured markdown briefing with section headers (## kanbanflow context, ### Active Decisions, etc.) that fits within approximately 1500 tokens. If memory files exist for the project, sections appear populated. If budget is tight, lower-priority sections show `[truncated]`.
**Why human:** SmartContextService requires real memory files in the database. Test suite uses mocked repositories.

#### 2. ANSI Stripping in Real Terminal Output

**Test:** Run `memory search authentication --format ai` and compare output with `memory search authentication`.
**Expected:** The `--format ai` output contains no `\x1b[` sequences, no colored text, no box-drawing characters. Content (session IDs, snippets, timestamps) is preserved.
**Why human:** Automated tests verify the formatter logic in isolation; real terminal with actual DB data exercises the full output path.

#### 3. Cross-Project Learning Discovery

**Test:** Tag at least one learning in a project's LEARNINGS.md with "Applies to: cross-project", run `memory sync`, then run `memory context anotherproject --cross-project`.
**Expected:** The Cross-Project Learnings section appears in the context output with the tagged content.
**Why human:** Requires real database state with cross-project tagged memory files.

### Gaps Summary

One gap blocking full verification: the test `HybridSearchService > uniform temporal decay > vector-only mode applies temporal decay` is structurally flawed. It uses random `Float32Array` embeddings for both the stored messages and the query. When both cosine distances are near-maximum (both vectors approximately orthogonal to query), the raw score is near 0 for both. Since `decayedScore = score * decayFactor` and `score ≈ 0`, the decay multiplication does not differentiate the results. The sort order becomes non-deterministic.

The decay implementation itself is correct -- verified by:
1. The FTS-only decay test (line 1002) passes deterministically.
2. The hybrid decay regression test (line 1142) passes.
3. Code inspection confirms `applyDecayToResults` is called at line 190 for all modes.
4. The test passes when run in isolation (different random seed correlation).

The fix requires controlled embeddings in the test: either spy on `vectorKnnSearch` to return deterministic distances, or construct the stored embeddings such that one clearly matches the query text better than the other.

---

_Verified: 2026-03-10T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
