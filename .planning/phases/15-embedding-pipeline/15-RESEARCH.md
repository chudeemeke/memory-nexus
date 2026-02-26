# Phase 15: Embedding Pipeline - Research

**Researched:** 2026-02-26
**Domain:** Sync workflow integration, embedding state management, background processing
**Confidence:** HIGH

## Summary

Phase 15 integrates embedding generation into the existing sync workflow. The foundation is solid: Phase 14 delivered `IEmbeddingProvider`, `TransformersJsProvider`, `EmbeddingProviderFactory`, `embedding_state` table, `message_embeddings` vec0 table, and config management. This phase wires those components into the sync pipeline with an `--embed` flag, tracks embedding state per message for incremental processing, handles model changes with re-embedding, and supports background mode.

The key architectural insight is that embedding is a **second pass** after extraction, not interleaved with it. The sync command already follows a discover-filter-extract pattern. Embedding appends an embed pass that queries `messages_meta LEFT JOIN embedding_state` for unembedded messages, batches them through the provider, and stores vectors in `message_embeddings` + state in `embedding_state` within a single transaction per batch. This is the standard ingest-then-embed pattern used by OpenClaw, Pinecone, and similar systems.

No new external libraries are needed. The existing `cli-progress`, `node:child_process`, and infrastructure patterns handle progress, background spawning, and logging. The `EmbeddingProviderFactory` creates providers from config; the provider's `initialize(onProgress)` handles first-run model download. The `embedding_state.model_hash` column enables model change detection via hash comparison.

**Primary recommendation:** Build an `EmbeddingService` in the application layer that accepts `IEmbeddingProvider`, database handle, and batch config. The sync command orchestrates: extract -> initialize provider -> embed unembedded messages -> report summary. Keep embedding in a separate transaction from extraction so sync data is safe even if embedding fails.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Embedding is a second pass AFTER extraction completes (industry-standard ingest-then-embed pattern)
- Opt-in via `--embed` flag; `memory sync` without it stays fast and never loads ONNX
- `--embed` processes ALL unembedded messages (not just current sync run) -- one command catches up
- Embedding runs in a SEPARATE database transaction from sync extraction -- if embedding fails, sync data is safe
- cli-progress bar with message count + ETA during embedding pass (reuse existing TtyProgressReporter pattern)
- First-run model download (23MB) gets its own SEPARATE progress indicator before the embedding bar starts
- Completion summary: "Embedded 500 messages in 32s (15.6 msg/s)" -- matches sync's existing summary style
- On failure partway through: "Embedding failed at 300/500 messages. Run memory sync --embed to resume from where it stopped." Already-embedded messages kept.
- `memory sync --embed --background` spawns a detached child process (reuse existing spawnBackgroundSync pattern from hook-runner.ts)
- `memory status` shows background embedding progress (PID, message count)
- PID lock file in data dir prevents double-run: "Embedding already in progress (PID 12345). Use memory status to check progress."
- Background completion: silent exit, log entry written to existing sync log (no desktop notification)
- On model change detection: confirmation prompt "Model changed from X to Y. Re-embed all N messages? [y/N]"
- Non-interactive mode (CI, hooks, --non-interactive): skip re-embedding with warning to stderr. `--force` flag overrides to auto-re-embed.
- Re-embedding is all-or-nothing: clear old embeddings then re-embed everything (mixed model vectors produce inconsistent search results)
- Model change detected via hash comparison: hash current config model name, compare against model_hash in embedding_state table

### Claude's Discretion
- Batch size for embedding (configurable via config, reasonable default)
- Exact embedding service architecture (application layer composition)
- How the embedding pass queries unembedded messages (SQL strategy)
- Error retry logic within a batch

