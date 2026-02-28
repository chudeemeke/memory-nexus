# TO-DOS

## Cross-cutting issues (2026-02-28)

- **Progress bar renders garbled Unicode on Windows** — Problem: `cli-progress` bar shows `ââââââ` instead of `█░` block characters when running from bundled `dist/` on Windows (MINGW/Git Bash). Root cause: code page mismatch — terminal interprets 3-byte UTF-8 as Latin-1. Files: `src/presentation/cli/progress-reporter.ts` (lines 55-56, 191-192, 286-287). Solution: either use ASCII-safe fallback chars (`#`/`-`) when Unicode support is absent, or set output encoding explicitly.

- **ONNX native binary resolution fails in bundled dist** — Problem: `memory sync --embed` errors with `Cannot find module '../bin/napi-v3/win32/x64/onnxruntime_binding.node'` when running from `dist/`. The WASM fallback doesn't catch it because the error occurs during `import("@huggingface/transformers")` (line 45 of `transformers-js-provider.ts`) which is OUTSIDE the try/catch wrapping `pipeline()` (line 63). Files: `src/infrastructure/embedding/transformers-js-provider.ts`. Solution: wrap the dynamic import in its own try/catch, or restructure so ONNX resolution errors are caught before pipeline creation.

- **Migration cleanup leaves orphaned files causing false "partial migration" warning** — Problem: `migrateFromLegacy()` moves `memory.db` but leaves WAL/SHM sidecar files (`.db-shm`, `.db-wal`) and skipped subdirectories. `getMigrationStatus()` reports "partial" when migration actually completed. Files: `src/infrastructure/migration.ts`. Solution: clean up source sidecars after moving `.db`; remove legacy subdirs when destination already has them; or reclassify status when main DB is already at XDG path.
