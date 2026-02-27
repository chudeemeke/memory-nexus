# Phase 16: Hybrid Search and Graceful Degradation - Research

**Researched:** 2026-02-27
**Domain:** Hybrid search (FTS5 BM25 + sqlite-vec cosine), Reciprocal Rank Fusion, graceful degradation
**Confidence:** HIGH

## Summary

Phase 16 extends the existing `memory search` command to support four search modes (auto, fts, vector, hybrid) by adding vector KNN queries via sqlite-vec and combining results with Reciprocal Rank Fusion (RRF). The infrastructure is already in place: Phase 14 delivered the embedding provider, sqlite-vec extension loading, and vec0 schema; Phase 15 delivered the embedding pipeline that populates message_embeddings. Phase 16 wires the query-time path.

The core technical challenge is building a `HybridSearchService` that orchestrates parallel FTS5 and vector queries, fuses results via RRF, applies temporal decay, and degrades gracefully when vector components are unavailable. The existing `Fts5SearchService` provides the FTS5 leg and serves as the degradation target. The existing `EmbeddingProviderFactory` provides query embedding at search time.

The secondary challenge is extending the CLI (search command, output formatter, doctor command) to surface the new mode, metadata envelope, and degradation information without breaking backward compatibility.

**Primary recommendation:** Build a `HybridSearchService` in the infrastructure database services layer that composes the existing `Fts5SearchService` for the FTS5 leg, adds a vector search method using sqlite-vec MATCH, and implements RRF fusion. Extend the domain layer with new value objects for search mode and hybrid results. Extend the presentation layer additively.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Four modes: `auto` (default), `fts`, `vector`, `hybrid`
- `auto` mode: if ANY embeddings exist, use hybrid. Otherwise FTS-only
- No threshold -- presence of any embeddings triggers hybrid
- Mode shown in JSON metadata always; in human output only with `--verbose`
- Silent degradation in auto mode (search always returns results)
- Explicit `--mode vector` with no embeddings: error with actionable guidance
- Query embedded at search time using same provider as stored embeddings; warn on provider/model mismatch
- `--mode auto|fts|vector|hybrid` flag (default: auto)
- `--no-vector` shorthand for `--mode fts`
- `--no-decay` disable temporal decay for single search
- CLI precedence: flags > config > defaults
- RRF k=60 hardcoded, 4x candidate multiplier hardcoded
- Minimum score threshold hardcoded (tuned during development)
- Temporal decay enabled by default, half-life 30 days, formula: `final_score = rrf_score * 0.5^(age_days / half_life)`
- Config: `search.temporalDecay.enabled` (bool) and `search.temporalDecay.halfLifeDays` (number)
- Config: `search.defaultMode` (auto|fts|vector|hybrid)
- JSON output: exhaustive metadata envelope with meta + per-result raw scores
- Table output: normalized 0-1 score, verbose adds per-ranker breakdown
- Backward compatibility: additive-only JSON schema changes
- Extend MemoryError/ErrorCode with VECTOR_UNAVAILABLE, PROVIDER_TIMEOUT, PROVIDER_CONFIG_INVALID, EMBEDDING_DIMENSION_MISMATCH, MODEL_CORRUPTED
- ErrorJson extended with `degraded_to` field
- Doctor: "Search Capability" section and "Embedding status" section
- Doctor exit codes: 0=OK, 1=degraded but functional, 2=broken
- `memory context` and `memory related` benefit automatically via shared infrastructure
- No per-invocation --decay-days flag
- No environment variable overrides for search
- Invalid config: warn to stderr, use defaults

### Claude's Discretion
- Exact minimum score threshold value (tuned during development/testing)
- Internal implementation of RRF fusion (algorithm structure)
- sqlite-vec query optimization details
- Provider instance lifecycle management
- JSON schema field naming conventions (following existing patterns)
- Test strategy for degradation paths
- Doctor output formatting details

