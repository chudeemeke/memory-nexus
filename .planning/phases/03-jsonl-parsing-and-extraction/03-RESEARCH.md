# Phase 3 Research: JSONL Parsing and Extraction

**Status:** Complete (leverages existing research)
**Date:** 2026-01-28

## Context

Phase 3 implements the streaming JSONL parser. Most research was already completed during project initialization and is documented in `.planning/research/JSONL-EVENT-SCHEMA.md`.

## Key Findings Summary

### Session File Location

```
~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
```

### Path Encoding

Directory paths encoded by replacing path separators with dashes:
- `C:\Users\Destiny\Projects\foo` -> `C--Users-Destiny-Projects-foo`
- `/home/user/projects/bar` -> `-home-user-projects-bar`

### File Characteristics

- **Format:** JSONL (one JSON object per line)
- **Size:** Can exceed 10MB / 10,000+ lines
- **Order:** Lines NOT guaranteed chronological
- **Subagents:** Stored in `<session-uuid>/subagents/agent-<id>.jsonl`

### Event Types to Extract

| Type | Extract | Notes |
|------|---------|-------|
| user | Yes | User messages, tool results |
| assistant | Yes | Claude responses, tool uses |
| tool_use | Yes | Nested in assistant |
| tool_result | Yes | Nested in user |
| summary | Yes | Context compression |
| system | Yes | Timing info only |
| progress | No | Transient |
| base64 | No | Binary, not searchable |
| file-history-snapshot | No | Internal state |

### Port Interfaces Already Defined

From Phase 2:
- `ISessionSource.discoverSessions()` - Returns `SessionFileInfo[]`
- `ISessionSource.getSessionFile(id)` - Returns file path
- `IEventParser.parse(filePath)` - Returns `AsyncIterable<ParsedEvent>`

### ParsedEvent Types

```typescript
type ParsedEvent =
  | { type: "user"; data: UserEventData }
  | { type: "assistant"; data: AssistantEventData }
  | { type: "tool_use"; data: ToolUseEventData }
  | { type: "tool_result"; data: ToolResultEventData }
  | { type: "summary"; data: SummaryEventData }
  | { type: "system"; data: SystemEventData }
  | { type: "skipped"; reason: string };
```

## Implementation Approach

### Streaming Parser

Use Bun's native file streaming:

```typescript
const file = Bun.file(filePath);
const reader = file.stream().getReader();
// Process line by line
```

Or Node's readline for line-by-line processing:

```typescript
import { createReadStream } from "fs";
import { createInterface } from "readline";

const rl = createInterface({
  input: createReadStream(filePath),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  // Parse each line
}
```

### Bun-Specific Considerations

Bun supports both Node-compatible APIs and native Bun APIs. For streaming:

1. **Bun.file().stream()** - Native, potentially faster
2. **createReadStream + readline** - Node-compatible, proven

Given the need for line-by-line processing (not byte-level), readline is more appropriate.

### Error Handling Strategy

```typescript
try {
  const event = JSON.parse(line);
} catch (err) {
  yield { type: "skipped", reason: `Malformed JSON at line ${lineNum}` };
  continue;
}
```

### Session Discovery

```typescript
const claudeDir = path.join(os.homedir(), ".claude", "projects");
for await (const entry of fs.opendir(claudeDir)) {
  if (entry.isDirectory()) {
    // Scan for .jsonl files
  }
}
```

## Phase 3 Scope

### In Scope

1. **Session discovery** - Find all JSONL files in ~/.claude/projects/
2. **Streaming parser** - Parse events without loading entire file
3. **Event classification** - Route events to appropriate ParsedEvent type
4. **Content extraction** - Extract messages, tool uses, summaries
5. **Error handling** - Skip malformed lines with logging

### Out of Scope (Phase 4+)

- Database storage (Phase 4)
- Incremental sync tracking (Phase 4)
- CLI commands (Phase 5+)

## Test Strategy

### Unit Tests

- Event type classification
- Content extraction for each event type
- Timestamp normalization
- Error handling for malformed JSON

### Integration Tests

- Parse actual session file (anonymized sample)
- Memory usage verification with large file
- Subagent file discovery
- Empty file handling

### Test Data

Create fixtures in `tests/fixtures/`:
- `valid-session.jsonl` - Sample events of each type
- `large-session.jsonl` - 1000+ line file for memory testing
- `malformed.jsonl` - Lines with invalid JSON
- `empty.jsonl` - Empty file edge case

---

*Last updated: 2026-01-28*
