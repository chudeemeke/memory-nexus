# Concerns and Risks

**Analysis Date:** 2026-01-27

## Open Questions

These questions are explicitly marked as unresolved in the documentation and must be answered during implementation.

**Path Encoding:**
- Files: `docs/02-RESEARCH.md`, `CLAUDE.md`
- Question: Exact encoding algorithm for directory names (base64-like, but not confirmed)
- Impact: Core functionality - must decode paths correctly to map sessions to projects
- Resolution approach: Inspect actual encoded paths, test decoding algorithms, document findings

**Session Format Stability:**
- Files: `docs/02-RESEARCH.md`
- Question: Does JSONL format change between Claude Code versions?
- Impact: Parser may break on updates
- Resolution approach: Version detection in parser, adapter pattern for format variations

**Session Boundaries:**
- Files: `CLAUDE.md`
- Question: How to detect session start/end in JSONL files?
- Impact: Affects message counting, session metadata extraction
- Resolution approach: Look for `session_start` metadata events, handle gracefully if missing

**Incremental Sync:**
- Files: `CLAUDE.md`
- Question: How to avoid re-processing already-synced sessions?
- Impact: Performance on large corpora
- Resolution approach: Track file mtime + byte offset in `extraction_state` table

**Conflict Resolution:**
- Files: `CLAUDE.md`
- Question: What if same session is synced from different machines?
- Impact: Data integrity if user has multiple machines
- Resolution approach: Defer until multi-machine use case is validated

**Summary Files:**
- Files: `docs/02-RESEARCH.md`
- Question: Structure of summary files and when they're generated
- Impact: May miss valuable context if summaries are not indexed
- Resolution approach: Investigate during Phase 1, add extraction if valuable

## Technical Risks

Risks explicitly identified in the implementation plan with mitigation strategies.

**JSONL Format Changes:**
- Files: `docs/05-IMPLEMENTATION.md`
- Likelihood: Low
- Impact: High
- Risk: Claude Code updates may change JSONL event structure
- Mitigation: Version detection in parser, graceful degradation for unknown event types

**Large Session Files:**
- Files: `docs/05-IMPLEMENTATION.md`, `docs/04-ARCHITECTURE.md`
- Likelihood: Medium
- Impact: Medium
- Risk: Session files can grow to 10,000+ lines, causing memory issues
- Mitigation: Streaming parser (line-by-line), chunked processing, batch inserts

**FTS5 Not Sufficient:**
- Files: `docs/05-IMPLEMENTATION.md`
- Likelihood: Low
- Impact: Medium
- Risk: Full-text search may not meet semantic search needs
- Mitigation: Deferred embeddings in Phase 4 if keyword search proves inadequate

**SQLite Concurrent Access:**
- Files: `docs/05-IMPLEMENTATION.md`
- Likelihood: Medium
- Impact: Low
- Risk: Database locks during concurrent read/write operations
- Mitigation: WAL mode enabled, read-only connections for search

**Encoded Path Decoding Fails:**
- Files: `docs/05-IMPLEMENTATION.md`
- Likelihood: Low
- Impact: High
- Risk: Cannot map sessions to projects if decoding algorithm is wrong
- Mitigation: Fallback to raw path storage, manual mapping option

**Hook Performance:**
- Files: `docs/05-IMPLEMENTATION.md`
- Likelihood: Medium
- Impact: Low
- Risk: SessionStop hook may slow Claude Code exit
- Mitigation: Background processing, async extraction, timeout handling

## Dependencies/Blockers

What must happen before memory-nexus implementation can proceed.

**WoW v8.0 Completion:**
- Files: `CLAUDE.md`, `docs/03-DECISION-JOURNEY.md`, `docs/05-IMPLEMENTATION.md`
- Blocker: Implementation explicitly deferred until WoW v8.0 is complete
- Rationale: Validate GSD-Lite methodology on WoW first, avoid delaying committed work
- Impact: Memory-nexus built with proven methodology, incorporates lessons learned

**GSD-Lite Validation:**
- Files: `CLAUDE.md`, `docs/03-DECISION-JOURNEY.md`
- Blocker: GSD-Lite methodology must be validated on real work before using it for memory-nexus
- Rationale: Avoid building with unproven process
- Impact: Memory-nexus benefits from battle-tested approach

**aidev Integration Point:**
- Files: `docs/05-IMPLEMENTATION.md`, `docs/04-ARCHITECTURE.md`
- Dependency: Memory-nexus integrates as `aidev memory` subcommand
- Rationale: Consistent with user's existing tooling
- Impact: Must understand aidev CLI registration pattern

## Deferred Decisions

Decisions explicitly postponed for future consideration.