### Deferred Ideas (OUT OF SCOPE)
- Knowledge layer (agent-written memory, pre-compaction hooks, temporal decay) -- separate milestone after v2.0, PRD at docs/plans/PRD-knowledge-layer.md
- Parallel/concurrent embedding within a batch -- optimize in Phase 17 or later if needed
- Embedding-aware search commands -- Phase 16 (Hybrid Search)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PIPE-01 | Integrate embedding generation into sync pipeline with `--embed` flag | Sync command extension pattern identified; `SyncOptions` already supports extensible options; embedding as second pass after extraction complete |
| PIPE-02 | Implement embedding cache with model_hash tracking; model change triggers full re-embedding | `embedding_state.model_hash` column exists from Phase 14; SHA-256 of `provider:model:dimensions` string; detection via `SELECT DISTINCT model_hash FROM embedding_state LIMIT 1` comparison |
| PIPE-03 | Batch embedding with configurable batch size and progress reporting | `IEmbeddingProvider.embedBatch()` ready; `cli-progress` already used for sync; configurable `batchSize` in `EmbeddingConfigData` interface |
| PIPE-04 | Background embedding: sync completes immediately, embeddings generate asynchronously | `spawnBackgroundSync` pattern in `hook-runner.ts`; PID lock file pattern; detached child process with log redirect |
| PIPE-05 | Track embedding state per message (message_id, embedded_at, model_hash) | `embedding_state` table exists with exactly these columns; `message_id` is `messages_meta.rowid` (integer, autoincrement) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | built-in | Database operations for embedding_state and message_embeddings | Already in use; direct SQL for batch inserts into vec0 table |
| cli-progress | 3.12.0 | Progress bar for embedding pass | Already used by TtyProgressReporter for sync; reuse same pattern |
| node:child_process | built-in | Background process spawning | Already used by spawnBackgroundSync in hook-runner.ts |
| node:crypto | built-in | SHA-256 hash for model_hash generation | Built into Node/Bun; createHash is synchronous |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @huggingface/transformers | 3.8.1 | Embedding generation via TransformersJsProvider | Loaded lazily only when --embed flag used |
| sqlite-vec | 0.1.6 | vec0 table for storing embeddings | Already loaded by connection.ts; INSERT via vec_f32() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 for model_hash | Simple string concatenation | Hash is fixed-length and collision-resistant; string concat works too but hash is cleaner for DB indexing |
| Batch INSERT in transaction | Individual INSERT per message | Batch is 10-50x faster for SQLite; individual gives finer error granularity |
| Detached child process | Worker thread | Detached process survives parent exit (required for --background); worker threads die with parent |

**Installation:**
No new dependencies required. All libraries are already in `package.json`.

## Architecture Patterns

### Recommended Project Structure
```
src/
  application/
    services/
      embedding-service.ts       # NEW: Orchestrates embedding pipeline
      embedding-service.test.ts  # NEW: Unit tests
      sync-service.ts            # EXISTING: Unchanged
  infrastructure/
    database/
      repositories/
        embedding-repository.ts       # NEW: embedding_state + message_embeddings CRUD
        embedding-repository.test.ts  # NEW: Integration tests
    embedding/
      embedding-provider-factory.ts   # EXISTING: Unchanged
      transformers-js-provider.ts     # EXISTING: Unchanged
  presentation/
    cli/
      commands/
        sync.ts                  # MODIFIED: Add --embed, --background flags
        status.ts                # MODIFIED: Show background embedding info
      progress-reporter.ts       # MODIFIED: Add embedding-specific reporter variant
```

### Pattern 1: EmbeddingService (Application Layer)
**What:** Application service that orchestrates the embedding pipeline: query unembedded messages, batch them, embed via provider, store results.
**When to use:** Called by sync command when `--embed` flag is present.
**Example:**
```typescript
// Application layer service - depends on ports, not infrastructure
export class EmbeddingService {
  constructor(
    private readonly db: Database,
    private readonly provider: IEmbeddingProvider,
    private readonly batchSize: number = 100,
  ) {}

  async embedUnembedded(options: EmbedOptions): Promise<EmbedResult> {
    // 1. Query unembedded messages
    const unembedded = this.queryUnembedded();
    // 2. Process in batches
    for (const batch of chunks(unembedded, this.batchSize)) {
      const results = await this.provider.embedBatch(batch.map(m => m.content));
      this.storeBatch(batch, results, modelHash);
      options.onProgress?.(progress);
    }
    // 3. Return summary
    return { embedded: count, durationMs, rate };
  }
}
```

