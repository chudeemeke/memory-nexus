# Phase 16: Hybrid Search and Graceful Degradation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `memory search` command with vector similarity (sqlite-vec) and hybrid ranking (Reciprocal Rank Fusion), add temporal decay to search scoring, and ensure search always works regardless of embedding state via graceful degradation to FTS5-only. This is an AI-first tool -- design decisions prioritize Claude's programmatic consumption via JSON, with human terminal use as secondary.

</domain>

<decisions>
## Implementation Decisions

### Mode Auto-Detection
- Four modes: `auto` (default), `fts`, `vector`, `hybrid`
- `auto` mode: if ANY embeddings exist, use hybrid. Otherwise FTS-only.
- No threshold -- presence of any embeddings triggers hybrid
- Mode shown in JSON metadata always; in human output only with `--verbose`
- Silent degradation in auto mode (search always returns results)
- Explicit `--mode vector` with no embeddings: error with actionable guidance ("Run 'memory sync --embed' first")
- Query embedded at search time using same provider as stored embeddings; warn on provider/model mismatch

### Search Flags (New in Phase 16)
- `--mode auto|fts|vector|hybrid` (default: auto)
- `--no-vector` shorthand for `--mode fts`
- `--no-decay` disable temporal decay for single search
- Both `--mode` and `--no-vector` supported (matches DEGRADE-04 requirement)
- CLI precedence: flags > config > defaults

### RRF Algorithm
- k=60 (standard RRF paper value), hardcoded
- 4x candidate multiplier (fetch 4x limit from each ranker), hardcoded
- Minimum score threshold to filter noise, hardcoded (tuned during development)
- Expose as config/flags only if real usage reveals defaults are insufficient
- Deduplication handled naturally by RRF (same message in both rankers gets boosted score)

