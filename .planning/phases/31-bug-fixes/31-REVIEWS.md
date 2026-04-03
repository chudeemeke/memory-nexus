---
phase: 31
reviewers: [gemini]
reviewed_at: 2026-04-03T14:00:00Z
plans_reviewed: [31-01-PLAN.md, 31-02-PLAN.md]
skipped_reviewers:
  claude: "Skipped (current runtime -- independence requirement)"
  codex: "Usage limit hit (resets Apr 6). Sandbox trust issue also identified and fixed."
---

# Cross-AI Plan Review -- Phase 31

## Gemini Review

### 1. Summary
The plans are technically sound, highly targeted, and demonstrate a deep understanding of the underlying issues -- particularly the nuance of Unicode handling in FTS5 and the limitations of the Transformers.js event emitter. The decision to diverge from the original user decision (D-05) regarding `content-length` in favor of an observable `maxTotal` strategy is a commendable piece of engineering judgment that prioritizes implementation reality over abstract requirements. The testing strategy is robust, with significant emphasis on edge cases (CJK, ANSI, mixed scripts).

### 2. Strengths
- **Precise Root Cause Analysis:** Identifying that the fallback regex in the FTS sanitizer was the "Unicode killer" is a surgical observation that avoids over-engineering the primary regex.
- **Pragmatic Problem Solving:** The `maxTotal` approach for the progress bar correctly addresses the "0/0 MB" issue without requiring a rewrite of the internal Transformers.js fetching logic.
- **Visual Correctness:** Moving from `.padEnd()` (character count) to `padToWidth` (visual width) is essential for a professional CLI tool handling internationalized content.
- **Comprehensive Testing:** The plan explicitly calls for specific Unicode scripts (CJK, Cyrillic, Emoji) and visual edge cases (ANSI codes), ensuring the fix isn't just "ASCII-plus."

### 3. Concerns
- **Regex Completeness (LOW):** While `\p{L}` (Letters) and `\p{N}` (Numbers) cover most search intent, some languages or technical searches might rely on symbols or marks that aren't strictly letters/numbers (e.g., combining marks or specific currency symbols).
  - *Risk:* Users searching for "C++" or "TCP/IP" might find the `+` or `/` stripped by the fallback regex if they aren't explicitly handled or if the fallback is too aggressive.
- **FTS5 Operator Collisions (MEDIUM):** The plan mentions stripping `{}` and `()`. However, FTS5 also uses `"` for phrase queries. If the sanitizer strips all non-alphanumeric characters in the fallback, it effectively disables phrase searching for Unicode-heavy queries.
- **Dependency Management (LOW):** `string-width` (v5+) is ESM-only. Since the project uses Bun/TypeScript, this is likely fine, but it's a minor check to ensure no CJS compatibility issues arise in the final bundle.
- **Terminal Width in CI (LOW):** `process.stdout.columns` is often `undefined` in CI environments or when output is piped. The fallback to `80` is correct, but the "truncate to width" logic might produce unexpected results in logs if not handled gracefully.

### 4. Suggestions
- **Sanitizer Regex Refinement:** Consider if `[^\p{L}\p{N}\s]` is too restrictive for a fallback. A "blacklist" approach (explicitly removing only known FTS5 dangerous operators) is often safer for search queries than a "whitelist" of letters/numbers. At minimum, ensure the `u` flag is applied to *all* regexes in `fts-sanitizer.ts`.
- **Phrase Query Support:** Check if double-quotes `"` should be preserved in the sanitizer to allow users to search for exact phrases (e.g., `"hello world in CJK"`).
- **Progress Bar Debounce:** When using `setTotal(maxTotal)`, if multiple files are discovered rapidly, the progress bar might "flicker" as the scale changes. Ensure the `cli-progress` instance is configured to handle dynamic total updates smoothly.
- **Performance check:** For Task 2 in Plan 31-02, if a user runs a `search` that returns 1,000+ results, calling `string-width` on every snippet could introduce a slight lag (it's fast, but not free). If performance dips, consider caching widths for common characters or limiting truncation to the first N results.

### 5. Risk Assessment: LOW
The risk is low because:
1. **Reversibility:** These are targeted bug fixes with no breaking changes to the database schema or core domain logic.
2. **Test Coverage:** The high number of planned test cases (21+ total) significantly mitigates the risk of regressions.
3. **Isolation:** The changes are confined to the presentation and application service layers.

**Verdict:** Proceed with implementation. The plans are ready for execution.

---

## Codex Review

**Unavailable:** Weekly usage limit reached (resets Apr 6th, 2026). During the attempted review, Codex was actively reading source files and reasoning about grapheme segmentation vs `\p{Emoji_Presentation}` and output-formatter truncation scope before hitting the limit.

---

## Consensus Summary

With only one reviewer completing, consensus analysis is limited. Key takeaways from Gemini:

### Agreed Strengths
- Root cause analysis is precise and avoids over-engineering
- D-05 divergence (maxTotal vs content-length) is well-justified
- Testing strategy covers real internationalization edge cases

### Top Concerns (worth considering during execution)
1. **FTS5 phrase query support (MEDIUM):** Check if double-quotes should be preserved in the sanitizer for phrase searching
2. **Regex completeness (LOW):** Consider whether blacklist (strip operators) is safer than whitelist (keep letters/numbers) for the fallback
3. **string-width ESM compatibility (LOW):** Verify no CJS issues in final bundle

### Actionable Items
- None blocking. All concerns are LOW-MEDIUM severity suggestions for the executor to consider during implementation.

---

*Review conducted: 2026-04-03*
*Reviewers: Gemini 2.5 Pro (complete), Codex gpt-5.4 high (usage limit)*
