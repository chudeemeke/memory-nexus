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

export {
  formatError,
  formatErrorJson,
  getSuggestion,
  type ErrorFormatOptions,
} from "./error-formatter.js";

export {
  formatFrictionDashboard,
  generateFrictionHtml,
} from "./friction-dashboard.js";

export {
  stripAnsi,
  estimateTokens,
  formatForAi,
} from "./ai-formatter.js";

// CLI-02 foundation: shared envelope contract + emission helpers.
// Re-exported here so per-command files import from the formatters barrel.
export {
  ENVELOPE_SCHEMA_VERSION,
  QUERY_COMMAND_NAMES,
  QUERY_RESULT_KINDS,
  buildEnvelope,
  buildErrorEnvelope,
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
  type QueryCommandName,
  type QueryResultKind,
  type EnvelopeScope,
  type QueryResultEnvelope,
  type QueryErrorEnvelope,
} from "./envelope.js";
