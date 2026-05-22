/**
 * HybridSearchService
 *
 * Composes Fts5SearchService, EmbeddingRepository, and EmbeddingProviderFactory
 * into a unified search interface supporting four modes: auto, fts, vector, hybrid.
 *
 * Implements ISearchService from the domain ports layer so it can be a drop-in
 * replacement for the FTS-only search service.
 *
 * Mode resolution: explicit CLI mode > config search.defaultMode > 'auto'
 *
 * Degradation:
 * - auto mode: silently uses FTS when vector unavailable
 * - hybrid mode: degrades to FTS when vector fails
 * - vector mode: throws VECTOR_UNAVAILABLE (explicit user intent)
 * - fts mode: never touches vector infrastructure
 */

import type { Database } from "bun:sqlite";
import type {
  ISearchService,
  SearchOptions,
  SearchMode,
  HybridSearchOptions,
} from "../../../domain/ports/services.js";
import type { SearchQuery } from "../../../domain/value-objects/search-query.js";
import { SearchResult } from "../../../domain/value-objects/search-result.js";
import { ErrorCode, MemoryError } from "../../../domain/index.js";
import type { Fts5SearchService } from "./search-service.js";
import type { EmbeddingRepository, VectorSearchRow } from "../repositories/embedding-repository.js";
import type { EmbeddingProviderFactory } from "../../embedding/embedding-provider-factory.js";
import type { IEmbeddingProvider } from "../../../domain/ports/embedding.js";
import type { MemoryConfig } from "../../hooks/config-manager.js";
import {
  reciprocalRankFusion,
  type RankedCandidate,
} from "../../../application/services/rrf-fusion.js";

/**
 * Dependencies injected via constructor.
 */
export interface HybridSearchDeps {
  db: Database;
  fts5Service: Fts5SearchService;
  embeddingRepo: EmbeddingRepository;
  providerFactory: EmbeddingProviderFactory;
  config: MemoryConfig;
  sqliteVecAvailable: boolean;
}

/**
 * Resolved mode after applying the resolution chain.
 */
interface ResolvedMode {
  effectiveMode: "fts" | "vector" | "hybrid";
  degraded: boolean;
  reason: string;
}

/**
 * Metadata about the last search operation.
 */
export interface SearchMeta {
  /** The effective search mode used */
  mode: SearchMode;
  /** Reason for the mode selection */
  modeReason: string;
  /** Whether the search degraded from requested mode */
  degraded: boolean;
  /** Reason for degradation, if any */
  degradationReason?: string | undefined;
  /** Fraction of messages with embeddings (0-1) */
  embeddingCoverage: number;
  /** System capabilities for this search */
  capabilities: { fts: boolean; vector: boolean; hybrid: boolean };
  /** Total search time in milliseconds */
  timingMs: number;
}

/**
 * Raw message metadata from database hydration.
 */
interface MessageMeta {
  rowid: number;
  id: string;
  session_id: string;
  content: string;
  timestamp: string;
  role: string;
}

/** Candidate multiplier for fetching more results before fusion */
const CANDIDATE_MULTIPLIER = 4;

/**
 * HybridSearchService composes FTS5 and vector search with RRF fusion.
 *
 * Implements ISearchService for drop-in compatibility.
 */
export class HybridSearchService implements ISearchService {
  private readonly db: Database;
  private readonly fts5Service: Fts5SearchService;
  private readonly embeddingRepo: EmbeddingRepository;
  private readonly providerFactory: EmbeddingProviderFactory;
  private readonly config: MemoryConfig;
  private readonly sqliteVecAvailable: boolean;
  private lastSearchMeta: SearchMeta | null = null;

  constructor(deps: HybridSearchDeps) {
    this.db = deps.db;
    this.fts5Service = deps.fts5Service;
    this.embeddingRepo = deps.embeddingRepo;
    this.providerFactory = deps.providerFactory;
    this.config = deps.config;
    this.sqliteVecAvailable = deps.sqliteVecAvailable;
  }

