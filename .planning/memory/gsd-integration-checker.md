---
agent: gsd-integration-checker
updated: 2026-03-01
entries: 12
---

- finding: "SearchMode, HybridSearchOptions, IStatsService, StatsResult, ProjectStats were NOT in domain/ports/index.ts before Phase 20. Phase 20 added them. Current state: all 6 types are exported from domain/ports/index.ts (verified in milestone v2.0 check)."
  source: "Phase 20 integration check - v2.0 milestone"
  confidence: HIGH
  phase: "20"
  date: "2026-03-01"
  status: "RESOLVED by Phase 20"

- finding: "VectorSearchRow is used by HybridSearchService via direct import from embedding-repository.ts (not the barrel). This is intentional internal coupling, not an integration gap."
  source: "Phase 16 integration check"
  confidence: HIGH
  phase: "16"
  date: "2026-03-01"

- finding: "executeBrowseCommand is exported from src/index.ts and commands/index.ts barrel, but is NOT tested in tests/integration/programmatic-api.test.ts. All other 15 execute* functions have integration tests. executeBrowseCommand is the only one missing."
  source: "Phase 18 integration check - v2.0 milestone"
  confidence: HIGH
  phase: "18"
  date: "2026-03-01"
  status: "OPEN - gap in INTEG-03 coverage"

- finding: "Phase 16.1 migration race condition fix is wired correctly: isMigrationPending() is called in src/presentation/cli/index.ts before program.parse() (lines 88-90), matching the ordering contract documented in migration.ts."
  source: "Phase 16.1 integration check"
  confidence: HIGH
  phase: "16.1"
  date: "2026-03-01"

- finding: "EmbeddingService (application layer) previously imported EmbeddingRepository and EmbeddingConfigData from infrastructure. Phase 21 resolved this: embedding-service.ts now imports IEmbeddingRepository, EmbeddingBatchItem, EmbeddingServiceConfig from domain/ports/repositories.ts only."
  source: "Phase 21 integration check - v2.0 milestone"
  confidence: HIGH
  phase: "21"
  date: "2026-03-01"
  status: "RESOLVED by Phase 21"

- finding: "The MESSAGE_EMBEDDINGS_TABLE schema hardcodes float[384] (line 218 schema.ts). If a user switches to OpenAI (1536-dim) or Ollama (768-dim), the vec0 table must be recreated. Phase 17 handles this via recreateVecTable() in EmbeddingRepository, called from sync.ts runEmbeddingPass on dimension change. The wiring is present."
  source: "Phase 17 integration check"
  confidence: HIGH
  phase: "17"
  date: "2026-03-01"

- finding: "HybridSearchService is wired into search command: search.ts creates it via new HybridSearchService({db, fts5Service, embeddingRepo, providerFactory, config, sqliteVecAvailable}) and calls searchService.search(). The full pipeline from CLI -> HybridSearchService -> RRF -> temporal decay is connected."
  source: "Phase 16 integration check"
  confidence: HIGH
  phase: "16"
  date: "2026-03-01"

- finding: "sync-service.ts (application layer) imports ProjectNameResolver type from infrastructure/sources/project-name-resolver.ts and checkpoint functions from infrastructure/signals/index.ts. This is a known cross-layer dependency accepted as pragmatic design (not a hexagonal arch violation per PhaseREQUIREMENTS.md)."
  source: "v2.0 milestone integration check"
  confidence: HIGH
  phase: "cross-cutting"
  date: "2026-03-01"

- finding: "infrastructure/index.ts does NOT export the embedding/ or paths/ sub-modules. Presentation layer commands import from infrastructure sub-paths directly (e.g., infrastructure/embedding/embedding-provider-factory.js). This is intentional -- embedding is lazy-loaded to avoid ONNX runtime overhead."
  source: "v2.0 milestone integration check"
  confidence: HIGH
  phase: "cross-cutting"
  date: "2026-03-01"

- finding: "presentation/index.ts has stub comment only ('CLI commands will be exported here as they are implemented'). Nothing is exported from it. The src/index.ts exports commands directly from presentation/cli/commands/index.ts. This means presentation/index.ts is an empty barrel -- no callers depend on it."
  source: "v2.0 milestone integration check"
  confidence: HIGH
  phase: "cross-cutting"
  date: "2026-03-01"

- finding: "HybridSearchService implements ISearchService with search(q, opts?: HybridSearchOptions). TypeScript accepts this because HybridSearchOptions extends SearchOptions with optional-only extra fields (mode?, noDecay?). Structural compatibility is valid in strict mode."
  source: "v2.0 milestone integration check"
  confidence: HIGH
  phase: "16"
  date: "2026-03-01"

- finding: "Domain layer has zero external dependencies. grep for external package imports in src/domain/ returned nothing. All domain imports are relative paths within domain only."
  source: "v2.0 milestone QUAL-02 check"
  confidence: HIGH
  phase: "cross-cutting"
  date: "2026-03-01"
