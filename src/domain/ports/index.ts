/**
 * Domain Ports
 *
 * Interfaces defining how the domain interacts with the outside world.
 * Implemented by infrastructure adapters.
 */

// Repository interfaces
export type {
  ISessionRepository,
  IMessageRepository,
  IToolUseRepository,
  ILinkRepository,
  IExtractionStateRepository,
} from "./repositories.js";

// Service interfaces
export type { ISearchService, SearchOptions } from "./services.js";

// Source interfaces
export type {
  ISessionSource,
  IEventParser,
  SessionFileInfo,
} from "./sources.js";

// Parsed event types
export type {
  ParsedEvent,
  UserEventData,
  AssistantEventData,
  ToolUseEventData,
  ToolResultEventData,
  SummaryEventData,
  SystemEventData,
  ContentBlock,
} from "./types.js";
