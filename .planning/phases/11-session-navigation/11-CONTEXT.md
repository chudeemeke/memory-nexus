# Phase 11: Session Navigation - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Detailed session viewing and in-list search capabilities. Implements `aidev memory show <session-id>` command, interactive session picker with search, tool use tracking, file modification tracking, and entity extraction via Claude Code hooks.

</domain>

<decisions>
## Implementation Decisions

### Show Command Output
- **Structure:** Conversation thread format (messages in order: user -> assistant -> user)
- **Tool uses:** Inline markers showing tool name + brief result (e.g., `[Read: file.ts -> 45 lines]`)
- **Message content:** Full content displayed, no truncation
- **Header metadata:** Standard — session ID, project, date range, duration, message count, tool count
- **Full tool details:** Separate command `aidev memory show <session> --tools` for complete inputs/outputs

### Entity Extraction
- **Entity types:** Core four — technical concepts, file paths, decisions, key terms
- **Extraction method:** Hybrid approach — pattern-based for artifacts, LLM for concepts/decisions
- **LLM timing:** During SessionStop hook (uses existing Claude session tokens, no separate API cost)
- **Hook handoff:** Write entities to JSON temp file, sync reads and imports
- **Re-extraction trigger:** Only on new content (extract once per session)
- **Entity storage:** Graph structure — entities linked to sessions AND to each other
- **Cross-project linking:** Yes — shared concepts automatically link sessions across projects
- **Confidence scores:** Yes — 0-1 scores for weighting search results and filtering low-quality extractions

### Decision Format
- **Storage:** Both structured triples AND natural language rationale
- **Structure:** `{ subject, decision, rejected[], rationale, confidence }`
- **Purpose:** Structured for queries, natural language for Claude context

### Tool Use Tracking
- **File modification source:** Extract from Write, Edit, NotebookEdit tool calls
- **Change detail:** Key changes described semantically (e.g., "Added Session entity, removed legacy export")
- **Change summarization:** Part of LLM extraction during SessionStop hook

### Interactive Session Picker
- **Search mode:** Interactive picker with live search filtering (fzf-style)
- **Searchable fields:** Metadata + session summary (not full content)
- **Selection action:** Action menu with options: Show / Search within / Context / Related
- **Multi-select:** No — single selection only for simpler UX

### Claude's Discretion
- Interactive picker library choice (inquirer, prompts, etc.)
- Exact inline marker formatting
- Temp file location and cleanup strategy
- Entity graph schema details

</decisions>

<specifics>
## Specific Ideas

- **OpenClaw-inspired patterns:** Memory stored in searchable index, hybrid vector + keyword search, async background processing for heavy operations
- **Claude Code framework integration:** LLM extraction uses existing session context (no separate API costs) via SessionStop hook
- **"Continuous learning and easy recall"** — Entity extraction designed for both human and AI agent consumption

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-session-navigation*
*Context gathered: 2026-01-31*
