/**
 * BackfillService
 *
 * Application service that orchestrates session backfilling:
 * 1. Query sessions without backfill state (unprocessed)
 * 2. Extract content from messages
 * 3. Generate structured summary via ISummaryGenerator
 * 4. Write daily log file via IDailyLogWriter
 * 5. Save BackfillState record for idempotency
 *
 * Depends on domain ports only. Infrastructure is injected via constructor.
 */

import type { ISessionRepository } from "../../domain/ports/repositories.js";
import type { IBackfillStateRepository } from "../../domain/ports/repositories.js";
import type { IMessageRepository } from "../../domain/ports/repositories.js";
import type { ISummaryGenerator } from "../../domain/ports/index.js";
import { BackfillState } from "../../domain/entities/backfill-state.js";

/** Approximate cost per session for claude -p summarization */
const COST_PER_SESSION = 0.001;

/** Maximum characters of session content to send to LLM */
const MAX_CONTENT_CHARS = 16000;

export interface BackfillProgress {
  current: number;
  total: number;
  sessionId: string;
  action: "processing" | "skipped" | "error";
}

export interface BackfillResult {
  sessionsProcessed: number;
  sessionsFailed: number;
  sessionsSkipped: number;
  dailyLogsCreated: number;
  dailyLogsUpdated: number;
  errors: Array<{ sessionId: string; error: string }>;
}

export interface DryRunResult {
  unprocessedCount: number;
  estimatedCost: number;
}

export interface BackfillOptions {
  batch?: number;
  project?: string;
  onProgress?: (progress: BackfillProgress) => void;
}

/**
 * File writer abstraction for daily log files.
 *
 * Allows the service to write daily log files without importing
 * filesystem modules directly. Infrastructure provides the implementation.
 */
export interface IDailyLogWriter {
  /**
   * Write or append content to a daily log file.
   * Creates parent directories if needed.
   *
   * @param datePath Date-based path relative to memory dir (e.g., "daily/2026-03-08.md")
   * @param content Markdown content to write or append
   * @returns Whether the file was created (true) or appended to (false)
   */
  writeOrAppend(datePath: string, content: string): Promise<boolean>;
}

export class BackfillService {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly backfillStateRepo: IBackfillStateRepository,
    private readonly summaryGenerator: ISummaryGenerator,
    private readonly dailyLogWriter: IDailyLogWriter,
  ) {}

  async dryRun(options: Pick<BackfillOptions, "project"> = {}): Promise<DryRunResult> {
    const unprocessed = await this.getUnprocessedSessions(options.project);
    return {
      unprocessedCount: unprocessed.length,
      estimatedCost: unprocessed.length * COST_PER_SESSION,
    };
  }

  async backfill(options: BackfillOptions = {}): Promise<BackfillResult> {
    const { batch = 50, project, onProgress } = options;

    const allUnprocessed = await this.getUnprocessedSessions(project);
    const sessions = allUnprocessed.slice(0, batch);

    const result: BackfillResult = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
      sessionsSkipped: 0,
      dailyLogsCreated: 0,
      dailyLogsUpdated: 0,
      errors: [],
    };

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];

      // Double-check idempotency (another process might have processed it)
      const existing = await this.backfillStateRepo.findBySessionId(session.id);
      if (existing) {
        result.sessionsSkipped++;
        onProgress?.({
          current: i + 1,
          total: sessions.length,
          sessionId: session.id,
          action: "skipped",
        });
        continue;
      }

      try {
        onProgress?.({
          current: i + 1,
          total: sessions.length,
          sessionId: session.id,
          action: "processing",
        });

        // Extract content from messages
        const content = await this.extractContent(session.id);

        // Derive project display name from decoded path (last segment)
        const decodedPath = session.projectPath.decoded;
        const projectName = decodedPath.split(/[/\\]/).filter(Boolean).pop() ?? decodedPath;

        // Generate summary via LLM
        const summary = await this.summaryGenerator.generateSummary(
          content,
          session.id,
          projectName,
          session.startTime.toISOString(),
          session.endTime?.toISOString() ?? session.startTime.toISOString(),
        );

        // Determine daily log path from session date
        const dateStr = session.startTime.toISOString().slice(0, 10);
        const datePath = `daily/${dateStr}.md`;

        // Write to daily log file
        const created = await this.dailyLogWriter.writeOrAppend(
          datePath,
          summary + "\n\n",
        );

        if (created) {
          result.dailyLogsCreated++;
        } else {
          result.dailyLogsUpdated++;
        }

        // Track state
        await this.backfillStateRepo.save(
          BackfillState.create({
            sessionId: session.id,
            backfilledAt: new Date(),
            dailyLogPath: datePath,
            success: true,
          }),
        );

        result.sessionsProcessed++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.sessionsFailed++;
        result.errors.push({ sessionId: session.id, error: errorMessage });

        // Track failure state
        const dateStr = session.startTime.toISOString().slice(0, 10);
        await this.backfillStateRepo.save(
          BackfillState.create({
            sessionId: session.id,
            backfilledAt: new Date(),
            dailyLogPath: `daily/${dateStr}.md`,
            success: false,
            errorMessage,
          }),
        );

        onProgress?.({
          current: i + 1,
          total: sessions.length,
          sessionId: session.id,
          action: "error",
        });
      }
    }

    return result;
  }

  private async getUnprocessedSessions(project?: string) {
    // Get all sessions using findFiltered (the correct ISessionRepository method)
    const allSessions = await this.sessionRepo.findFiltered({
      projectFilter: project,
      limit: 10000, // Practical upper bound
    });

    const unprocessed = [];
    for (const session of allSessions) {
      const state = await this.backfillStateRepo.findBySessionId(session.id);
      if (!state) {
        unprocessed.push(session);
      }
    }

    // Sort chronologically (oldest first)
    unprocessed.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    return unprocessed;
  }

  private async extractContent(sessionId: string): Promise<string> {
    const messages = await this.messageRepo.findBySession(sessionId);

    // Filter to user and assistant messages only.
    // Note: The Message entity only allows "user" and "assistant" roles
    // (validated in Message.create()), so this filter is technically a no-op
    // for data from findBySession(). Kept for defensive clarity.
    const filtered = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    );

    // Build content string
    let content = "";
    for (const msg of filtered) {
      const prefix = msg.role === "user" ? "User" : "Assistant";
      const text = `${prefix}: ${msg.content}\n\n`;

      if (content.length + text.length > MAX_CONTENT_CHARS) {
        content += "... [content truncated]\n";
        break;
      }
      content += text;
    }

    return content;
  }
}