### Pattern 2: Unembedded Message Query (SQL Strategy)
**What:** LEFT JOIN to find messages without embeddings for the current model.
**When to use:** Every embedding pass needs this query.
**Example:**
```sql
-- Find messages not yet embedded (or embedded with different model)
SELECT m.rowid, m.content
FROM messages_meta m
LEFT JOIN embedding_state es ON m.rowid = es.message_id
WHERE es.message_id IS NULL
ORDER BY m.rowid ASC
LIMIT ?
```

This is efficient because:
- `embedding_state.message_id` is PRIMARY KEY (indexed)
- LEFT JOIN + IS NULL is the standard "find missing" pattern in SQL
- ORDER BY rowid is a clustered index scan (fast)
- LIMIT enables batch processing

### Pattern 3: Batch Insert into vec0 + embedding_state
**What:** Transaction wrapping vec0 INSERT + embedding_state INSERT per batch.
**When to use:** Storing embedding results after each batch completes.
**Example:**
```typescript
const insertEmbedding = db.prepare(
  "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
);
const insertState = db.prepare(
  "INSERT INTO embedding_state(message_id, embedded_at, model_hash) VALUES (?, ?, ?)"
);

const storeBatch = db.transaction((items: BatchItem[]) => {
  const now = new Date().toISOString();
  for (const item of items) {
    insertEmbedding.run(item.rowid, item.embedding);
    insertState.run(item.rowid, now, modelHash);
  }
});
storeBatch.immediate(batchItems);
```

### Pattern 4: Model Change Detection
**What:** Compare current config's model hash against stored model_hash in embedding_state.
**When to use:** At the start of every `--embed` run, before processing.
**Example:**
```typescript
function computeModelHash(config: EmbeddingConfigData): string {
  const input = `${config.provider}:${config.model}:${config.dimensions}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// Check if stored embeddings use a different model
const stored = db.query<{ model_hash: string }, []>(
  "SELECT DISTINCT model_hash FROM embedding_state LIMIT 1"
).get();

if (stored && stored.model_hash !== currentHash) {
  // Model changed - prompt for re-embedding
}
```

### Pattern 5: Background Embedding via Detached Process
**What:** Spawn `memory sync --embed --quiet` as a detached child process with PID lock.
**When to use:** When `--background` flag is present.
**Example:**
```typescript
// Write PID lock file
const lockPath = join(getDataDir(), "embedding.lock");
writeFileSync(lockPath, JSON.stringify({ pid, startedAt, messageCount }));

