# Claude Code JSONL Event Schema

Research document capturing the structure of Claude Code session files.

**Status:** Complete
**Date:** 2026-01-27
**Source:** Reverse-engineered from actual session files at `~/.claude/projects/`

## Session File Location

```
~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
```

### Path Encoding Pattern

Directory paths are encoded by replacing path separators with dashes:

| Original Path | Encoded |
|---------------|---------|
| `C:\Users\Destiny\Projects\foo` | `C--Users-Destiny-Projects-foo` |
| `/home/user/projects/bar` | `-home-user-projects-bar` |

### File Structure

- Each line is a self-contained JSON object (JSONL format)
- Lines are NOT guaranteed to be in chronological order
- Session files can exceed 10MB / 10,000+ lines
- Some sessions have companion directories: `<session-uuid>/subagents/`

## Common Event Fields

Most events share these base fields:

```typescript
interface BaseEvent {
  type: string;              // Event type discriminator
  uuid: string;              // Unique event ID
  timestamp: string;         // ISO 8601 timestamp
  parentUuid: string | null; // Links to parent event (conversation threading)
  isSidechain: boolean;      // true for subagent conversations
  sessionId: string;         // Session UUID
  cwd: string;               // Working directory
  version: string;           // Claude Code version (e.g., "2.1.19")
  gitBranch?: string;        // Git branch if in repo
  userType: string;          // "external" for main user
}
```

## Event Types Reference

### Conversation Events

#### `user`

User message or tool result.

```json
{
  "type": "user",
  "parentUuid": "abc-123",
  "isSidechain": false,
  "userType": "external",
  "cwd": "C:\\Users\\Destiny\\Projects\\foo",
  "sessionId": "session-uuid",
  "version": "2.1.19",
  "gitBranch": "main",
  "message": {
    "role": "user",
    "content": "User's message text"
  },
  "uuid": "event-uuid",
  "timestamp": "2026-01-26T13:37:43.219Z"
}
```

**With tool result:**

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_xxx",
        "type": "tool_result",
        "content": "File contents or tool output..."
      }
    ]
  },
  "toolUseResult": {
    "type": "text",
    "file": {
      "filePath": "/path/to/file.ts",
      "content": "...",
      "numLines": 119
    }
  },
  "sourceToolAssistantUUID": "assistant-event-uuid"
}
```

#### `assistant`

Claude's response including tool calls.

```json
{
  "type": "assistant",
  "parentUuid": "user-event-uuid",
  "isSidechain": false,
  "userType": "external",
  "cwd": "...",
  "sessionId": "...",
  "version": "2.1.19",
  "gitBranch": "main",
  "message": {
    "model": "claude-opus-4-5-20251101",
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "Response text..."
      },
      {
        "type": "tool_use",
        "id": "toolu_xxx",
        "name": "Read",
        "input": {
          "file_path": "/path/to/file"
        }
      }
    ],
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 890
    }
  },
  "requestId": "req_xxx",
  "uuid": "...",
  "timestamp": "..."
}
```

**Content block types within `message.content`:**

| Type | Description |
|------|-------------|
| `text` | Plain text response |
| `tool_use` | Tool invocation with name and input |
| `thinking` | Extended thinking content (signature-protected) |

#### `thinking` (nested in assistant content)

```json
{
  "type": "thinking",
  "thinking": "Internal reasoning text...",
  "signature": "base64-signature-for-verification"
}
```

#### `system`

System-generated events (timing, configuration).

```json
{
  "type": "system",
  "subtype": "turn_duration",
  "durationMs": 114731,
  "timestamp": "2026-01-26T13:40:00.000Z"
}
```

**Known subtypes:**
- `turn_duration` - Time taken for a turn

### Progress Events

#### `progress`

General progress indicator.

```json
{
  "type": "progress",
  "content": "Processing...",
  "timestamp": "..."
}
```

#### `agent_progress`

Subagent execution progress.

```json
{
  "type": "agent_progress",
  "agentId": "ad27413",
  "status": "running",
  "message": "Searching files...",
  "timestamp": "..."
}
```

#### `bash_progress`

Command execution progress.

```json
{
  "type": "bash_progress",
  "command": "bun test",
  "output": "Running tests...",
  "timestamp": "..."
}
```

#### `mcp_progress`

MCP server communication progress.

```json
{
  "type": "mcp_progress",
  "server": "context7",
  "operation": "tool_call",
  "timestamp": "..."
}
```

#### `hook_progress`

Hook execution progress.

```json
{
  "type": "hook_progress",
  "hook": "PreToolUse",
  "status": "running",
  "timestamp": "..."
}
```

### State Events

#### `file-history-snapshot`

Tracks file state for undo/restore.

```json
{
  "type": "file-history-snapshot",
  "messageId": "msg_xxx",
  "snapshot": {
    "messageId": "msg_xxx",
    "trackedFileBackups": {
      "/path/to/file.ts": {
        "originalContent": "...",
        "modifiedContent": "..."
      }
    },
    "timestamp": "..."
  },
  "isSnapshotUpdate": false
}
```

#### `summary`

Session summary (for context compression).

```json
{
  "type": "summary",
  "summary": "Condensed session history...",
  "leafUuid": "last-event-uuid"
}
```

### Queue Events

#### `queue-operation`

Task queue management.

```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "content": "Task description...",
  "sessionId": "...",
  "timestamp": "..."
}
```

**Operations:** `enqueue`, `dequeue`, `complete`

### Resource Events

#### `create`

Resource creation tracking.

```json
{
  "type": "create",
  "resource": "file",
  "path": "/path/to/new/file.ts",
  "timestamp": "..."
}
```

#### `update`

Resource modification tracking.

```json
{
  "type": "update",
  "resource": "file",
  "path": "/path/to/modified/file.ts",
  "timestamp": "..."
}
```

#### `image`

Image content reference.

```json
{
  "type": "image",
  "source": "screenshot",
  "path": "/tmp/screenshot.png",
  "timestamp": "..."
}
```

#### `base64`

Base64-encoded binary content.

```json
{
  "type": "base64",
  "mediaType": "image/png",
  "data": "iVBORw0KGgo...",
  "timestamp": "..."
}
```

#### `waiting_for_task`

Subagent waiting state.

```json
{
  "type": "waiting_for_task",
  "agentId": "ad27413",
  "taskId": "task-uuid",
  "timestamp": "..."
}
```

## Subagent Sessions

Subagent conversations are stored separately:

```
<session-uuid>/
  subagents/
    agent-<id>.jsonl
