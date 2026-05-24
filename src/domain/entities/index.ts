/**
 * Domain Entities
 *
 * Core business objects with identity and lifecycle.
 */

export {
  Entity,
  type ExtractedEntityType,
  type ConceptMetadata,
  type FileMetadata,
  type DecisionMetadata,
  type TermMetadata,
  type EntityMetadata,
} from "./entity.js";
export {
  ExtractionState,
  type ExtractionStatus,
} from "./extraction-state.js";
export { Link, type EntityType, type LinkType } from "./link.js";
export { Message, type MessageRole } from "./message.js";
export { Session } from "./session.js";
export { ToolUse, type ToolUseStatus } from "./tool-use.js";
export { MemoryFile, type MemoryFileType } from "./memory-file.js";
export {
    FrictionEntry,
    type FrictionSeverity,
    type FrictionCategory,
    type FrictionStatus,
} from "./friction-entry.js";
export { BackfillState } from "./backfill-state.js";
export { Fact, type FactType, type FactParams, type CandidateFact } from "./fact.js";

