# Phase 11: Session Navigation - Research

**Researched:** 2026-01-31
**Domain:** Session viewing, interactive search, entity extraction
**Confidence:** MEDIUM

## Summary

Phase 11 implements detailed session viewing (`aidev memory show <session-id>`), interactive session picker with live search, and entity extraction capabilities. Research covered three main areas: (1) interactive CLI picker libraries for fzf-style session selection, (2) show command formatting patterns for conversation display, and (3) entity extraction approaches for topics, decisions, and file modifications.

The interactive picker will use `@inquirer/search` (standalone prompt from Inquirer.js v13) which provides built-in search filtering with async source functions. Entity extraction will use a hybrid approach: pattern-based for artifacts (file paths, tool names) and LLM-based for concepts/decisions during SessionStop hook.

**Primary recommendation:** Use `@inquirer/search` for interactive picker, implement ShowFormatter following existing strategy pattern, and design Entity domain type with graph storage for cross-session linking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @inquirer/search | 3.0+ | Interactive search picker | Official standalone prompt, async source support, AbortSignal for cancellation |
| @inquirer/select | 4.0+ | Action menu after selection | Official standalone prompt, supports separators and descriptions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fuzzy | 0.1+ | Fuzzy string matching | For search filtering within source function |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @inquirer/search | inquirer-autocomplete-prompt | Older API, requires registerPrompt, less type-safe |
| @inquirer/search | prompts | Smaller but less feature-rich for complex selections |
| @inquirer/search | enquirer | Good but different API style, less npm support |

**Installation:**
```bash
bun add @inquirer/search @inquirer/select fuzzy
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── domain/
│   └── entities/
│       └── entity.ts              # Entity type (concept, file, decision, term)
├── application/
│   └── services/
│       └── entity-extractor.ts    # Pattern + LLM extraction orchestration
├── infrastructure/
│   └── database/
│       └── repositories/
│           └── entity-repository.ts  # Entity CRUD with graph links
├── presentation/
│   └── cli/
│       ├── commands/
│       │   └── show.ts            # Show command with --tools option
│       ├── formatters/
│       │   └── show-formatter.ts  # Conversation thread formatting
│       └── pickers/
│           └── session-picker.ts  # Interactive search UI
```

### Pattern 1: Interactive Picker with Search
**What:** Use @inquirer/search with async source function that queries sessions
**When to use:** NAV-05 interactive session picker requirement
**Example:**
```typescript
// Source: https://github.com/SBoudrias/Inquirer.js/blob/main/packages/search/README.md
import { search } from '@inquirer/search';
import { select } from '@inquirer/select';

interface SessionChoice {
  value: string;  // session ID
  name: string;   // display: "project-name (2h ago)"
  description: string;  // summary or first message preview
}

async function pickSession(): Promise<string | null> {
  const sessionId = await search<string>({
    message: 'Search sessions',
    source: async (term, { signal }) => {
      // Query sessions from database
      const sessions = await sessionRepo.findFiltered({
        summaryFilter: term || undefined,
        limit: 20,
      });

      return sessions.map(s => ({
        value: s.id,
        name: `${s.projectPath.projectName} (${formatRelativeTime(s.startTime)})`,
        description: s.summary?.substring(0, 80) ?? '',
      }));
    },
    pageSize: 10,
  });

  // Action menu after selection
  const action = await select<string>({
    message: 'What would you like to do?',
    choices: [
      { value: 'show', name: 'Show session details' },
      { value: 'search', name: 'Search within session' },
      { value: 'context', name: 'Get project context' },
      { value: 'related', name: 'Find related sessions' },
    ],
  });

  return { sessionId, action };
}
```

