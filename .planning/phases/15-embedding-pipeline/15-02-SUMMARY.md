---
phase: 15
plan: 02
title: Sync command --embed integration with progress and model change handling
subsystem: presentation/cli
tags: [embedding, sync, progress, model-change, cli]
dependency-graph:
  requires: [15-01]
  provides: [sync-embed-flag, embedding-progress, model-change-handling]
  affects: [sync-command, progress-reporter]
tech-stack:
  added: []
  patterns: [dynamic-import, dependency-injection-for-testing, model-change-detection]
key-files:
  created: []
  modified:
    - src/presentation/cli/progress-reporter.ts
    - src/presentation/cli/progress-reporter.test.ts
    - src/presentation/cli/commands/sync.ts
    - src/presentation/cli/commands/sync.test.ts
    - src/presentation/cli/commands/sync.integration.test.ts
key-decisions:
  - Exported runEmbeddingPass and handleModelChange for direct unit testing via DI
  - EmbeddingPassDeps interface allows factory/config/repo overrides without mock.module
  - Dynamic import() for all embedding modules ensures zero ONNX overhead without --embed
  - Interactive readline prompt only in TTY mode; non-TTY skips with warning
  - Math.max(1, ...) on seconds display prevents "0s" for fast operations
patterns-established:
  - Dynamic import for optional heavy dependencies (ONNX runtime)
  - DI overrides pattern for testing async orchestration functions
  - Separate progress reporter interfaces per use case (sync vs embedding)
requirements-completed:
  - PIPE-01
metrics:
  duration: 7min
  completed: 2026-02-26T03:41:58Z
---

# Phase 15 Plan 02: Sync Command --embed Integration Summary

Wired EmbeddingService into sync command via --embed flag with dedicated embedding progress bar, model download indicator, model change detection with human-readable names, and error isolation preserving sync data.

## Accomplishments

- Added --embed and --background options to sync command
- EmbeddingProgressReporter interface with TTY/Plain/Quiet implementations
- Model download progress handler for first-run setup
- createEmbeddingProgressReporter factory with environment detection
- runEmbeddingPass orchestrates: config -> factory -> provider -> model check -> initialize -> embed
- handleModelChange prompts with human-readable model names, auto-confirms with --force, skips in non-interactive
- Error isolation: embedding failure does not lose extracted sync data
- Dynamic import ensures zero ONNX overhead when --embed not specified
- Integration test verifies --embed in CLI help output

## Task Commits

| Task | Name | Commits | Key Changes |
|------|------|---------|-------------|
| 15-02-A | Embedding progress reporter (TDD) | cde443b (RED), cdc3f45 (GREEN) | EmbeddingProgressReporter interface + 3 implementations + factory + model download handler |
| 15-02-B | Sync --embed flag orchestration (TDD) | 2e34cb1 (RED), defa381 (GREEN) | --embed/--background options, runEmbeddingPass, handleModelChange, error isolation |

## Files Created/Modified

### Modified
- `src/presentation/cli/progress-reporter.ts` -- Added EmbeddingProgressReporter, model download handler
- `src/presentation/cli/progress-reporter.test.ts` -- 18 new tests for embedding reporters
- `src/presentation/cli/commands/sync.ts` -- --embed/--background options, runEmbeddingPass, handleModelChange
- `src/presentation/cli/commands/sync.test.ts` -- 17 new tests for embed flag and model change
- `src/presentation/cli/commands/sync.integration.test.ts` -- Verify --embed in help output

## Decisions Made

1. **DI overrides for testing**: runEmbeddingPass accepts EmbeddingPassDeps with optional factory/config/repositoryOverride instead of using mock.module for dynamic imports. This avoids bun's mock.module caching issues while keeping tests fast and deterministic.

2. **Separate EmbeddingProgressReporter interface**: Rather than modifying the existing ProgressReporter (which takes sessionId), created a new interface with simpler update(current) signature. This follows ISP and avoids breaking existing sync progress reporting.

3. **Dynamic import for lazy loading**: All embedding modules loaded via import() inside runEmbeddingPass. The sync command without --embed never touches ONNX runtime, satisfying the zero-overhead requirement.

4. **handleModelChange uses human-readable names**: ModelState.storedModelName and currentModelName displayed in prompts. Falls back to storedHash only for legacy data without model_name column.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Pre-existing EBUSY flaky test in export.test.ts on Windows continues to fail consistently. Not related to this plan's changes.

## Next Phase Readiness

Plan 15-02 provides the --embed flag that Plan 15-03 (background embedding) will extend with --background handling. All infrastructure is in place:
- runEmbeddingPass is a clean orchestration function ready for background variant
- EmbeddingProgressReporter supports quiet mode needed for background operation
- handleModelChange already handles non-interactive mode

## Self-Check: PASSED

All 5 files exist. All 4 commits verified in git log.
