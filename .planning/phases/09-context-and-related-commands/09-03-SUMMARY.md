---
phase: 09-context-and-related-commands
plan: 03
subsystem: presentation-cli
tags: [related-command, graph-traversal, formatters]
dependency-graph:
  requires: ["09-01"]
  provides: ["related-command", "related-formatter"]
  affects: ["09-04"]
tech-stack:
  added: []
  patterns: ["strategy-pattern-formatter", "commander-arg-validation"]
key-files:
  created:
    - src/presentation/cli/formatters/related-formatter.ts
    - src/presentation/cli/formatters/related-formatter.test.ts
    - src/presentation/cli/commands/related.ts
    - src/presentation/cli/commands/related.test.ts
  modified:
    - src/presentation/cli/commands/index.ts
    - src/presentation/cli/index.ts
decisions:
  - name: "RelatedSession composite type"
    rationale: "Groups Session with weight and hops for formatter consumption"
  - name: "Color thresholds 75%/50%"
    rationale: "Green >75%, yellow 50-75%, no color <50% for weight visibility"
  - name: "Hop display 'direct'/'indirect'"
    rationale: "Human-readable labels in detailed mode vs numeric in brief"
  - name: "Source session filtered from results"
    rationale: "Avoid showing the queried session as related to itself"
metrics:
  duration: "15 minutes"
  completed: "2026-01-30"
---

# Phase 9 Plan 3: Related Command Implementation Summary

Graph-based session discovery via shared topics and entities using 2-hop traversal.

## What Was Built

### 1. Related Formatter (`related-formatter.ts`)

Strategy pattern formatter for related session output with 5 modes:

**Types:**
```typescript
export type RelatedOutputMode = "default" | "json" | "brief" | "detailed" | "quiet";

export interface RelatedSession {
  session: Session;
  weight: number;
  hops: number;
}

export interface RelatedFormatOptions {
  sourceId: string;
  executionTimeMs?: number;
}

export interface RelatedFormatter {
  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string;
  formatError(error: Error): string;
  formatEmpty(sourceId: string): string;
  formatNoLinks(): string;
}
```

**Modes:**
- **Brief** (default): Numbered list with project name, weight %, relative time, hops
- **Detailed**: Full session info with path, absolute timestamp, direct/indirect labels
- **JSON**: Machine-readable with sourceId and related array
- **Quiet**: Session IDs only, one per line
- **Verbose**: Execution timing + detailed output

**Weight Color Coding:**
- Green (>75%): Strong relationship
- Yellow (50-75%): Moderate relationship
- No color (<50%): Weak relationship

### 2. Related Command (`related.ts`)

Command signature: `memory related <id>`

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Maximum results | 10 |
| `--hops <n>` | Traversal depth (1-3) | 2 |
| `--type <type>` | Entity type: session/message/topic | session |
| `--format <type>` | Output format: brief/detailed | brief |
| `--json` | JSON output | - |
| `-v, --verbose` | Show timing | - |
| `-q, --quiet` | Session IDs only | - |

**Implementation Flow:**
1. Initialize database connection
2. Create SqliteLinkRepository and SqliteSessionRepository
3. Call `findRelatedWithHops(entityType, id, hops)` for graph traversal
4. Group links by target session, take max weight per session
5. Filter out source session from results
6. Sort by weight descending, hops ascending
7. Limit results
8. Fetch full session details for each related session ID
9. Format and output
10. Close database

**Output Examples:**

Brief mode:
```
Related to session abc123...
1. wow-system (95%) - 2 hours ago [1 hop]
2. memory-nexus (72%) - 1 day ago [2 hops]
```

Detailed mode:
```
Related to session abc123...
========================================

1. wow-system
   Weight: 95% | Hops: 1 (direct)
   Path: C:\Users\Destiny\Projects\wow-system
   Last active: yesterday (2026-01-29 14:23)
   Messages: 234
```

## Files Modified

| File | Change |
|------|--------|
| `src/presentation/cli/formatters/related-formatter.ts` | Created - Strategy pattern formatter |
| `src/presentation/cli/formatters/related-formatter.test.ts` | Created - 44 tests |
| `src/presentation/cli/commands/related.ts` | Created - Command handler |
| `src/presentation/cli/commands/related.test.ts` | Created - 22 tests |
| `src/presentation/cli/commands/index.ts` | Updated - Export related command |
| `src/presentation/cli/index.ts` | Updated - Wire command, remove placeholder |

## Test Coverage

| Component | Tests | Coverage |
|-----------|-------|----------|
| Related Formatter | 44 | 98% lines |
| Related Command | 22 | 100% (structure) |
| **Total New** | **66** | **95%+** |

## Integration Points

- **SqliteLinkRepository.findRelatedWithHops()**: Multi-hop graph traversal with weight decay
- **SqliteSessionRepository.findById()**: Fetch session details for display
- **formatRelativeTime/formatTimestamp**: Time display in output
- **green/yellow from color.ts**: Weight visualization

## Commits

1. `7c89f94` - feat(09-03): add related formatter with brief/detailed modes
2. `a3530c8` - feat(09-03): add related command for graph-based session discovery

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**09-04 Show Command Integration:**
- Link repository and session repository patterns established
- Formatter strategy pattern proven and extensible
- CLI wiring pattern consistent with other commands

## Success Criteria Met

1. [x] `memory related <id>` command shows related sessions
2. [x] Results ranked by weight (higher first)
3. [x] 1-hop and 2-hop relationships both shown
4. [x] 2-hop relationships have decayed weight (via CTE multiplication)
5. [x] --limit N restricts result count
6. [x] --hops N controls traversal depth (validated 1-3)
7. [x] --format brief shows compact output
8. [x] --format detailed shows full session info
9. [x] --json outputs valid JSON
10. [x] All tests pass with 95%+ coverage