**Vector Embeddings (Phase 4):**
- Files: `docs/05-IMPLEMENTATION.md`, `docs/04-ARCHITECTURE.md`, `CLAUDE.md`
- Decision: Semantic similarity search via embeddings
- Rationale: Not needed for MVP - FTS5 + relationships covers 80% of use cases
- When to revisit: After Phase 3, if keyword search proves inadequate
- Implementation path: OpenAI API or local embeddings, sqlite-vss extension

**Topic Clustering:**
- Files: `docs/05-IMPLEMENTATION.md`
- Decision: Automatic topic clustering and tagging
- Rationale: Phase 4 future enhancement
- When to revisit: After core search is validated

**Web UI:**
- Files: `docs/05-IMPLEMENTATION.md`
- Decision: Browser-based browsing interface
- Rationale: CLI-first approach, UI only if needed
- When to revisit: After CLI proves value

**Export Formats:**
- Files: `docs/05-IMPLEMENTATION.md`
- Decision: Export to markdown/HTML for sharing
- Rationale: Phase 4 future enhancement
- When to revisit: If sharing use case emerges

**MCP Integration:**
- Files: `docs/04-ARCHITECTURE.md`
- Decision: Expose memory-nexus as MCP server
- Rationale: Direct CLI approach chosen over MCP complexity
- When to revisit: If Claude Code adds native MCP memory support

**Multi-User/Shared Memory:**
- Files: `docs/01-VISION.md`
- Decision: Explicitly out of scope
- Rationale: Personal tool, not team collaboration
- When to revisit: If team use case emerges

**Cloud Sync/Backup:**
- Files: `docs/01-VISION.md`
- Decision: Explicitly out of scope
- Rationale: Local-only tool, user manages backup
- When to revisit: If multi-machine sync needed

## Alternative Approaches Considered

Options that were rejected with documented rationale.

**MCP-Based Approach:**
- Files: `docs/01-VISION.md`, `docs/03-DECISION-JOURNEY.md`
- Previous attempt: `~/Projects/mcp-nexus/servers/memory-nexus/`
- Rejected because:
  - Required manual memory writes (incomplete coverage)
  - MCP server complexity vs. simple file parsing
  - Only captured what Claude remembered to save
  - JSON pointer complexity
  - MCP boilerplate overhead
- Current approach: Direct JSONL extraction (automatic, complete, verbatim)

**PostgreSQL:**
- Files: `docs/05-IMPLEMENTATION.md`
- Rejected because: Requires server setup, overkill for personal tool
- Current approach: SQLite (embedded, no server)

**Elasticsearch:**
- Files: `docs/05-IMPLEMENTATION.md`
- Rejected because: Complex, resource heavy
- Current approach: FTS5 (built into SQLite, sufficient for use case)

**Plain Files + Grep:**
- Files: `docs/05-IMPLEMENTATION.md`
- Rejected because: Too slow at scale
- Current approach: SQLite + FTS5

**Vector DB (Pinecone):**
- Files: `docs/05-IMPLEMENTATION.md`
- Rejected because: External dependency, ongoing cost
- Status: Deferred to Phase 4 if semantic search needed

**session-nexus (Name):**
- Files: `docs/03-DECISION-JOURNEY.md`
- Rejected because: Technically accurate but generic
- Current approach: memory-nexus (user-centric, memorable, fits project family)

## Security Considerations

Documented security-related concerns and mitigations.

**Data Sensitivity:**
- Files: `docs/04-ARCHITECTURE.md`
- Risk: Session data may contain code snippets, file paths, API keys, credentials, personal information
- Mitigation:
  - Database stored with user-only permissions (600)
  - No network access - fully local tool
  - Optional credential scrubbing during extraction
  - Exclude sensitive directories from extraction

**Credential Patterns:**
- Files: `docs/04-ARCHITECTURE.md`
- Risk: Tool outputs may contain accidentally logged secrets
- Mitigation: Regex-based scrubbing patterns for common secret formats
- Patterns to detect: api keys, tokens, secrets, passwords, private keys

## Test Coverage Gaps

Untested areas that need attention during implementation.

**Parser Edge Cases:**
- What's not tested: Malformed JSON, truncated files, encoding issues
- Files: TBD during implementation
- Risk: Parser crashes on corrupted session files
- Priority: High - must handle gracefully

**Concurrent Access:**
- What's not tested: Multiple sync operations simultaneously
- Files: TBD during implementation
- Risk: Database corruption or deadlock
- Priority: Medium - WAL mode mitigates

**Large Dataset Performance:**
- What's not tested: 100+ sessions, search latency at scale
- Files: TBD during implementation
- Risk: Slow search, high memory usage
- Priority: High - Phase 1 success criterion

---

*Concerns audit: 2026-01-27*