### Pattern 2: ShowFormatter Strategy
**What:** Extend existing formatter pattern for show command output
**When to use:** NAV-02 session detail display
**Example:**
```typescript
// Following existing OutputFormatter/ListFormatter pattern
export type ShowOutputMode = 'default' | 'json' | 'verbose' | 'tools';

export interface ShowFormatter {
  formatSession(session: SessionDetail, options?: ShowFormatOptions): string;
  formatToolMarker(toolUse: ToolUse): string;
  formatError(error: Error): string;
}

// Inline tool marker format: [Read: file.ts -> 45 lines]
function formatInlineToolMarker(tool: ToolUse): string {
  const briefResult = summarizeToolResult(tool);
  return `[${tool.name}: ${briefResult}]`;
}

function summarizeToolResult(tool: ToolUse): string {
  switch (tool.name) {
    case 'Read':
      const path = tool.input.file_path as string;
      const lines = countLines(tool.result);
      return `${basename(path)} -> ${lines} lines`;
    case 'Write':
      return `${basename(tool.input.file_path as string)}`;
    case 'Bash':
      const exitCode = extractExitCode(tool.result);
      return exitCode === 0 ? 'OK' : `exit ${exitCode}`;
    case 'Glob':
      const matches = countMatches(tool.result);
      return `${matches} files`;
    default:
      return tool.status;
  }
}
```

### Pattern 3: Entity Extraction (Hybrid)
**What:** Combine pattern-based extraction for artifacts with LLM for concepts
**When to use:** EXTR-01 through EXTR-04 requirements
**Example:**
```typescript
// Pattern-based extraction (synchronous, during sync)
export class PatternExtractor {
  // File paths from tool inputs
  static extractFilePaths(toolUses: ToolUse[]): string[] {
    const paths: string[] = [];
    for (const tool of toolUses) {
      if (tool.input.file_path) {
        paths.push(tool.input.file_path as string);
      }
      if (tool.input.path) {
        paths.push(tool.input.path as string);
      }
    }
    return [...new Set(paths)];
  }

  // Tool names
  static extractToolNames(toolUses: ToolUse[]): string[] {
    return [...new Set(toolUses.map(t => t.name))];
  }

  // File modifications (Write, Edit tools)
  static extractModifications(toolUses: ToolUse[]): FileModification[] {
    return toolUses
      .filter(t => ['Write', 'Edit', 'NotebookEdit'].includes(t.name))
      .map(t => ({
        path: t.input.file_path as string,
        operation: t.name,
        timestamp: t.timestamp,
      }));
  }
}

// LLM extraction (during SessionStop hook, uses existing session)
export interface LLMExtraction {
  concepts: Array<{ term: string; confidence: number }>;
  decisions: Array<{
    subject: string;
    decision: string;
    rejected: string[];
    rationale: string;
    confidence: number;
  }>;
  keyTerms: Array<{ term: string; confidence: number }>;
  summary: string;
}
```

### Pattern 4: Entity Graph Storage
**What:** Store entities with links to sessions AND to each other
**When to use:** Cross-project entity linking, graph traversal
**Example:**
```sql
-- Entities table
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('concept', 'file', 'decision', 'term')),
    name TEXT NOT NULL,
    metadata TEXT,  -- JSON for type-specific data
    confidence REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(type, name)
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

-- Session-Entity links (many-to-many)
CREATE TABLE IF NOT EXISTS session_entities (
    session_id TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    frequency INTEGER DEFAULT 1,  -- How often entity appears
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, entity_id)
);

-- Entity-Entity links (cross-project)
CREATE TABLE IF NOT EXISTS entity_links (
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    relationship TEXT NOT NULL,  -- 'related', 'implies', 'contradicts'
    weight REAL DEFAULT 1.0,
    FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id, relationship)
);
```

### Anti-Patterns to Avoid
- **Blocking picker in non-TTY:** Always check `process.stdout.isTTY` before showing interactive picker; fall back to `--session` argument
- **Hand-rolling fuzzy search:** Use `fuzzy` library; edge cases in Unicode, case sensitivity
- **LLM extraction on sync:** Too slow; do during SessionStop hook with existing session tokens
- **Storing raw LLM output:** Parse into structured entities; raw text not queryable

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive search | Custom readline loop | @inquirer/search | Arrow keys, pagination, theming handled |
| Fuzzy matching | Simple substring check | fuzzy library | Unicode, scoring, ranking edge cases |
| File path parsing | Manual string.split | path.parse/basename | Cross-platform, Windows paths |
| Action menu | Custom input handling | @inquirer/select | Separator support, disabled options |
| Temp file handling | Manual fs operations | tmp/tmp-promise | Cleanup on exit, unique names |

