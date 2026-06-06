/**
 * Extract CLI Command Handler
 *
 * Runs the comparative LLM fact extraction pipeline on session history.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { SqliteExtractionLogRepository } from "../../../infrastructure/database/repositories/extraction-log-repository.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../infrastructure/database/repositories/message-repository.js";
import { loadConfig, type MemoryConfig } from "../../../infrastructure/hooks/config-manager.js";
import { parseDuration } from "./purge.js";
import { ExtractionPipeline } from "../../../application/services/extraction-pipeline.js";
import type { IExtractionProvider } from "../../../domain/ports/extraction.js";
import type { IEmbeddingProvider } from "../../../domain/ports/embedding.js";
import { emitJsonErrorEnvelope } from "../formatters/envelope.js";
import { shouldUseColor, green, dim } from "../formatters/color.js";
import { PatternRedactor } from "../../../infrastructure/security/pattern-redactor.js";
import { createExtractionProvider } from "../../../infrastructure/providers/provider-registry.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

export interface ExtractCommandOptions {
  project: string;
  all?: boolean;
  since?: string;
  force?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface ExtractCommandDeps {
  dbPath?: string;
  mockExtractor?: IExtractionProvider;
  mockEmbedder?: IEmbeddingProvider;
  createEmbedder?: (config: MemoryConfig) => Promise<IEmbeddingProvider | undefined>;
  eventLogPath?: string;
}

/**
 * Custom Progress indicator for fact extraction.
 */
export class ExtractProgress {
  private current = 0;
  private total = 0;
  private isTty = process.stdout.isTTY;
  private quiet = false;

  constructor(total: number, quiet = false) {
    this.total = total;
    this.quiet = quiet;
    if (this.quiet) return;

    if (this.isTty) {
      process.stdout.write(`\rExtracting facts... [0/${total}] ░░░░░░░░░░ 0%`);
    } else {
      console.log(`Extracting facts from ${total} sessions...`);
    }
  }

  update(sessionName: string) {
    if (this.quiet) return;
    this.current++;
    const percent = Math.round((this.current / this.total) * 100);
    const progressChars = Math.min(10, Math.max(0, Math.floor(percent / 10)));
    const bar = "█".repeat(progressChars) + "░".repeat(10 - progressChars);

    if (this.isTty) {
      // Truncate session name for terminal space safety
      const name = sessionName.length > 25 ? sessionName.substring(0, 22) + "..." : sessionName;
      process.stdout.write(`\rExtracting facts... [${this.current}/${this.total}] [${bar}] ${percent}% - Session: ${name}`);
    } else {
      console.log(`[${this.current}/${this.total}] Processed session: ${sessionName}`);
    }
  }

  stop() {
    if (this.quiet) return;
    if (this.isTty) {
      process.stdout.write("\n");
    }
  }
}

export async function createDefaultEmbedder(
  config: MemoryConfig
): Promise<IEmbeddingProvider | undefined> {
  const { EmbeddingProviderFactory } = await import("../../../infrastructure/embedding/embedding-provider-factory.js");
  const factory = new EmbeddingProviderFactory();
  const embedder = factory.createFromConfig(config);
  if (!embedder) {
    return undefined;
  }
  await embedder.initialize();
  return embedder;
}

export function createExtractCommand(): Command {
  return new Command("extract")
    .description("Extract facts from session messages using LLM")
    .argument("<project>", "Project name or path to process")
    .option("--all", "Process all sessions matching this project")
    .option("--since <duration>", "Filter sessions by age (e.g. '24h', '7d', '30d')")
    .option("-f, --force", "Force extraction even on previously processed sessions")
    .option("--json", "Output result as JSON")
    .option("-q, --quiet", "Minimal output")
    .action(async (projectArg: string, options: Omit<ExtractCommandOptions, "project">) => {
      const result = await executeExtractCommand({
        project: projectArg,
        ...options
      });
      process.exitCode = result.exitCode;
    });
}

