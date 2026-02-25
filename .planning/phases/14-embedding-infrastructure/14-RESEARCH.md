# Phase 14: Embedding Infrastructure - Research

**Researched:** 2026-02-25
**Domain:** Vector embeddings, SQLite extension loading, ONNX runtime management
**Confidence:** HIGH

## Summary

Phase 14 introduces the foundation for semantic search: a pluggable embedding provider architecture in the domain layer, a TransformersJsProvider adapter in infrastructure, sqlite-vec extension loading alongside existing FTS5, schema migration for the `message_embeddings` virtual table, and lazy-loading of the ONNX runtime. This phase does NOT embed any messages or search by vector -- it establishes the infrastructure that Phases 15-16 consume.

The codebase is well-structured for this addition. The hexagonal architecture already separates domain ports from infrastructure adapters (see `ISearchService`, `ISessionRepository` patterns). The new `IEmbeddingProvider` port follows the same pattern. Database initialization (`connection.ts`) already handles FTS5 verification and schema application; sqlite-vec loading extends this existing flow. The config system (`config-manager.ts`) already handles `~/.config/memory/config.json` with merge-on-load semantics, so adding an `embedding` section is straightforward.

The key technical risk is sqlite-vec's npm package status: the "latest" tag on npm points to `0.1.7-alpha.2`, while the last stable release is `0.1.6`. Both versions use the same `sqliteVec.load(db)` API for bun:sqlite. The recommendation is to pin `sqlite-vec@0.1.6` (stable) and upgrade when 0.1.7 leaves alpha.

**Primary recommendation:** Implement in 4 plans: (1) domain port + value objects, (2) sqlite-vec loading + schema migration, (3) TransformersJsProvider with lazy loading and WASM fallback, (4) EmbeddingProviderFactory + config integration + doctor reporting.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EMBED-01 | Define `IEmbeddingProvider` port in domain layer with embed, embedBatch, isReady, initialize, dispose methods | Domain port pattern from existing `ISearchService`; value objects `EmbeddingResult`, `EmbeddingConfig` defined here |
| EMBED-02 | Implement `TransformersJsProvider` adapter using @huggingface/transformers v3 with all-MiniLM-L6-v2 default model (384 dimensions) | Transformers.js v3.8.1 pipeline API verified; dynamic import for lazy loading; `env` object for WASM fallback configuration |
| EMBED-03 | Load sqlite-vec extension alongside existing FTS5 extension in database initialization | `sqliteVec.load(db)` API in `connection.ts` after FTS5 check; platform-specific binaries bundled by sqlite-vec npm package |
| EMBED-04 | Create `message_embeddings` virtual table (vec0, float[384]) and `embedding_state` tracking table via schema migration | Schema migration in `schema.ts` using `SCHEMA_SQL` array extension; vec0 virtual table syntax verified |
| EMBED-05 | Implement `EmbeddingProviderFactory` with config-driven provider selection and lazy loading | Factory pattern; config section in `~/.config/memory/config.json`; dynamic import inside provider constructor |
| EMBED-06 | First-run model download with progress indicator | Transformers.js `progress_callback` option in pipeline construction; wire to cli-progress (already a dependency) |
| EMBED-07 | WASM fallback when onnxruntime-node initialization fails | Transformers.js `env.backends` configuration; catch native init error, reconfigure to WASM, retry |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@huggingface/transformers` | ^3.8.1 | Local embedding model runtime (ONNX) | Stable v3; Bun-compatible (Issue #558 closed); pipeline API for feature-extraction; includes onnxruntime-node@1.21.0 as dependency |
| `sqlite-vec` | 0.1.6 | Vector storage and KNN search in SQLite | Only viable SQLite vector extension with Bun support; `sqliteVec.load(db)` API; brute-force search <75ms at 200K rows |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `onnxruntime-node` | 1.21.0 | Native ONNX backend (bundled via transformers) | Automatic -- transformers.js depends on this; do NOT install separately |
| `onnxruntime-web` | (bundled) | WASM ONNX fallback backend | Automatic fallback when native fails; already a dependency of transformers.js |
| `cli-progress` | ^3.12.0 | Progress bar for model download | Already in dependencies; used for sync progress |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @huggingface/transformers v3 | v4.0.0-next.4 | v4 has 4x BERT speedup + 53% smaller bundle, but is preview-only (`@next` tag); migrate when stable |
| sqlite-vec 0.1.6 | sqlite-vec 0.1.7-alpha.2 | Alpha tagged as `latest` on npm (unusual); same API, but alpha risks regressions; pin stable |
| fastembed | -- | Uses `@pykeio/ort` (different ONNX binding); Bun compatibility unverified; smaller model selection |

**Installation:**
```bash
bun add @huggingface/transformers@^3.8.1 sqlite-vec@0.1.6
```

Note: `onnxruntime-node` and `onnxruntime-web` are transitive dependencies of `@huggingface/transformers` -- do NOT install them directly. Doing so risks version conflicts.

## Architecture Patterns

### Recommended Project Structure (New Files)

```
src/
  domain/
    ports/
      embedding.ts              # IEmbeddingProvider port interface
    value-objects/
      embedding-result.ts       # EmbeddingResult value object
      embedding-config.ts       # EmbeddingConfig value object
  infrastructure/
    embedding/
      transformers-js-provider.ts   # Default local provider (Transformers.js v3)
      embedding-provider-factory.ts # Config-driven provider instantiation
    database/
      schema.ts                     # Extended: message_embeddings + embedding_state DDL
      connection.ts                 # Extended: sqlite-vec loading alongside FTS5
      health-checker.ts             # Extended: sqlite-vec + embedding status checks
  presentation/
    cli/
      commands/
        doctor.ts                   # Extended: embedding health section
