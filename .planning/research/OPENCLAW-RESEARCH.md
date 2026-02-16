# OpenClaw Research Report: Memory & Continuous Learning Implementation

**Research Date**: 2026-01-30
**Purpose**: Inform memory-nexus Phase 10 (Hook Integration) design
**Source**: https://github.com/openclaw/openclaw (formerly moltbot/clawdbot)

---

## 1. Executive Summary - Key Takeaways for Memory-Nexus

OpenClaw provides one of the most sophisticated implementations of persistent memory for AI assistants. Key innovations relevant to memory-nexus:

**Critical Insights:**

1. **Hybrid Storage Strategy**: Both structured (SQLite + JSONL transcripts) and unstructured (Markdown memory files) storage, each serving distinct purposes.

2. **Automatic Memory Flush**: Before compaction, triggers silent AI turn to extract and persist important information to disk. Critical for preserving knowledge across context window boundaries.

3. **Semantic + Keyword Search**: Vector embeddings combined with BM25 full-text search provides robust retrieval.

4. **Event-Driven Hook System**: Commands like `/new` trigger hooks that capture session snapshots, enabling cross-session learning without manual intervention.

5. **Workspace-Based Knowledge**: Memory files (daily logs + long-term MEMORY.md) live in a version-controlled workspace that serves as "source of truth" for agent knowledge.

**Direct Application to Memory-Nexus Phase 10:**

- Implement post-session hooks that trigger on session closure/compaction
- Extract session summaries automatically before context window pruning
- Consider hybrid search (vector + FTS5) for Phase 4 enhancements
- Use workspace-style directory structure for organized memory storage
- Enable Claude Code hooks to capture context at critical boundaries

---

## 2. Memory Architecture - How OpenClaw Stores/Retrieves Knowledge

### Storage Layers (Three-Tier)

#### Tier 1: Session Transcripts (Short-Term, Structured)
- **Location**: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
- **Format**: Newline-delimited JSON (JSONL)
- **Structure**: Tree-based entries with `id` + `parentId` relationships
- **Purpose**: Complete conversation history for active sessions

**Key Feature**: Session entries form a tree structure, allowing branch navigation and selective history retrieval.

#### Tier 2: Memory Files (Long-Term, Unstructured)
- **Daily Logs**: `memory/YYYY-MM-DD.md` (append-only, day-to-day notes)
- **Long-Term Memory**: `MEMORY.md` (curated facts, preferences, decisions)
- **Format**: Plain Markdown (human-readable, version-controllable)
- **Location**: `~/.openclaw/workspace/memory/`

**Philosophy**: "The files are the source of truth; the model only 'remembers' what gets written to disk."

#### Tier 3: Semantic Index (Retrieval Layer)
- **Storage**: SQLite per-agent (`~/.openclaw/memory/<agentId>.sqlite`)
- **Technology**: Embeddings + sqlite-vec extension for vector similarity
- **Search**: Hybrid approach - 70% vector similarity, 30% BM25 full-text search
- **Caching**: Chunk embeddings cached to avoid re-embedding unchanged text

### What Gets Remembered

**Explicit Memory Capture:**
- Users explicitly request: "Write this to memory"
- Daily notes and running context -> daily logs
- Durable facts, preferences, decisions -> MEMORY.md

**Automatic Memory Flush:**
- Triggers when session approaches compaction (soft threshold: ~4000 tokens before limit)
- Silent AI turn prompts model to extract and persist important information
- Results typically in `NO_REPLY` (invisible to user)
- Skipped when workspace is read-only or sandboxed

### Retrieval Mechanisms

**Tools Provided to AI:**

1. **`memory_search`**: Semantic search across memory files and optionally session transcripts
   - Hybrid scoring: vector similarity + BM25 keyword matching
   - Configurable result limits and relevance thresholds

2. **`memory_get`**: Read specific memory files by path

**Indexing Strategy:**
- File watchers: Detect changes with 1.5-second debounce
- Automatic reindexing: Triggers when provider/model configuration changes
- Batch processing: OpenAI and Gemini support batch API for cost-efficient large indexing
- Fingerprinting: Provider/model changes detected via fingerprint comparison

---

## 3. Hook System - Integration Patterns

### Available Hooks

OpenClaw ships with four bundled hooks:

1. **session-memory**: Saves session context to workspace when `/new` command issued
2. **command-logger**: Records all command events to `~/.openclaw/logs/commands.log`
3. **boot-md**: Executes `BOOT.md` checklist on gateway startup
4. **soul-evil**: Swaps SOUL.md personality files (demonstration hook)

### Event Types

**Command Events** (most relevant for memory-nexus):
- `command:new` - Triggered by `/new` (start new session)
- `command:reset` - Triggered by `/reset` (clear session)
- `command:stop` - Triggered by `/stop` (halt execution)

**Agent Events:**
- `agent:bootstrap` - Before workspace files inject (allows mutation of `bootstrapFiles`)

**Gateway Events:**
- `gateway:startup` - After channels initialize and hooks load

### Hook Execution Patterns

Each hook handler receives a context object containing:
- Event type and action identifier
- Session key and timestamp
- Message array for user communication
- Context including session entry, workspace directory, bootstrap files

**Execution Characteristics:**
- Asynchronous execution but must complete before system proceeds
- Early event filtering recommended ("filter events early, keep handlers fast")
- No replay mechanism - events are not persisted or replayed on reconnection

