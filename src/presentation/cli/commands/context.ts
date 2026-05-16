/**
 * Context Command Handler
 *
 * CLI command for showing aggregated context for a project.
 * Supports filtering by days, token budgets, cross-project mode,
 * and multiple output formats including AI-optimized output.
 *
 * When --format ai, --budget, or --cross-project is set, uses
 * SmartContextService for structured briefings from memory files.
 * Otherwise falls back to legacy SqliteContextService for backward
 * compatibility.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  SqliteContextService,
  SqliteProjectResolver,
} from "../../../infrastructure/database/services/context-service.js";
import {
  SqliteMemoryFileRepository,
} from "../../../infrastructure/database/repositories/memory-file-repository.js";
import {
  SqliteFrictionRepository,
} from "../../../infrastructure/database/repositories/friction-repository.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  SmartContextService,
} from "../../../application/services/smart-context-service.js";
import {
  createContextFormatter,
  type ContextOutputMode,
  type ContextFormatOptions,
} from "../formatters/context-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toContextDto } from "../formatters/dto-helpers.js";
import { emitFormatDeprecationWarning } from "./_helpers/deprecation-warning.js";

/**
 * Options for the context command.
 */
export interface ContextCommandOptions {
  /** Sessions from last N days (includes today) */
  days?: number;
  /**
   * Output format. Phase 32 (CLI-03) normalized choices: `brief`,
   * `ai`. `detailed` retained as deprecated alias (one-minor cadence;
   * CHANGELOG documents removal). Undefined = no-flag default
   * (existing brief behavior preserved for backward compatibility).
   */
  format?: "brief" | "ai" | "detailed";
  /** Maximum token budget for smart context */
  budget?: number;
  /** Include cross-project learnings and decisions */
  crossProject?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Show detailed output with timing */
  verbose?: boolean;
  /** Minimal output */
  quiet?: boolean;
  /** Override database path (for testing) */
  dbPath?: string;
}

/**
 * Create the context command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createContextCommand(): Command {
  return new Command("context")
    .description("Show aggregated context for a project")
    .argument("<project>", "Project name or substring to filter by")
    .addOption(
      new Option("--days <n>", "Sessions from last N days (includes today)")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
          return n;
        })
    )
    .addOption(
      new Option(
        "--format <type>",
        "Output format: brief, ai. 'detailed' accepted as deprecated alias.",
      ).choices(["brief", "ai", "detailed"]),
      // No .default() — undefined preserves existing implicit brief behavior
      // via the action handler. Phase 32 (CLI-03) normalization.
    )
    .addOption(
      new Option("--budget <tokens>", "Maximum token budget for context")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Budget must be a positive number");
          return n;
        })
    )
    .option("--cross-project", "Include cross-project learnings and decisions")
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-v, --verbose", "Show detailed output with timing")
        .conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output")
        .conflicts("verbose")
    )
    .action(async (project: string, options: ContextCommandOptions) => {
      const result = await executeContextCommand(project, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Precedence rule for context command output (per Codex HIGH-5):
 *
 *   --json wins routing AND output formatting. When --json is set:
 *     - --format ai is IGNORED (no formatForAi() post-processing)
 *     - The routing decision (Smart vs Legacy) depends on --budget /
 *       --cross-project flags ONLY, not on --format ai.
 *
 *   When --json is NOT set:
 *     - --format ai routes to SmartContextService and post-processes
 *       text output via formatForAi().
 *
 * Plan 32-02's context.json.test.ts deep-equals the JSON output of
 * `--json` and `--json --format ai`. That assertion is the
 * verification that this precedence rule holds at the routing layer,
 * not just at the output-formatting layer.
 */
function useSmartContext(options: ContextCommandOptions): boolean {
  // --json mode: ignore --format ai; routing depends only on smart
  // context flags (budget / cross-project).
  if (options.json) {
    return !!options.budget || !!options.crossProject;
  }
  return options.format === "ai" || !!options.budget || !!options.crossProject;
}

/**
 * Execute the context command programmatically.
 *
 * Shows aggregated context for a project including recent topics,
 * entities, and session summaries. When smart context flags are set,
 * produces structured briefings from memory files. Handles its own
 * database initialization and teardown.
 *
 * @param project - Project name or substring to filter by
 * @param options - Context command options
 * @returns CommandResult with exitCode 0 (success) or 1 (not found/error)
 */
export async function executeContextCommand(
  project: string,
  options: ContextCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  // Phase 32 (CLI-03): deprecation warning for --format detailed
  // (alias retained for one-minor cadence; behavior preserved).
  if (options.format === "detailed") {
    emitFormatDeprecationWarning({
      command: "context",
      alias: "detailed",
      replacement: "Use --format brief or --format ai.",
      json: options.json,
    });
  }

  const dbPath = options.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Route to SmartContextService or legacy path
    if (useSmartContext(options)) {
      return await executeSmartContext(db, project, options, startTime);
    }
    return await executeLegacyContext(db, project, options, startTime);
  } catch (error) {
    // Wrap in MemoryError for consistent formatting
    const nexusError =
      error instanceof MemoryError
        ? error
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            error instanceof Error ? error.message : String(error)
          );

    // Format error based on output mode
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "context",
        code: nexusError.code,
        message: nexusError.message,
        ...(nexusError.context !== undefined
          ? { context: nexusError.context }
          : {}),
      });
    } else {
      console.error(formatError(nexusError));
    }
    return { exitCode: 1 };
  } finally {
    closeDatabase(db);
  }
}

/**
 * Execute smart context path using SmartContextService.
 */
