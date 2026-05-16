/**
 * DTO helpers for query command JSON output.
 *
 * Extracted from JsonOutputFormatter (per Codex MEDIUM-1) so each command
 * can build its envelope `data` field using a pure, testable transformation.
 *
 * INVARIANT (Gemini LOW): highlight offsets MUST be computed BEFORE
 * <mark> tags are stripped. Computing after-strip would always produce
 * offset 0 (no tags remain). See toSearchResultDto.
 *
 * CONTEXT_BUDGET BOUNDARY (Codex MEDIUM-1): the iterative truncation loop
 * that fits results within the 50K-char budget lives in
 * JsonOutputFormatter (output-formatter.ts), NOT here. DTO helpers
 * transform shape; the formatter owns truncation. Plan 32-02's envelope
 * path skips truncation because envelope consumers expect a stable
 * data array, not a heuristically-trimmed prefix.
 */

import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import type { Session } from "../../../domain/entities/session.js";
import type { Message } from "../../../domain/entities/message.js";
import type { ToolUse } from "../../../domain/entities/tool-use.js";
import type { QmdSearchResult } from "../../../domain/ports/services.js";
import type { ProjectContext } from "../../../infrastructure/database/services/context-service.js";
import type { ExtendedStatsResult } from "./stats-formatter.js";
import type { SessionDetail } from "./show-formatter.js";
import type { RelatedSession } from "./related-formatter.js";
import { extractHighlights } from "./output-formatter.js";

/* -------------------------------------------------------------------------- */
/* SEARCH (DB path)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * DTO for a single search result in JSON output.
 *
 * Mirrors the legacy JsonOutputFormatter.formatResults() shape so
 * existing consumers see the same fields wrapped in the envelope's
 * `data` array.
 */
export interface SearchResultDto {
  sessionId: string;
  messageId: string;
  role: string;
  score: number;
  timestamp: string;
  snippet: string;
  rank?: number;
  raw_scores?: { bm25?: number; cosine?: number; rrf?: number };
  source?: "fts" | "vector" | "both";
  highlights?: Array<{ offset: number; length: number }>;
}

/**
 * Convert a SearchResult value-object into a JSON-emitting DTO.
 *
 * - highlights are computed from the ORIGINAL snippet before <mark>
 *   stripping (Gemini LOW invariant).
 * - hybrid-search-meta fields (rank, raw_scores, source, highlights)
 *   are only included when includeSearchMetaFields is true — preserving
 *   the legacy behavior where these were gated on options.searchMeta.
 */
export function toSearchResultDto(
  result: SearchResult,
  opts: { rank?: number; includeSearchMetaFields?: boolean } = {},
): SearchResultDto {
  // 1. Compute highlights BEFORE stripping <mark> (load-bearing).
  const highlights = extractHighlights(result.snippet);
  // 2. Strip tags for the final snippet value.
  const cleanSnippet = result.snippet.replace(/<\/?mark>/g, "");
  // 3. Build base DTO.
  const dto: SearchResultDto = {
    sessionId: result.sessionId,
    messageId: result.messageId,
    role: result.role,
    score: result.score,
    timestamp: result.timestamp.toISOString(),
    snippet: cleanSnippet,
  };
  if (opts.includeSearchMetaFields) {
    if (opts.rank !== undefined) dto.rank = opts.rank;
    const rawScores = result.rawScores;
    if (rawScores) dto.raw_scores = rawScores;
    if (result.source) dto.source = result.source;
    if (highlights.length > 0) dto.highlights = highlights;
  }
  return dto;
}

/* -------------------------------------------------------------------------- */
/* SEARCH (--files branch — HIGH-4)                                            */
/* -------------------------------------------------------------------------- */

/**
 * DTO for a single qmd file-search result.
 *
 * Mirrors the QmdSearchResult shape so consumers see the same fields
 * wrapped in the envelope (instead of the bespoke bare array that
 * leaked in the pre-Plan-32-02 code).
 */
export interface FileResultDto {
  docid?: string;
  score: number;
  file: string;
  title: string;
  context?: string;
  snippet?: string;
}

export function toFileResultDto(result: QmdSearchResult): FileResultDto {
  const dto: FileResultDto = {
    score: result.score,
    file: result.file,
    title: result.title,
  };
  if (result.docid !== undefined) dto.docid = result.docid;
  if (result.context !== undefined) dto.context = result.context;
  if (result.snippet !== undefined) dto.snippet = result.snippet;
  return dto;
}

/* -------------------------------------------------------------------------- */
/* LIST                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * DTO for a session entry in the `list` command output.
 *
 * Mirrors the existing list-formatter JSON shape.
 */
export interface SessionListDto {
  id: string;
  project: string;
  projectPath: string;
  startTime: string;
  endTime?: string;
  messageCount?: number;
  summary?: string;
}