### Configuration

**Modern Format:**
```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "session-memory": { "enabled": true }
      }
    }
  }
}
```

**Hook Loading Precedence:**
1. Workspace-specific: `<workspace>/hooks/`
2. User-managed: `~/.openclaw/hooks/`
3. Bundled: `<openclaw>/dist/hooks/bundled/`

---

## 4. Session Management - Boundaries and Sync Patterns

### Session Lifecycle

**Reset Policy:**
- Time-based: Default resets daily at 4:00 AM local gateway time
- Idle-based: Optional expiration after inactivity period
- Combined: "Whichever expires first" determines reset
- Manual: `/new` or `/reset` commands create fresh session immediately

### State Persistence

**Dual Storage:**
1. **Metadata Store**: `~/.openclaw/agents/{agentId}/sessions/sessions.json`
   - Map: `sessionKey -> { sessionId, updatedAt, compactionCount, tokens, ... }`

2. **Transcript Files**: `*.jsonl` in same directory
   - Append-only conversation history
   - Tree structure with branch_summary entries for navigation

### Pruning and Compaction

**Three Mechanisms:**

1. **Transient Pruning** (Pre-Request)
   - Removes old tool results from in-memory context
   - TTL default: 5 minutes
   - Does NOT modify persistent JSONL transcript

2. **Compaction** (At Threshold)
   - Triggers when: `contextTokens > contextWindow - reserveTokens`
   - Summarizes older conversation into `compaction` entry
   - Recent messages preserved fully
   - Summary persists in JSONL transcript

3. **Memory Flush** (Pre-Compaction)
   - Soft threshold: ~4,000 tokens before compaction limit
   - Silent AI turn prompts model to write important info to disk
   - Typically results in `NO_REPLY` (invisible to user)
   - Executes once per compaction cycle

### Cross-Session Knowledge Transfer

**Mechanisms:**
1. Memory Files: Daily logs and MEMORY.md loaded at session start
2. Session-Memory Hook: Captures context when `/new` issued
3. Semantic Search: `memory_search` tool retrieves relevant context from past sessions
4. Bootstrap Files: Workspace files (AGENTS.md, SOUL.md) persist instructions across sessions
5. Optional Session Indexing: Past transcripts searchable if enabled

---

## 5. Recommendations for Memory-Nexus Phase 10

### Must Implement

#### 1. Memory Flush Pattern
Trigger memory extraction BEFORE session context is lost or compacted.

```bash
# Hook configuration concept for Claude Code
{
  "hooks": {
    "PreCompaction": [{
      "matcher": "ContextThreshold",
      "command": "aidev memory flush --session $SESSION_ID"
    }],
    "PostToolUse": [{
      "matcher": "SessionEnd",
      "command": "aidev memory sync --session $SESSION_ID"
    }]
  }
}
```

#### 2. Incremental Sync with Fingerprinting

```sql
CREATE TABLE sync_status (
  session_file TEXT PRIMARY KEY,
  last_modified INTEGER,
  last_synced INTEGER,
  content_hash TEXT,
  version INTEGER
);

-- Incremental sync logic
SELECT session_file
FROM sync_status
WHERE last_modified > last_synced
   OR content_hash != compute_hash(session_file)
   OR version < CURRENT_SYNC_VERSION;
```

#### 3. Workspace-Style Organization

```
~/.memory-nexus/
├── db/
│   └── memory-nexus.sqlite
├── extracts/
│   ├── YYYY-MM-DD/
│   │   ├── session-abc123.md
│   │   └── session-def456.md
│   └── projects/
│       ├── wow-system.md
│       └── memory-nexus.md
└── config/
    └── sync-config.json
```

#### 4. Hook Configuration for Claude Code

```json
{
  "hooks": {
    "memory-nexus": {
      "enabled": true,
      "events": {
        "sessionEnd": {
          "command": "aidev memory sync --session $SESSION_ID",
          "background": true,
          "timeout": 5000
        },
        "contextCompaction": {
          "command": "aidev memory flush --session $SESSION_ID",
          "background": true,
          "timeout": 3000
        }
      },
      "config": {
        "autoSync": true,
        "syncOnExit": true,
        "batchSize": 10,
        "maxSessionSize": "10MB"
      }
    }
  }
}
```

### Should Consider (Phase 4+)

1. **Hybrid Search (Vector + FTS5)**: 70% vector similarity, 30% BM25
2. **File Watchers**: 1.5s debounce for auto-sync
3. **Optional Full Transcript Indexing**: Power user opt-in
4. **Memory Debugging Tools**: `aidev memory debug` command

### Can Skip

1. Multi-channel support (not applicable)
2. Gateway architecture (CLI invocation simpler)
3. Authentication layer (local-only tool)
4. Multi-agent coordination (future if needed)

---

## Success Metrics for Phase 10

| Metric | Target |
|--------|--------|
| Automatic Capture Rate | >95% sessions synced without manual intervention |
| Sync Latency | <5 seconds from session end to database availability |
| Hook Reliability | >99% success rate |
| User Friction | Zero manual commands required per day |
| Data Completeness | 100% of successfully completed sessions |

---

## Sources

- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Session Management and Compaction](https://docs.openclaw.ai/reference/session-management-compaction)
- [OpenClaw Configuration Guide](https://docs.openclaw.ai/gateway/configuration)