```

### Pattern 1: Domain Port with Zero External Dependencies

**What:** `IEmbeddingProvider` lives in the domain layer with no imports from infrastructure or external packages. It uses only domain value objects (`EmbeddingResult`) and primitive types.

**When to use:** Always -- this is the hexagonal architecture rule already enforced in this project.

**Example:**
```typescript
// src/domain/ports/embedding.ts
// ZERO external imports -- only domain types

export interface EmbeddingResult {
  embedding: Float32Array;
  model: string;
  dimensions: number;
}

export interface EmbeddingModelInfo {
  name: string;
  dimensions: number;
  provider: string;
}

export interface IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly model: string;

  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  isReady(): Promise<boolean>;
  initialize(onProgress?: (progress: DownloadProgress) => void): Promise<void>;
  dispose(): Promise<void>;
}

export interface DownloadProgress {
  status: "downloading" | "loading" | "ready";
  file?: string;
  loaded?: number;
  total?: number;
}
```

### Pattern 2: Lazy Dynamic Import

**What:** The ONNX runtime (~50MB in memory) loads only when `initialize()` is called, which happens only when semantic search is invoked. The `@huggingface/transformers` module is imported dynamically inside the method, not at module load time.

**When to use:** For the TransformersJsProvider -- this ensures `memory search "test"` (FTS5-only) never touches the ONNX runtime.

**Example:**
```typescript
// src/infrastructure/embedding/transformers-js-provider.ts

export class TransformersJsProvider implements IEmbeddingProvider {
  private pipeline: any = null;

  async initialize(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    if (this.pipeline) return;

    // Dynamic import: ONNX runtime only loads HERE
    const { pipeline, env } = await import("@huggingface/transformers");

    // Configure before first use
    env.allowLocalModels = false;

    try {
      this.pipeline = await pipeline("feature-extraction", this.model, {
        dtype: "q8",
        progress_callback: onProgress ? (p: any) => {
          onProgress({
            status: p.status === "ready" ? "ready" : "downloading",
            file: p.file,
            loaded: p.loaded,
            total: p.total,
          });
        } : undefined,
      });
    } catch (nativeError) {
      // WASM fallback (EMBED-07)
      console.warn("Native ONNX runtime failed, falling back to WASM backend");
      env.backends.onnx.wasm.numThreads = 1;
      this.pipeline = await pipeline("feature-extraction", this.model, {
        dtype: "q8",
        device: "wasm",
      });
    }
  }
}
```

### Pattern 3: Schema Extension via SCHEMA_SQL Array

**What:** New DDL statements are appended to the existing `SCHEMA_SQL` array in `schema.ts`. The `createSchema()` function iterates the array in order, using `CREATE ... IF NOT EXISTS` for idempotency.

**When to use:** Always for schema additions -- the existing pattern handles both fresh databases and upgrades.

**Example:**
```typescript
// Appended to SCHEMA_SQL array in schema.ts