// Spawn detached process (reuse spawnBackgroundSync pattern)
const subprocess = spawn(command, args, {
  detached: true,
  stdio: ["ignore", out, err],
});
subprocess.unref();
```

### Anti-Patterns to Avoid
- **Embedding inside extraction transaction:** Breaks the "separate transaction" constraint. If ONNX fails, extraction data would be rolled back.
- **Loading ONNX on every sync:** Without `--embed`, the provider factory should never be called. Guard with early return.
- **Mixed model vectors in message_embeddings:** Re-embedding must be all-or-nothing. Never leave mixed model vectors; they produce meaningless cosine distances.
- **Unbounded query for unembedded messages:** Always LIMIT + paginate. A user with 100K unembedded messages would OOM if loaded into JS at once.
- **Blocking background process:** The `--background` flag must return control immediately. Never wait for the child process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom console.log progress | `cli-progress` SingleBar | ETA calculation, TTY detection, bar rendering handled |
| Background process | Custom daemon/fork logic | `node:child_process.spawn` with detached+unref | Proven pattern already in `hook-runner.ts` |
| Model hash | Custom hash function | `node:crypto.createHash("sha256")` | Correct, fast, collision-resistant |
| Batch chunking | Manual array slicing | Simple utility function | Avoid off-by-one errors |
| PID lock | Custom file locking | Write JSON file + check PID existence | POSIX kill(pid, 0) for liveness check |

**Key insight:** The existing codebase already has patterns for every infrastructure concern this phase needs. Reuse `spawnBackgroundSync`, `createProgressReporter`, `logSync`, and `loadConfig` rather than building new infrastructure.

## Common Pitfalls

### Pitfall 1: vec0 rowid must match messages_meta rowid
**What goes wrong:** Inserting into `message_embeddings` with the message's UUID (string id) instead of its integer `rowid` from `messages_meta`.
**Why it happens:** The `messages_meta` table has both `rowid` (INTEGER autoincrement) and `id` (TEXT UUID). The `embedding_state` and `message_embeddings` tables both use the integer `rowid` as the key.
**How to avoid:** Always query `SELECT rowid, content FROM messages_meta` when collecting messages for embedding. The rowid is the join key between `messages_meta`, `messages_fts`, `embedding_state`, and `message_embeddings`.
**Warning signs:** "constraint failed" errors on INSERT, or zero results from vec0 MATCH queries that should return data.

### Pitfall 2: TransformersJsProvider.embedBatch() is sequential
**What goes wrong:** Assuming `embedBatch()` is parallelized when the Phase 14 implementation processes one text at a time in a loop.
**Why it happens:** The current `embedBatch()` calls `embed()` in sequence. This is by design (simple and correct), but means batch size affects throughput linearly.
**How to avoid:** Set a reasonable default batch size (50-100 messages) to balance memory usage and commit frequency. The provider does the heavy lifting per call; the batch is for transaction grouping and progress reporting.
**Warning signs:** Very slow embedding with large batch sizes; the batch size doesn't improve throughput, it only affects how often we commit and report progress.

### Pitfall 3: PID lock file stale after crash
**What goes wrong:** Background embedding crashes, leaving a PID lock file. Next `--background` run refuses to start because lock exists.
**Why it happens:** Detached processes that crash or are killed don't clean up lock files.
**How to avoid:** On detecting an existing lock file, check if the PID is still alive using `process.kill(pid, 0)` (signal 0 = existence check, doesn't actually kill). If the process is dead, delete the stale lock and proceed.
**Warning signs:** "Embedding already in progress" error when no embedding is actually running.

### Pitfall 4: Re-embedding deletes vec0 rows but FK cascade deletes embedding_state
**What goes wrong:** Deleting from `message_embeddings` triggers FK cascade deletes on `embedding_state`, or vice versa.
**Why it happens:** The `embedding_state.message_id` has a FK to `messages_meta(rowid)`, not to `message_embeddings`. The `message_embeddings` is a vec0 virtual table with no FK relationships. These are independent tables sharing a key.
**How to avoid:** For re-embedding: `DELETE FROM message_embeddings` (clears all vectors) + `DELETE FROM embedding_state` (clears all tracking). Both must be deleted. Then re-embed from scratch.
**Warning signs:** After re-embedding, `embedding_state` still has old model_hash entries, or `message_embeddings` still has stale vectors.

### Pitfall 5: --background + model change prompt conflict
**What goes wrong:** Background mode spawns a detached process, but model change detection requires an interactive confirmation prompt.
**Why it happens:** Detached processes have no TTY for prompts.
**How to avoid:** Background mode implies non-interactive. If model change is detected in `--background` mode, skip re-embedding with a warning logged to sync.log. User must run interactive `memory sync --embed` to confirm re-embedding.
**Warning signs:** Background process hangs waiting for stdin input that will never come.

## Code Examples

Verified patterns from the existing codebase:

### Querying Unembedded Messages
```typescript
// Using the existing message_meta + embedding_state schema
interface UnembeddedMessage {
  rowid: number;
  content: string;
}