  /**
   * Get metadata from the last search operation.
   */
  getLastSearchMeta(): SearchMeta | null {
    return this.lastSearchMeta;
  }

  /**
   * Search for content using the configured mode.
   *
   * Supports FTS, vector, hybrid, and auto modes.
   * Degrades gracefully when vector components are unavailable.
   */
  async search(
    query: SearchQuery,
    options?: HybridSearchOptions
  ): Promise<SearchResult[]> {
    const startTime = performance.now();
    const embeddedCount = this.embeddingRepo.getEmbeddedCount();
    const totalCount = this.embeddingRepo.getTotalMessageCount();
    const embeddingCoverage =
      totalCount > 0 ? embeddedCount / totalCount : 0;

    const vectorCapable = this.sqliteVecAvailable && embeddedCount > 0;
    const capabilities = {
      fts: true,
      vector: vectorCapable,
      hybrid: vectorCapable,
    };

    const resolved = this.resolveMode(options?.mode, embeddedCount);

    // Track degradation that may happen during search execution
    let degradedDuring = false;
    let degradationReason: string | undefined;

    let results: SearchResult[];
    try {
      switch (resolved.effectiveMode) {
        case "fts":
          results = await this.ftsSearch(query, options);
          break;
        case "vector":
          results = await this.vectorSearch(query, options);
          break;
        case "hybrid":
          {
            const hybridResult = await this.hybridSearch(query, options);
            results = hybridResult.results;
            if (hybridResult.degraded) {
              degradedDuring = true;
              degradationReason = hybridResult.degradationReason;
            }
          }
          break;
      }
    } catch (error) {
      // For auto/hybrid, degrade to FTS on failure
      if (
        resolved.effectiveMode !== "vector" &&
        !(error instanceof MemoryError)
      ) {
        results = await this.ftsSearch(query, options);
        degradedDuring = true;
        degradationReason = "provider_failure";
      } else {
        throw error;
      }
    }

    // Apply temporal decay uniformly across all search modes
    results = this.applyDecayToResults(results, options);

    const isDegraded = resolved.degraded || degradedDuring;
    const finalReason = degradationReason ?? (resolved.degraded ? resolved.reason : undefined);
    const effectiveMode = isDegraded && !resolved.degraded
      ? "fts" as const
      : resolved.effectiveMode;

    const timingMs = performance.now() - startTime;
    this.lastSearchMeta = {
      mode: effectiveMode,
      modeReason: isDegraded ? (finalReason ?? resolved.reason) : resolved.reason,
      degraded: isDegraded,
      degradationReason: isDegraded ? finalReason : undefined,
      embeddingCoverage,
      capabilities,
      timingMs,
    };

    return results;
  }

  /**
   * Resolve the effective search mode from requested mode, config, and capabilities.
   */
  private resolveMode(
    requested?: SearchMode,
    embeddedCount: number = 0
  ): ResolvedMode {
    const configDefault = this.config.search?.defaultMode ?? "auto";
    const mode = requested ?? configDefault;

    if (mode === "fts") {
      return { effectiveMode: "fts", degraded: false, reason: "explicit" };
    }

    if (mode === "vector") {
      if (!this.sqliteVecAvailable) {
        throw new MemoryError(
          ErrorCode.VECTOR_UNAVAILABLE,
          "Vector search requires sqlite-vec extension",
          { suggestion: "Run 'memory doctor' to check extension status" }
        );
      }
      if (embeddedCount === 0) {
        throw new MemoryError(
          ErrorCode.VECTOR_UNAVAILABLE,
          "No embeddings found in database",
          { suggestion: "Run 'memory sync --embed' to generate embeddings" }
        );
      }
      return { effectiveMode: "vector", degraded: false, reason: "explicit" };
    }

    if (mode === "hybrid") {
      if (!this.sqliteVecAvailable || embeddedCount === 0) {
        return {
          effectiveMode: "fts",
          degraded: true,
          reason: !this.sqliteVecAvailable
            ? "sqlite_vec_unavailable"
            : "no_embeddings",
        };
      }
      return { effectiveMode: "hybrid", degraded: false, reason: "explicit" };
    }

    // mode === 'auto'
    if (!this.sqliteVecAvailable || embeddedCount === 0) {
      return { effectiveMode: "fts", degraded: false, reason: "no_embeddings" };
    }
    return { effectiveMode: "hybrid", degraded: false, reason: "auto_hybrid" };
  }

