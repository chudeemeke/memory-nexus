/**
 * Application Services
 *
 * Services that orchestrate domain logic and infrastructure.
 */

export { SyncService } from "./sync-service.js";
export type {
  SyncOptions,
  SyncProgress,
  SyncResult,
} from "./sync-service.js";

export { RecoveryService, extractSessionId } from "./recovery-service.js";
export type {
  RecoveryResult,
  RecoveryOptions,
} from "./recovery-service.js";

export { PatternExtractor } from "./pattern-extractor.js";
export type {
  FileModification,
  ToolStats,
} from "./pattern-extractor.js";

export { LlmExtractor } from "./llm-extractor.js";
export type {
  ExtractionResult,
  LlmExtractorOptions,
} from "./llm-extractor.js";

export { EmbeddingService, computeModelHash } from "./embedding-service.js";
export type {
  EmbedOptions,
  EmbedProgress,
  EmbedResult,
  ModelState,
} from "./embedding-service.js";

export {
  exportToJson,
  validateExportFile,
  importFromJson,
  hasExistingData,
} from "./export-service.js";
export type {
  ExportData,
  ExportStats,
  ImportStats,
  ValidationResult,
  ImportOptions,
  SessionExport,
  MessageExport,
  ToolUseExport,
  EntityExport,
  LinkExport,
} from "./export-service.js";

export { reciprocalRankFusion } from "./rrf-fusion.js";
export type {
  RankedCandidate,
  FusedResult,
} from "./rrf-fusion.js";

export {
  applyTemporalDecay,
  applyTemporalDecayWithExemptions,
  CURATED_FILE_TYPES,
} from "./temporal-decay.js";
export type {
  DecayableResult,
  DecayedResult,
} from "./temporal-decay.js";

export { sanitizeFtsQuery } from "./fts-sanitizer.js";

export { MemoryFileSyncService } from "./memory-file-sync-service.js";
export type {
  MemoryFileSyncResult,
  MemoryFileSyncProgress,
  MemoryFileSyncOptions,
} from "./memory-file-sync-service.js";

export { FrictionService } from "./friction-service.js";
export type {
  LogFrictionParams,
  ListFrictionOptions,
} from "./friction-service.js";

export { BackfillService } from "./backfill-service.js";
export type {
  BackfillResult,
  BackfillProgress,
  DryRunResult,
  BackfillOptions,
  IDailyLogWriter,
} from "./backfill-service.js";

export { allocateBudget } from "./budget-allocator.js";
export type {
  BudgetSection,
  AllocatedSection,
  BudgetAllocationResult,
} from "./budget-allocator.js";

export { SmartContextService } from "./smart-context-service.js";
export type {
  SmartContextOptions,
  SmartContextResult,
  ContextSection,
  IProjectResolver,
  IContextGovernancePolicy,
  SmartContextDeps,
} from "./smart-context-service.js";

export { AmbientContextService } from "./ambient-context-service.js";
export type {
  AmbientContextOptions,
  AmbientContextResult,
} from "./ambient-context-service.js";

export { ProjectionRegistry } from "./projection-registry.js";
export type {
  EventProjection,
  ProjectionReplayResult,
} from "./projection-registry.js";

export { MemoryGovernanceService } from "./memory-governance-service.js";
export type {
  GovernanceControlCommand,
  MemoryEventWriter,
  MemoryGovernanceServiceDeps,
  RegisterDerivedMemoryParams,
} from "./memory-governance-service.js";