const stmt = db.prepare<UnembeddedMessage, [number]>(`
  SELECT m.rowid, m.content
  FROM messages_meta m
  LEFT JOIN embedding_state es ON m.rowid = es.message_id
  WHERE es.message_id IS NULL
  ORDER BY m.rowid ASC
  LIMIT ?
`);

const batch = stmt.all(batchSize);
```

### Storing Embeddings (vec0 + state)
```typescript
// Based on sqlite-vec documentation and schema.ts pattern
const insertVec = db.prepare(
  "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
);
const insertState = db.prepare(
  `INSERT INTO embedding_state(message_id, embedded_at, model_hash)
   VALUES (?, ?, ?)`
);

const storeBatch = db.transaction((items: Array<{
  rowid: number;
  embedding: Float32Array;
}>) => {
  const now = new Date().toISOString();
  for (const item of items) {
    insertVec.run(item.rowid, item.embedding);
    insertState.run(item.rowid, now, modelHash);
  }
});
storeBatch.immediate(batchItems);
```

### Model Hash Computation
```typescript
import { createHash } from "node:crypto";

function computeModelHash(config: EmbeddingConfigData): string {
  // Matches the factory cache key pattern: provider:model:dimensions
  const input = `${config.provider}:${config.model}:${config.dimensions}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
```

### Spawning Background Embedding (reusing hook-runner pattern)
```typescript
// From hook-runner.ts pattern
import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";

function spawnBackgroundEmbedding(options: {
  logDir: string;
  lockPath: string;
}): SpawnResult {
  const logPath = join(options.logDir, "sync.log");
  const out = openSync(logPath, "a");
  const err = openSync(logPath, "a");

  const args = ["sync", "--embed", "--quiet"];
  const subprocess = spawn("memory", args, {
    detached: true,
    stdio: ["ignore", out, err],
    env: { ...process.env, MEMORY_EMBED_BACKGROUND: "1" },
  });
  subprocess.unref();

  // Write PID lock
  writeFileSync(options.lockPath, JSON.stringify({
    pid: subprocess.pid,
    startedAt: new Date().toISOString(),
  }));

  return { pid: subprocess.pid };
}
```

### Progress Reporter for Embedding
```typescript
// Reusing existing TtyProgressReporter pattern
const bar = new cliProgress.SingleBar({
  format: "Embedding |{bar}| {percentage}% | {value}/{total} messages | ETA: {eta_formatted}",
  barCompleteChar: "\u2588",
  barIncompleteChar: "\u2591",
  hideCursor: true,
  etaBuffer: 20,  // Smooth ETA over last 20 updates
});
```

### Embedding Summary Format
```typescript
// Matches existing sync summary style
const rate = (embedded / (durationMs / 1000)).toFixed(1);
console.log(`\nEmbedded ${embedded} messages in ${(durationMs / 1000).toFixed(0)}s (${rate} msg/s)`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Embed during extraction | Embed as separate pass after extraction | Industry standard since RAG pipelines 2023+ | Cleaner error isolation, resumable |
| Re-embed incrementally on model change | All-or-nothing re-embed | Pinecone/Weaviate guidance 2024+ | Mixed model vectors produce meaningless distances |
| Sync progress bars | Two-phase progress (extraction bar + embedding bar) | This phase | Users see both phases distinctly |

**Deprecated/outdated:**
- Embedding during extraction (couples ONNX failures to data loss)
- Manual embedding tracking via application state (DB-level tracking with `embedding_state` is more reliable)

## Open Questions

1. **vec_f32() input format in bun:sqlite**
   - What we know: sqlite-vec docs show `vec_f32(?)` with Float32Array as parameter
   - What's unclear: Whether bun:sqlite passes Float32Array correctly to sqlite-vec's vec_f32() function, or if it needs Buffer conversion
   - Recommendation: Verify with a simple insert test in Wave 0. The Phase 14 schema tests insert into embedding_state but not into message_embeddings vec0 table. Confidence: MEDIUM -- the sqlite-vec bun example shows it working, but we should validate

2. **cli-progress ETA accuracy with variable batch times**
   - What we know: cli-progress computes ETA from update rate; first batches may be slower (model warmup)
   - What's unclear: Whether the ETA will be misleading for the first few updates
   - Recommendation: Use `etaBuffer` option to smooth ETA over recent samples. Set to ~20 for a rolling average. Confidence: HIGH -- standard cli-progress configuration

3. **Embedding config batchSize field**
   - What we know: The `EmbeddingConfigData` interface currently has `enabled`, `provider`, `model`, `dimensions` -- no `batchSize`
   - What's unclear: Whether to add `batchSize` to the config interface or keep it as a CLI default
   - Recommendation: Add `batchSize` to `EmbeddingConfigData` with a default of 100. This allows users to tune without code changes. The config manager's deep-merge handles the new field gracefully.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/application/services/sync-service.ts` -- sync workflow pattern
- Existing codebase: `src/presentation/cli/progress-reporter.ts` -- progress bar implementation
- Existing codebase: `src/infrastructure/hooks/hook-runner.ts` -- background process spawning
- Existing codebase: `src/infrastructure/database/schema.ts` -- `embedding_state` and `message_embeddings` DDL
- Existing codebase: `src/infrastructure/embedding/embedding-provider-factory.ts` -- provider creation
- Existing codebase: `src/infrastructure/hooks/config-manager.ts` -- `EmbeddingConfigData` interface and `loadConfig()`
- sqlite-vec documentation: `INSERT INTO ... (rowid, embedding) VALUES (?, vec_f32(?))` pattern

### Secondary (MEDIUM confidence)
- `.planning/research/SEMANTIC-SEARCH.md` -- Embedding pipeline architecture, sqlite-vec API patterns
- cli-progress npm documentation -- `etaBuffer`, `format` string options

### Tertiary (LOW confidence)
- vec_f32() + bun:sqlite Float32Array interop -- needs validation (see Open Question 1)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun built-in test runner, v1.1+) |
| Config file | None (Bun uses defaults; `vitest.config.ts` is Stryker-only) |
| Coverage tool | `bun test --coverage` (V8 provider, built-in) |
| Mock framework | `bun:test` built-in (`mock`, `spyOn`, manual mock objects) |
| Mutation testing | Stryker + Vitest (domain layer only) |
| Quick run command | `bun test --filter embedding` |
| Full suite command | `bun test` |