export const MESSAGE_EMBEDDINGS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
  embedding float[384]
);
`;

export const EMBEDDING_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS embedding_state (
  message_id INTEGER PRIMARY KEY,
  embedded_at TEXT NOT NULL,
  model_hash TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages_meta(rowid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_embedding_state_model ON embedding_state(model_hash);
`;
```

### Pattern 4: Extension Loading in connection.ts

**What:** sqlite-vec loads after FTS5 verification but before schema application. The load is conditional: if sqlite-vec is not installed (e.g., in test environments), the system continues without vector support. A new `sqliteVecAvailable` field is added to `DatabaseInitResult`.

**When to use:** During database initialization in `initializeDatabase()`.

**Example:**
```typescript
// In connection.ts initializeDatabase(), after FTS5 check:

let sqliteVecAvailable = false;
try {
  const sqliteVec = await import("sqlite-vec");
  sqliteVec.load(db);
  sqliteVecAvailable = true;
} catch {
  // sqlite-vec not available -- vector search disabled, FTS5 still works
}

// Schema creation only creates vec0 tables if sqliteVec loaded
if (applySchema) {
  createSchema(db, { sqliteVecAvailable });
}
```

### Anti-Patterns to Avoid

- **Top-level import of @huggingface/transformers:** Doing `import { pipeline } from "@huggingface/transformers"` at the top of any file loaded during CLI startup will import the ONNX runtime on every command, including `memory list` and `memory search "text"`. Use dynamic `import()` inside `initialize()` only.

- **Installing onnxruntime-node separately:** `@huggingface/transformers` pins a specific version (1.21.0). Installing a different version directly causes resolution conflicts. Let it come as a transitive dependency.

- **Hardcoding 384 dimensions in SQL:** The vec0 virtual table dimension is fixed at creation time. If the user changes models later (Phase 17), the table must be dropped and recreated. Design the schema migration to accept configurable dimensions but default to 384.

- **Synchronous sqlite-vec loading in tests:** Tests using `:memory:` databases should handle sqlite-vec loading separately. The extension may not load in all test environments. Use a `sqliteVecAvailable` flag and skip vec0 table creation when false.

- **Calling `embed()` without `initialize()`:** The provider must be initialized before use. The factory should NOT auto-initialize -- the caller controls when the ONNX runtime loads. This is critical for the lazy-loading requirement (EMBED-05).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector distance computation | Manual cosine similarity in JS | sqlite-vec `MATCH` operator | sqlite-vec uses SIMD (AVX2/NEON) for 10-50x speedup over pure JS Float32Array loops |
| ONNX model loading/caching | Custom model download + cache | Transformers.js pipeline API | Handles model download, caching in `~/.cache/huggingface/`, ONNX session management, quantization |
| SQLite extension discovery | Manual .so/.dll path resolution | `sqlite-vec` npm package `load()` | Package bundles platform-specific binaries and resolves paths automatically |
| WASM fallback detection | Manual feature detection | Transformers.js `env.backends` + `device: "wasm"` | Library handles WASM runtime initialization and thread management |
| Progress reporting for download | Custom HTTP download with progress | Transformers.js `progress_callback` | Library provides standardized progress events during model download |

**Key insight:** Both `@huggingface/transformers` and `sqlite-vec` are specifically designed for the JavaScript/TypeScript ecosystem and handle platform-specific complexity internally. The implementation layer should configure and compose these libraries, not replicate their internals.

## Common Pitfalls

### Pitfall 1: sqlite-vec Load Order

**What goes wrong:** Calling `sqliteVec.load(db)` after `createSchema(db)` causes `CREATE VIRTUAL TABLE ... USING vec0(...)` to fail with "no such module: vec0".

**Why it happens:** SQLite extensions must be loaded before any SQL references their virtual table types. The extension registers the `vec0` module name with SQLite's internal registry.

**How to avoid:** Load sqlite-vec in `connection.ts` BEFORE calling `createSchema()`. The existing code structure already loads FTS5 verification first; sqlite-vec goes between FTS5 check and schema application.

**Warning signs:** "no such module: vec0" error during schema creation.

### Pitfall 2: Dynamic Import Caching in Bun

**What goes wrong:** `await import("@huggingface/transformers")` is called multiple times thinking each creates a fresh module, but Bun (and Node) cache dynamic imports. The module initializes once.

**Why it happens:** ES module semantics: `import()` returns the same module object on subsequent calls. This is actually desirable -- it means the ONNX runtime loads once and stays warm.

**How to avoid:** Design the provider as a singleton per process. The `EmbeddingProviderFactory` should cache the created provider instance. Multiple `initialize()` calls should be no-ops (idempotent).

**Warning signs:** Unexpected behavior when changing provider config mid-session (irrelevant for CLI tool but matters for tests).

### Pitfall 3: Float32Array Serialization for sqlite-vec

**What goes wrong:** Passing a JavaScript `number[]` array to sqlite-vec's `vec_f32()` SQL function instead of a `Float32Array` causes incorrect results or errors.

**Why it happens:** sqlite-vec expects raw binary float32 data. A `Float32Array` provides the correct binary representation. A `number[]` would be serialized as JSON text.

**How to avoid:** Always pass `Float32Array` to sqlite-vec query parameters. The `EmbeddingResult.embedding` field is typed as `Float32Array` for this reason.

**Warning signs:** Vector search returning zero results or garbage results despite having embeddings.

### Pitfall 4: WASM Fallback Thread Count on Windows

**What goes wrong:** WASM backend defaults to multi-threaded mode using SharedArrayBuffer, which requires specific HTTP headers in browser contexts and can fail silently in Node/Bun.

**Why it happens:** Transformers.js v3 attempts to use multi-threaded WASM by default.

**How to avoid:** When falling back to WASM, explicitly set `env.backends.onnx.wasm.numThreads = 1`. Single-threaded WASM is slower but reliable across all platforms.

**Warning signs:** Hangs or crashes during embedding generation after WASM fallback.

### Pitfall 5: Schema Migration with Existing Databases

**What goes wrong:** Adding `message_embeddings` (vec0 table) to `SCHEMA_SQL` fails on existing v1.0 databases when sqlite-vec is not loaded.

**Why it happens:** Existing databases were created without sqlite-vec. If the extension fails to load (missing binary, unsupported platform), the `CREATE VIRTUAL TABLE ... USING vec0` statement fails.

**How to avoid:** Conditionally include vec0 table creation based on `sqliteVecAvailable` flag. If sqlite-vec is not available, skip vec0 tables silently. The `embedding_state` table (regular SQL) can always be created. Doctor command reports the status.

**Warning signs:** Database initialization failure for existing users who upgrade but don't have sqlite-vec available.

## Code Examples

### sqlite-vec Loading with bun:sqlite

```typescript
// Verified pattern from sqlite-vec documentation and Bun examples
import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new Database(":memory:");
sqliteVec.load(db);