async function executeSmartContext(
  db: ReturnType<typeof initializeDatabase>["db"],
  project: string,
  options: ContextCommandOptions,
  _startTime: number,
): Promise<CommandResult> {
  const projectResolver = new SqliteProjectResolver(db);
  const memoryFileRepo = new SqliteMemoryFileRepository(db);
  const frictionRepo = new SqliteFrictionRepository(db);

  // We need a captured legacy context if --json is set so we can build
  // the envelope's data field (toContextDto). The smart-context summary
  // text is for human formatters; envelope consumers want structured DTO.
  const legacy = new SqliteContextService(db);

  const smartContext = new SmartContextService({
    projectResolver,
    memoryFileRepo,
    frictionRepo,
    getSessionSummary: async (filter, days) => {
      const ctx = await legacy.getProjectContext(filter, { days });
      if (!ctx) return null;
      return `Sessions: ${ctx.sessionCount} | Messages: ${ctx.totalMessages} | Last active: ${ctx.lastActivity?.toISOString() ?? "never"}`;
    },
  });

  const result = await smartContext.getContext({
    projectFilter: project,
    budget: options.budget,
    days: options.days,
    crossProject: options.crossProject,
  });

  // --json takes the envelope path (Codex HIGH-5: same shape regardless
  // of --format ai). Note: smart-context returns a sections array, but
  // envelope consumers also want structured ProjectContext DTO data —
  // so we re-fetch the legacy context shape for the data payload and
  // attach smart-context sections in meta.
  if (options.json) {
    if (!result) {
      emitJsonErrorEnvelope({
        command: "context",
        code: "NOT_FOUND",
        message: `Project not found: ${project}`,
        context: { project },
      });
      return { exitCode: 1 };
    }
    const ctx = await legacy.getProjectContext(project, { days: options.days });
    emitJsonEnvelope({
      command: "context",
      kind: "context",
      data: ctx ? toContextDto(ctx) : null,
      meta: {
        project,
        days: options.days,
        budget: options.budget,
        cross_project: !!options.crossProject,
        mode: "smart",
        sections: result.sections.map((s) => ({ key: s.key, title: s.title })),
      },
    });
    return { exitCode: 0 };
  }

  // Determine output mode (text mode)
  const outputMode: ContextOutputMode = options.format === "ai" ? "ai" :
    options.verbose ? "verbose" :
    options.quiet ? "quiet" :
    options.format === "detailed" ? "detailed" : "brief";

  const useColor = shouldUseColor();
  const formatter = createContextFormatter(outputMode, useColor);

  // Handle null result (project not found)
  if (!result) {
    const message = formatter.formatEmpty(project);
    if (outputMode !== "quiet" || message) {
      console.error(message);
    }
    return { exitCode: 1 };
  }

  // Format output based on mode
  if (formatter.formatSmartContext) {
    const output = formatter.formatSmartContext(result);
    console.log(output);
  } else {
    // For non-AI formatters, fall through to session summary if available
    const sessionSummarySection = result.sections.find(s => s.key === "session_summary");
    if (sessionSummarySection) {
      console.log(sessionSummarySection.content);
    } else {
      // Build minimal output from available sections
      const output = result.sections.map(s => `${s.title}:\n${s.content}`).join("\n\n");
      console.log(output);
    }
  }

  return { exitCode: 0 };
}

/**
 * Execute legacy context path using SqliteContextService.
 * Preserves backward compatibility for brief/detailed/json/verbose/quiet modes.
 */
async function executeLegacyContext(
  db: ReturnType<typeof initializeDatabase>["db"],
  project: string,
  options: ContextCommandOptions,
  startTime: number,
): Promise<CommandResult> {
  const contextService = new SqliteContextService(db);

  // Build context options from CLI options
  const contextOptions = {
    days: options.days,
  };

  // Get project context
  const context = await contextService.getProjectContext(project, contextOptions);

  // --json: envelope path (Codex HIGH-2 — every exit point routes here)
  if (options.json) {
    if (!context) {
      emitJsonErrorEnvelope({
        command: "context",
        code: "NOT_FOUND",
        message: `Project not found: ${project}`,
        context: { project },
      });
      return { exitCode: 1 };
    }
    emitJsonEnvelope({
      command: "context",
      kind: "context",
      data: toContextDto(context),
      meta: {
        project,
        days: options.days,
        cross_project: !!options.crossProject,
        mode: "legacy",
      },
    });
    return { exitCode: 0 };
  }

  // Determine output mode (text mode)
  let outputMode: ContextOutputMode = "brief";
  if (options.verbose) outputMode = "verbose";
  else if (options.quiet) outputMode = "quiet";
  else if (options.format === "detailed") outputMode = "detailed";

  const useColor = shouldUseColor();
  const formatter = createContextFormatter(outputMode, useColor);

  // Handle null result (project not found) — text mode
  if (!context) {
    const message = formatter.formatEmpty(project);
    if (outputMode !== "quiet" || message) {
      console.error(message);
    }
    return { exitCode: 1 };
  }

  // Format and output
  const endTime = performance.now();
  const formatOptions: ContextFormatOptions = {
    executionTimeMs: Math.round(endTime - startTime),
    filtersApplied: buildFiltersList(options),
  };
  const output = formatter.formatContext(context, formatOptions);
  console.log(output);
  return { exitCode: 0 };
}

/**
 * Build a list of filters applied for verbose output.
 */
function buildFiltersList(options: ContextCommandOptions): string[] {
  const filters: string[] = [];
  if (options.days) filters.push(`days: ${options.days}`);
  if (options.budget) filters.push(`budget: ${options.budget}`);
  if (options.crossProject) filters.push("cross-project");
  return filters;
}