### Test Patterns
| Pattern | File Locations | Example |
|---------|---------------|---------|
| Co-located unit tests | `src/**/*.test.ts` next to source | `embedding-provider-factory.test.ts` beside `embedding-provider-factory.ts` |
| Integration tests (co-located) | `src/**/*.integration.test.ts` | `sync-service.integration.test.ts` with real DB + file I/O |
| Integration tests (standalone) | `tests/integration/*.test.ts` | `interrupted-sync.test.ts`, `concurrent-commands.test.ts` |
| Smoke tests | `tests/smoke/*.test.ts` | `cli-commands.test.ts` -- all CLI commands respond to `--help` |
| Domain port contract tests | `src/domain/ports/*.test.ts` | `embedding.test.ts` -- mock provider implements IEmbeddingProvider |
| Repository tests (in-memory DB) | `src/infrastructure/database/repositories/*.test.ts` | `session-repository.test.ts` with `Database(":memory:")` + `createSchema(db)` |

### Database Testing Pattern
Tests use `bun:sqlite` in-memory databases for isolation:
```typescript
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";

let db: Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  createSchema(db);
});
afterEach(() => { db.close(); });
```

For Phase 15, the `createSchema(db)` call creates `embedding_state` and `message_embeddings` (vec0) tables. The `message_embeddings` table requires the `sqlite-vec` extension to be loaded. Tests that insert into `message_embeddings` must use a schema with `loadVec: true` (or use the `initializeDatabase` helper which loads extensions automatically).

