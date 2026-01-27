# Memory-Nexus: Vision Document

## Executive Summary

Memory-Nexus addresses a fundamental limitation in Claude Code's session management: **cross-project context is lost**. This document defines the problem space, articulates the vision, and explains why solving this matters for professional development workflows.

---

## The Problem

### Current Session Architecture

Claude Code stores conversation sessions in a per-directory structure:

```
~/.claude/projects/<encoded-dir>/*.jsonl
```

Where `<encoded-dir>` is a base64-encoded representation of the project path. For example:
- `~/Projects/wow-system/` sessions are stored separately from
- `~/Projects/get-stuff-done/` sessions

### Key Limitations

#### 1. Per-Directory Isolation
Sessions are fundamentally tied to the directory where Claude Code was invoked. There is no mechanism to:
- Query sessions from another project
- Resume a conversation started in a different directory
- Share context between related projects

#### 2. 30-Day Retention
By default, Claude Code deletes session files after 30 days. This means:
- Historical context is permanently lost
- Valuable architectural decisions and rationale disappear
- Debugging history becomes unavailable
- Learning from past conversations is impossible

#### 3. No Cross-Project Resume
When you switch to a different project directory:
- Previous project's context is completely unavailable
- You cannot "bring" context from one project to another
- Each project starts with zero historical knowledge

#### 4. "Additional Working Directories" Misconception
Claude Code's settings allow specifying additional working directories:
```json
{
  "permissions": {
    "additionalDirectories": ["/path/to/other/project"]
  }
}
```

**Critical Clarification**: This setting grants FILE ACCESS to those directories, NOT context persistence. The additional directories feature:
- Allows Claude to read/write files in other locations
- Does NOT make session history from those directories available
- Does NOT enable cross-project context sharing
- Is purely a filesystem permission, not a memory feature

### Real-World Impact

Consider a typical multi-project workflow:

```
Day 1 in ~/Projects/wow-system:
  "Let's redesign the handler architecture using the Strategy pattern"
  [Detailed discussion of patterns, trade-offs, implementation plan]

Day 2 in ~/Projects/get-stuff-done:
  "I want to use similar patterns here"
  Claude: "I don't have context about what patterns you're referring to"
  [Must re-explain everything from scratch]
```

The context boundary is absolute. Even if the projects are closely related (both by the same developer, using similar patterns, potentially sharing code), Claude Code treats them as completely separate worlds.

---

## The Vision

### Core Concept

Memory-Nexus extracts ALL Claude Code session JSONL files into a **centralized SQLite database** with full-text search capabilities, accessible from ANY project.

```
                     CURRENT STATE

~/Projects/wow-system/          ~/Projects/get-stuff-done/
        |                                |
        v                                v
~/.claude/projects/abc123/      ~/.claude/projects/def456/
    session1.jsonl                  session1.jsonl
    session2.jsonl                  session2.jsonl
        |                                |
        X [ISOLATED] X-----------------X [ISOLATED] X


                     MEMORY-NEXUS VISION

~/Projects/wow-system/          ~/Projects/get-stuff-done/
        |                                |
        +----------------+---------------+
                         |
                         v
              ~/.memory-nexus/memory.db
                         |
                   [UNIFIED INDEX]
                         |
                FTS5 Full-Text Search
                         |
        +----------------+---------------+
        |                                |
        v                                v
  Search from ANY project         Query ANY conversation
```

### Key Capabilities

#### 1. Centralized Storage
All sessions from all projects in one SQLite database:
- Permanent archive (no automatic deletion)
- User-controlled retention
- Single query point for all history

#### 2. Full-Text Search (FTS5)
SQLite's FTS5 extension enables:
- Natural language queries across all conversations
- Relevance-ranked results
- Fast performance even with large corpus

Example queries:
```sql
-- Find all discussions about "Strategy pattern"
SELECT * FROM sessions_fts WHERE content MATCH 'Strategy pattern';

-- Find context about a specific file
SELECT * FROM sessions_fts WHERE content MATCH 'handler-router.sh';

-- Find discussions in a specific project
SELECT * FROM sessions WHERE project LIKE '%wow-system%'
  AND content MATCH 'architecture';
```

#### 3. Cross-Project Access
From ANY project, query conversations from ANY other project:
```bash
# While working in get-stuff-done, recall wow-system context
aidev memory search "Strategy pattern handler design"

# Results show conversations from wow-system
# Can provide this context to current Claude session
```

#### 4. Automatic Sync
Two sync mechanisms:
- **Hook-triggered**: When Claude Code sessions update, sync to database
- **Manual**: `aidev memory sync` command for explicit synchronization

