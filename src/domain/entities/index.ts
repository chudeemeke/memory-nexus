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
export {
  MemoryEventEnvelope,
  MEMORY_EVENT_SCHEMA_VERSION,
  type ConsentStatus,
  type MemoryEventCausality,
  type MemoryEventConsent,
  type MemoryEventCreateParams,
  type MemoryEventEnvelopeJson,
  type MemoryEventIntegrity,
  type MemoryEventKind,
  type MemoryEventOperation,
  type MemoryEventPrivacy,
  type MemoryEventProvenance,
  type MemoryEventScope,
  type MemoryEventVisibility,
  type RedactionState,
} from "./memory-event.js";
export {
  MemoryGovernanceEntry,
  MEMORY_GOVERNANCE_CONTROLS,
  MEMORY_GOVERNANCE_STATUSES,
  MEMORY_GOVERNANCE_SURFACES,
  assertMemoryGovernanceControl,
  assertMemoryGovernanceSurface,
  type GovernanceControlParams,
  type MemoryGovernanceControl,
  type MemoryGovernanceEntryJson,
  type MemoryGovernanceEntryParams,
  type MemoryGovernanceStatus,
  type MemoryGovernanceSurface,
} from "./memory-governance.js";
export {
  PersonaEntry,
  PERSONA_ENTRY_CONTROLS,
  PERSONA_ENTRY_KINDS,
  type PersonaEntryJson,
  type PersonaEntryKind,
  type PersonaEntryParams,
  type PersonaReviewStatus,
} from "./persona-entry.js";
export {
  GraphEdge,
  GRAPH_NODE_TYPES,
  type GraphEdgeJson,
  type GraphEdgeParams,
  type GraphNodeRef,
  type GraphNodeType,
} from "./graph-edge.js";
export {
  MemoryUtilityMetric,
  MEMORY_UTILITY_CONTROLS,
  MEMORY_UTILITY_SURFACES,
  type MemoryUtilityControl,
  type MemoryUtilityMetricJson,
  type MemoryUtilityMetricParams,
  type MemoryUtilitySurface,
} from "./memory-utility-metric.js";