export function toSessionListDto(session: Session): SessionListDto {
  const dto: SessionListDto = {
    id: session.id,
    project: session.projectPath.projectName,
    projectPath: session.projectPath.decoded,
    startTime: session.startTime.toISOString(),
  };
  if (session.endTime) dto.endTime = session.endTime.toISOString();
  if (session.messageCount !== undefined) dto.messageCount = session.messageCount;
  if (session.summary !== undefined) dto.summary = session.summary;
  return dto;
}

/* -------------------------------------------------------------------------- */
/* SHOW                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * DTO for a message in the `show` command output.
 */
export interface ShowMessageDto {
  id: string;
  role: string;
  timestamp: string;
  content: string;
  toolUseIds?: string[];
}

/**
 * DTO for a tool use in the `show` command output.
 */
export interface ShowToolUseDto {
  id: string;
  name: string;
  status: string;
  input: Record<string, unknown>;
  result?: string;
}

/**
 * DTO for `show` command — session + messages + tool uses.
 */
export interface ShowSessionDto {
  session: SessionListDto;
  messages: ShowMessageDto[];
  toolUses: ShowToolUseDto[];
}

export function toShowSessionDto(detail: SessionDetail): ShowSessionDto {
  return {
    session: toSessionListDto(detail.session),
    messages: detail.messages.map(toShowMessageDto),
    toolUses: Array.from(detail.toolUses.values()).map(toShowToolUseDto),
  };
}

function toShowMessageDto(message: Message): ShowMessageDto {
  const dto: ShowMessageDto = {
    id: message.id,
    role: message.role,
    timestamp: message.timestamp.toISOString(),
    content: message.content,
  };
  return dto;
}

function toShowToolUseDto(tool: ToolUse): ShowToolUseDto {
  const dto: ShowToolUseDto = {
    id: tool.id,
    name: tool.name,
    status: tool.status,
    input: tool.input,
  };
  if (tool.result !== undefined) dto.result = tool.result;
  return dto;
}

/* -------------------------------------------------------------------------- */
/* RELATED                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * DTO for a related-session entry in the `related` command output.
 */
export interface RelatedDto {
  session: SessionListDto;
  weight: number;
  hops: number;
}

export function toRelatedDto(item: RelatedSession): RelatedDto {
  return {
    session: toSessionListDto(item.session),
    weight: item.weight,
    hops: item.hops,
  };
}

/* -------------------------------------------------------------------------- */
/* STATS                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * DTO for the `stats` command output.
 *
 * Mirrors ExtendedStatsResult shape: totals plus per-project breakdown
 * and optional hooks summary.
 */
export interface StatsDto {
  totalSessions: number;
  totalMessages: number;
  totalToolUses: number;
  databaseSizeBytes: number;
  projectBreakdown: Array<{
    projectName: string;
    sessionCount: number;
    messageCount: number;
  }>;
  hooks?: {
    installed: boolean;
    autoSync: boolean;
    pendingSessions: number;
  };
}

export function toStatsDto(stats: ExtendedStatsResult): StatsDto {
  const dto: StatsDto = {
    totalSessions: stats.totalSessions,
    totalMessages: stats.totalMessages,
    totalToolUses: stats.totalToolUses,
    databaseSizeBytes: stats.databaseSizeBytes,
    projectBreakdown: stats.projectBreakdown.map((p) => ({
      projectName: p.projectName,
      sessionCount: p.sessionCount,
      messageCount: p.messageCount,
    })),
  };
  if (stats.hooks) {
    dto.hooks = {
      installed: stats.hooks.installed,
      autoSync: stats.hooks.autoSync,
      pendingSessions: stats.hooks.pendingSessions,
    };
  }
  return dto;
}

/* -------------------------------------------------------------------------- */
/* CONTEXT                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * DTO for the `context` command output.
 *
 * Mirrors ProjectContext shape so envelope `data` carries the same
 * information the legacy formatter renders.
 */
export interface ContextDto {
  projectName: string;
  projectPathDecoded: string;
  sessionCount: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  recentTopics: string[];
  recentToolUses: Array<{ name: string; count: number }>;
  lastActivity: string | null;
}

export function toContextDto(context: ProjectContext): ContextDto {
  return {
    projectName: context.projectName,
    projectPathDecoded: context.projectPathDecoded,
    sessionCount: context.sessionCount,
    totalMessages: context.totalMessages,
    userMessages: context.userMessages,
    assistantMessages: context.assistantMessages,
    recentTopics: [...context.recentTopics],
    recentToolUses: context.recentToolUses.map((t) => ({
      name: t.name,
      count: t.count,
    })),
    lastActivity: context.lastActivity ? context.lastActivity.toISOString() : null,
  };
}
