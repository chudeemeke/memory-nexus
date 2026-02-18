# Semantic Search Research: Local Embedding Models for memory-nexus v2.0

**Project:** memory-nexus (Claude Code Session Extraction and Search)
**Research Date:** 2026-02-18
**Overall Confidence:** MEDIUM-HIGH
**Research Mode:** Ecosystem + Feasibility

---

## Executive Summary

Adding hybrid search (vector similarity + BM25) to memory-nexus is feasible with the current ecosystem. The recommended approach is **Transformers.js v3 (stable) for local embeddings + sqlite-vec for vector storage + Reciprocal Rank Fusion for hybrid scoring**. This combination runs entirely local, works with Bun, and fits the existing hexagonal architecture via a pluggable `IEmbeddingProvider` port.

The most significant finding is that Transformers.js has resolved its Bun compatibility issues (GitHub Issue #558 closed October 2025), and sqlite-vec has explicit Bun support with a working `sqliteVec.load(db)` API for `bun:sqlite`. The pieces fit together.

The recommended default embedding model is **all-MiniLM-L6-v2** (384 dimensions, ~23MB quantized ONNX) for its speed and small footprint. For users who want higher quality, **nomic-embed-text-v1.5** (768 dimensions with Matryoshka truncation support, ~137MB quantized) is the upgrade path. Both have pre-built ONNX weights on Hugging Face ready for Transformers.js consumption.

**Key risk:** onnxruntime-node on Windows with Bun had a regression in Bun 1.2.5 (fixed via PR #18107), demonstrating that Bun+ONNX compatibility can break between minor versions. The mitigation is pinning Bun versions and having a CI test that validates embedding generation works.

---

## 1. Local Embedding Models

### 1.1 Runtime Options for JS-Native Embeddings

There are three viable approaches to running embedding models locally in JavaScript/TypeScript:

| Approach | Library | ONNX Backend | Bun Status | Confidence |
|----------|---------|-------------|------------|------------|
| **Transformers.js v3** | `@huggingface/transformers` | onnxruntime-node | Working (Issue #558 resolved Oct 2025) | HIGH |
| **Transformers.js v4** | `@huggingface/transformers@next` | onnxruntime (new C++ WebGPU runtime) | Explicitly supported | MEDIUM (preview) |
| **FastEmbed** | `fastembed` | onnxruntime-node via `@pykeio/ort` | Unverified | LOW |

#### Recommendation: Transformers.js v3 (stable)

Use `@huggingface/transformers` v3 (currently at 3.6.x). Rationale:

1. **Stable release** -- v4 is still in preview (`@next` tag on npm). For a CLI tool that ships to users, stability matters more than bleeding-edge performance.
2. **Bun compatibility confirmed** -- Issue #558 was closed as resolved. The fix was adding `onnxruntime-node` as an optional dependency, which the library auto-detects.
3. **Mature model ecosystem** -- Thousands of ONNX models on Hugging Face with the `Xenova/` prefix are pre-converted and ready to use.
4. **Pipeline API is simple** -- `pipeline("feature-extraction", modelName)` is the entire API surface.

**Migration path to v4:** When v4 reaches stable, it brings a 4x speedup for BERT-based embedding models via the `com.microsoft.MultiHeadAttention` ONNX operator. The pipeline API is compatible, so migration should be a version bump.

**Why not FastEmbed:** It depends on `onnxruntime-node` via `@pykeio/ort` (a different ONNX binding). Bun compatibility is unverified. The model selection is more limited. Transformers.js gives access to the full Hugging Face model hub.

#### Code Pattern for Embedding Generation

```typescript
import { pipeline } from "@huggingface/transformers";

// Initialize once, reuse across calls
const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2",
  { dtype: "q8" }  // Use quantized model for speed
);

// Generate embeddings
const output = await extractor(
  "search query text here",
  { pooling: "mean", normalize: true }
);

// output.tolist() returns number[][] -- first element is the embedding
const embedding: number[] = output.tolist()[0]; // 384-dimensional vector
```

### 1.2 Model Selection

Three models evaluated for the memory-nexus use case (Claude Code sessions containing mixed code + natural language + tool calls):

| Model | Dimensions | Quantized ONNX Size | Context Window | Quality (MTEB) | Speed | Recommendation |
|-------|-----------|---------------------|----------------|----------------|-------|---------------|
| **all-MiniLM-L6-v2** | 384 | ~23 MB (uint8) | 512 tokens | Moderate (56% Top-5) | Fastest (14.7ms/1K tokens) | Default model |
| **nomic-embed-text-v1.5** | 64-768 (Matryoshka) | ~137 MB (uint8) | 8192 tokens | High | Moderate | Quality upgrade |
| **BGE-small-en-v1.5** | 384 | ~33 MB (uint8) | 512 tokens | Good | Fast | Alternative default |

#### Default: all-MiniLM-L6-v2

**Why:** Speed is the priority for a CLI tool that needs to embed queries at search time. 23MB is a reasonable first-download size. 384 dimensions keeps sqlite-vec storage compact and queries fast. The 512-token context window is sufficient because memory-nexus already chunks session messages individually.

**Tradeoff acknowledged:** This is a 2019-era model architecture. It will miss semantic nuances that newer models catch. For a session search tool where the user already has approximate keywords in mind, BM25 will catch what the vector search misses -- that is the entire point of hybrid search.

**Hugging Face ID:** `Xenova/all-MiniLM-L6-v2` (pre-converted ONNX for Transformers.js)

#### Quality Upgrade: nomic-embed-text-v1.5

**Why as upgrade:** Matryoshka Representation Learning allows truncating embeddings from 768 to 384 or even 256 dimensions with minimal quality loss. The 8192-token context window handles long assistant responses without chunking. Top-tier MTEB scores.

**Tradeoff:** 137MB quantized model is 6x larger than all-MiniLM-L6-v2. Slower inference. The `nomic-ai/nomic-embed-text-v1.5` model on Hugging Face has ONNX weights but they may need the `Xenova/` prefix version for optimal Transformers.js compatibility (needs verification).

**When to recommend:** Users who search by concept rather than keyword, users with large session databases, users who run on machines with 16GB+ RAM.

#### Code-Specific Consideration

Claude Code sessions contain a mix of code, natural language, tool calls, and structured output. General-purpose embedding models (all-MiniLM, nomic-embed) handle natural language well but are weaker on code semantics. Dedicated code embedding models like **Qodo-Embed-1** exist but are too large (1.5B+ parameters) for local CLI use.

**Mitigation:** The hybrid search design compensates. BM25/FTS5 excels at exact code matches (function names, error codes, file paths). Vector search handles the "I remember discussing authentication patterns" conceptual queries. Together they cover both modalities.

### 1.3 Bun Compatibility Details

#### onnxruntime-node + Bun

| Platform | Status | Notes |
|----------|--------|-------|
| **Linux** | Working | Stable since Transformers.js Issue #558 resolution |
| **macOS** | Working | Initial M1/Apple Silicon issues resolved |
| **Windows** | Working (with caveat) | Bun 1.2.5 had a regression (Issue #18079) -- fix merged in PR #18107. Pin Bun >= 1.2.6 on Windows. |

**Root cause of Windows issue:** UTF-8/ASCII text was being reinterpreted as UTF-16 in NAPI string conversion, corrupting file paths. The fix was better edge-case handling in `napi_value <-> String` conversion.

**Critical action item:** Pin minimum Bun version in `package.json` engines field. Add CI test that runs embedding generation on Windows.

#### First-Run Model Download

Transformers.js downloads models from Hugging Face Hub on first use and caches them locally. For a CLI tool:

1. **Cache location:** `~/.cache/huggingface/` by default (configurable via `env.cacheDir`)
2. **First search will be slow:** Model download + ONNX runtime initialization takes 5-30 seconds depending on model size and connection speed
3. **Subsequent searches:** ONNX session cached in memory for the process lifetime, sub-second for embedding generation

**UX recommendation:** Show a progress indicator on first use: "Downloading embedding model (23 MB, one-time setup)..."

---

## 2. Vector Storage in SQLite

### 2.1 sqlite-vec (Recommended)

**Use sqlite-vec.** It is the clear winner for this use case.

| Feature | sqlite-vec | sqlite-vss | Manual BLOB |
|---------|-----------|-----------|-------------|
| **Status** | Active development | Abandoned | N/A |
| **Dependencies** | Pure C, zero deps | Faiss C++ library | None |
| **Bun support** | Explicit (docs + examples) | Unknown | N/A |
| **Windows support** | Yes (npm: `sqlite-vec-windows-x64`) | Problematic | Yes |
| **Install** | `bun add sqlite-vec` | Not recommended | No install |
| **Search** | SQL `WHERE embedding MATCH ?` | SQL-based | Manual in JS |
| **Performance (100K, 384d)** | <75ms brute-force | N/A | Slower (no SIMD) |
| **Distance metrics** | Cosine, L2, inner product | Cosine, L2 | Cosine only |
| **Index type** | Brute-force (ANN planned) | HNSW via Faiss | None |

#### How sqlite-vec Works with bun:sqlite

```typescript
import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new Database("memory-nexus.db");
sqliteVec.load(db);

// Create vector table
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(embedding float[384])");

// Insert embeddings
const insertStmt = db.prepare(
  "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
);

const insertTransaction = db.transaction((items: Array<[number, Float32Array]>) => {
  for (const [id, vector] of items) {
    insertStmt.run(BigInt(id), vector);
  }
});

// Query nearest neighbors
const searchStmt = db.prepare(`
  SELECT rowid, distance
  FROM message_embeddings
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT ?
`);

const results = searchStmt.all(new Float32Array(queryEmbedding), 20);
```

#### Platform-Specific Setup

| Platform | sqlite-vec Loading | Extra Setup |
|----------|-------------------|-------------|
| **Windows** | `sqliteVec.load(db)` works directly | None |
| **Linux** | `sqliteVec.load(db)` works directly | None |
| **macOS** | Requires `Database.setCustomSQLite()` first | Install vanilla SQLite via Homebrew |

**macOS setup:**
```typescript
import { Database } from "bun:sqlite";

// Must be called BEFORE creating any Database instances
Database.setCustomSQLite("/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib");

const db = new Database("memory-nexus.db");
// Now loadExtension works
```

This is the same macOS limitation that affects FTS5 extensions. memory-nexus v1.0 already handles this for FTS5, so the same `setCustomSQLite` call covers sqlite-vec.

#### Performance Expectations for memory-nexus

Estimating dataset size based on typical Claude Code usage:

| Usage Level | Sessions | Messages | Vectors (384d) | Query Time (brute-force) |
|-------------|----------|----------|-----------------|-------------------------|
| Light (3 months) | 50 | 5,000 | 5,000 | <5ms |
| Moderate (1 year) | 200 | 50,000 | 50,000 | ~15ms |
| Heavy (2 years) | 500 | 200,000 | 200,000 | ~50ms |
| Extreme (5 years) | 1,500 | 1,000,000 | 1,000,000 | ~200ms+ |

For the "Extreme" tier, sqlite-vec's planned ANN index would be needed. For realistic usage (under 200K messages), brute-force is fast enough.

**Binary quantization option:** Reduces storage 32x and query time significantly. At 384 dimensions with binary quantization, 1M vectors query in ~100ms. Trade: ~5% accuracy loss. Worth enabling as an option for large databases.

### 2.2 Why Not Manual Cosine Similarity

Storing vectors as BLOBs and computing cosine similarity in JavaScript is technically possible but inferior:

1. **No SIMD optimization** -- sqlite-vec uses CPU SIMD instructions (AVX2, NEON) for distance computation. Pure JS Float32Array loops are 10-50x slower.
2. **All vectors loaded into JS memory** -- For a K-NN query, you would need to load all vectors from SQLite into JS, compute distances, then sort. sqlite-vec does this in C inside SQLite.
3. **No SQL composability** -- Cannot combine vector search with other WHERE clauses in a single query.

### 2.3 Schema Extension for v2.0

Extending the existing v1.0 schema:

```sql
-- New table for embeddings (sqlite-vec virtual table)
CREATE VIRTUAL TABLE message_embeddings USING vec0(
  embedding float[384]
);
-- rowid maps to messages_meta.id

-- Metadata about embedding state
CREATE TABLE embedding_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Keys: 'model_name', 'model_version', 'dimensions', 'provider'

-- Track which messages have been embedded
-- (embedding_config tracks model version; if model changes, re-embed all)
CREATE TABLE embedding_state (
  message_id INTEGER PRIMARY KEY,
  embedded_at DATETIME,
  model_hash TEXT,  -- hash of model name + version, detect model changes
  FOREIGN KEY (message_id) REFERENCES messages_meta(id)
);
```

**Migration strategy:** v2.0 adds these tables alongside existing v1.0 tables. Embedding generation is a background process that runs after sync. Users who never enable semantic search pay zero storage cost (tables exist but are empty).

---

## 3. Hybrid Search Architecture

### 3.1 Scoring Strategy: Reciprocal Rank Fusion (RRF)

**Use RRF, not linear combination.** Rationale:

| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| **Linear combination** | Simple, tunable weights | Requires score normalization (BM25 and cosine scores are on different scales) | When you control both scoring systems |
| **Reciprocal Rank Fusion** | No score normalization needed, robust, proven | Less tunable | When combining heterogeneous scoring systems |

BM25 scores (from FTS5 `rank`) and cosine similarity scores (from sqlite-vec `distance`) are fundamentally different scales. Normalizing them is error-prone. RRF sidesteps this by working with **ranks**, not scores.

#### RRF Formula

```
RRF_score(doc) = sum over all rankers R: 1 / (k + rank_R(doc))
```

Where `k` is a constant (typically 60, per the original paper). A document that ranks #1 in both systems gets: `1/(60+1) + 1/(60+1) = 0.0328`. A document that ranks #1 in vector but #100 in BM25 gets: `1/(60+1) + 1/(60+100) = 0.0226`.

#### Implementation Pattern

```typescript
interface RankedResult {
  messageId: number;
  rank: number;
  source: "fts5" | "vector";
}

function reciprocalRankFusion(
  fts5Results: RankedResult[],
  vectorResults: RankedResult[],
  k: number = 60,
  limit: number = 10
): Array<{ messageId: number; score: number }> {
  const scores = new Map<number, number>();

  for (const result of fts5Results) {
    const current = scores.get(result.messageId) ?? 0;
    scores.set(result.messageId, current + 1 / (k + result.rank));
  }

  for (const result of vectorResults) {
    const current = scores.get(result.messageId) ?? 0;
    scores.set(result.messageId, current + 1 / (k + result.rank));
  }

  return Array.from(scores.entries())
    .map(([messageId, score]) => ({ messageId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

### 3.2 OpenClaw Reference Implementation

OpenClaw uses a **linear combination** approach (70% vector, 30% BM25) rather than RRF. Their implementation details:

- **Parallel execution:** Both BM25 and vector queries run simultaneously
- **Candidate multiplier:** Fetch 4x more candidates than needed from each ranker, then fuse
- **Union-based merging:** Results from either search contribute (not intersection)
- **Minimum score threshold:** 0.35 floor, results below are dropped
- **Score normalization:** BM25 rank converted to score via `1/(1 + rank)`

**Why memory-nexus should use RRF instead:**

1. OpenClaw's `1/(1+rank)` conversion for BM25 is a simplified form of RRF with k=1. Using k=60 is more robust.
2. OpenClaw's 70/30 weighting requires tuning. RRF is parameter-free (the k constant rarely needs adjustment).
3. OpenClaw combines normalized scores with weights, which is fragile when the score distributions change (different data, different query types).

**What to borrow from OpenClaw:**
- Union-based merging (include results from either system)
- Candidate multiplier (fetch 4x, then rank)
- Embedding cache (avoid re-embedding unchanged content)
- Minimum score threshold to filter noise

### 3.3 Query Flow

```
User searches: "authentication patterns"
        |
        v
+---[Query Processor]---+
|                        |
v                        v
[FTS5 Search]     [Embed Query]
|                        |
| BM25 ranked        | Generate embedding
| results (top 40)   | via Transformers.js
|                        |
v                        v
[FTS5 Results]   [sqlite-vec KNN]
| rank 1: msg_42    | rank 1: msg_107
| rank 2: msg_107   | rank 2: msg_42
| rank 3: msg_88    | rank 3: msg_215
| ...                | ...
|                        |
+--------+   +---------+
         |   |
         v   v
  [Reciprocal Rank Fusion]
  | RRF(msg_42)  = 1/61 + 1/62 = 0.0326
  | RRF(msg_107) = 1/62 + 1/61 = 0.0326
  | RRF(msg_215) = 0    + 1/63 = 0.0159
  | RRF(msg_88)  = 1/63 + 0    = 0.0159
  |
  v
[Top 10 Results with metadata]
```

### 3.4 Degraded Mode (No Embeddings)

Hybrid search must degrade gracefully when:

1. **Embedding model not downloaded yet** -- Fall back to FTS5 only (current v1.0 behavior)
2. **Messages not yet embedded** -- Use FTS5 for unembedded messages, hybrid for embedded ones
3. **sqlite-vec extension not available** -- Fall back to FTS5 only
4. **User explicitly disables semantic search** -- `--no-vector` flag or config option

This aligns with the existing v1.0 behavior as the baseline. Semantic search is an enhancement, not a requirement.

---

## 4. Pluggable Provider Architecture

### 4.1 Port Definition (Domain Layer)

```typescript
// src/domain/ports/IEmbeddingProvider.ts

export interface EmbeddingResult {
  embedding: Float32Array;
  model: string;
  dimensions: number;
}

export interface IEmbeddingProvider {
  /** Human-readable provider name */
  readonly name: string;

  /** Embedding dimensions produced by this provider */
  readonly dimensions: number;

  /** Model identifier */
  readonly model: string;

  /** Generate embedding for a single text */
  embed(text: string): Promise<EmbeddingResult>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** Check if provider is ready (model downloaded, API key set, etc.) */
  isReady(): Promise<boolean>;

  /** Initialize provider (download model, warm up, etc.) */
  initialize(): Promise<void>;

  /** Clean up resources */
  dispose(): Promise<void>;
}
```

### 4.2 Infrastructure Adapters

```
src/infrastructure/embedding/
  |-- local/
  |   |-- TransformersJsProvider.ts    # Default: local ONNX via Transformers.js
  |   +-- OllamaProvider.ts           # Alternative: Ollama running locally
  |
  |-- remote/
  |   |-- AnthropicProvider.ts         # Anthropic Voyager embeddings (if/when available)
  |   |-- OpenAIProvider.ts            # OpenAI text-embedding-3-small
  |   +-- VoyageProvider.ts            # Voyage AI embeddings
  |
  +-- EmbeddingProviderFactory.ts      # Create provider from config
```

#### Default Provider: TransformersJsProvider

```typescript
// src/infrastructure/embedding/local/TransformersJsProvider.ts

import type { IEmbeddingProvider, EmbeddingResult } from "@/domain/ports/IEmbeddingProvider";

export class TransformersJsProvider implements IEmbeddingProvider {
  readonly name = "transformers-js";
  readonly dimensions: number;
  readonly model: string;

  private pipeline: any = null;  // Lazy-loaded

  constructor(
    model: string = "Xenova/all-MiniLM-L6-v2",
    dimensions: number = 384
  ) {
    this.model = model;
    this.dimensions = dimensions;
  }

  async initialize(): Promise<void> {
    if (this.pipeline) return;
    // Dynamic import -- don't load ONNX runtime until needed
    const { pipeline } = await import("@huggingface/transformers");
    this.pipeline = await pipeline("feature-extraction", this.model, {
      dtype: "q8",
    });
  }

  async embed(text: string): Promise<EmbeddingResult> {
    await this.initialize();
    const output = await this.pipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    return {
      embedding: new Float32Array(output.tolist()[0]),
      model: this.model,
      dimensions: this.dimensions,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    await this.initialize();
    const results: EmbeddingResult[] = [];
    // Transformers.js supports batch input
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  async isReady(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    this.pipeline = null;
  }
}
```

### 4.3 Lazy Loading Strategy

The ONNX runtime is heavy (~50MB in memory). It should only load when semantic search is actually used.

```typescript
// src/infrastructure/embedding/EmbeddingProviderFactory.ts

export class EmbeddingProviderFactory {
  static create(config: EmbeddingConfig): IEmbeddingProvider {
    switch (config.provider) {
      case "local":
        // Dynamic import -- @huggingface/transformers not loaded until here
        return new TransformersJsProvider(config.model, config.dimensions);

      case "openai":
        return new OpenAIProvider(config.apiKey, config.model);

      case "ollama":
        return new OllamaProvider(config.host, config.model);

      default:
        return new TransformersJsProvider(); // Default
    }
  }
}
```

**Key design decisions:**

1. **Dynamic import** -- `@huggingface/transformers` is imported inside `initialize()`, not at module load time. Users who never use semantic search never pay the cost.
2. **Provider is a dependency** -- Injected into the application layer via the composition root. Infrastructure detail stays in infrastructure.
3. **Config-driven** -- Provider selection via `~/.config/memory-nexus/config.json`, not code changes.

### 4.4 Configuration

```json
{
  "embedding": {
    "enabled": true,
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "batchSize": 50,
    "cacheDir": "~/.cache/memory-nexus/models"
  }
}
```

**Provider options:**
- `"local"` -- Transformers.js (default, zero config)
- `"ollama"` -- Local Ollama server (`host` required)
- `"openai"` -- OpenAI API (`apiKey` required)
- `"voyage"` -- Voyage AI (`apiKey` required)

### 4.5 Embedding Cache

Borrow OpenClaw's pattern: cache embeddings keyed by content hash + model version. If the model changes, all embeddings are invalidated and re-generated.

```sql
-- Already in schema extension above
CREATE TABLE embedding_state (
  message_id INTEGER PRIMARY KEY,
  embedded_at DATETIME,
  model_hash TEXT,
  FOREIGN KEY (message_id) REFERENCES messages_meta(id)
);
```

On model change detection: `DELETE FROM message_embeddings; DELETE FROM embedding_state;` then re-embed all messages in the background.

---

## 5. Bun Compatibility Assessment

### 5.1 Dependency Compatibility Matrix

| Dependency | Bun Support | Platform | Confidence | Notes |
|-----------|-------------|----------|------------|-------|
| `@huggingface/transformers` v3 | Working | All | HIGH | Issue #558 resolved Oct 2025 |
| `onnxruntime-node` | Working (pinned) | Win needs >= Bun 1.2.6 | MEDIUM | PR #18107 merged, but future regressions possible |
| `sqlite-vec` | Working | All | HIGH | Explicit docs + examples for Bun |
| `bun:sqlite` loadExtension | Working | Win/Linux native, macOS needs setup | HIGH | Same as v1.0 FTS5 setup |

### 5.2 WASM-Based Alternative (Fallback)

If `onnxruntime-node` has issues on a user's platform, `onnxruntime-web` (WASM backend) could serve as a fallback. Transformers.js supports both backends:

```typescript
// Force WASM backend if native fails
import { env } from "@huggingface/transformers";
env.backends.onnx.wasm.wasmPaths = "path/to/wasm/files/";
```

**Tradeoffs:**
- WASM is slower than native (2-5x for embedding models)
- WASM works everywhere (no native compilation issues)
- For small models like all-MiniLM-L6-v2, WASM is still fast enough (~50ms per query)

**Recommendation:** Use native onnxruntime-node by default. If initialization fails, automatically fall back to WASM with a warning. This makes the tool work on any platform without user intervention.

### 5.3 Transformers.js v4 vs v3 Decision

| Factor | v3 (Stable) | v4 (Preview) |
|--------|-------------|-------------|
| npm tag | `latest` | `next` |
| Package | `@huggingface/transformers` | `@huggingface/transformers@next` |
| BERT embedding speedup | Baseline | 4x faster |
| Bun support | Confirmed working | Explicitly listed |
| WebGPU | Available | Improved C++ runtime |
| Bundle size | Standard | 53% smaller |
| Risk | Low | Medium (preview, API may change) |

**Decision: Start with v3, migrate to v4 when stable.** The 4x embedding speedup is appealing but not worth the risk of preview-quality software in a CLI tool. When v4 drops the `@next` tag, upgrade.

---

## 6. Model Comparison Summary

### For memory-nexus Default (Local, No API Key)

| Model | Dimensions | ONNX Size (quantized) | Speed | Quality | Context | Best For |
|-------|-----------|----------------------|-------|---------|---------|----------|
| **all-MiniLM-L6-v2** | 384 | 23 MB (uint8) | 14.7ms/1K tokens | Moderate | 512 tokens | Fast CLI queries, small footprint |
| **BGE-small-en-v1.5** | 384 | ~33 MB (uint8) | Fast | Good | 512 tokens | Better quality, same dimensions |
| **nomic-embed-text-v1.5** | 768 (truncatable) | 137 MB (uint8) | Moderate | High | 8192 tokens | Long messages, conceptual search |
| **mxbai-embed-xsmall-v1** | 384 | ~28 MB | Fast | Good | 512 tokens | Good quality/size balance |

### Recommended Default: all-MiniLM-L6-v2

- Smallest model (23MB download)
- Fastest inference
- 384 dimensions keeps sqlite-vec storage small
- Most widely tested with Transformers.js
- `Xenova/all-MiniLM-L6-v2` has pre-built quantized ONNX weights

### Configurable Upgrade Path

Users can change the model in config:

```json
{
  "embedding": {
    "model": "nomic-ai/nomic-embed-text-v1.5",
    "dimensions": 768
  }
}
```

Changing the model triggers re-embedding of all messages (handled by model_hash tracking).

---

## 7. Risks and Mitigations

### Critical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bun + onnxruntime regression | Medium | High (broken embedding) | Pin Bun version, CI tests on all platforms, WASM fallback |
| Model download fails | Low | Medium (feature unavailable) | Graceful degradation to FTS5-only, retry logic |
| sqlite-vec extension loading fails | Low | Medium (no vector search) | Check extension availability at startup, fall back to FTS5 |
| Large model slows CLI startup | Medium | Medium (bad UX) | Lazy loading, only initialize when semantic search invoked |

### Moderate Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ONNX model incompatibility with future Transformers.js | Low | Medium | Pin Transformers.js version, test model loading in CI |
| sqlite-vec brute-force too slow for large databases | Low (most users < 200K messages) | Medium | Binary quantization, future ANN index from sqlite-vec |
| macOS setCustomSQLite path changes | Low | Low | Detect Homebrew path dynamically |

---

## 8. Implementation Roadmap Implications

### Suggested Phasing

**Phase 1: Embedding Infrastructure (Foundation)**
- Define `IEmbeddingProvider` port in domain
- Implement `TransformersJsProvider` adapter
- Add sqlite-vec extension loading alongside existing FTS5
- Create `message_embeddings` virtual table and `embedding_state` table
- Schema migration from v1.0

**Phase 2: Embedding Pipeline (Background Processing)**
- Add embedding generation to sync pipeline (embed messages after extraction)
- Implement embedding cache with model_hash tracking
- Add `--embed` flag to sync command
- Progress reporting for embedding generation

**Phase 3: Hybrid Search (Core Feature)**
- Implement vector KNN query via sqlite-vec
- Implement Reciprocal Rank Fusion
- Integrate hybrid results into existing search command
- Add `--mode fts|vector|hybrid` flag (default: hybrid when embeddings available)

**Phase 4: Provider Ecosystem (Extensibility)**
- Add OpenAI provider adapter
- Add Ollama provider adapter
- Add provider configuration to CLI and config file
- Model change detection and re-embedding

**Phase 5: Optimization**
- Binary quantization option
- Batch embedding with progress
- WASM fallback for onnxruntime issues
- Matryoshka dimension reduction for nomic-embed

### Dependencies

```
Phase 1 (Infrastructure) --> Phase 2 (Pipeline) --> Phase 3 (Search)
                                                        |
                                    Phase 4 (Providers) -+ (parallel with Phase 3)
                                                        |
                                    Phase 5 (Optimization) (after Phase 3)
```

---

## 9. Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Transformers.js + Bun compatibility | HIGH | Issue #558 closed, fix merged, multiple working examples |
| sqlite-vec + bun:sqlite | HIGH | Official documentation + Bun example in repository |
| all-MiniLM-L6-v2 as default model | HIGH | Most widely used with Transformers.js, well-benchmarked |
| RRF hybrid scoring | HIGH | Well-established algorithm, used by Azure AI Search, OpenSearch, Elasticsearch |
| onnxruntime-node Windows stability | MEDIUM | Fix merged for 1.2.5 regression, but future regressions possible |
| nomic-embed-text-v1.5 Transformers.js compatibility | MEDIUM | ONNX weights exist on HF but Xenova-prefix version needs verification |
| Transformers.js v4 timeline | LOW | Preview only, no stable release date announced |
| sqlite-vec ANN index availability | LOW | On roadmap but no timeline |

---

## 10. Sources

### Primary (HIGH confidence)

- [sqlite-vec: Using with Node.js, Deno, and Bun](https://alexgarcia.xyz/sqlite-vec/js.html)
- [sqlite-vec GitHub + Bun Example](https://github.com/asg017/sqlite-vec/blob/main/examples/simple-bun/demo.ts)
- [sqlite-vec v0.1.0 Stable Release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [Transformers.js GitHub Issue #558 - Bun Support (CLOSED)](https://github.com/huggingface/transformers.js/issues/558)
- [Bun Issue #18079 - onnxruntime-node Windows Fix (CLOSED)](https://github.com/oven-sh/bun/issues/18079)
- [Transformers.js v4 Preview Announcement](https://huggingface.co/blog/transformersjs-v4)
- [Xenova/all-MiniLM-L6-v2 ONNX Weights](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [bun:sqlite loadExtension Documentation](https://bun.com/reference/bun/sqlite/Database/loadExtension)
- [OpenClaw Memory Search (DeepWiki)](https://deepwiki.com/openclaw/openclaw/7.3-memory-search)

### Secondary (MEDIUM confidence)

- [Hybrid Search with BM25 and Rank Fusion](https://medium.com/thinking-sand/hybrid-search-with-bm25-and-rank-fusion-for-accurate-results-456a70305dc5)
- [Azure AI Search: Hybrid Search Scoring (RRF)](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
- [OpenSearch: Introducing RRF for Hybrid Search](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- [Best Open-Source Embedding Models Benchmarked](https://supermemory.ai/blog/best-open-source-embedding-models-benchmarked-and-ranked/)
- [The Best Open-Source Embedding Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Qodo-Embed-1: Code Retrieval](https://www.qodo.ai/blog/qodo-embed-1-code-embedding-code-retrieval/)
- [OpenClaw Hybrid Local Memory](https://www.clawsetup.co.uk/articles/hybrid-local-memory-openclaw-bm25-vectors-sqlite-vec-local-embeddings/)

### Tertiary (LOW confidence -- needs validation)

- [fastembed npm package](https://www.npmjs.com/package/fastembed) -- Bun compatibility unverified
- [Transformers.js v4 stable release timeline](https://huggingface.co/blog/transformersjs-v4) -- No date announced
- [sqlite-vec ANN index roadmap](https://github.com/asg017/sqlite-vec) -- Planned but no timeline

---

*Research complete: 2026-02-18*