  /**
   * Apply temporal decay to search results using their embedded timestamps.
   *
   * Builds decay by computing age from each result's timestamp,
   * applying the standard half-life formula, and re-sorting by
   * decayed score. This is the single point where temporal decay
   * is applied, regardless of search mode (FTS, vector, hybrid).
   */
  private applyDecayToResults(
    results: SearchResult[],
    options?: HybridSearchOptions
  ): SearchResult[] {
    const decayEnabled =
      this.config.search?.temporalDecay?.enabled !== false &&
      !options?.noDecay;

    if (!decayEnabled || results.length === 0) {
      return results;
    }

    const halfLifeDays =
      this.config.search?.temporalDecay?.halfLifeDays ?? 30;
    const now = new Date();
    const nowMs = now.getTime();
    const msPerDay = 1000 * 60 * 60 * 24;

    const decayed = results.map((r) => {
      const ageDays = (nowMs - r.timestamp.getTime()) / msPerDay;
      const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);
      const decayedScore = Math.max(0, Math.min(1, r.score * decayFactor));
      return { result: r, decayedScore };
    });

    decayed.sort((a, b) => b.decayedScore - a.decayedScore);

    return decayed.map(({ result, decayedScore }) =>
      SearchResult.create({
        sessionId: result.sessionId,
        messageId: result.messageId,
        snippet: result.snippet,
        score: decayedScore,
        timestamp: result.timestamp,
        role: result.role,
        source: result.source,
        rawScores: result.rawScores,
      })
    );
  }

  /**
   * FTS-only search path. Delegates directly to Fts5SearchService.
   */
  private async ftsSearch(
    query: SearchQuery,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const results = await this.fts5Service.search(query, options);
    // Tag each result with FTS source
    return results.map((r) =>
      SearchResult.create({
        sessionId: r.sessionId,
        messageId: r.messageId,
        snippet: r.snippet,
        score: r.score,
        timestamp: r.timestamp,
        role: r.role,
        source: "fts",
        rawScores: { bm25: r.score },
      })
    );
  }

  /**
   * Get or initialize the embedding provider.
   *
   * For auto/hybrid mode: returns null on failure (allows degradation).
   * For vector mode: throws on failure (user explicitly requested).
   */
  private async getProvider(
    isVectorMode: boolean
  ): Promise<IEmbeddingProvider | null> {
    try {
      const provider = this.providerFactory.createFromConfig(this.config);
      if (!provider) {
        if (isVectorMode) {
          throw new MemoryError(
            ErrorCode.VECTOR_UNAVAILABLE,
            "Embedding provider is disabled in configuration"
          );
        }
        return null;
      }

      if (!provider.isReady()) {
        await provider.initialize();
      }

      return provider;
    } catch (error) {
      if (isVectorMode) {
        if (error instanceof MemoryError) throw error;
        throw new MemoryError(
          ErrorCode.VECTOR_UNAVAILABLE,
          `Embedding provider failed to initialize: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return null;
    }
  }

  /**
   * Embed the query text using the configured provider.
   */
  private async embedQuery(
    text: string,
    provider: IEmbeddingProvider
  ): Promise<Float32Array> {
    const result = await provider.embed(text);
    return result.embedding;
  }

  /**
   * Check for dimension mismatch between stored embeddings and current provider.
   *
   * The vec0 table was created with a specific dimension. If the provider
   * produces embeddings of a different dimension, KNN queries will fail.
   * We detect this by comparing the provider's dimensions against the
   * schema's stored dimension (derived from the embedding table definition).
   *
   * Returns the mismatch reason string if mismatch found, null otherwise.
   */
  private checkDimensionMismatch(
    provider: IEmbeddingProvider
  ): string | null {
    const embeddedCount = this.embeddingRepo.getEmbeddedCount();
    if (embeddedCount === 0) return null;

    // Get the stored embedding dimensions by querying the actual vec0 table
    // The schema creates message_embeddings with embedding float[N] where N
    // is the configured dimension at schema creation time
    const storedDimensions = this.getStoredEmbeddingDimensions();
    if (storedDimensions === null) return null;

    const providerDimensions = provider.dimensions;

    if (providerDimensions !== storedDimensions) {
      return `dimension_mismatch (stored: ${storedDimensions}, provider: ${providerDimensions})`;
    }

    return null;
  }

  /**
   * Get the dimension count of stored embeddings.
   * Queries the first embedding to determine its dimension.
   */
  private getStoredEmbeddingDimensions(): number | null {
    try {
      // Query the vec0 table to find what dimension the stored embeddings use
      // We can infer from the first row's embedding length
      const row = this.db
        .prepare<{ embedding: Float32Array }, []>(
          "SELECT embedding FROM message_embeddings LIMIT 1"
        )
        .get();
      if (!row || !row.embedding) return null;
      const emb = row.embedding as any;
      // Float32Array gives us the dimension count directly
      if (emb instanceof Float32Array) {
        return emb.length;
      }
      // If returned as buffer, compute from byte length
      if (emb instanceof ArrayBuffer || emb.byteLength !== undefined) {
        return emb.byteLength / 4;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Vector-only search path.
   * Embeds query, runs KNN, hydrates results.
   */
  private async vectorSearch(
    query: SearchQuery,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const provider = await this.getProvider(true);
    if (!provider) {
      throw new MemoryError(
        ErrorCode.VECTOR_UNAVAILABLE,
        "Embedding provider unavailable"
      );
    }

    const dimMismatch = this.checkDimensionMismatch(provider);
    if (dimMismatch) {
      throw new MemoryError(
        ErrorCode.EMBEDDING_DIMENSION_MISMATCH,
        `Cannot run vector search: ${dimMismatch}`
      );
    }

    const queryEmbedding = await this.embedQuery(query.value, provider);
    const limit = options?.limit ?? 20;
    const candidateLimit = limit * CANDIDATE_MULTIPLIER;

    const vectorRows = this.embeddingRepo.vectorKnnSearch(
      queryEmbedding,
      candidateLimit
    );

    if (vectorRows.length === 0) {
      return [];
    }

    // Hydrate with message metadata
    const rowids = vectorRows.map((r) => r.rowid);
    const metaMap = this.hydrateByRowids(rowids);

    // Build results, apply filters
    const results: SearchResult[] = [];
    for (let i = 0; i < vectorRows.length && results.length < limit; i++) {
      const vr = vectorRows[i];
      if (!vr) continue;
      const meta = metaMap.get(vr.rowid);
      if (!meta) continue;

      // Apply filters
      if (!this.passesFilters(meta, options)) continue;

      const snippet = this.vectorSnippet(meta.content);
      // Normalize distance to 0-1 score (closer = higher score)
      const score = Math.max(0, Math.min(1, 1 - vr.distance / 2));

      results.push(
        SearchResult.create({
          sessionId: meta.session_id,
          messageId: meta.id,
          snippet,
          score,
          timestamp: new Date(meta.timestamp),
          role: meta.role,
          source: "vector",
          rawScores: { cosine: vr.distance },
        })
      );
    }

    return results;
  }

  /**
   * Hybrid search path.
   * Runs FTS and vector searches, combines with RRF, applies temporal decay.
   * Returns results plus degradation status.
   */
  private async hybridSearch(
    query: SearchQuery,
    options?: HybridSearchOptions
  ): Promise<{ results: SearchResult[]; degraded: boolean; degradationReason?: string | undefined }> {
    const limit = options?.limit ?? 20;
    const candidateLimit = limit * CANDIDATE_MULTIPLIER;

    // FTS leg
    const ftsOptions = { ...options, limit: candidateLimit };
    const ftsResults = await this.fts5Service.search(query, ftsOptions);

    // Vector leg -- wrapped in try-catch for degradation
    let vectorRows: VectorSearchRow[] = [];
    let provider: IEmbeddingProvider | null = null;
    let vectorDegraded = false;
    let vectorDegradationReason: string | undefined;

    try {
      provider = await this.getProvider(false);
      if (provider) {
        const dimMismatch = this.checkDimensionMismatch(provider);
        if (dimMismatch) {
          // Dimension mismatch: degrade vector leg
          provider = null;
          vectorDegraded = true;
          vectorDegradationReason = dimMismatch;
        } else {
          const queryEmbedding = await this.embedQuery(query.value, provider);
          vectorRows = this.embeddingRepo.vectorKnnSearch(
            queryEmbedding,
            candidateLimit
          );
        }
      } else {
        vectorDegraded = true;
        vectorDegradationReason = "provider_unavailable";
      }
    } catch (error) {
      // Vector leg failed -- continue with FTS only
      vectorRows = [];
      vectorDegraded = true;
      vectorDegradationReason = `provider_failure: ${error instanceof Error ? error.message : String(error)}`;
    }

    // If vector leg produced nothing, return FTS results directly
    if (vectorRows.length === 0 && ftsResults.length > 0) {
      const ftsOnly = ftsResults.map((r) =>
        SearchResult.create({
          sessionId: r.sessionId,
          messageId: r.messageId,
          snippet: r.snippet,
          score: r.score,
          timestamp: r.timestamp,
          role: r.role,
          source: "fts",
          rawScores: { bm25: r.score },
        })
      ).slice(0, limit);
      return {
        results: ftsOnly,
        degraded: vectorDegraded,
        degradationReason: vectorDegradationReason,
      };
    }

    if (ftsResults.length === 0 && vectorRows.length === 0) {
      return { results: [], degraded: vectorDegraded, degradationReason: vectorDegradationReason };
    }

    // Build rowid map from FTS results for correlation
    const ftsRowidMap = this.buildFtsRowidMap(ftsResults);

    // Convert FTS results to RankedCandidates
    const ftsCandidates: RankedCandidate[] = ftsResults.map((r, i) => ({
      rowid: ftsRowidMap.get(r.messageId) ?? 0,
      rank: i + 1,
      source: "fts" as const,
      rawScore: r.score,
    }));

    // Convert vector results to RankedCandidates
    const vectorCandidates: RankedCandidate[] = vectorRows.map((r, i) => ({
      rowid: r.rowid,
      rank: i + 1,
      source: "vector" as const,
      rawScore: r.distance,
    }));

    // RRF fusion
    const fused = reciprocalRankFusion(ftsCandidates, vectorCandidates, limit);

    if (fused.length === 0) {
      return { results: [], degraded: vectorDegraded, degradationReason: vectorDegradationReason };
    }

    // Collect all rowids for hydration
    const allRowids = fused.map((f) => f.rowid);
    const metaMap = this.hydrateByRowids(allRowids);

    // Determine source for each fused result
    const sourceMap = new Map<number, "fts" | "vector" | "both">();
    for (const f of fused) {
      const hasFts = f.sources.some((s) => s.source === "fts");
      const hasVector = f.sources.some((s) => s.source === "vector");
      if (hasFts && hasVector) {
        sourceMap.set(f.rowid, "both");
      } else if (hasFts) {
        sourceMap.set(f.rowid, "fts");
      } else {
        sourceMap.set(f.rowid, "vector");
      }
    }

    // Score from RRF normalizedScore -- decay applied uniformly by search()
    const scoredResults = fused.map((f) => ({
      ...f,
      score: f.normalizedScore,
    }));

    // Build SearchResult objects
    const results: SearchResult[] = [];
    for (const sr of scoredResults) {
      const meta = metaMap.get(sr.rowid);
      if (!meta) continue;

      // Apply filters
      if (!this.passesFilters(meta, options)) continue;

      const source = sourceMap.get(sr.rowid) ?? "fts";
      const ftsMatch = ftsResults.find((r) => r.messageId === meta.id);
      const snippet = ftsMatch ? ftsMatch.snippet : this.vectorSnippet(meta.content);

      // Normalize score to 0-1
      const normalizedScore = Math.max(0, Math.min(1, sr.score));

      // Collect raw scores
      const rawScores: { bm25?: number; cosine?: number; rrf?: number } = {
        rrf: sr.rrfScore,
      };
      for (const s of sr.sources) {
        if (s.source === "fts") rawScores.bm25 = s.rawScore;
        if (s.source === "vector") rawScores.cosine = s.rawScore;
      }

      results.push(
        SearchResult.create({
          sessionId: meta.session_id,
          messageId: meta.id,
          snippet,
          score: normalizedScore,
          timestamp: new Date(meta.timestamp),
          role: meta.role,
          source,
          rawScores,
        })
      );
    }

    return { results, degraded: vectorDegraded, degradationReason: vectorDegradationReason };
  }

  /**
   * Build a map from message ID to rowid for FTS results.
   */
  private buildFtsRowidMap(ftsResults: SearchResult[]): Map<string, number> {
    if (ftsResults.length === 0) return new Map();

    const messageIds = ftsResults.map((r) => r.messageId);
    const placeholders = messageIds.map(() => "?").join(",");
    const rows = this.db
      .prepare<{ rowid: number; id: string }, string[]>(
        `SELECT rowid, id FROM messages_meta WHERE id IN (${placeholders})`
      )
      .all(...messageIds);

    return new Map(rows.map((r) => [r.id, r.rowid]));
  }

  /**
   * Hydrate message metadata by rowids.
   */
  private hydrateByRowids(rowids: number[]): Map<number, MessageMeta> {
    if (rowids.length === 0) return new Map();
    const placeholders = rowids.map(() => "?").join(",");
    const rows = this.db
      .prepare<MessageMeta, number[]>(
        `SELECT rowid, id, session_id, content, timestamp, role
         FROM messages_meta
         WHERE rowid IN (${placeholders})`
      )
      .all(...rowids);
    return new Map(rows.map((r) => [r.rowid, r]));
  }

  /**
   * Generate a snippet for vector-only results (first 200 chars).
   */
  private vectorSnippet(content: string): string {
    if (content.length <= 200) return content;
    return content.slice(0, 200) + "...";
  }

  /**
   * Check if a message passes the search filters.
   */
  private passesFilters(
    meta: MessageMeta,
    options?: SearchOptions
  ): boolean {
    if (!options) return true;

    if (options.projectFilter) {
      // For project filter, we need to look up the session's project
      const session = this.db
        .prepare<{ project_name: string }, [string]>(
          "SELECT project_name FROM sessions WHERE id = ?"
        )
        .get(meta.session_id);
      if (
        !session ||
        !session.project_name
          .toLowerCase()
          .includes(options.projectFilter.toLowerCase())
      ) {
        return false;
      }
    }

    if (options.roleFilter) {
      if (Array.isArray(options.roleFilter)) {
        if (!options.roleFilter.includes(meta.role as "user" | "assistant")) {
          return false;
        }
      } else if (meta.role !== options.roleFilter) {
        return false;
      }
    }

    if (options.sessionFilter && meta.session_id !== options.sessionFilter) {
      return false;
    }

    if (options.sinceDate) {
      const msgDate = new Date(meta.timestamp);
      if (msgDate < options.sinceDate) return false;
    }

    if (options.beforeDate) {
      const msgDate = new Date(meta.timestamp);
      if (msgDate > options.beforeDate) return false;
    }

    return true;
  }
}