### External Service Mocking
The project uses manual mock objects matching port interfaces (no DI container). The `IEmbeddingProvider` port already has an established mock pattern in `src/domain/ports/embedding.test.ts`:
```typescript
const createMockProvider = (
  overrides: Partial<IEmbeddingProvider> = {},
): IEmbeddingProvider => ({
  name: "mock-provider",
  dimensions: 384,
  model: "test-model",
  embed: async (text) =>
    EmbeddingResult.create({
      embedding: new Float32Array(384).fill(0.1),
      model: "test-model",
      dimensions: 384,
    }),
  embedBatch: async (texts) =>
    texts.map(() =>
      EmbeddingResult.create({
        embedding: new Float32Array(384).fill(0.1),
        model: "test-model",
        dimensions: 384,
      }),
    ),
  isReady: () => true,
  initialize: async () => {},
  dispose: async () => {},
  ...overrides,
});
```

For `node:child_process`, the project uses `spyOn` on the module (see `hook-runner.test.ts`):
```typescript
import * as childProcess from "node:child_process";
const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProcess);
```

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | `--embed` flag triggers embedding pass after extraction | unit | `bun test src/presentation/cli/commands/sync.test.ts` | Exists (needs --embed tests added) |
| PIPE-01 | EmbeddingService.embedUnembedded() orchestrates batch pipeline | unit | `bun test src/application/services/embedding-service.test.ts` | Wave 0 |
| PIPE-01 | Sync with --embed end-to-end (extract then embed) | integration | `bun test src/application/services/sync-service.integration.test.ts` | Exists (needs --embed scenario added) |
| PIPE-02 | computeModelHash() produces consistent SHA-256 truncated hash | unit | `bun test src/application/services/embedding-service.test.ts` | Wave 0 |
| PIPE-02 | Model change detection: different hash triggers prompt | unit | `bun test src/application/services/embedding-service.test.ts` | Wave 0 |
| PIPE-02 | Re-embedding clears all vectors + state, then re-embeds | integration | `bun test src/infrastructure/database/repositories/embedding-repository.test.ts` | Wave 0 |
| PIPE-03 | Batch processing with configurable size and progress callback | unit | `bun test src/application/services/embedding-service.test.ts` | Wave 0 |
| PIPE-03 | Progress bar updates during embedding pass | unit | `bun test src/presentation/cli/progress-reporter.test.ts` | Exists (needs embedding reporter tests) |
| PIPE-04 | --background spawns detached process, writes PID lock | unit | `bun test src/presentation/cli/commands/sync.test.ts` | Exists (needs --background tests added) |
| PIPE-04 | PID lock prevents double-run, stale lock detection | unit | `bun test src/application/services/embedding-service.test.ts` | Wave 0 |
| PIPE-04 | status command shows background embedding info | unit | `bun test src/presentation/cli/commands/status.test.ts` | Exists (needs embedding status tests) |
| PIPE-05 | embedding_state CRUD: insert, query unembedded, delete all | integration | `bun test src/infrastructure/database/repositories/embedding-repository.test.ts` | Wave 0 |
| PIPE-05 | message_embeddings vec0 insert with vec_f32() | integration | `bun test src/infrastructure/database/repositories/embedding-repository.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test --filter embedding` (runs only embedding-related tests, < 10s)
- **Per wave merge:** `bun test` (full suite, all unit + integration + smoke tests)
- **Phase gate:** Full suite green + `bun test --coverage` showing 95%+ at each metric before verification