**Key insight:** CLI interaction is deceptively complex - terminal modes, key escape sequences, cursor positioning, pagination - all handled by Inquirer.

## Common Pitfalls

### Pitfall 1: Non-TTY Interactive Prompt
**What goes wrong:** Interactive picker hangs or crashes when stdout is not a TTY (piped output)
**Why it happens:** Inquirer requires interactive terminal for key input
**How to avoid:** Check `process.stdout.isTTY` before prompting; require explicit `--session` in non-TTY mode
**Warning signs:** Tests hang indefinitely; CI failures

### Pitfall 2: Large Session Memory Usage
**What goes wrong:** Loading full messages for all sessions during search
**Why it happens:** Eager loading to display message counts or previews
**How to avoid:** Session metadata query should NOT join messages; separate query for selected session
**Warning signs:** Search feels slow; memory grows with session count

### Pitfall 3: Entity Deduplication
**What goes wrong:** Duplicate entities created for same concept across projects
**Why it happens:** Case sensitivity, minor spelling variations
**How to avoid:** Normalize entity names (lowercase, trim); use UNIQUE constraint with conflict handling
**Warning signs:** Duplicate entries in entity list; bloated entity table

### Pitfall 4: LLM Extraction Timeout
**What goes wrong:** SessionStop hook times out waiting for LLM extraction
**Why it happens:** LLM response time varies; large sessions take longer
**How to avoid:** Fire extraction in background; write to temp file; sync imports on next sync
**Warning signs:** Hook failures in logs; missing entities

### Pitfall 5: AbortSignal Not Handled
**What goes wrong:** Stale search results appear after typing new query
**Why it happens:** @inquirer/search passes AbortSignal but source function ignores it
**How to avoid:** Check `signal.aborted` before returning; abort in-flight database queries
**Warning signs:** Results flicker; wrong results appear

## Code Examples

Verified patterns from official sources:

### Interactive Session Picker (Full Implementation)
```typescript
// Source: @inquirer/search README + project patterns
import { search } from '@inquirer/search';
import { select } from '@inquirer/select';
import fuzzy from 'fuzzy';

type PickerAction = 'show' | 'search' | 'context' | 'related' | 'cancel';

interface PickerResult {
  sessionId: string;
  action: PickerAction;
}

export async function sessionPicker(
  sessionRepo: ISessionRepository
): Promise<PickerResult | null> {
  // Check TTY
  if (!process.stdout.isTTY) {
    throw new Error('Interactive picker requires TTY. Use --session <id> instead.');
  }

  // Search prompt
  const sessionId = await search<string>({
    message: 'Search sessions (type to filter):',
    source: async (term, { signal }) => {
      // Fetch sessions (metadata only, no messages)
      const sessions = await sessionRepo.findFiltered({ limit: 100 });

      if (signal.aborted) return [];

      // Build choice list
      const choices = sessions.map(s => ({
        value: s.id,
        name: `${s.projectPath.projectName} (${formatRelativeTime(s.startTime)})`,
        description: `${s.id.substring(0, 8)}... | ${s.messages.length} messages`,
      }));

      // Filter if term provided
      if (term) {
        const results = fuzzy.filter(term, choices, {
          extract: (c) => `${c.name} ${c.description}`,
        });
        return results.map(r => r.original);
      }

      return choices;
    },
    pageSize: 10,
  });

  // Action menu
  const action = await select<PickerAction>({
    message: 'Action:',
    choices: [
      { value: 'show', name: 'Show session details' },
      { value: 'search', name: 'Search within session' },
      { value: 'context', name: 'Get project context' },
      { value: 'related', name: 'Find related sessions' },
      { value: 'cancel', name: 'Cancel' },
    ],
  });

  if (action === 'cancel') {
    return null;
  }

  return { sessionId, action };
}
```