// Verify loading worked
const result = db.query("SELECT vec_version()").get() as { "vec_version()": string };
console.log(`sqlite-vec version: ${result["vec_version()"]}`);

// Create vector table
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(embedding float[384])");

// Insert a vector (must be Float32Array)
const vector = new Float32Array(384);
const stmt = db.prepare("INSERT INTO embeddings(rowid, embedding) VALUES (?, vec_f32(?))");
stmt.run(BigInt(1), vector);

// KNN query
const query = new Float32Array(384);
const results = db.prepare(`
  SELECT rowid, distance
  FROM embeddings
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT ?
`).all(query, 10);
```

### Transformers.js Feature Extraction Pipeline

```typescript
// Verified from @huggingface/transformers documentation
const { pipeline, env } = await import("@huggingface/transformers");

// Optional: disable local model loading (always fetch from HF Hub)
env.allowLocalModels = false;

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
  dtype: "q8",  // Use quantized model
  progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (progress.status === "progress" && progress.total) {
      const pct = Math.round((progress.loaded! / progress.total) * 100);
      console.log(`Downloading: ${pct}%`);
    }
  },
});

// Generate embedding
const output = await extractor("search query text", {
  pooling: "mean",
  normalize: true,
});

const embedding: number[] = output.tolist()[0]; // 384-dimensional
const float32 = new Float32Array(embedding);    // For sqlite-vec
```

### WASM Fallback Pattern

```typescript
const { pipeline, env } = await import("@huggingface/transformers");