### Temporal Decay (Inspired by OpenClaw)
- Enabled by default, configurable via config file
- Default half-life: 30 days (matching OpenClaw's default)
- Formula: `final_score = rrf_score * 0.5^(age_days / half_life)`
- "Evergreen" consideration: explore if certain content types should skip decay
- `--no-decay` flag for debugging
- Config: `search.temporalDecay.enabled` (bool) and `search.temporalDecay.halfLifeDays` (number)

### Result Presentation
- **JSON output (AI-primary)**: exhaustive metadata envelope
  - `meta`: query, mode, mode_reason, total_results, embedding_coverage, degraded, degradation_reason, capabilities (fts/vector/hybrid bools)
  - Per-result: rank, normalized score (0-1), raw scores (bm25, cosine, rrf), source (fts/vector/both), highlights with offset/length
- **Table output (human-secondary)**: clean, normalized 0-1 score, no per-ranker detail
  - Verbose adds per-ranker breakdown
- **Highlighting**: FTS matches get highlights, vector-only matches show text without highlights, hybrid results highlight FTS-matched terms
- **Empty state**: "No results for [query]" (FTS/hybrid), "No semantic matches for [query]" (vector)
- **Backward compatibility**: additive-only JSON schema changes (new fields, no removals/renames)

### Score Normalization
- Normalize final RRF score to 0-1 range for human display
- JSON includes both raw scores and normalized score
- Result ordering may change when hybrid activates (expected, documented)

### Partial Coverage
- RRF handles partial coverage structurally: FTS covers all messages, vector covers embedded only
- Unembedded messages are never invisible (FTS always finds them)
- Embedded messages get ranking advantage (two scoring signals)
- Coverage reported in verbose/JSON metadata, not in normal output
- One-time hint at 0% coverage: "Tip: run 'memory sync --embed' to enable semantic search" (tracked via config flag)
- `--mode vector` with partial coverage: return available results, report coverage, no warning

### Graceful Degradation
- Three degradation triggers: sqlite-vec unavailable, provider failure, no embeddings
- All degrade to FTS-only (search never fails completely)
- Recovery is automatic on next invocation (no cached degraded state)
- Degraded searches return BOTH error info AND FTS results in JSON
- Hard errors (explicit --mode vector, no embeddings) return error only
- `memory doctor` reports search capability with actionable hints per component

### Commands Inheriting Hybrid Search
- `memory context` benefits automatically via shared search infrastructure (no new flags)
- `memory related` benefits automatically (vector similarity especially good for finding related sessions)
- No new flags on context or related commands

### Error Handling
- Extend existing MemoryError/ErrorCode system with new codes: VECTOR_UNAVAILABLE, PROVIDER_TIMEOUT, PROVIDER_CONFIG_INVALID, EMBEDDING_DIMENSION_MISMATCH, MODEL_CORRUPTED
- New suggestions for each error code
- ErrorJson extended with `degraded_to` field for soft errors
- Current error framework (MemoryError + formatError + formatErrorJson) is fit for purpose -- extend, don't replace
- Logging: same patterns (console.error to stderr for CLI, no new logging framework)

### Memory Doctor Enhancements
- "Search Capability" section: FTS5 status, sqlite-vec status, embedding count/percentage, provider info, default mode, vector readiness
- "Embedding status" section: total messages, embedded count, percentage, provider name, model, dimensions
- Config validation reporting
- Exit codes: 0=OK, 1=degraded but functional, 2=broken

### Performance
- First hybrid search: ~1-3s (model load), subsequent: ~100-200ms
- FTS-only (--no-vector) stays sub-100ms
- Zero regression for existing workflows (sync without --embed, search without embeddings)
- Flat scan only (sqlite-vec has no IVF/ANN support currently; flat scan ~68ms at 100K vectors, acceptable)
- Singleton embedding provider (most impactful cache), in-process query embedding cache (minor), no result cache
- Concurrent search safe (WAL mode, read-only operations)
- Memory: ~15MB vector index for 10K messages, ~100MB during search (model loaded), freed on exit
- Failed model downloads: clean up partial files, retry on next invocation

### Configuration
- Config file: `~/.config/memory/config.json` (extending existing Phase 14 config)
- New keys: `search.defaultMode` (auto|fts|vector|hybrid), `search.temporalDecay.enabled` (bool), `search.temporalDecay.halfLifeDays` (number)
- Invalid config values: warn to stderr, use defaults (never break search)
- No environment variable overrides for search
- No per-invocation --decay-days flag (config file handles this)

### Claude's Discretion
- Exact minimum score threshold value (tuned during development/testing)
- Internal implementation of RRF fusion (algorithm structure)
- sqlite-vec query optimization details
- Provider instance lifecycle management
- JSON schema field naming conventions (following existing patterns)
- Test strategy for degradation paths
- Doctor output formatting details

</decisions>

<specifics>
## Specific Ideas

- Inspired by OpenClaw's memory architecture: temporal decay (30-day half-life), hybrid search, graceful fallback
- OpenClaw uses fixed 70/30 weights (semantic/keyword); we use RRF which is technically stronger (parameter-free, handles score distribution differences)
- OpenClaw's "search always works" principle: search never fails, only degrades
- JSON output is the AI-primary interface (Claude uses --json for structured parsing)
- Engram's progressive disclosure pattern (compact -> detail) parallels our --limit + show approach
- Tool is AI-first: designed for Claude to use via Bash tool. Human terminal use is secondary but should be clean.
- Long-term vision: memory backbone for a personal AI assistant using Anthropic Agent SDK. All Phase 16 decisions support this trajectory.

</specifics>

<deferred>
## Deferred Ideas

- **Service mode**: persistent process where embedding model stays loaded (eliminates cold start). Consider when Agent SDK integration requires low-latency, high-frequency search.
- **Intentional memory writing**: agent actively writes high-signal memories (`memory write` command). Two-tier: curated (agent-written) + extracted (auto). Consider for post-Phase 18.
- **Markdown source of truth layer**: files as source, SQLite as index (OpenClaw pattern). Assessment: probably not needed for our use case -- SQLite provides durability without two-source complexity.
- **IVF/ANN indexing**: sqlite-vec currently only supports flat scan. When ANN support ships, evaluate at 50K+ messages.
- **Search result caching**: not needed for CLI (results cheap to regenerate). Revisit for service mode.
- **Environment variable overrides**: not needed (flags + config sufficient). Revisit if CI/pipeline usage demands it.

</deferred>

---

*Phase: 16-hybrid-search*
*Context gathered: 2026-02-27*
