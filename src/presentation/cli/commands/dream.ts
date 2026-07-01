/**
 * Dreaming consolidation CLI command.
 *
 * Manual, audited dream proposal workflow. Background dreaming remains
 * intentionally absent until this explicit path is proven safe.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { DreamingService } from "../../../application/services/dreaming-service.js";
import { MemoryGovernanceService } from "../../../application/services/memory-governance-service.js";
import type { FactType } from "../../../domain/entities/fact.js";
import type { DreamEntry, DreamEntryKind, DreamEntryStatus } from "../../../domain/entities/dream-entry.js";
import {
  closeDatabase,
  getDefaultDbPath,
  initializeDatabase,
} from "../../../infrastructure/database/index.js";
import { appendMemoryEvent } from "../../../infrastructure/database/event-log.js";
import { SqliteDreamRepository } from "../../../infrastructure/database/repositories/dream-repository.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { PatternRedactor } from "../../../infrastructure/security/pattern-redactor.js";

export type DreamAction =
  | "propose-supersedence"
  | "list"
  | "show"
  | "approve"
  | "reject"
  | "apply"
  | "rollback";

export interface DreamCommandOptions {
  action: DreamAction;
  dreamId?: string | undefined;
  project?: string | undefined;
  targetFactUuid?: string | undefined;
  sourceEventIds?: string[] | undefined;
  proposedContent?: string | undefined;
  proposedFactType?: FactType | undefined;
  reason?: string | undefined;
  confidence?: number | undefined;
  status?: DreamEntryStatus | undefined;
  kind?: DreamEntryKind | undefined;
  limit?: number | undefined;
  confirm?: boolean | undefined;
  json?: boolean | undefined;
}

export interface DreamCommandDeps {
  dbPath?: string | undefined;
  writeEvents?: boolean | undefined;
  now?: (() => Date) | undefined;
  nextSequence?: (() => number) | undefined;
}

const FACT_TYPE_CHOICES: FactType[] = ["decision", "learning", "preference", "friction", "observation", "supersedence"];
const DREAM_STATUS_CHOICES: DreamEntryStatus[] = ["pending_review", "approved", "rejected", "applied", "rolled_back"];
const DREAM_KIND_CHOICES: DreamEntryKind[] = ["supersedence_proposal"];

export function createDreamCommand(deps: DreamCommandDeps = {}): Command {
  const command = new Command("dream")
    .description("Create, review, apply, and rollback audited dream proposals");

  command.command("propose-supersedence")
    .description("Create a review-gated supersedence proposal")
    .requiredOption("--project <project>", "Project scope")
    .requiredOption("--target <factUuid>", "Target fact UUID to supersede")
    .requiredOption("--replacement <content>", "Replacement fact content")
    .requiredOption("--reason <reason>", "Why this proposal should exist")
    .option("--source-event <id...>", "Source event id(s)")
    .addOption(new Option("--type <type>", "Replacement fact type").choices(FACT_TYPE_CHOICES).default("decision"))
    .addOption(new Option("--confidence <n>", "Proposal confidence").argParser(parseConfidence))
    .option("--json", "Output as JSON")
    .action(async (options: {
      project: string;
      target: string;
      replacement: string;
      reason: string;
      sourceEvent?: string[];
      type?: FactType;
      confidence?: number;
      json?: boolean;
    }) => {
      process.exitCode = (await executeDreamCommand({
        action: "propose-supersedence",
        project: options.project,
        targetFactUuid: options.target,
        proposedContent: options.replacement,
        proposedFactType: options.type,
        reason: options.reason,
        sourceEventIds: options.sourceEvent,
        confidence: options.confidence,
        json: options.json,
      }, deps)).exitCode;
    });

  command.command("list")
    .description("List audited dream proposals")
    .option("--project <project>", "Project to filter by")
    .addOption(new Option("--status <status>", "Dream status").choices(DREAM_STATUS_CHOICES))
    .addOption(new Option("--kind <kind>", "Dream proposal kind").choices(DREAM_KIND_CHOICES))
    .addOption(new Option("--limit <n>", "Maximum entries").argParser(parsePositiveInt))
    .option("--json", "Output as JSON")
    .action(async (options: Omit<DreamCommandOptions, "action">) => {
      process.exitCode = (await executeDreamCommand({ action: "list", ...options }, deps)).exitCode;
    });

  command.command("show")
    .description("Show one dream proposal")
    .argument("<dreamId>", "Dream proposal id")
    .option("--json", "Output as JSON")
    .action(async (dreamId: string, options: Omit<DreamCommandOptions, "action" | "dreamId">) => {
      process.exitCode = (await executeDreamCommand({ action: "show", dreamId, ...options }, deps)).exitCode;
    });

  addReviewCommand(command, "approve", "Approve a pending dream proposal", deps);
  addReviewCommand(command, "reject", "Reject a pending dream proposal", deps);
  addConfirmCommand(command, "apply", "Append canonical promotion/supersedence events for an approved proposal", deps);
  addConfirmCommand(command, "rollback", "Append canonical rollback events for an applied proposal", deps);

  return command;
}

export async function executeDreamCommand(
  options: DreamCommandOptions,
  deps: DreamCommandDeps = {},
): Promise<CommandResult> {
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  let db;

  try {
    ({ db } = initializeDatabase({ path: dbPath }));
  } catch (error) {
    return emitDreamError(options, "DB_CONNECTION_FAILED", errorMessage(error), 1);
  }

  try {
    const dreamRepo = new SqliteDreamRepository(db);
    const factRepo = new SqliteFactRepository(db);
    const governanceRepo = new SqliteMemoryGovernanceRepository(db);
    const writeEvent = deps.writeEvents === false ? undefined : appendMemoryEvent;
    const service = new DreamingService({
      dreamRepo,
      factRepo,
      governanceService: new MemoryGovernanceService({
        repository: governanceRepo,
        writeEvent,
        ...(deps.now ? { now: deps.now } : {}),
        ...(deps.nextSequence ? { nextSequence: deps.nextSequence } : {}),
      }),
      writeEvent,
      redactor: new PatternRedactor(),
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.nextSequence ? { nextSequence: deps.nextSequence } : {}),
    });

    if (options.action === "propose-supersedence") {
      const entry = await service.proposeSupersedence({
        project: required(options.project, "project"),
        sourceEventIds: requiredArray(options.sourceEventIds, "sourceEventIds"),
        targetFactUuid: required(options.targetFactUuid, "targetFactUuid"),
        proposedContent: required(options.proposedContent, "proposedContent"),
        proposedFactType: options.proposedFactType,
        reason: required(options.reason, "reason"),
        confidence: options.confidence,
        actor: "memory",
      });
      return emitDreamSuccess(options, entry.toJSON());
    }

    if (options.action === "list") {
      const entries = await service.list({
        project: options.project,
        status: options.status,
        kind: options.kind,
        limit: options.limit,
      });
      return emitDreamSuccess(options, entries.map((entry) => entry.toJSON()));
    }

    const dreamId = required(options.dreamId, "dreamId");

    if (options.action === "show") {
      const entry = await service.show(dreamId);
      if (!entry) {
        return emitDreamError(options, "NOT_FOUND", `Dream proposal not found: ${dreamId}`, 1);
      }
      return emitDreamSuccess(options, entry.toJSON());
    }

    if (options.action === "approve") {
      return emitDreamSuccess(options, (await service.approveProposal(dreamId, { actor: "user" })).toJSON());
    }
    if (options.action === "reject") {
      return emitDreamSuccess(options, (await service.rejectProposal(dreamId, { actor: "user" })).toJSON());
    }
    if (options.action === "apply") {
      const result = await service.applyProposal(dreamId, { actor: "user", confirm: options.confirm });
      return emitDreamSuccess(options, {
        entry: result.entry.toJSON(),
        canonical_event_ids: result.canonicalEventIds,
      });
    }
    if (options.action === "rollback") {
      const result = await service.rollbackProposal(dreamId, { actor: "user", confirm: options.confirm });
      return emitDreamSuccess(options, {
        entry: result.entry.toJSON(),
        rollback_event_ids: result.rollbackEventIds,
      });
    }

    return emitDreamError(options, "INVALID_ACTION", `Unsupported dream action: ${options.action}`, 2);
  } catch (error) {
    return emitDreamError(options, "UNEXPECTED_ERROR", errorMessage(error), 2);
  } finally {
    closeDatabase(db);
  }
}

function addReviewCommand(command: Command, name: "approve" | "reject", description: string, deps: DreamCommandDeps): void {
  command.command(name)
    .description(description)
    .argument("<dreamId>", "Dream proposal id")
    .option("--json", "Output as JSON")
    .action(async (dreamId: string, options: Omit<DreamCommandOptions, "action" | "dreamId">) => {
      process.exitCode = (await executeDreamCommand({ action: name, dreamId, ...options }, deps)).exitCode;
    });
}

function addConfirmCommand(command: Command, name: "apply" | "rollback", description: string, deps: DreamCommandDeps): void {
  command.command(name)
    .description(description)
    .argument("<dreamId>", "Dream proposal id")
    .option("--confirm", "Confirm canonical event mutation")
    .option("--json", "Output as JSON")
    .action(async (dreamId: string, options: Omit<DreamCommandOptions, "action" | "dreamId">) => {
      process.exitCode = (await executeDreamCommand({ action: name, dreamId, ...options }, deps)).exitCode;
    });
}

function emitDreamSuccess(options: DreamCommandOptions, data: unknown): CommandResult {
  if (options.json) {
    console.log(JSON.stringify({ status: "success", data }, null, 2));
    return { exitCode: 0 };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("No dream proposals found.");
      return { exitCode: 0 };
    }
    for (const item of data as Array<ReturnType<DreamEntry["toJSON"]>>) {
      console.log(formatDreamLine(item));
    }
    return { exitCode: 0 };
  }

  if (isApplyResult(data)) {
    console.log(`Dream ${data.entry.dream_id} applied.`);
    console.log(`Canonical events: ${data.canonical_event_ids.join(", ")}`);
    return { exitCode: 0 };
  }
  if (isRollbackResult(data)) {
    console.log(`Dream ${data.entry.dream_id} rolled back.`);
    console.log(`Rollback events: ${data.rollback_event_ids.join(", ")}`);
    return { exitCode: 0 };
  }

  console.log(formatDreamDetail(data as ReturnType<DreamEntry["toJSON"]>));
  return { exitCode: 0 };
}

function emitDreamError(
  options: DreamCommandOptions,
  code: string,
  message: string,
  exitCode: number,
): CommandResult {
  if (options.json) {
    console.log(JSON.stringify({ status: "error", error: { code, message } }, null, 2));
  } else {
    console.error(`Error: ${message}`);
  }
  return { exitCode };
}

function formatDreamLine(entry: ReturnType<DreamEntry["toJSON"]>): string {
  return `${entry.dream_id} [${entry.status}] ${entry.project ?? entry.visibility} ${entry.target_fact_uuid} -> ${entry.proposed_fact.uuid}`;
}

function formatDreamDetail(entry: ReturnType<DreamEntry["toJSON"]>): string {
  return [
    `Dream: ${entry.dream_id}`,
    `Status: ${entry.status}`,
    `Project: ${entry.project ?? entry.visibility}`,
    `Target: ${entry.target_fact_uuid}`,
    `Replacement: ${entry.proposed_fact.uuid}`,
    `Reason: ${entry.reason}`,
    `Review required: ${entry.requires_review}`,
    `Rollback event: ${entry.rollback_event_kind}`,
    `Redaction: ${entry.audit.redaction_state}`,
    `Sources: ${entry.source_event_ids.join(", ")}`,
  ].join("\n");
}

function isApplyResult(value: unknown): value is { entry: ReturnType<DreamEntry["toJSON"]>; canonical_event_ids: string[] } {
  return isRecord(value) && isRecord(value.entry) && Array.isArray(value.canonical_event_ids);
}

function isRollbackResult(value: unknown): value is { entry: ReturnType<DreamEntry["toJSON"]>; rollback_event_ids: string[] } {
  return isRecord(value) && isRecord(value.entry) && Array.isArray(value.rollback_event_ids);
}

function required(value: string | undefined, field: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requiredArray(value: string[] | undefined, field: string): string[] {
  if (!value || value.length === 0) {
    throw new Error(`${field} must include at least one value`);
  }
  return value;
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Value must be a positive integer");
  }
  return parsed;
}

function parseConfidence(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Confidence must be between 0 and 1");
  }
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
