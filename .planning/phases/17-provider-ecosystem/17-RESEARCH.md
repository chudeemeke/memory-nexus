# Phase 17: Provider Ecosystem - Research

**Researched:** 2026-02-28
**Domain:** Embedding provider adapters (OpenAI API, Ollama local server), provider configuration, model change detection
**Confidence:** HIGH

## Summary

Phase 17 adds two new embedding provider adapters (OpenAI and Ollama) to the existing `IEmbeddingProvider` port/adapter architecture established in Phase 14. The codebase is well-prepared for this: the port interface, factory with switch/cache pattern, config system with `EmbeddingConfigData`, and model change detection via `computeModelHash` are all in place. The primary implementation is straightforward adapter code making HTTP requests to external APIs.

The most significant finding is a **dimension mismatch problem**: the vec0 virtual table (`message_embeddings`) is created with hardcoded `float[384]` dimensions in the schema. Switching from the default local model (384d) to OpenAI's text-embedding-3-small (1536d) requires dropping and recreating the vec0 table, not just clearing rows. The existing `clearAllEmbeddings()` only DELETEs rows. This is the one non-trivial piece of Phase 17 -- all other work is straightforward adapter implementation.

Neither OpenAI nor Ollama require any npm dependencies. Both expose simple HTTP endpoints that can be called with native `fetch()` (available in Bun globally). The OpenAI provider needs an API key; Ollama needs a running local server. The `EmbeddingConfigData` interface needs extension with optional `apiKey` and `baseUrl` fields.

**Primary recommendation:** Implement OpenAI and Ollama adapters as simple HTTP-based `IEmbeddingProvider` implementations with zero new dependencies. Add `apiKey` and `baseUrl` to `EmbeddingConfigData`. Handle dimension change by dropping and recreating the vec0 table during re-embedding.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROV-01 | Implement OpenAI embedding provider adapter (text-embedding-3-small) | OpenAI /v1/embeddings endpoint is a single POST with model + input; returns embedding array. No SDK needed -- native fetch suffices. See "OpenAI Provider" section. |
| PROV-02 | Implement Ollama embedding provider adapter (local server) | Ollama /api/embed endpoint accepts model + input array; returns embeddings array. No SDK needed. See "Ollama Provider" section. |
| PROV-03 | Provider configuration via ~/.config/memory/config.json (provider, model, dimensions, apiKey, batchSize) | Existing EmbeddingConfigData needs apiKey and baseUrl fields. Config manager deep-merge handles new fields gracefully. Doctor needs provider readiness checks. See "Configuration" section. |
| PROV-04 | Model change detection: when configured model differs from embedded model_hash, trigger re-embedding with user confirmation | Existing computeModelHash and handleModelChange already work for model changes. The gap is dimension changes requiring vec0 table recreation. See "Dimension Change" section. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch` | Built-in (Bun) | HTTP requests to OpenAI/Ollama | Zero dependencies; both APIs are simple REST endpoints |
| Existing IEmbeddingProvider | N/A (domain port) | Provider contract | Already defined in Phase 14; new providers implement it |
| Existing EmbeddingProviderFactory | N/A (infrastructure) | Provider creation + caching | Already has switch/cache pattern; add two cases |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | - | - | No new dependencies needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch for OpenAI | `openai` npm package | SDK adds 2MB+ dependency and Node.js runtime assumption; fetch is sufficient for a single endpoint |
| Native fetch for Ollama | `ollama` npm package | SDK adds unnecessary abstraction; the API is a single POST endpoint |

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Recommended Project Structure

```
src/infrastructure/embedding/
  transformers-js-provider.ts     # Existing (local)
  openai-provider.ts              # New (PROV-01)
  ollama-provider.ts              # New (PROV-02)
  embedding-provider-factory.ts   # Extend (add "openai" + "ollama" cases)
  index.ts                        # Export new providers
