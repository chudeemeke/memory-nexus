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

import * as fs from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  SqliteContextService,
  SqliteProjectResolver,
} from "../../../infrastructure/database/services/context-service.js";
import {
  SqliteFactRepository,
} from "../../../infrastructure/database/repositories/fact-repository.js";
import {
  SqliteFrictionRepository,
} from "../../../infrastructure/database/repositories/friction-repository.js";
import {
  SqliteMemoryGovernanceRepository,
} from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  SmartContextService,
} from "../../../application/services/smart-context-service.js";
import {
  MemoryGovernanceService,
} from "../../../application/services/memory-governance-service.js";
import {
  createContextFormatter,
  type ContextOutputMode,
} from "../formatters/context-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toContextDto } from "../formatters/dto-helpers.js";
import { emitFormatDeprecationWarning } from "./_helpers/deprecation-warning.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

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

export async function executeContextCommand(
  project: string,
  options: ContextCommandOptions
): Promise<CommandResult> {
  const { executeQueryCommand } = await import("./query.js");
  process.env.MEMORY_JSON_COMMAND_OVERRIDE = "context";
  try {
    return await executeQueryCommand(project, {
      ...options,
      kind: "context",
      scope: "project",
    });
  } finally {
    delete process.env.MEMORY_JSON_COMMAND_OVERRIDE;
  }
}

/**
 * Internal implementation of the context query execution.
 */
export async function runContextInternal(
  project: string,
  options: ContextCommandOptions,
  deps?: { dbPath?: string }
): Promise<CommandResult> {
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

  // Check for legacy ~/.memory/ directory
  const legacyDir = join(os.homedir(), ".memory");
  if (fs.existsSync(legacyDir) && !options.quiet && !options.json) {
    console.error(
      "[DEPRECATION WARNING] Legacy memory directory ~/.memory/ is deprecated. Your knowledge and decisions are now stored safely in the SQLite database."
    );
  }

  const dbPath = deps?.dbPath ?? options.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    return await executeSmartContext(db, project, options);
  } catch (error) {
    // Wrap in MemoryError for consistent formatting
    const nexusError =
      error instanceof MemoryError
        ? error
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            unknownErrorMessage(error)
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
): Promise<CommandResult> {
  const projectResolver = new SqliteProjectResolver(db);
  const factRepo = new SqliteFactRepository(db);
  const frictionRepo = new SqliteFrictionRepository(db);
  const governanceRepo = new SqliteMemoryGovernanceRepository(db);
  const governancePolicy = new MemoryGovernanceService({ repository: governanceRepo });

  // We need a captured legacy context if --json is set so we can build
  // the envelope's data field (toContextDto). The smart-context summary
  // text is for human formatters; envelope consumers want structured DTO.
  const legacy = new SqliteContextService(db);

  const smartContext = new SmartContextService({
    projectResolver,
    factRepo,
    frictionRepo,
    governancePolicy,
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
