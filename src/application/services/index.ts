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
