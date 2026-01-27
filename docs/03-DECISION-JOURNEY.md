# Memory-Nexus: Decision Journey

How we arrived at this project concept through conversation.

---

## Origin: Phase 5 Validation Discussion (2026-01-25)

### Initial Context

The user was working on **Get Stuff Done (GSD)** methodology research within the wow-system project. After extensive development of the GSD framework, they had reached **Phase 5: Validation** - the stage where GSD itself would be tested by using it to plan WoW v8.0.

This was a pivotal moment: validate the methodology before betting major work on it.

### The Problem Emerged

The user faced a practical challenge:

1. **Validation work** needed to happen in the `get-stuff-done` folder
2. **WoW v8.0 planning** would happen in the `wow-system` folder
3. **GSD completion** would return to `get-stuff-done`

The question arose: **How do you preserve context across project switches?**

Claude Code sessions are tied to the Current Working Directory (CWD). Switching directories means starting fresh. The user wondered if there was a way to maintain continuity.

### Research Conducted

We investigated Claude Code's built-in capabilities:

| Feature Investigated | Finding |
|---------------------|---------|
| Additional working directories | Grants file access only, NOT context persistence |
| CLAUDE.md from additional dirs | NOT auto-loaded (must manually read) |
| Session file location | `~/.claude/projects/<encoded-dir>/*.jsonl` |
| Session retention | 30 days default, then deleted |
| Cross-project resume | NOT supported by Claude Code |

The research revealed a fundamental limitation: **sessions are isolated silos** that cannot share context with each other.

### The Insight

Rather than accept the limitation or work around it manually, the user had a realization:

> "Instead of working around this limitation... why not build a tool to SOLVE it fundamentally?"

The core idea:
- **Extract** all session JSONL files into a structured database
- **Index** the content for full-text search
- **Access** context from any project, at any time
- **Persist** beyond the 30-day deletion window

This transforms Claude Code sessions from ephemeral, isolated logs into a **persistent, searchable knowledge base**.

### Naming Discussion

Several names were considered:

| Name | Assessment |
|------|------------|
| `session-nexus` | Technically accurate but generic |
| `memory-nexus` | User-centric, memorable, fits the MCP-Nexus project family |

During discussion, we discovered that `memory-nexus` already existed as a directory at `~/Projects/mcp-nexus/servers/memory-nexus/` - an earlier abandoned MCP server attempt.

**Decision:** Reuse the name with a new standalone approach. The MCP version's problems (JSON pointer complexity, MCP boilerplate) don't apply to a direct CLI tool.

### The Defer Decision

The user was excited about the concept but recognized a critical risk: **scope creep**.

They were supposed to be validating GSD for WoW v8.0, not starting a new project. Building Memory-Nexus now would:
- Delay WoW v8.0 (which wow-system users are waiting for)
- Skip the very validation step GSD methodology prescribes
- Potentially build it poorly without battle-tested process

**Decision:** Document thoroughly now, build AFTER WoW v8.0

**Reasoning:**
1. Complete WoW v8.0 using GSD (validates the methodology)
2. Build Memory-Nexus using validated GSD (benefits from lessons learned)
3. This documentation ensures nothing is lost in the interim

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage format | SQLite + FTS5 | Full-text search built-in, no server required, portable single file |
| Trigger mechanism | Claude Code hook + aidev manual | Automatic capture on session end + manual fallback for control |
| Scope boundary | MVP first, iterate | Avoid over-engineering; start with extraction + search, add features as needed |
| Timing | After WoW v8.0 | Validate GSD methodology first, avoid delaying committed work |
| Name | memory-nexus | User-centric (remembers conversations), fits existing project family |

---

## The Conversation Pattern

This project emerged from a specific conversation pattern worth noting:

1. **Practical friction** - User encountered real workflow limitation
2. **Investigation** - Researched existing capabilities thoroughly
3. **Gap identification** - Found no solution exists
4. **Solution ideation** - Proposed building what's missing
5. **Scope discipline** - Deferred building to appropriate time
6. **Documentation** - Captured everything to preserve the insight

This is the GSD methodology in action: recognize problems, research thoroughly, scope carefully, execute at the right time.

---

## For Future Claude Instances

When this project is built, you'll have this context:

- **Why it exists:** Cross-project context persistence isn't supported
- **What triggered it:** Real workflow pain during multi-project work
- **How it should work:** Extract JSONL -> SQLite with FTS5 -> Query via aidev
- **What to avoid:** Over-engineering, MCP complexity, scope creep
- **What to embrace:** Simple extraction, full-text search, hook automation

The user values **simple tools that solve real problems**. Memory-Nexus should embody that philosophy.
