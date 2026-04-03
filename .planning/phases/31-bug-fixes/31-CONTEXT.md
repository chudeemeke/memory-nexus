# Phase 31: Bug Fixes - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three user-reported bugs: Unicode search errors (#14), CLI output truncation (#15), and download progress bar showing 0/0 MB (#163). No new features, no refactoring beyond what's needed for the fix.

</domain>

<decisions>
## Implementation Decisions

### FIX-01: Unicode Search (#14)
- **D-01:** Root cause is likely in `sanitizeFtsQuery()` stripping Unicode characters during its regex operator-removal pass. The `unicode61` tokenizer handles CJK/accented chars correctly -- the problem is upstream in the sanitizer.
- **D-02:** Fix should preserve all Unicode codepoints while still stripping FTS5 operators ({}, (), ^, :, +, -, ~). Test with CJK, emoji, accented Latin, Cyrillic, and mixed scripts.

### FIX-02: CLI Truncation (#15)
- **D-03:** Use `string-width` for accurate character width measurement (handles CJK double-width, emoji, ANSI escape codes). Add as dev/runtime dependency if not already present.
- **D-04:** Apply width-aware truncation in output formatters that produce table/columnar output. Use `process.stdout.columns` (or fallback 80) for terminal width detection.

### FIX-03: Download Bar 0/0 MB (#163)
- **D-05:** The 0/0 MB issue is in the embedding model download flow. Fix by reading `content-length` header from the HTTP response and passing it to the progress bar's `total` parameter.

### Claude's Discretion
- Exact regex patterns for Unicode-safe FTS5 sanitization
- Which specific formatters need width-aware truncation (researcher should identify all affected output paths)
- Whether to use `string-width` npm package or implement a minimal version inline

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug Source Files
- `src/application/services/fts-sanitizer.ts` -- FTS5 query sanitizer (FIX-01 root cause)
- `src/application/services/fts-sanitizer.test.ts` -- existing sanitizer tests
- `src/presentation/cli/progress-reporter.ts` -- progress bar implementation (FIX-03)
- `src/presentation/cli/formatters/` -- output formatters (FIX-02, identify which need width fixes)

### Embedding Download Flow
- `src/infrastructure/embedding/transformers-js-provider.ts` -- model download with progress callback

### Issue References
- Issue #14: Unicode search
- Issue #15: CLI truncation
- Issue #163: Download bar 0/0 MB

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fts-sanitizer.ts` has comprehensive tests -- extend with Unicode test cases
- `progress-reporter.ts` already has TTY/non-TTY awareness and bar rendering
- `cli-progress` library is already a dependency

### Established Patterns
- FTS5 queries go through `sanitizeFtsQuery()` before MATCH -- single chokepoint for the fix
- Output formatters use a consistent interface -- changes should follow the existing pattern
- Test files are co-located with source files

### Integration Points
- Search commands call sanitizer via application services -- no presentation layer changes needed for FIX-01
- All query commands use formatters -- FIX-02 may touch multiple formatter files
- Embedding download is in infrastructure layer -- FIX-03 is isolated

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- standard bug fix approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 31-bug-fixes*
*Context gathered: 2026-04-03*