#### 5. Selective Recall
Query specific types of information:
- Architectural decisions
- Code patterns
- Bug resolutions
- Implementation discussions

---

## Why This Matters

### The Multi-Project Developer Workflow

Professional developers rarely work on a single project in isolation. The user's actual workflow involves:

| Project | Purpose | Relationship |
|---------|---------|--------------|
| wow-system | Claude Code behavior framework | Core infrastructure |
| get-stuff-done | Productivity methodology | Uses wow-system concepts |
| ai-dev-environment | CLI tooling | Integrates with wow-system |
| mcp-nexus | MCP server collection | Extends Claude capabilities |

These projects are interconnected:
- Patterns discovered in wow-system apply to get-stuff-done
- CLI conventions from ai-dev-environment inform all projects
- Architectural decisions propagate across the ecosystem

**Without Memory-Nexus**: Each project is a context island. Knowledge doesn't transfer.

**With Memory-Nexus**: Context flows between projects. Learning compounds.

### The Compounding Context Problem

As projects age and conversations accumulate:

```
Month 1:  50 sessions across 4 projects
Month 3:  150 sessions (100 deleted due to 30-day limit)
Month 6:  300 sessions started, only ~50 retained

Lost: Architectural rationale, debugging insights, design evolution
```

Memory-Nexus preserves everything. Six months of context remains queryable.

### The Re-Explanation Tax

Every time context is lost, the user pays a "re-explanation tax":
- Time spent re-describing background
- Risk of inconsistent explanations
- Cognitive load of remembering what was previously discussed
- Potential for different decisions due to incomplete context

Memory-Nexus eliminates this tax by making historical context instantly accessible.

---

## Related Prior Work

### Former MCP Attempt: mcp-nexus/servers/memory-nexus

An earlier attempt to solve this problem exists at:
```
~/Projects/mcp-nexus/servers/memory-nexus/
```

That approach used the Model Context Protocol (MCP) to:
- Expose memory storage as MCP tools
- Allow Claude to write/read memories via MCP protocol
- Create a separate memory layer alongside Claude Code

**Why the new approach is better:**

| Aspect | MCP Approach | Direct Extraction |
|--------|-------------|-------------------|
| Data source | Manual memory writes | Actual session history |
| Completeness | Only what Claude remembers to save | Everything automatically |
| Accuracy | Summarized/interpreted | Verbatim conversation |
| Implementation | MCP server complexity | Simple file parsing |
| Dependency | Requires MCP protocol | Standard file I/O |

The key insight: **Claude Code JSONL files already exist**. They contain the complete conversation history. We don't need Claude to write memories; we need to extract what's already there.

### Technical Foundation

The JSONL session files were not always accessible. The approach became viable when:
1. Claude Code started persisting sessions to disk
2. The file format was documented/discoverable
3. The location pattern became stable

Now that these files exist and are accessible, direct extraction is both possible and significantly simpler than the MCP-based approach.

---

## Success Criteria

Memory-Nexus will be considered successful when:

1. **Coverage**: All JSONL session files are indexed
2. **Searchability**: Full-text queries return relevant results in <100ms
3. **Permanence**: No automatic deletion; user-controlled retention
4. **Accessibility**: Queryable from any project directory
5. **Freshness**: Automatic sync keeps database current
6. **Usability**: Simple CLI interface (`aidev memory search`)

---

## Scope Boundaries

### In Scope
- JSONL session extraction and parsing
- SQLite database with FTS5
- CLI query interface
- Automatic sync via hooks
- Manual sync command

### Out of Scope (For Now)
- Semantic/vector search (future enhancement)
- Claude Code integration (reading results back into context)
- Multi-user/shared memory
- Cloud sync/backup
- Memory editing/annotation

---

## Next Steps

This vision document establishes the "why" and "what". Subsequent documents cover:

- **02-RESEARCH.md**: Technical investigation of JSONL format, SQLite FTS5, existing tools
- **03-DECISION-JOURNEY.md**: How we arrived at this approach, alternatives considered
- **04-ARCHITECTURE.md**: System design, data models, component structure
- **05-IMPLEMENTATION.md**: Build plan, phasing, testing strategy
- **CLAUDE.md**: Project instructions for Claude Code when working on memory-nexus

---

## Document Metadata

| Field | Value |
|-------|-------|
| Author | Agent 2 |
| Created | 2026-01-25 |
| Status | Complete |
| Related | SCRATCHPAD.md, 02-RESEARCH.md |
