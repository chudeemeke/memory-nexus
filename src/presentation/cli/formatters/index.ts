/**
 * CLI Formatters Barrel Export
 *
 * Output formatting utilities for CLI commands.
 */

export {
  formatTimestamp,
  formatRelativeTime,
  formatAbsoluteTime,
} from "./timestamp-formatter.js";

export {
  shouldUseColor,
  bold,
  dim,
  green,
  red,
  yellow,
  type ColorOptions,
} from "./color.js";

export {
  createOutputFormatter,
  CONTEXT_BUDGET,
  type OutputMode,
  type FormatOptions,
  type ExecutionDetails,
  type SummaryStats,
  type OutputFormatter,
} from "./output-formatter.js";

export {
  createListFormatter,
  type ListOutputMode,
  type ListFormatOptions,
  type ListFormatter,
} from "./list-formatter.js";

export {
  createStatsFormatter,
  type StatsOutputMode,
  type StatsFormatOptions,
  type StatsFormatter,
} from "./stats-formatter.js";

export {
  createContextFormatter,
  type ContextOutputMode,
  type ContextFormatOptions,
  type ContextFormatter,
} from "./context-formatter.js";

export {
  createRelatedFormatter,
  type RelatedOutputMode,
  type RelatedFormatOptions,
  type RelatedFormatter,
  type RelatedSession,
} from "./related-formatter.js";

export {
  createShowFormatter,
  summarizeToolResult,
  type ShowOutputMode,
  type SessionDetail,
  type ShowFormatOptions,
  type ShowFormatter,
} from "./show-formatter.js";
