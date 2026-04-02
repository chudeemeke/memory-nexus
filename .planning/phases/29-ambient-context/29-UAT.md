---
status: complete
phase: 29-ambient-context
source: 29-01-SUMMARY.md, 29-02-SUMMARY.md
started: 2026-04-02T12:00:00Z
updated: 2026-04-02T12:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Sync generates context.md
expected: Running `memory sync` generates a context.md file for the current project with AI-formatted context derived from session data.
result: blocked
blocked_by: release-build
reason: "Installed global binary is memory-nexus@0.1.2 (pre-rename). Ambient context feature exists only in v2.0.0 source, which has not been published. Need to publish @chude/memory@2.0.0 and install globally."

### 2. MEMORY.md marker-based merge
expected: After `memory sync`, the project's MEMORY.md contains a block between `<!-- memory-cli:start -->` and `<!-- memory-cli:end -->` markers with a summary (decision/learnings/friction counts, last synced date). Content outside the markers is preserved untouched.
result: blocked
blocked_by: release-build
reason: "Same as test 1 -- requires published v2.0.0"

### 3. Marker merge preserves user content
expected: If MEMORY.md already has user-written content above or below the marker block, running sync again preserves that content and only replaces the content between markers.
result: blocked
blocked_by: release-build
reason: "Same as test 1 -- requires published v2.0.0"

### 4. Ambient context config exists
expected: The config at `~/.config/memory/config.json` (or equivalent) includes an `ambientContext` section with `enabled: true` and `budget: 800` as defaults. Running `memory sync` with default config triggers ambient context generation.
result: blocked
blocked_by: release-build
reason: "Same as test 1 -- requires published v2.0.0. Config defaults exist in source but loadConfig from old binary won't produce them."

### 5. Non-fatal error handling
expected: If ambient context generation encounters an error (e.g., SmartContextService fails, project not found), sync completes successfully. The error is logged to stderr but does not prevent session extraction or other sync operations.
result: blocked
blocked_by: release-build
reason: "Same as test 1 -- requires published v2.0.0"

### 6. Disable ambient context via config
expected: Setting `ambientContext.enabled: false` in `~/.config/memory/config.json` causes sync to skip context.md generation and MEMORY.md update entirely. No error is shown -- it silently skips.
result: blocked
blocked_by: release-build
reason: "Same as test 1 -- requires published v2.0.0"

## Summary

total: 6
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 6

## Gaps

[none -- all tests blocked by unpublished release, not code issues]
