# Phase 15: Embedding Pipeline - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate embedding generation into the sync workflow. `memory sync --embed` extracts sessions AND generates embeddings for unembedded messages, with incremental tracking, background processing, and progress reporting. Embedding is opt-in and never affects default sync speed.

</domain>

<decisions>
## Implementation Decisions

### Sync integration
- Embedding is a second pass AFTER extraction completes (industry-standard ingest-then-embed pattern)
- Opt-in via `--embed` flag; `memory sync` without it stays fast and never loads ONNX
- `--embed` processes ALL unembedded messages (not just current sync run) -- one command catches up
- Embedding runs in a SEPARATE database transaction from sync extraction -- if embedding fails, sync data is safe

### Progress and feedback UX
- cli-progress bar with message count + ETA during embedding pass (reuse existing TtyProgressReporter pattern)
- First-run model download (23MB) gets its own SEPARATE progress indicator before the embedding bar starts
- Completion summary: "Embedded 500 messages in 32s (15.6 msg/s)" -- matches sync's existing summary style
- On failure partway through: "Embedding failed at 300/500 messages. Run memory sync --embed to resume from where it stopped." Already-embedded messages kept.

### Background embedding mode
- `memory sync --embed --background` spawns a detached child process (reuse existing spawnBackgroundSync pattern from hook-runner.ts)
- `memory status` shows background embedding progress (PID, message count)
- PID lock file in data dir prevents double-run: "Embedding already in progress (PID 12345). Use memory status to check progress."
- Background completion: silent exit, log entry written to existing sync log (no desktop notification)

### Model change and re-embedding
- On model change detection: confirmation prompt "Model changed from X to Y. Re-embed all N messages? [y/N]"
- Non-interactive mode (CI, hooks, --non-interactive): skip re-embedding with warning to stderr. `--force` flag overrides to auto-re-embed.
- Re-embedding is all-or-nothing: clear old embeddings then re-embed everything (mixed model vectors produce inconsistent search results)
- Model change detected via hash comparison: hash current config model name, compare against model_hash in embedding_state table

### Claude's Discretion
- Batch size for embedding (configurable via config, reasonable default)
- Exact embedding service architecture (application layer composition)
- How the embedding pass queries unembedded messages (SQL strategy)
- Error retry logic within a batch

</decisions>

<specifics>
## Specific Ideas

- Reuse the existing progress reporter factory (`createProgressReporter`) for embedding progress -- same TTY/non-TTY/quiet handling
- Reuse `spawnBackgroundSync()` pattern from `hook-runner.ts` for the `--background` detached process
- Follow the existing checkpoint pattern from sync service for embedding resumability
- `--force` flag is already established on sync to mean "skip safety checks" -- use it consistently for model change confirmation bypass
- EMBED-06 callback infrastructure (onProgress from Phase 14) must be wired to a cli-progress bar here -- this was explicitly deferred from Phase 14
- The log writer (`logSync()` in `log-writer.ts`) and log directory (`~/.local/share/memory/logs/`) already exist for embedding log entries

</specifics>

<deferred>
## Deferred Ideas

- Knowledge layer (agent-written memory, pre-compaction hooks, temporal decay) -- separate milestone after v2.0, PRD at docs/plans/PRD-knowledge-layer.md
- Parallel/concurrent embedding within a batch -- optimize in Phase 17 or later if needed
- Embedding-aware search commands -- Phase 16 (Hybrid Search)

</deferred>

---

*Phase: 15-embedding-pipeline*
*Context gathered: 2026-02-26*