```

Subagent events have additional fields:

```json
{
  "agentId": "ad27413",
  "isSidechain": true,
  "parentUuid": null
}
```

## Event Type Distribution (Sample)

From a 10MB session file:

| Type | Count | Description |
|------|-------|-------------|
| progress | 613 | Progress updates |
| message | 555 | Nested in user/assistant |
| assistant | 555 | Claude responses |
| agent_progress | 483 | Subagent updates |
| user | 430 | User messages + tool results |
| tool_result | 375 | Tool output (nested) |
| tool_use | 374 | Tool calls (nested) |
| text | 162 | Text blocks (nested) |
| thinking | 115 | Extended thinking |
| bash_progress | 103 | Command progress |
| queue-operation | 39 | Task queue |
| file-history-snapshot | 37 | File tracking |
| system | 15 | System events |
| create | 14 | Resource creation |
| hook_progress | 13 | Hook execution |
| waiting_for_task | 12 | Subagent waiting |
| update | 8 | Resource updates |
| image | 4 | Image references |
| base64 | 4 | Binary content |
| mcp_progress | 2 | MCP progress |

## Extraction Strategy for memory-nexus

### Primary Targets

1. **User messages** (`type: "user"` with string content)
   - Extract: content, timestamp, cwd, gitBranch

2. **Assistant responses** (`type: "assistant"`)
   - Extract: text content, tool usage, model, token usage

3. **Tool interactions** (nested in user/assistant)
   - Extract: tool name, inputs, outputs

4. **Summaries** (`type: "summary"`)
   - Already condensed - store as-is

### Secondary Targets

- File operations (`create`, `update`) - track what files were modified
- System events - timing information

### Skip

- Progress events - transient, no semantic value
- Base64/image - binary, not searchable
- File-history-snapshot - internal state

### Linking Strategy

```sql
-- Parent-child relationships via parentUuid
INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
VALUES ('message', 'child-uuid', 'message', 'parent-uuid', 'replies_to');

-- Session membership
INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
VALUES ('message', 'msg-uuid', 'session', 'session-uuid', 'belongs_to');

-- Project association
INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
VALUES ('session', 'session-uuid', 'project', 'wow-system', 'from_project');
```

## Edge Cases

1. **Empty sessions** - Only contain `file-history-snapshot` and `summary`
2. **Interrupted sessions** - May lack final `system` event with duration
3. **Large tool outputs** - Content may be truncated in tool_result
4. **Nested content** - Tool use and thinking are nested in assistant.message.content

## Version Compatibility

Tested with Claude Code version `2.1.19`. Event schema may evolve - check `version` field.
