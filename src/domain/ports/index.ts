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
  IEmbeddingRepository,
  IMemoryFileRepository,
  IFrictionRepository,
  IBackfillStateRepository,
  BackfillStatusCounts,
  FrictionStats,
  UnembeddedMessage,
  EmbeddingBatchItem,
  EmbeddingServiceConfig,
} from "./repositories.js";

// Embedding provider port
export type {
  IEmbeddingProvider,
  DownloadProgress,
  EmbeddingModelInfo,
} from "./embedding.js";

// Service interfaces
export type {
  ISearchService,
  SearchOptions,
  SearchMode,
  HybridSearchOptions,
  IStatsService,
  StatsResult,
  ProjectStats,
} from "./services.js";

// Source interfaces
export type {
  ISessionSource,
  IEventParser,
  IProjectNameResolver,
  IMemoryFileScanner,
  SessionFileInfo,
  MemoryFileInfo,
} from "./sources.js";

// Signal interfaces
export type {
  SyncCheckpoint,
  ISyncAbortSignal,
  ICheckpointManager,
  ISyncLogger,
} from "./signals.js";

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