```

### Pattern 1: HTTP-Based IEmbeddingProvider Adapter

**What:** Each remote provider implements IEmbeddingProvider with HTTP calls to external APIs. The adapter translates between the domain port contract (embed/embedBatch/initialize/dispose) and the provider's HTTP API.

**When to use:** For any provider that exposes an HTTP embedding endpoint.

**Example (OpenAI):**

```typescript
// Source: OpenAI API reference (https://platform.openai.com/docs/api-reference/embeddings)
export class OpenAiProvider implements IEmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private _ready = false;

  constructor(options: {
    apiKey: string;
    model?: string;
    dimensions?: number;
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "text-embedding-3-small";
    this.dimensions = options.dimensions ?? 1536;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async initialize(): Promise<void> {
    // Validate API key by making a lightweight request or just mark ready
    this._ready = true;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const result = await response.json();
    const embedding = new Float32Array(result.data[0].embedding);
    return EmbeddingResult.create({
      embedding,
      model: this.model,
      dimensions: this.dimensions,
    });
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // OpenAI supports batch in a single request (input as array)
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const result = await response.json();
    // OpenAI returns data[] sorted by index
    return result.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) =>
        EmbeddingResult.create({
          embedding: new Float32Array(item.embedding),
          model: this.model,
          dimensions: this.dimensions,
        })
      );
  }

  isReady(): boolean { return this._ready; }
  async dispose(): Promise<void> { this._ready = false; }
}
```

### Pattern 2: Ollama Provider Adapter

**What:** Ollama provider implementing IEmbeddingProvider against the local Ollama API.

**When to use:** When user has Ollama running locally.

**Example (Ollama):**

```typescript
// Source: Ollama API docs (https://github.com/ollama/ollama/blob/main/docs/api.md)
export class OllamaProvider implements IEmbeddingProvider {
  readonly name = "ollama";
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private _ready = false;

  constructor(options: {
    model?: string;
    dimensions?: number;
    baseUrl?: string;
  }) {
    this.model = options.model ?? "nomic-embed-text";
    this.dimensions = options.dimensions ?? 768;
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
  }

  async initialize(): Promise<void> {
    // Check server reachability
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama server returned ${response.status}`);
      }
      this._ready = true;
    } catch (error) {
      throw new Error(
        `Cannot reach Ollama server at ${this.baseUrl}. ` +
        `Ensure Ollama is running: ollama serve`
      );
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${error}`);
    }

    const result = await response.json();
    const embedding = new Float32Array(result.embeddings[0]);
    return EmbeddingResult.create({
      embedding,
      model: this.model,
      dimensions: this.dimensions,
    });
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Ollama /api/embed supports input as array (returns embeddings[])
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${error}`);
    }

    const result = await response.json();
    return result.embeddings.map((emb: number[]) =>
      EmbeddingResult.create({
        embedding: new Float32Array(emb),
        model: this.model,
        dimensions: this.dimensions,
      })
    );
  }

  isReady(): boolean { return this._ready; }
  async dispose(): Promise<void> { this._ready = false; }
}
```

### Pattern 3: Vec0 Table Dimension Migration

**What:** When provider/model dimensions change, the vec0 virtual table must be dropped and recreated with the new dimension.

**When to use:** During re-embedding triggered by model change (PROV-04).

**Example:**

```typescript
// In EmbeddingRepository or a new migration function
recreateVecTable(newDimensions: number): void {
  this.db.exec("DROP TABLE IF EXISTS message_embeddings");
  this.db.exec(
    `CREATE VIRTUAL TABLE message_embeddings USING vec0(
      embedding float[${newDimensions}]
    )`
  );
}
```

**Critical:** This must happen BEFORE `clearAndReembed()` inserts new vectors. The dimension value (`float[N]`) is structural to the vec0 table and cannot be ALTERed.

### Anti-Patterns to Avoid

- **Installing SDK packages for simple HTTP APIs:** Both OpenAI and Ollama have single-endpoint embedding APIs. An SDK adds dependency weight, version coupling, and Node.js runtime assumptions with zero benefit.
- **Validating API key at initialize() by calling the API:** For OpenAI, validation should not consume credits. Mark ready at initialize(); actual errors surface at embed() time with actionable messages.
- **Hardcoding model dimensions:** OpenAI's text-embedding-3-small supports dimension reduction via the `dimensions` parameter. Let the user configure dimensions in config.json rather than hardcoding per-model defaults.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests | Custom HTTP client | Native `fetch()` | Built into Bun, handles all needed features (headers, JSON, status codes) |
| Retry logic | Custom retry wrapper | Simple try/catch with informative error | Re-embedding is idempotent; user can retry the sync command |
| API key storage | Custom keychain integration | Config file (`~/.config/memory/config.json`) | Consistent with existing config pattern; user manages secrets |
| Rate limiting | Token bucket / sliding window | OpenAI batch endpoint + existing batchSize config | OpenAI handles 2048 inputs per request; Ollama is local with no rate limits |

**Key insight:** Both APIs are trivially simple (single POST endpoint). The complexity is in integrating them into the existing architecture, not in the API calls themselves.

## Common Pitfalls

### Pitfall 1: Vec0 Dimension Mismatch on Provider Change

