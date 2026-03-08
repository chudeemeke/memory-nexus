# Agent Write Protocol

Conventions for how Claude writes durable memory during sessions. These files persist knowledge across sessions and are indexed by `memory sync` for full-text search.

## Directory Structure

```
~/.memory/
  DECISIONS.md                                     # cross-project decisions
  LEARNINGS.md                                     # cross-project learnings
  USER-PREFS.md                                    # user interaction patterns
  daily/
    2026-03-07.md                                  # daily session log
    2026-03-08.md
  projects/
    C--Users-Destiny-Projects-kanbanflow/           # encoded project path
      DECISIONS.md                                 # project-specific decisions
      LEARNINGS.md                                 # project-specific learnings
    C--Users-Destiny-Projects-memory-nexus/
      DECISIONS.md
      LEARNINGS.md
```

### Path Conventions

- **Root files** (`DECISIONS.md`, `LEARNINGS.md`, `USER-PREFS.md`) are global, cross-project. They never decay.
- **Daily logs** (`daily/YYYY-MM-DD.md`) are temporal and subject to decay weighting in search results (Phase 25).
- **Project directories** use encoded paths that mirror `~/.claude/projects/<encoded>/` convention. The `ProjectNameResolver` maps these to display names.

### Encoded Paths

Project subdirectories follow the same encoding convention as `~/.claude/projects/`:

| Actual Path | Encoded Directory Name |
|---|---|
| `C:\Users\Destiny\Projects\kanbanflow` | `C--Users-Destiny-Projects-kanbanflow` |
| `C:\Users\Destiny\Projects\memory-nexus` | `C--Users-Destiny-Projects-memory-nexus` |

Rules:
- Path separators (`/`, `\`) become `-`
- Colons (`:`) become `-`
- Spaces become `-`
- Other characters are preserved

## File Formats

### Daily Log (`daily/YYYY-MM-DD.md`)

One file per day. Multiple sessions append to the same file.

```markdown
# 2026-03-07

## Session: <session-id> (HH:MM - HH:MM)

### Topic
Brief description of what was worked on

### Decisions
- [decision summary]

### Outcomes
- [what was completed]

### Unresolved
- [items still pending]

### Learnings
- [insights gained]

### Key Files
- [important files touched]
```

**Guidelines:**
- Use the session UUID from Claude Code (visible in JSONL filenames)
- Time range is approximate start and end of session
- Each section is optional -- omit sections with nothing to report
- Multiple sessions per day are appended chronologically

### DECISIONS.md

Records architectural and design decisions with rationale.

```markdown
# Decisions

## [YYYY-MM-DD] Decision title
- **Chose:** What was chosen
- **Over:** What was rejected
- **Because:** Rationale
- **Status:** active | superseded
- **Session:** <session-id>
```

**Guidelines:**
- New entries are appended at the bottom
- When a decision is superseded, update its Status to `superseded` and add the new decision
- Global `~/.memory/DECISIONS.md` is for cross-project decisions (tool choices, architecture patterns)
- Project-specific decisions go in `~/.memory/projects/<encoded>/DECISIONS.md`

### LEARNINGS.md

Records mistakes, corrections, and reusable insights.

```markdown
# Learnings

## Learning title
- **Context:** When/where this was learned
- **Wrong approach:** What didn't work
- **Why wrong:** Root cause
- **Correct approach:** What to do instead
- **Applies to:** This project | cross-project
- **Date:** YYYY-MM-DD
```

**Guidelines:**
- New entries are appended at the bottom
- "Applies to" determines whether the learning goes in the global or project-specific file
- Cross-project learnings belong in `~/.memory/LEARNINGS.md`
- Project-specific learnings go in `~/.memory/projects/<encoded>/LEARNINGS.md`
- Learnings tagged "cross-project" are surfaced in `memory context --cross-project` (Phase 25)

### USER-PREFS.md (Global Only)

Records user interaction patterns and preferences.

```markdown
# User Preferences

## Communication
- [observed communication preferences]

## Workflow
- [observed workflow patterns]

## Tooling
- [tool preferences and configurations]
```

**Guidelines:**
- Global only -- no project-specific variant
- Updated when user explicitly states a preference or when a pattern is observed across multiple sessions
- This is a curated file, not a log -- entries are edited, not just appended

## File Types

The scanner recognizes four file types by path pattern:

| Path Pattern | File Type | Description |
|---|---|---|
| `daily/*.md` | `daily_log` | Temporal session logs |
| `**/DECISIONS.md` | `decisions` | Decision records |
| `**/LEARNINGS.md` | `learnings` | Learning records |
| `**/USER-PREFS.md` | `user_prefs` | User preferences |

Files not matching these patterns are ignored by the scanner.

## Write Timing

Claude writes to memory files at natural breakpoints during a session:

| Trigger | What to Write | Where |
|---|---|---|
| Significant decision made | Decision entry | DECISIONS.md (global or project) |
| Task completed | Outcomes in daily log | daily/YYYY-MM-DD.md |
| Learning moment (error correction, user pushback) | Learning entry | LEARNINGS.md (global or project) |
| Before `/clear` (user signals session end) | Full session summary | daily/YYYY-MM-DD.md |
| Pre-compaction hook fires (Phase 26) | Flush any pending memory | All relevant files |

**Do not write:**
- Trivial or routine operations (standard file edits, simple bug fixes)
- Duplicate information already in the daily log
- Information that changes frequently (use daily logs for temporal data)

## Indexing

Running `memory sync` automatically discovers and indexes all `~/.memory/**/*.md` files:

1. Scans `~/.memory/` recursively for `.md` files
2. Classifies each file by path pattern (see File Types table)
3. Computes SHA-256 content hash
4. Skips files where hash matches the last indexed version (incremental)
5. Stores file content in `memory_files` table with FTS5 indexing

**Incremental behavior:**
- First sync: all files indexed
- Subsequent syncs: only new or modified files re-indexed
- Deleted files: remain in database until explicit cleanup (future feature)

## Search

Indexed memory files are searchable via FTS5:

```bash
# Search across all indexed content (sessions + memory files)
memory search "authentication patterns"

# Memory file content is included in search results
# alongside session messages
```

## Creating the Directory

The `~/.memory/` directory is not created automatically. Claude should create it and any needed subdirectories when first writing memory files:

```bash
mkdir -p ~/.memory/daily
mkdir -p ~/.memory/projects/<encoded-path>
```