try {
  // Attempt native ONNX first
  return await pipeline("feature-extraction", model, { dtype: "q8" });
} catch (nativeError) {
  // Native failed -- fall back to WASM
  console.warn(`Native ONNX runtime failed: ${nativeError instanceof Error ? nativeError.message : String(nativeError)}`);
  console.warn("Falling back to WASM backend (slower but universal)");

  env.backends.onnx.wasm.numThreads = 1;

  return await pipeline("feature-extraction", model, {
    dtype: "q8",
    device: "wasm",
  });
}
```

### Config Extension Pattern

```typescript
// Extending existing MemoryConfig in config-manager.ts
export interface EmbeddingConfig {
  enabled: boolean;
  provider: "local" | "openai" | "ollama";
  model: string;
  dimensions: number;
}

export interface MemoryConfig {
  // ... existing fields ...
  embedding?: EmbeddingConfig;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  enabled: true,
  provider: "local",
  model: "Xenova/all-MiniLM-L6-v2",
  dimensions: 384,
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sqlite-vss (Faiss-based) | sqlite-vec (pure C) | 2024 | sqlite-vss abandoned; sqlite-vec is active, Bun-compatible, zero deps |
| onnxruntime-node manual install | Bundled via @huggingface/transformers | Transformers.js v3 | No separate install; version locked to compatible pair |
| Transformers.js v2 (Xenova/) | v3 (@huggingface/) | v3.0.0 (2024) | New package name, improved Bun support, unified backend selection |
| Separate WASM/native packages | env.backends configuration | Transformers.js v3 | Single import handles both; runtime selection via config |

**Deprecated/outdated:**
- `sqlite-vss`: Abandoned by maintainer; replaced by `sqlite-vec`
- `Xenova/transformers.js`: Old package name; now `@huggingface/transformers`
- `onnxruntime-node` standalone install: Now a dependency of Transformers.js; manual install causes version conflicts

## Open Questions

1. **sqlite-vec npm tagging anomaly**
   - What we know: `npm view sqlite-vec dist-tags` shows `latest: 0.1.7-alpha.2`, which is alpha. Stable releases exist at 0.1.6.
   - What's unclear: Whether this is intentional or a publishing mistake. The `alpha` tag points to `0.1.7-alpha.10` (a newer alpha).
   - Recommendation: Pin `sqlite-vec@0.1.6` explicitly. Do not use `^` range. Revisit when 0.1.7 stable ships.

2. **Transformers.js v3 env.backends.onnx.wasm API surface**
   - What we know: The research doc and Transformers.js source reference `env.backends.onnx.wasm.numThreads` for WASM configuration.
   - What's unclear: Exact API shape may have changed between 3.6.x (research date) and 3.8.1 (current). The `device: "wasm"` parameter in `pipeline()` may be the preferred mechanism.
   - Recommendation: During implementation, verify the WASM fallback mechanism against the actual 3.8.1 API. The integration test should validate native-failure-to-WASM-fallback.

3. **connection.ts synchronous vs async for extension loading**
   - What we know: `initializeDatabase()` is currently synchronous. `sqliteVec.load(db)` is synchronous. But dynamic `import("sqlite-vec")` is async.
   - What's unclear: Whether to make `initializeDatabase()` async or pre-import sqlite-vec.
   - Recommendation: Keep `initializeDatabase()` synchronous. Import sqlite-vec at the top of `connection.ts` (it is lightweight -- just path resolution for the native extension). The ONNX runtime import stays dynamic in the provider.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | bunfig.toml |
| Quick run command | `bun test src/domain/ports/embedding.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EMBED-01 | IEmbeddingProvider port interface + value objects | unit | `bun test src/domain/ports/embedding.test.ts` | Wave 0 |
| EMBED-02 | TransformersJsProvider with correct model/dimensions | unit + integration | `bun test src/infrastructure/embedding/transformers-js-provider.test.ts` | Wave 0 |
| EMBED-03 | sqlite-vec loads alongside FTS5 | unit | `bun test src/infrastructure/database/connection.test.ts` | Existing (extend) |
| EMBED-04 | message_embeddings + embedding_state tables created | unit | `bun test src/infrastructure/database/schema.test.ts` | Existing (extend) |
| EMBED-05 | EmbeddingProviderFactory lazy loads, config-driven | unit | `bun test src/infrastructure/embedding/embedding-provider-factory.test.ts` | Wave 0 |
| EMBED-06 | Progress indicator during model download | unit | `bun test src/infrastructure/embedding/transformers-js-provider.test.ts` | Wave 0 (mock) |
| EMBED-07 | WASM fallback on native failure | unit | `bun test src/infrastructure/embedding/transformers-js-provider.test.ts` | Wave 0 (mock) |

### Sampling Rate

- **Per task commit:** `bun test --bail` (stop on first failure)
- **Per plan merge:** `bun test` (full suite)
- **Phase gate:** Full suite green + coverage thresholds met

### Wave 0 Gaps

- [ ] `src/domain/ports/embedding.test.ts` -- covers EMBED-01 (interface contract tests)
- [ ] `src/domain/value-objects/embedding-result.test.ts` -- covers EmbeddingResult value object
- [ ] `src/domain/value-objects/embedding-config.test.ts` -- covers EmbeddingConfig value object
- [ ] `src/infrastructure/embedding/transformers-js-provider.test.ts` -- covers EMBED-02, EMBED-06, EMBED-07
- [ ] `src/infrastructure/embedding/embedding-provider-factory.test.ts` -- covers EMBED-05
- [ ] Extend `src/infrastructure/database/connection.test.ts` -- covers EMBED-03
- [ ] Extend `src/infrastructure/database/schema.test.ts` -- covers EMBED-04

## Sources

### Primary (HIGH confidence)

- npm registry: `@huggingface/transformers@3.8.1` dependencies verified via `npm view` (onnxruntime-node@1.21.0, onnxruntime-web dev version)
- npm registry: `sqlite-vec` version analysis (latest=0.1.7-alpha.2, stable=0.1.6, platform deps verified)
- Codebase inspection: `connection.ts`, `schema.ts`, `config-manager.ts`, `health-checker.ts`, `doctor.ts` patterns verified by reading source
- SEMANTIC-SEARCH.md: Prior research (2026-02-18) with verified sources from sqlite-vec docs, Transformers.js GitHub, Bun issues
- Bun version: 1.3.5 (verified locally, well past the 1.2.6 Windows onnxruntime fix)

### Secondary (MEDIUM confidence)

- sqlite-vec Bun example: `https://github.com/asg017/sqlite-vec/blob/main/examples/simple-bun/demo.ts` (referenced in prior research)
- Transformers.js Issue #558 (Bun support) resolution: Closed October 2025 (from prior research)
- Transformers.js progress_callback API: Documented in library source but not extensively in user docs

### Tertiary (LOW confidence)

- `env.backends.onnx.wasm.numThreads` API: Based on training data and prior research; needs verification against 3.8.1 actual exports
- `device: "wasm"` pipeline parameter: Documented in Transformers.js v3 but specific behavior with bun:sqlite may differ

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Versions verified via npm registry; API patterns validated against existing codebase architecture
- Architecture: HIGH - Extends well-established hexagonal patterns already in use; no new architectural concepts
- Pitfalls: HIGH - Informed by existing codebase patterns (FTS5 load order, schema migration, test isolation) and prior research
- WASM fallback: MEDIUM - API surface needs runtime verification against 3.8.1; concept is sound but exact configuration may differ

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable libraries; main risk is sqlite-vec alpha promotion)