**What goes wrong:** User switches from local (384d) to OpenAI (1536d). The vec0 table is still `float[384]`. New embeddings are 1536-dimensional Float32Arrays. sqlite-vec rejects or silently truncates them.
**Why it happens:** `clearAllEmbeddings()` only DELETEs rows, does not DROP/CREATE the table. The vec0 schema dimension is structural (defined at CREATE time).
**How to avoid:** When model change is detected AND dimensions differ from the current vec0 table, DROP and CREATE the table with new dimensions before re-embedding.
**Warning signs:** sqlite-vec errors during `storeBatch()`, or silently corrupted search results.

### Pitfall 2: OpenAI API Key in Config File Permissions

**What goes wrong:** API key is stored in `~/.config/memory/config.json` which may be world-readable.
**Why it happens:** Config file is created with default permissions (often 644).
**How to avoid:** Document that users should `chmod 600 ~/.config/memory/config.json`. The doctor command can check file permissions and warn if the config file is world-readable when an API key is present.
**Warning signs:** `ls -la ~/.config/memory/config.json` shows group/other read permissions.

### Pitfall 3: Ollama Server Not Running

**What goes wrong:** User configures `"provider": "ollama"` but Ollama is not running. `memory sync --embed` fails with a connection refused error.
**Why it happens:** Ollama runs as a background service and may not auto-start.
**How to avoid:** `initialize()` checks server reachability. `memory doctor` reports Ollama server status. Error message includes recovery hint: "Ensure Ollama is running: ollama serve"
**Warning signs:** Connection refused / ECONNREFUSED errors.

### Pitfall 4: OpenAI API Rate Limits and Costs

**What goes wrong:** User with 100K+ messages runs `memory sync --embed` with OpenAI provider. Large batch requests hit rate limits or generate unexpected costs.
**Why it happens:** OpenAI's embedding API has per-minute token limits. text-embedding-3-small costs $0.02/1M tokens (cheap but not free for large databases).
**How to avoid:** Respect the existing batchSize config. Add cost estimation to the re-embedding confirmation prompt. Consider adding a `--limit N` flag for incremental embedding.
**Warning signs:** HTTP 429 responses from OpenAI API.

### Pitfall 5: Ollama Model Not Pulled

**What goes wrong:** User configures `"model": "nomic-embed-text"` but has not pulled the model. API returns 404 or model-not-found error.
**Why it happens:** Ollama requires `ollama pull <model>` before first use, unlike Transformers.js which auto-downloads.
**How to avoid:** Informative error message: "Model 'nomic-embed-text' not found. Run: ollama pull nomic-embed-text"
**Warning signs:** Ollama API returns error with "model not found" message.

### Pitfall 6: text-embedding-3-small Dimension Parameter

**What goes wrong:** User configures OpenAI with 384 dimensions (matching local) but the API returns 1536-dimensional vectors.
**Why it happens:** The `dimensions` parameter in OpenAI's API is optional and only supported for certain models (text-embedding-3-small/large). If omitted, the full dimension is returned.
**How to avoid:** Always pass the `dimensions` parameter in the OpenAI API request body. This ensures the API returns vectors matching the configured dimension. Validate that returned embedding length matches config.
**Warning signs:** Dimension mismatch error at EmbeddingResult.create().

## Code Examples

Verified patterns from the existing codebase:

### Factory Extension Pattern

```typescript
// Source: src/infrastructure/embedding/embedding-provider-factory.ts
// Extend the existing switch statement:
case "openai":
  provider = new OpenAiProvider({
    apiKey: config.apiKey ?? "",
    model: config.model,
    dimensions: config.dimensions,
    baseUrl: config.baseUrl,
  });
  break;

case "ollama":
  provider = new OllamaProvider({
    model: config.model,
    dimensions: config.dimensions,
    baseUrl: config.baseUrl ?? "http://localhost:11434",
  });
  break;
```

### Config Extension Pattern

```typescript
// Source: src/infrastructure/hooks/config-manager.ts
// Extend EmbeddingConfigData:
export interface EmbeddingConfigData {
  enabled: boolean;
  provider: string;        // "local" | "openai" | "ollama"
  model: string;
  dimensions: number;
  batchSize: number;
  apiKey?: string;         // NEW: for OpenAI
  baseUrl?: string;        // NEW: for OpenAI custom endpoint or Ollama host
}
```

### Doctor Enhancement Pattern

```typescript
// Source: src/infrastructure/database/health-checker.ts
// Extend EmbeddingHealth with readiness status:
export interface EmbeddingHealth {
  configured: boolean;
  provider: string;
  model: string;
  dimensions: number;
  enabled: boolean;
  ready: boolean;          // NEW: provider-specific readiness
  readyReason?: string;    // NEW: why not ready (e.g., "API key not set")
}
```

