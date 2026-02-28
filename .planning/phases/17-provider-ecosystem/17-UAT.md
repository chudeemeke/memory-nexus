---
status: complete
phase: 17-provider-ecosystem
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md]
started: 2026-02-28T17:45:00Z
updated: 2026-02-28T18:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Doctor with local provider (default)
expected: Run `memory doctor`. Embedding section shows provider: local, model: Xenova/all-MiniLM-L6-v2, dimensions: 384, and ready status.
result: pass

### 2. Doctor with OpenAI provider (no API key)
expected: Set `"provider": "openai"` in `~/.config/memory/config.json` embedding section (without setting model or dimensions). Run `memory doctor`. Should show provider: openai, model: text-embedding-3-small, dimensions: 1536, and readiness warning about API key not being set.
result: pass

### 3. Doctor with Ollama provider
expected: Set `"provider": "ollama"` in `~/.config/memory/config.json` embedding section (without setting model or dimensions). Run `memory doctor`. Should show provider: ollama, model: nomic-embed-text, dimensions: 768.
result: pass

### 4. User-explicit model overrides provider defaults
expected: Set `"provider": "openai"` AND `"model": "text-embedding-ada-002"` AND `"dimensions": 1536` in config. Run `memory doctor`. Should show model: text-embedding-ada-002 (user's explicit choice), NOT text-embedding-3-small (provider default).
result: pass

### 5. Revert to local provider
expected: Remove or reset the embedding section in config (set provider back to "local" or remove provider field entirely). Run `memory doctor`. Should show local provider defaults again (Xenova/all-MiniLM-L6-v2, 384 dimensions).
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Migration from legacy ~/.memory-nexus/ to XDG paths completes fully with no orphaned files or false warnings"
  status: failed
  reason: "Migration moves memory.db but leaves behind WAL/SHM sidecar files and subdirectories with files. getMigrationStatus() reports 'partial' when migration actually completed. Two code gaps: (1) post-move sidecar cleanup missing for source .db-shm/.db-wal, (2) subdirectories skipped when destination exists but legacy copies not cleaned up, preventing final rmdir."
  severity: major
  test: discovered-during-uat
  root_cause: "migrateFromLegacy() move list excludes .db-shm/.db-wal sidecars; directory skip logic (line 263) leaves legacy copies; final cleanup (line 326-334) only removes legacy dir if completely empty"
  artifacts:
    - path: "src/infrastructure/migration.ts"
      issue: "Move list missing WAL sidecars; no post-move source cleanup; directory skip without legacy removal"
  missing:
    - "Clean up .db-shm and .db-wal at source path after moving .db file"
    - "Remove legacy subdirectories when destination already has them (files are duplicates)"
    - "Or: reclassify getMigrationStatus() to distinguish 'complete with leftovers' from actual partial migration"
  debug_session: ""