### Show Command with Inline Tool Markers
```typescript
// Source: Project patterns (list-formatter.ts, output-formatter.ts)
interface SessionDetail {
  session: Session;
  messages: Message[];
  toolUses: Map<string, ToolUse>;  // id -> ToolUse
}

class DefaultShowFormatter implements ShowFormatter {
  constructor(private useColor: boolean) {}

  formatSession(detail: SessionDetail): string {
    const { session, messages, toolUses } = detail;

    // Header
    let output = this.formatHeader(session, toolUses.size);
    output += '\n';

    // Conversation thread
    for (const msg of messages) {
      output += this.formatMessage(msg, toolUses);
      output += '\n';
    }

    return output;
  }

  private formatHeader(session: Session, toolCount: number): string {
    const duration = session.durationMs
      ? formatDuration(session.durationMs)
      : 'ongoing';

    return [
      `Session: ${session.id}`,
      `Project: ${session.projectPath.projectName}`,
      `Date: ${formatTimestamp(session.startTime)} - ${session.endTime ? formatTimestamp(session.endTime) : 'ongoing'}`,
      `Duration: ${duration}`,
      `Messages: ${session.messages.length} | Tools: ${toolCount}`,
      '---',
    ].join('\n');
  }

  private formatMessage(msg: Message, toolUses: Map<string, ToolUse>): string {
    const roleLabel = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    const roleColor = msg.role === 'user' ? cyan : green;

    let output = roleColor(`[${roleLabel}] ${formatTimestamp(msg.timestamp)}`, this.useColor);
    output += '\n';
    output += msg.content;

    // Inline tool markers for assistant messages
    if (msg.role === 'assistant' && msg.hasToolUses) {
      output += '\n';
      for (const toolId of msg.toolUses) {
        const tool = toolUses.get(toolId);
        if (tool) {
          output += dim(this.formatToolMarker(tool), this.useColor);
          output += ' ';
        }
      }
    }

    return output;
  }

  formatToolMarker(tool: ToolUse): string {
    const brief = this.summarizeToolResult(tool);
    return `[${tool.name}: ${brief}]`;
  }

  private summarizeToolResult(tool: ToolUse): string {
    // Type-specific summaries
    switch (tool.name) {
      case 'Read': {
        const path = tool.input.file_path as string;
        const lines = tool.result?.split('\n').length ?? 0;
        return `${basename(path)} -> ${lines} lines`;
      }
      case 'Write':
        return basename(tool.input.file_path as string);
      case 'Bash': {
        const cmd = (tool.input.command as string).substring(0, 30);
        return tool.isSuccess ? `${cmd}...` : 'FAILED';
      }
      case 'Glob': {
        // Count files from result
        const count = tool.result?.split('\n').filter(Boolean).length ?? 0;
        return `${count} files`;
      }
      case 'Grep':
        return tool.isSuccess ? 'matches found' : 'no matches';
      default:
        return tool.status;
    }
  }
}
```

### Entity Extraction (Pattern-Based)
```typescript
// Source: Derived from project ToolUse entity and content-extractor patterns
export class PatternExtractor {
  /**
   * Extract file paths from tool uses
   * Handles Read, Write, Edit, Glob, Grep tools
   */
  static extractFilePaths(toolUses: ToolUse[]): string[] {
    const paths = new Set<string>();

    for (const tool of toolUses) {
      // Direct file_path input
      if (typeof tool.input.file_path === 'string') {
        paths.add(tool.input.file_path);
      }
      // Glob/Grep path input
      if (typeof tool.input.path === 'string') {
        paths.add(tool.input.path);
      }
      // Glob pattern results
      if (tool.name === 'Glob' && tool.result) {
        const files = tool.result.split('\n').filter(Boolean);
        files.forEach(f => paths.add(f));
      }
    }

    return [...paths];
  }

  /**
   * Extract file modifications (Write, Edit, NotebookEdit)
   */
  static extractFileModifications(toolUses: ToolUse[]): FileModification[] {
    const modTools = ['Write', 'Edit', 'NotebookEdit'];

    return toolUses
      .filter(t => modTools.includes(t.name) && t.isSuccess)
      .map(t => ({
        path: t.input.file_path as string,
        operation: t.name as 'Write' | 'Edit' | 'NotebookEdit',
        timestamp: t.timestamp,
        // Semantic summary to be filled by LLM later
        summary: undefined,
      }));
  }

  /**
   * Extract tool usage statistics
   */
  static extractToolStats(toolUses: ToolUse[]): Map<string, number> {
    const stats = new Map<string, number>();

    for (const tool of toolUses) {
      const count = stats.get(tool.name) ?? 0;
      stats.set(tool.name, count + 1);
    }

    return stats;
  }
}
```

