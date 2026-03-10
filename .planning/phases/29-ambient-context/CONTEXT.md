# Phase 29: Ambient Context — Discussion Context

**Source:** Design discussion 2026-03-10 (session conversation analyzing Claude Code's auto memory system prompt)
**Phase goal:** Make memory CLI context ambient at session start by generating files into Claude Code's auto memory directory, bridging the gap between query-based CLI and always-present context.

## What This Phase Builds

Automatic generation of memory context into each project's auto memory directory so Claude has cross-project awareness without manually querying. Two artifacts per project: a full `context.md` file owned by the CLI, and a small demarcated summary block inserted into the project's existing MEMORY.md.

## Problem Statement

Memory CLI is query-based — Claude must choose to run `memory context <project>`. Claude Code's built-in auto memory is ambient — MEMORY.md is loaded into the system prompt at session start, visible every turn, never compressed.

The result: Claude knows it *should* query memory (via `~/.claude/rules/memory.md`), but doesn't *have* the context unless it acts. This is the difference between "a CLI you can query" and "memory that's always there."

## Design Decisions (All Locked)

### Delivery mechanism: Auto memory directory, not hooks

A hook's output lands in conversation history and degrades over time (compressed in long sessions). Auto memory's MEMORY.md lives in the persistent system prompt — never compressed, always visible. Use the platform's own delivery channel rather than competing with it.

### File structure: Two-file approach

| File | Owner | Content | Update strategy |
|------|-------|---------|-----------------|
| `context.md` | Memory CLI (full ownership) | Full `memory context <project> --format ai` output | Complete overwrite on every sync |
| `MEMORY.md` | Shared (user + CLI) | User content + small demarcated CLI block | Marker-based insert/update, never touch content outside markers |

### context.md naming rationale

Mirrors the command name (`memory context`). Short, self-descriptive in the auto memory directory where everything is already memory-namespaced. Rejected alternatives: `memory-cli.md` (encodes delivery mechanism, not content), `memory-tool.md` (same issue), `cross-project.md` (too narrow — context includes friction, decisions, learnings).

### MEMORY.md block format

```markdown
<!-- memory-cli:start -->
## Cross-Project Context
Run `memory context <project>` for full briefing. See [context.md](context.md) for latest snapshot.
- 3 active decisions from kanbanflow, 2 from wow-system
- Open friction: 2 high (aidev), 1 medium (memory)
- Last synced: 2026-03-10
<!-- memory-cli:end -->
```

Rules:
- HTML comment markers (`<!-- memory-cli:start/end -->`) for find-and-replace on subsequent syncs
- Insert at the **end** of MEMORY.md (user content takes priority in the 200-line cap)
- **Never touch content outside the markers**
- If markers don't exist yet, append the block
- If markers exist, replace content between them

### Friction inclusion

Summary line in the MEMORY.md block (e.g., "Open friction: 2 high (aidev), 1 medium (memory)"). Works with the current friction system — no dependency on Phase 28 (Friction Universalization). When Phase 28 ships the `--tool` column, the summary naturally gets richer.

### Regeneration trigger

Wired into the existing sync hook via `memory install`. After session sync completes, regenerate `context.md` and update the MEMORY.md block for the current project. This means context is always fresh after every session.

### Agent story

Sub-agents spawned via Task/Agent tool don't inherit session hooks and don't read auto memory directories. The solution is a **prompt pattern**, not code: orchestrators include `memory context <project> --format ai` output in the agent's prompt. This is already possible today. Phase 29 documents the pattern but doesn't implement agent-specific hooks.

## Auto Memory Directory Structure

Claude Code's auto memory lives at:
```
~/.claude/projects/<encoded-dir>/memory/
  MEMORY.md          # Auto-loaded into system prompt (200-line cap)
  context.md         # NEW: Full memory CLI context (owned by CLI)
  debugging.md       # Existing: User/Claude topic files
  patterns.md        # Existing: User/Claude topic files
```

The `<encoded-dir>` is Claude Code's encoding of the project's working directory path. Memory CLI needs to resolve the current project directory to this encoded path.

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| IAmbientContextWriter | Domain Port | src/domain/ports/services.ts (new interface) |
| AmbientContextService | Application | src/application/services/ambient-context-service.ts (new) |
| AutoMemoryWriter | Infrastructure | src/infrastructure/filesystem/auto-memory-writer.ts (new) |
| Sync hook integration | Infrastructure | src/infrastructure/hooks/ (modify existing) |
| `memory install` update | Presentation | src/presentation/cli/commands/install.ts (modify) |

### Key implementation details

- **Project directory resolution:** The sync hook knows which project triggered it (from Claude Code's hook context). Use this to find the auto memory directory.
- **Encoded path resolution:** Claude Code encodes project paths for the `~/.claude/projects/` directory. Need to match this encoding. Inspect existing directories to reverse-engineer the pattern, or use a known mapping.
- **MEMORY.md merge logic:** Read file, find markers, replace between them (or append if absent). Must handle: file doesn't exist, file exists without markers, file exists with markers. Never corrupt content outside markers.
- **context.md generation:** Call SmartContextService (Phase 25) with `--format ai` and a reasonable budget (800-1000 tokens). Write the full output to `context.md`.
- **Summary extraction:** Parse the SmartContextService output to extract key counts (decisions, learnings, friction) for the MEMORY.md block. Keep the block under 10 lines.

## Dependencies

- **Depends on:** Phase 25 (SmartContextService, `--format ai`, budget allocator)
- **Independent of:** Phase 27 (qmd), Phase 28 (friction universalization)
- **All dependencies are complete** — this phase can start immediately

## Three-Tier Ambient Awareness

The end state gives Claude three tiers of memory access:

| Tier | What Claude sees | When | Compression risk |
|------|-----------------|------|-----------------|
| Summary block in MEMORY.md | Always (system prompt) | Every turn, entire session | None — system prompt is persistent |
| `context.md` in auto memory dir | On demand (Read tool) | When Claude needs detail | None — file on disk, not in context |
| `memory context/search/related` | Full query (Bash tool) | Deep investigation | None — fresh query each time |

## Testing Strategy

- Unit tests for MEMORY.md marker-based merge (all cases: no file, empty file, file without markers, file with markers, file with markers and surrounding content)
- Unit tests for context.md generation (mocked SmartContextService)
- Unit tests for summary extraction from SmartContextService output
- Integration test for the full flow: sync triggers context.md write + MEMORY.md update
- No tests that require actual Claude Code auto memory directory (mock the path)

## Open Questions for Planning

1. **Encoded path discovery:** How does Claude Code encode project paths for `~/.claude/projects/`? Need to inspect existing directories. If the encoding isn't deterministic or discoverable, fall back to a config mapping.
   **Recommendation:** Research during planning. Check if it's base64, URL-encoding, or hash-based. The current project's path can be inspected at `~/.claude/projects/` to find the pattern.

2. **Budget for context.md:** What token budget for the generated context file?
   **Recommendation:** 800-1000 tokens. Large enough to be useful, small enough that Claude won't blow context reading it. Make it configurable in `~/.config/memory/config.json`.

3. **Sync hook ordering:** Should context generation happen before or after session extraction?
   **Recommendation:** After. The new session's data should be in the database before generating context. Sequence: extract session -> update database -> generate context.md -> update MEMORY.md.