export async function executeExtractCommand(
  options: ExtractCommandOptions,
  deps: ExtractCommandDeps = {}
): Promise<CommandResult> {
  const startTime = performance.now();
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const config = loadConfig();

  // 1. Resolve LLM Extractor Provider
  let extractor: IExtractionProvider;
  if (deps.mockExtractor) {
    extractor = deps.mockExtractor;
  } else {
    try {
      extractor = createExtractionProvider(config);
    } catch (err) {
      const message = unknownErrorMessage(err);
      if (options.json) {
        emitJsonErrorEnvelope({
          command: "extract" as any,
          code: "PROVIDER_INIT_FAILED",
          message,
        });
      } else {
        console.error(`Error: Provider initialization failed: ${message}`);
      }
      return { exitCode: 1 };
    }
  }

  // 2. Resolve Embedding Provider if enabled
  let embedder: IEmbeddingProvider | undefined = deps.mockEmbedder;
  if (!deps.mockEmbedder && config.embedding?.enabled) {
    try {
      embedder = await (deps.createEmbedder ?? createDefaultEmbedder)(config);
    } catch (err) {
      // Gracefully continue without embeddings (falling back to Jaccard similarity)
    }
  }

  // 3. Initialize DB and Repositories
  let db;
  try {
    const initRes = initializeDatabase({ path: dbPath });
    db = initRes.db;
  } catch (err: any) {
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "extract" as any,
        code: "DB_CONNECTION_FAILED",
        message: err.message
      });
    } else {
      console.error(`Error: Database connection failed: ${err.message}`);
    }
    return { exitCode: 1 };
  }

  try {
    const factRepo = new SqliteFactRepository(db);
    const logRepo = new SqliteExtractionLogRepository(db);
    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);

    // 4. Retrieve and filter sessions
    const allSessions = await sessionRepo.findFiltered({
      projectFilter: options.project,
      limit: 10000
    });

    let filteredSessions = allSessions;
    if (options.since && !options.all) {
      try {
        const cutoffDate = parseDuration(options.since);
        filteredSessions = allSessions.filter((s) => s.startTime >= cutoffDate);
      } catch (err: any) {
        if (options.json) {
          emitJsonErrorEnvelope({
            command: "extract" as any,
            code: "INVALID_ARGUMENT",
            message: err.message
          });
        } else {
          console.error(`Error: ${err.message}`);
        }
        return { exitCode: 1 };
      }
    }

    // 5. Run Extraction sequentially
    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      extractor,
      embedder,
      deps.eventLogPath,
      new PatternRedactor(),
    );
    const sessionsToProcess = [];

    for (const session of filteredSessions) {
      const existingLog = await logRepo.findById(session.id);
      if (!existingLog || options.force) {
        sessionsToProcess.push(session);
      }
    }

    if (sessionsToProcess.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          status: "success",
          data: { added: 0, updated: 0, superseded: 0, skipped: 0 },
          meta: { timing_ms: Math.round(performance.now() - startTime), sessions_processed: 0 }
        }, null, 2));
      } else if (!options.quiet) {
        console.log("No new sessions to extract for project:", options.project);
      }
      return { exitCode: 0 };
    }

    const progress = new ExtractProgress(sessionsToProcess.length, !!options.quiet || !!options.json);

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalSuperseded = 0;
    let totalSkipped = 0;

    for (const session of sessionsToProcess) {
      const res = await pipeline.extractFromSession(session.id, options.project, options.force ? { force: true } : undefined);
      totalAdded += res.added;
      totalUpdated += res.updated;
      totalSuperseded += res.superseded;
      totalSkipped += res.skipped;
      progress.update(session.id.substring(0, 8));
    }
    progress.stop();

    // 6. Format and Output
    if (options.json) {
      console.log(JSON.stringify({
        status: "success",
        data: {
          added: totalAdded,
          updated: totalUpdated,
          superseded: totalSuperseded,
          skipped: totalSkipped
        },
        meta: {
          timing_ms: Math.round(performance.now() - startTime),
          sessions_processed: sessionsToProcess.length
        }
      }, null, 2));
    } else if (options.quiet) {
      console.log(`added: ${totalAdded}, updated: ${totalUpdated}, superseded: ${totalSuperseded}, skipped: ${totalSkipped}`);
    } else {
      const useColor = shouldUseColor();
      console.log("\n" + green("==================================================", useColor));
      console.log(green("          Extraction Completed Successfully", useColor));
      console.log(green("==================================================", useColor));
      console.log(`Sessions Processed : ${sessionsToProcess.length}`);
      console.log(`Added              : ${totalAdded}`);
      console.log(`Updated            : ${totalUpdated}`);
      console.log(`Superseded         : ${totalSuperseded}`);
      console.log(`Skipped (Duplicate): ${totalSkipped}`);
      console.log(dim(`Timing             : ${Math.round(performance.now() - startTime)}ms`, useColor));
    }

    return { exitCode: 0 };
  } catch (err: any) {
    if (options.json) {
      console.log(JSON.stringify({
        status: "error",
        error: {
          code: "UNEXPECTED_ERROR",
          message: err.message
        }
      }, null, 2));
    } else {
      console.error(`Error: Fact extraction pipeline execution failed: ${err.message}`);
    }
    return { exitCode: 2 };
  } finally {
    closeDatabase(db);
  }
}