### LLM Extraction Prompt Template
```typescript
// Source: OpenClaw patterns + CONTEXT.md decisions
const EXTRACTION_PROMPT = `
Analyze this Claude Code session and extract:

1. **Technical Concepts**: Key programming concepts, patterns, or technologies discussed
   - Example: "hexagonal architecture", "FTS5 full-text search", "streaming parser"

2. **Decisions Made**: Explicit choices with rationale
   - Format: { subject, decision, rejected[], rationale }
   - Example: { subject: "database", decision: "use SQLite", rejected: ["PostgreSQL"], rationale: "embedded, no server" }

3. **Key Terms**: Domain-specific terminology introduced or explained
   - Example: "JSONL", "context window", "WAL mode"

4. **Session Summary**: 2-3 sentence summary of what was accomplished

Output as JSON:
{
  "concepts": [{ "term": "...", "confidence": 0.0-1.0 }],
  "decisions": [{ "subject": "...", "decision": "...", "rejected": [], "rationale": "...", "confidence": 0.0-1.0 }],
  "keyTerms": [{ "term": "...", "confidence": 0.0-1.0 }],
  "summary": "..."
}

Session content:
---
{SESSION_CONTENT}
---
`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| inquirer (monolith) | @inquirer/prompts (modular) | 2023 (v9) | Smaller bundles, tree-shaking |
| registerPrompt() | Standalone imports | 2023 | Simpler API, better types |
| inquirer-autocomplete-prompt | @inquirer/search | 2024 | Native search with AbortSignal |

**Deprecated/outdated:**
- `inquirer.registerPrompt('autocomplete', ...)`: Use standalone `@inquirer/search` instead
- `inquirer.prompt([...])` chained: Use individual standalone prompts

## Open Questions

Things that couldn't be fully resolved:

1. **LLM extraction without API key**
   - What we know: SessionStop hook can use existing Claude session
   - What's unclear: How to invoke Claude Code's internal API for extraction
   - Recommendation: Research Claude Code's tool calling mechanism; may need workaround

2. **Temp file location for hook handoff**
   - What we know: Hook writes JSON, sync reads and imports
   - What's unclear: Best location for temp files on Windows/Linux/macOS
   - Recommendation: Use `.memory-nexus/pending/` directory; clean on successful import

3. **Entity confidence threshold**
   - What we know: Store 0-1 confidence scores
   - What's unclear: What threshold filters "noise" vs useful entities
   - Recommendation: Start with 0.5; make configurable; tune based on usage

## Sources

### Primary (HIGH confidence)
- @inquirer/search README (GitHub) - API, options, source function pattern
- @inquirer/select README (GitHub) - Action menu pattern
- Project codebase - Existing patterns (formatters, repositories, hooks)

### Secondary (MEDIUM confidence)
- OpenClaw research (OPENCLAW-RESEARCH.md) - Memory flush, entity extraction patterns
- NLP.js GitHub - Entity extraction concepts
- fuzzy npm - Fuzzy matching for search

### Tertiary (LOW confidence)
- WebSearch results for file path regex - General patterns, needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - @inquirer/search API verified but version currency unconfirmed
- Architecture: HIGH - Follows established project patterns
- Pitfalls: MEDIUM - Based on general CLI development experience + project learnings
- Entity extraction: LOW - LLM integration approach needs validation

**Research date:** 2026-01-31
**Valid until:** 2026-02-28 (30 days - libraries stable)