### Wave 0 Gaps
- [ ] `src/application/services/embedding-service.test.ts` -- covers PIPE-01, PIPE-02, PIPE-03, PIPE-04 (unit tests for EmbeddingService orchestration, model hash, batching, PID lock)
- [ ] `src/infrastructure/database/repositories/embedding-repository.test.ts` -- covers PIPE-02, PIPE-05 (integration tests: embedding_state CRUD, message_embeddings vec0 inserts, bulk delete for re-embedding, unembedded message query)
- [ ] Verify `createSchema(db)` with sqlite-vec loads correctly in test environment for vec0 table operations (Open Question 1: Float32Array + vec_f32() interop)
- [ ] Add `--embed` and `--background` flag tests to existing `src/presentation/cli/commands/sync.test.ts`
- [ ] Add embedding progress reporter variant tests to existing `src/presentation/cli/progress-reporter.test.ts`
- [ ] Add background embedding status display tests to existing `src/presentation/cli/commands/status.test.ts`

### Phase-Specific Validation Risks
| Risk | What Can Go Wrong | How to Verify | Test Type |
|------|-------------------|---------------|-----------|
| vec_f32() + Float32Array interop | bun:sqlite may not pass Float32Array correctly to sqlite-vec vec_f32() function; could need Buffer conversion | Insert a Float32Array via vec_f32() and read it back; compare dimensions | integration |
| Stale PID lock | Background process crashes, lock file remains, next run blocked | Write lock with fake PID, verify detection + cleanup via process.kill(pid, 0) catch | unit |
| Mixed model vectors | Partial re-embedding leaves inconsistent vectors | Assert re-embedding deletes ALL from both tables before re-inserting | integration |
| Embedding transaction isolation | Embedding failure rolls back sync data | Run sync with failing mock provider; verify extraction data persists | integration |
| Background + model change | Background mode attempts interactive prompt (hangs) | Spawn with model change; verify non-interactive skip with warning logged | unit |
| Batch boundary edge cases | Off-by-one in chunking logic; last batch smaller than batchSize | Embed exactly batchSize, batchSize+1, batchSize-1, 0 messages | unit |

### Coverage Strategy

**Unit tests (src/**/*.test.ts):**
- EmbeddingService: embedUnembedded(), computeModelHash(), batch chunking, error handling, progress callbacks, PID lock management
- Sync command: --embed flag parsing, --background flag parsing, --force + model change bypass
- Progress reporter: embedding-specific bar format, download progress indicator

**Integration tests (*.integration.test.ts + tests/integration/):**
- EmbeddingRepository: INSERT into embedding_state + message_embeddings vec0 table, LEFT JOIN unembedded query, bulk DELETE for re-embedding, round-trip verification
- Sync pipeline with --embed: full extract-then-embed flow with in-memory DB and mock provider
- vec_f32() interop validation: Float32Array insert + readback

**Smoke tests (tests/smoke/):**
- `memory sync --embed --help` responds correctly
- `memory status --help` includes embedding fields

### Test Infrastructure Notes
- No new test framework dependencies needed; bun:test covers all requirements
- The `createMockProvider()` pattern from `embedding.test.ts` should be extracted to a shared test helper (e.g., `tests/helpers/mock-provider.ts`) to avoid duplication across EmbeddingService tests, sync integration tests, and repository tests
- Repository integration tests require sqlite-vec extension loaded; use `initializeDatabase()` helper (from `connection.ts`) which handles extension loading, rather than raw `Database(":memory:")` + manual `createSchema()`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows existing sync service + progress reporter patterns, CONTEXT.md decisions are clear
- Pitfalls: HIGH -- identified from direct codebase analysis (rowid keys, sequential embedBatch, PID locks, re-embedding semantics)
- Validation: HIGH -- test framework, patterns, and mock strategies all verified from existing codebase

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable -- no fast-moving dependencies)