### Deferred Ideas (OUT OF SCOPE)
- Service mode (persistent process with loaded model)
- Intentional memory writing (`memory write` command)
- Markdown source of truth layer
- IVF/ANN indexing
- Search result caching
- Environment variable overrides
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HSRCH-01 | Vector KNN query via sqlite-vec MATCH with configurable limit | sqlite-vec MATCH syntax verified in existing research + codebase; `WHERE embedding MATCH ? ORDER BY distance LIMIT ?` pattern |
| HSRCH-02 | RRF combining FTS5 BM25 ranks with vector similarity ranks (k=60) | RRF algorithm well-documented; rank-based fusion avoids score normalization problems; k=60 from original paper |
| HSRCH-03 | `--mode fts\|vector\|hybrid` flag (default: hybrid when embeddings available, fts when not) | CONTEXT.md specifies four modes with `auto` as default; mode resolution logic maps cleanly to existing SearchOptions extension |
| HSRCH-04 | 4x candidate multiplier | Fetch `limit * 4` candidates from each ranker before fusion; borrowed from OpenClaw pattern |
| HSRCH-05 | Minimum score threshold to filter noise | Threshold applied post-RRF; value determined empirically during testing (Claude's discretion) |
| HSRCH-06 | Embed query at search time via configured provider | Use EmbeddingProviderFactory + lazy init; singleton provider cached across queries in same process |
| DEGRADE-01 | Fall back to FTS5 when embedding model not downloaded | Auto mode detects zero embeddings -> FTS-only path; no provider initialization attempted |
| DEGRADE-02 | Fall back to FTS5 when sqlite-vec unavailable | `initializeDatabase` already tracks `sqliteVecAvailable`; propagate to search service |
| DEGRADE-03 | FTS5 for unembedded, hybrid for embedded (partial coverage) | RRF handles structurally: FTS covers all messages, vector covers embedded subset; unembedded messages still appear via FTS leg |
| DEGRADE-04 | `--no-vector` flag for explicit FTS-only | Maps to `--mode fts`; CONTEXT.md confirms both supported |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlite-vec | 0.1.6 | Vector KNN queries via vec0 MATCH | Already installed; provides SIMD-optimized cosine distance in SQLite |
| @huggingface/transformers | ^3.8.1 | Query embedding at search time | Already installed; provides the same model used for stored embeddings |
| bun:sqlite | (bundled) | Database access for FTS5 and vec0 queries | Already in use across entire codebase |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | ^14.0.2 | CLI flag parsing for new --mode, --no-vector, --no-decay flags | Already in use; extend existing search command |
| cli-progress | ^3.12.0 | Progress reporting (if needed for long searches) | Already installed; unlikely needed for search (sub-second) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RRF | Linear combination (70/30 like OpenClaw) | Requires score normalization between BM25 and cosine; fragile when distributions change |
| sqlite-vec MATCH | Manual cosine in JS | 10-50x slower (no SIMD), all vectors loaded into JS memory |
| Embedding at search time | Pre-computed query cache | Over-engineering for CLI; queries are cheap after model load |

**Installation:** No new dependencies needed. All required packages already installed.

## Architecture Patterns

### Recommended Project Structure

New and modified files for Phase 16:

```
src/
├── domain/
│   ├── ports/
│   │   └── services.ts            # Extend ISearchService, add SearchMode type
│   ├── value-objects/
│   │   ├── search-query.ts        # May extend with mode field
│   │   └── search-result.ts       # Extend with source, raw scores
│   └── errors/
│       └── error-codes.ts         # Add VECTOR_UNAVAILABLE, etc.
├── application/
│   └── services/
│       └── hybrid-search-service.ts  # NEW: orchestration layer (optional)
├── infrastructure/
│   └── database/
│       ├── services/
│       │   ├── search-service.ts      # Existing FTS5 (unchanged)
│       │   └── vector-search-service.ts  # NEW: sqlite-vec KNN queries
│       └── repositories/
│           └── embedding-repository.ts  # Add vector query method
├── presentation/
│   └── cli/
│       ├── commands/
│       │   ├── search.ts           # Extend with --mode, --no-vector, --no-decay
│       │   └── doctor.ts           # Extend with search capability section
│       └── formatters/
│           └── output-formatter.ts # Extend JSON with metadata envelope
```

### Pattern 1: Composite Search Service

**What:** A `HybridSearchService` that composes the existing `Fts5SearchService` with a new `VectorSearchService` and implements RRF fusion. Implements `ISearchService` to maintain polymorphism.

**When to use:** When the search command needs to orchestrate multiple search backends with mode-dependent logic.

**Example:**
```typescript
// Infrastructure layer - composes FTS5 + vector into hybrid
class HybridSearchService implements ISearchService {
  constructor(
    private readonly fts5: Fts5SearchService,
    private readonly vectorSearch: VectorSearchService | null,
    private readonly embeddingRepo: EmbeddingRepository,
    private readonly config: SearchConfig,
  ) {}

  async search(query: SearchQuery, options?: HybridSearchOptions): Promise<SearchResult[]> {
    const mode = this.resolveMode(options?.mode);

    switch (mode) {
      case 'fts':
        return this.fts5.search(query, options);
      case 'vector':
        return this.vectorOnlySearch(query, options);
      case 'hybrid':
        return this.hybridSearch(query, options);
    }
  }

  private resolveMode(requested?: SearchMode): SearchMode {
    // auto -> hybrid if embeddings exist, fts otherwise
    // explicit mode -> validate availability -> error or degrade
  }
}
```

### Pattern 2: RRF Fusion as Pure Function

**What:** Reciprocal Rank Fusion implemented as a stateless pure function that takes two ranked lists and produces a merged ranked list.

**When to use:** Keeping the fusion algorithm testable and independent of infrastructure.

**Example:**
```typescript
// Pure function - no dependencies, easily unit tested
interface RankedCandidate {
  rowid: number;
  rank: number;
  source: 'fts' | 'vector';
  rawScore: number;
}

interface FusedResult {
  rowid: number;
  rrfScore: number;
  sources: Array<{ source: 'fts' | 'vector'; rank: number; rawScore: number }>;
}

function reciprocalRankFusion(
  ftsResults: RankedCandidate[],
  vectorResults: RankedCandidate[],
  k: number = 60
): FusedResult[] {
  const scores = new Map<number, FusedResult>();

  for (const r of ftsResults) {
    const existing = scores.get(r.rowid) ?? { rowid: r.rowid, rrfScore: 0, sources: [] };
    existing.rrfScore += 1 / (k + r.rank);
    existing.sources.push({ source: 'fts', rank: r.rank, rawScore: r.rawScore });
    scores.set(r.rowid, existing);
  }

  for (const r of vectorResults) {
    const existing = scores.get(r.rowid) ?? { rowid: r.rowid, rrfScore: 0, sources: [] };
    existing.rrfScore += 1 / (k + r.rank);
    existing.sources.push({ source: 'vector', rank: r.rank, rawScore: r.rawScore });
    scores.set(r.rowid, existing);
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
```

### Pattern 3: Temporal Decay as Post-Processing

**What:** Apply temporal decay as a multiplicative factor after RRF scoring.

**When to use:** After fusion, before final ranking.

**Example:**
```typescript
function applyTemporalDecay(
  results: FusedResult[],
  timestamps: Map<number, Date>,
  halfLifeDays: number = 30,
  now: Date = new Date()
): FusedResult[] {
  return results.map(r => {
    const timestamp = timestamps.get(r.rowid);
    if (!timestamp) return r;

    const ageDays = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);

    return { ...r, rrfScore: r.rrfScore * decayFactor };
  }).sort((a, b) => b.rrfScore - a.rrfScore);
}
```

### Pattern 4: Mode Resolution Chain

**What:** Resolve the effective search mode through a priority chain: CLI flag > config default > auto-detection.

**When to use:** In the search command handler before delegating to the search service.

**Example:**
```typescript
function resolveSearchMode(
  cliMode: SearchMode | undefined,
  configDefault: SearchMode,
  embeddingsExist: boolean,
  vectorAvailable: boolean,
): { mode: SearchMode; degraded: boolean; reason: string } {
  const requested = cliMode ?? configDefault;

  if (requested === 'auto') {
    if (!vectorAvailable || !embeddingsExist) {
      return { mode: 'fts', degraded: false, reason: 'no_embeddings' };
    }
    return { mode: 'hybrid', degraded: false, reason: 'auto_hybrid' };
  }

  if (requested === 'vector' || requested === 'hybrid') {
    if (!vectorAvailable) {
      if (requested === 'vector') {
        // Hard error for explicit vector mode
        throw new MemoryError(ErrorCode.VECTOR_UNAVAILABLE, ...);
      }
      return { mode: 'fts', degraded: true, reason: 'sqlite_vec_unavailable' };
    }
    if (!embeddingsExist && requested === 'vector') {
      throw new MemoryError(ErrorCode.VECTOR_UNAVAILABLE, ...);
    }
  }

  return { mode: requested, degraded: false, reason: 'explicit' };
}
```

### Anti-Patterns to Avoid

- **Modifying Fts5SearchService directly:** Keep it as-is. Compose it; do not inherit from or modify it. It is the degradation fallback -- it must remain a stable, simple FTS-only path.
- **Loading ONNX on every search:** The provider must be singleton-cached. First search pays cold start (~1-3s), subsequent searches reuse the loaded model.
- **Normalizing BM25 and cosine to a common scale:** BM25 returns negative values (SQLite implementation detail). Cosine distance from sqlite-vec returns 0-2 range. These scales are incompatible. RRF avoids this problem by using ranks, not scores.
- **Blocking on provider initialization in auto mode:** If auto mode detects no embeddings, skip vector path entirely. Do not attempt to initialize the provider "just in case."
- **Coupling temporal decay into the search query SQL:** Apply decay in application/presentation code after fusion. Keeps SQL queries simple and the decay logic testable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom cosine in JS | sqlite-vec `WHERE embedding MATCH ?` | SIMD-optimized C code; 10-50x faster than JS Float32Array loops |
| Score normalization across rankers | Custom min-max normalization | Reciprocal Rank Fusion (rank-based) | RRF is scale-independent; avoids fragile score distribution assumptions |
| Embedding generation | Custom ONNX pipeline | Existing `IEmbeddingProvider` / `EmbeddingProviderFactory` | Already built in Phase 14; handles lazy loading, WASM fallback, progress |
| FTS5 search | New FTS implementation | Existing `Fts5SearchService` | Already built, tested, handles BM25 scoring, snippet extraction, filters |
| Config management | New config system | Existing `loadConfig()` / `saveConfig()` with deep merge | Phase 14 established the pattern; new `search.*` keys merge naturally |
| Error codes/formatting | New error system | Extend existing `ErrorCode` + `MemoryError` + `formatError` | Established pattern; just add new code constants and suggestions |

**Key insight:** Phase 16 is a composition phase. All building blocks exist (FTS5 service, embedding provider, embedding repository, vec0 table, config manager, error system). The new code orchestrates these components and adds the fusion algorithm.

## Common Pitfalls

### Pitfall 1: sqlite-vec Distance vs Similarity Confusion

**What goes wrong:** sqlite-vec MATCH returns `distance` (lower = more similar), not `similarity` (higher = more similar). Using distance as a score directly produces inverted rankings.

**Why it happens:** Cosine distance is 1 - cosine_similarity for normalized vectors. sqlite-vec returns the distance, not the similarity.

**How to avoid:** For RRF, only the rank matters, not the raw distance value. Sort by distance ASC to get rank 1 = most similar. Store the raw distance in metadata but use rank position for fusion.

**Warning signs:** Best vector results appearing at the bottom of hybrid results.

### Pitfall 2: BM25 Negative Score Ordering

**What goes wrong:** SQLite's bm25() function returns negative scores where more negative = better match. If you sort DESC (expecting higher = better), you get the worst matches first.

**Why it happens:** SQLite FTS5 implementation choice. The existing `Fts5SearchService` already handles this correctly with `ORDER BY score` (ASC).

**How to avoid:** For RRF, assign rank 1 to the first row returned by FTS5 (the most negative BM25 score, i.e., best match). The existing service already returns results in correct order.

**Warning signs:** FTS5 results appearing in reverse relevance order in hybrid output.

### Pitfall 3: Provider Cold Start Blocking Search

**What goes wrong:** First hybrid search takes 1-3 seconds because the ONNX runtime must load and the model must initialize. Users perceive search as broken.

**Why it happens:** TransformersJsProvider lazy-loads the ONNX runtime on first `embed()` call.

**How to avoid:** Cache the provider singleton across search invocations within the same process. For CLI, each invocation is a new process, so cold start is unavoidable on first search. Document the expected latency. For JSON output, include timing metadata so callers know the cost.

**Warning signs:** Users running `--mode fts` to avoid the slowness; perception that hybrid is "broken."

### Pitfall 4: Partial Coverage Score Bias

**What goes wrong:** Messages with embeddings get two RRF score contributions (FTS + vector), while unembedded messages only get one (FTS). This systematically ranks embedded messages higher, even when an unembedded FTS-only result is a better keyword match.

**Why it happens:** RRF by design boosts documents that appear in multiple rankers.

**How to avoid:** This is by design and documented in CONTEXT.md: "Embedded messages get ranking advantage (two scoring signals)." It is acceptable because: (1) users who embed all messages have no bias; (2) for partial coverage, the FTS leg still surfaces unembedded matches; (3) the advantage is proportional to vector similarity, not automatic.

**Warning signs:** Users confused by why a newer (embedded) result outranks a more keyword-relevant (unembedded) result.

### Pitfall 5: Stale Provider / Dimension Mismatch

**What goes wrong:** User changes embedding config between sync and search. Query embedding dimensions differ from stored embedding dimensions. sqlite-vec throws an error.

**Why it happens:** Embedding config at search time may differ from config at embedding time.

**How to avoid:** At search time, check the stored model hash against the current config hash. If they differ, warn but still attempt search (the stored embeddings' dimensions are what the vec0 table was created with). The dimension mismatch is a hard error from sqlite-vec -- catch it and degrade to FTS-only.

**Warning signs:** Cryptic sqlite-vec errors about dimension mismatch.

### Pitfall 6: Empty Vec0 Table MATCH Error

**What goes wrong:** Querying `WHERE embedding MATCH ?` on an empty vec0 table may return zero results or throw an error depending on sqlite-vec version.

**Why it happens:** Edge case when no embeddings have been generated yet.

**How to avoid:** Check embedding count from `embedding_state` BEFORE attempting vector search. If zero, skip vector leg entirely (auto mode) or return empty results (vector mode). This is also the graceful degradation trigger for DEGRADE-01.

**Warning signs:** Error on first search after fresh install before any `sync --embed`.

## Code Examples

### sqlite-vec KNN Query (Verified from research + codebase patterns)

```typescript
// Source: .planning/research/SEMANTIC-SEARCH.md + existing embedding-repository.ts
// sqlite-vec uses MATCH operator for KNN queries

interface VectorSearchRow {
  rowid: number;
  distance: number;
}

function vectorKnnSearch(
  db: Database,
  queryEmbedding: Float32Array,
  limit: number
): VectorSearchRow[] {
  const stmt = db.prepare<VectorSearchRow, [Float32Array, number]>(`
    SELECT rowid, distance
    FROM message_embeddings
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `);
  return stmt.all(queryEmbedding, limit);
}
```

### Embedding Query at Search Time (Verified from existing provider pattern)

```typescript
// Source: existing EmbeddingProviderFactory + TransformersJsProvider

async function embedQuery(
  factory: EmbeddingProviderFactory,
  config: MemoryConfig,
  queryText: string
): Promise<Float32Array> {
  const provider = factory.createFromConfig(config);
  if (!provider) throw new Error('Embedding not configured');

  if (!provider.isReady()) {
    await provider.initialize();
  }

  const result = await provider.embed(queryText);
  return result.embedding;
}
```

### Hydrating Vector Results with Message Metadata

```typescript
// Source: existing Fts5SearchService pattern for JOIN with messages_meta

interface HydratedVectorRow {
  rowid: number;
  id: string;
  session_id: string;
  content: string;
  timestamp: string;
  role: string;
  distance: number;
}

function hydrateVectorResults(
  db: Database,
  vectorRowids: number[],
  distances: Map<number, number>
): HydratedVectorRow[] {
  if (vectorRowids.length === 0) return [];

  const placeholders = vectorRowids.map(() => '?').join(',');
  const rows = db.prepare<Omit<HydratedVectorRow, 'distance'>, number[]>(`
    SELECT m.rowid, m.id, m.session_id, m.content, m.timestamp, m.role
    FROM messages_meta m
    WHERE m.rowid IN (${placeholders})
  `).all(...vectorRowids);

  return rows.map(r => ({
    ...r,
    distance: distances.get(r.rowid) ?? Infinity,
  }));
}
```

### Extending MemoryConfig for Search Config

```typescript
// Source: existing config-manager.ts pattern

// Add to MemoryConfig interface
interface SearchConfigData {
  defaultMode: 'auto' | 'fts' | 'vector' | 'hybrid';
  temporalDecay: {
    enabled: boolean;
    halfLifeDays: number;
  };
}

// Default values
const DEFAULT_SEARCH_CONFIG: SearchConfigData = {
  defaultMode: 'auto',
  temporalDecay: {
    enabled: true,
    halfLifeDays: 30,
  },
};
```

### JSON Output Envelope (AI-Primary Interface)

```typescript
// Source: CONTEXT.md decisions

interface SearchJsonOutput {
  meta: {
    query: string;
    mode: 'auto' | 'fts' | 'vector' | 'hybrid';
    mode_reason: string;      // 'auto_hybrid', 'auto_fts', 'explicit', 'degraded'
    total_results: number;
    embedding_coverage: number; // 0-1, fraction of messages with embeddings
    degraded: boolean;
    degradation_reason?: string;
    capabilities: {
      fts: boolean;
      vector: boolean;
      hybrid: boolean;
    };
    timing_ms: number;
  };
  results: Array<{
    rank: number;
    session_id: string;
    message_id: string;
    role: string;
    timestamp: string;
    score: number;           // normalized 0-1
    raw_scores: {
      bm25?: number;
      cosine?: number;
      rrf?: number;
    };
    source: 'fts' | 'vector' | 'both';
    snippet: string;
    highlights?: Array<{ offset: number; length: number }>;
  }>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FTS5-only search | Hybrid FTS5 + vector | Phase 16 | Semantic queries now find conceptually similar results |
| Fixed search mode | Auto-detecting mode | Phase 16 | Search adapts to embedding availability |
| Raw BM25 scores | RRF normalized scores | Phase 16 | Score comparisons meaningful across modes |
| No temporal signal | 30-day half-life decay | Phase 16 | Recent results ranked higher |

**Deprecated/outdated:**
- Nothing deprecated. FTS5-only remains the fallback and is accessible via `--mode fts` / `--no-vector`.

## Open Questions

1. **Minimum RRF score threshold value**
   - What we know: OpenClaw uses 0.35 floor. RRF scores with k=60 are typically in the 0.01-0.03 range.
   - What's unclear: The right threshold depends on our specific score distribution, which depends on database size and query patterns.
   - Recommendation: Start with no threshold (or very low, e.g., 0.001), test empirically against real data, tune. This is explicitly Claude's discretion per CONTEXT.md.

2. **Provider/model mismatch behavior at search time**
   - What we know: CONTEXT.md says "warn on provider/model mismatch." The stored model hash in embedding_state tracks what was used for embedding.
   - What's unclear: Whether to degrade to FTS-only or attempt the search anyway (dimension mismatch will fail at sqlite-vec level).
   - Recommendation: Check dimensions match first. If dimensions match (same dimensions, different model), attempt search with warning. If dimensions differ, degrade to FTS-only with warning.

3. **Snippet generation for vector-only results**
   - What we know: FTS5 provides `snippet()` function for highlighted text. Vector-only results have no FTS match and no snippet.
   - What's unclear: How to generate a useful text excerpt for vector-only results.
   - Recommendation: Use first 200 characters of message content as the snippet for vector-only results (no highlights). For hybrid results where the message appears in both rankers, use the FTS5 snippet.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `Fts5SearchService`, `EmbeddingRepository`, `EmbeddingProviderFactory`, `TransformersJsProvider` -- verified by direct code reading
- Existing codebase: `initializeDatabase()` returns `sqliteVecAvailable` boolean -- verified in connection.ts
- Existing codebase: `loadConfig()` with deep merge for new nested config keys -- verified in config-manager.ts
- `.planning/research/SEMANTIC-SEARCH.md` -- Prior research on sqlite-vec, RRF, embedding models (2026-02-18)
- sqlite-vec documentation: KNN via `WHERE embedding MATCH ? ORDER BY distance LIMIT ?` -- verified in research
- RRF paper: `score(d) = sum(1 / (k + rank_i(d)))`, k=60 standard -- verified across multiple sources

### Secondary (MEDIUM confidence)
- Azure AI Search RRF documentation -- confirms k=60 as industry standard
- OpenClaw memory search pattern -- 4x candidate multiplier, minimum score threshold

### Tertiary (LOW confidence)
- Temporal decay formula effectiveness -- borrowed from OpenClaw (30-day half-life); needs empirical validation against real memory data
- Minimum score threshold value -- requires empirical tuning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already installed and working in Phases 14-15
- Architecture: HIGH - composition of existing services; patterns verified in codebase
- Pitfalls: HIGH - all identified through direct codebase analysis and prior research
- RRF algorithm: HIGH - well-documented, used by major search engines
- Temporal decay: MEDIUM - formula is simple but optimal half-life needs empirical tuning

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain; no external dependency changes expected)