### Dimension-Aware Re-embedding Pattern

```typescript
// In EmbeddingRepository:
recreateVecTable(dimensions: number): void {
  this.db.exec("DROP TABLE IF EXISTS message_embeddings");
  this.db.exec(`CREATE VIRTUAL TABLE message_embeddings USING vec0(
    embedding float[${dimensions}]
  )`);
}

// In the re-embedding flow (sync.ts runEmbeddingPass):
if (modelState.modelChanged && modelState.needsReEmbed) {
  // Check if dimensions changed
  const storedDims = getStoredEmbeddingDimensions();
  const newDims = config.embedding.dimensions;
  if (storedDims !== null && storedDims !== newDims) {
    repository.recreateVecTable(newDims);
  }
  // Then proceed with clearAndReembed()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Install SDK for each provider | Native fetch for HTTP APIs | 2024-2025 | Zero-dependency provider adapters |
| Fixed embedding dimensions | OpenAI dimension reduction parameter | Dec 2024 | text-embedding-3-small supports 256/512/1024/1536 dimensions |
| Ollama /api/embeddings (singular) | Ollama /api/embed (newer endpoint) | 2025 | Batch-native endpoint, returns embeddings[] array |

**Deprecated/outdated:**
- Ollama `/api/embeddings` endpoint: Still works but `/api/embed` is the newer endpoint supporting batch input natively
- OpenAI `text-embedding-ada-002`: Replaced by text-embedding-3-small (better quality, dimension reduction, lower cost)

## Open Questions

1. **OpenAI dimension reduction for matching local dimensions**
   - What we know: text-embedding-3-small supports `dimensions` parameter to truncate output (e.g., 384 to match local model)
   - What's unclear: Whether truncated OpenAI embeddings at 384d compete quality-wise with native 384d local models
   - Recommendation: Let user configure any dimension; document that keeping 384d means cheaper storage but potentially reduced quality compared to full 1536d. Default OpenAI dimensions to 1536 in config.

2. **Ollama model dimension auto-detection**
   - What we know: Different Ollama models produce different dimensions (nomic-embed-text: 768, all-minilm: 384, mxbai-embed-large: 1024)
   - What's unclear: Whether Ollama's API reports embedding dimensions before generating an embedding
   - Recommendation: Require explicit `dimensions` in config for Ollama. If user gets it wrong, the dimension validation at EmbeddingResult.create() will catch the mismatch immediately.

3. **Config file security for API keys**
   - What we know: Config file at `~/.config/memory/config.json` stores all settings as plain JSON
   - What's unclear: Whether to add file permission enforcement or just warn
   - Recommendation: Warn in doctor if file permissions are too open when apiKey is present. Do not enforce -- the user's environment is their responsibility. Document the security consideration.

## Validation Architecture

> Skipped: workflow.nyquist_validation is not configured in .planning/config.json

## Sources

### Primary (HIGH confidence)
- Existing codebase: `IEmbeddingProvider` port (src/domain/ports/embedding.ts), `EmbeddingProviderFactory` (src/infrastructure/embedding/embedding-provider-factory.ts), `TransformersJsProvider` (src/infrastructure/embedding/transformers-js-provider.ts), `EmbeddingConfigData` (src/infrastructure/hooks/config-manager.ts), `EmbeddingRepository` (src/infrastructure/database/repositories/embedding-repository.ts), `health-checker.ts`, schema.ts
- .planning/research/SEMANTIC-SEARCH.md -- Previous research with provider architecture patterns

### Secondary (MEDIUM confidence)
- OpenAI Embeddings API: POST /v1/embeddings with model + input + dimensions parameters. Response: { data: [{ embedding: number[], index: number }] }. Training data knowledge -- API is stable and well-documented.
- Ollama /api/embed endpoint: POST with model + input (string or string[]). Response: { embeddings: number[][] }. Training data knowledge -- API has been stable since 2024.

### Tertiary (LOW confidence)
- Ollama batch input support on /api/embed: Training data indicates array input is supported. Should be validated during implementation with a running Ollama instance.
- OpenAI dimension reduction quality at 384d: No empirical data found. Likely acceptable for session search but not benchmarked.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; pattern is clear HTTP adapter implementing existing port
- Architecture: HIGH - Existing factory/port/adapter pattern; extension points already designed for this phase
- Pitfalls: HIGH - Vec0 dimension mismatch is the critical risk; all others are standard HTTP API concerns

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable; OpenAI and Ollama embedding APIs are mature)
