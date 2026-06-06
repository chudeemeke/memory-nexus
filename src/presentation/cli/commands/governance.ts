/**
 * Governance CLI command.
 *
 * Inspect and control derived memory provenance/consent state.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  closeDatabase,
  getDefaultDbPath,
  initializeDatabase,
} from "../../../infrastructure/database/index.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { appendMemoryEvent } from "../../../infrastructure/database/event-log.js";
import { MemoryGovernanceService } from "../../../application/services/memory-governance-service.js";
import {
  MEMORY_GOVERNANCE_SURFACES,
  assertMemoryGovernanceSurface,
  type MemoryGovernanceSurface,
} from "../../../domain/entities/memory-governance.js";

export type GovernanceAction =
  | "list"
  | "show"
  | "suppress"
  | "unsuppress"
  | "invalidate"
  | "expire"
  | "review"
  | "consent-grant"
  | "consent-revoke";

export interface GovernanceCommandOptions {
  action: GovernanceAction;
  surface?: MemoryGovernanceSurface | undefined;
  targetId?: string | undefined;
  project?: string | undefined;
  status?: string | undefined;
  reason?: string | undefined;
  at?: string | undefined;
  scope?: string[] | undefined;
  json?: boolean | undefined;
  limit?: number | undefined;
}

export interface GovernanceCommandDeps {
  dbPath?: string | undefined;
  writeEvents?: boolean | undefined;
}

const SURFACE_CHOICES = [...MEMORY_GOVERNANCE_SURFACES];

export function createGovernanceCommand(): Command {
  const cmd = new Command("governance")
    .description("Inspect and control derived memory consent/provenance state");

  cmd.command("list")
    .description("List governed derived memory")
    .addOption(new Option("--surface <surface>", "Surface to list").choices(SURFACE_CHOICES))
    .option("--project <project>", "Project to filter by")
    .option("--status <status>", "Governance status to filter by")
    .addOption(new Option("--limit <n>", "Maximum entries").argParser(parsePositiveInt))
    .option("--json", "Output as JSON")
    .action(async (options: Omit<GovernanceCommandOptions, "action">) => {
      process.exitCode = (await executeGovernanceCommand({ action: "list", ...options })).exitCode;
    });

  cmd.command("show")
    .description("Show governance state for a target")
    .argument("<targetId>", "Target memory id")
    .addOption(new Option("--surface <surface>", "Surface to inspect").choices(SURFACE_CHOICES).default("fact"))
    .option("--json", "Output as JSON")
    .action(async (targetId: string, options: Omit<GovernanceCommandOptions, "action" | "targetId">) => {
      process.exitCode = (await executeGovernanceCommand({ action: "show", targetId, ...options })).exitCode;
    });

  addControlCommand(cmd, "suppress", "Suppress a target from future memory use");
  addControlCommand(cmd, "unsuppress", "Reactivate a suppressed target");
  addControlCommand(cmd, "invalidate", "Invalidate a target as wrong or unsafe");
  addControlCommand(cmd, "review", "Mark a target as reviewed");

  cmd.command("expire")
    .description("Expire a target now or at a supplied ISO timestamp")
    .argument("<targetId>", "Target memory id")
    .addOption(new Option("--surface <surface>", "Surface to control").choices(SURFACE_CHOICES).default("fact"))
    .option("--reason <reason>", "Reason for the control event")
    .option("--at <iso>", "Expiry timestamp, defaults to now")
    .option("--json", "Output as JSON")
    .action(async (targetId: string, options: Omit<GovernanceCommandOptions, "action" | "targetId">) => {
      process.exitCode = (await executeGovernanceCommand({ action: "expire", targetId, ...options })).exitCode;
    });

  cmd.command("consent-grant")
    .description("Grant consent for a target and scope")
    .argument("<targetId>", "Target memory id")
    .addOption(new Option("--surface <surface>", "Surface to control").choices(SURFACE_CHOICES).default("fact"))
    .option("--scope <scope...>", "Consent scope(s)")
    .option("--reason <reason>", "Reason for the control event")
    .option("--json", "Output as JSON")
    .action(async (targetId: string, options: Omit<GovernanceCommandOptions, "action" | "targetId">) => {
      process.exitCode = (await executeGovernanceCommand({ action: "consent-grant", targetId, ...options })).exitCode;
    });

  cmd.command("consent-revoke")
    .description("Revoke consent for a target and scope")
    .argument("<targetId>", "Target memory id")
    .addOption(new Option("--surface <surface>", "Surface to control").choices(SURFACE_CHOICES).default("fact"))
    .option("--scope <scope...>", "Consent scope(s)")
    .option("--reason <reason>", "Reason for the control event")
    .option("--json", "Output as JSON")
    .action(async (targetId: string, options: Omit<GovernanceCommandOptions, "action" | "targetId">) => {
      process.exitCode = (await executeGovernanceCommand({ action: "consent-revoke", targetId, ...options })).exitCode;
    });

  return cmd;
}

export async function executeGovernanceCommand(
  options: GovernanceCommandOptions,
  deps: GovernanceCommandDeps = {},
): Promise<CommandResult> {
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  let db;

  try {
    ({ db } = initializeDatabase({ path: dbPath }));
  } catch (error) {
    return emitGovernanceError(options, "DB_CONNECTION_FAILED", errorMessage(error), 1);
  }

  try {
    const repo = new SqliteMemoryGovernanceRepository(db);
    const service = new MemoryGovernanceService({
      repository: repo,
      writeEvent: deps.writeEvents === false ? undefined : appendMemoryEvent,
    });

    if (options.action === "list") {
      const entries = await service.list({
        surface: options.surface,
        project: options.project,
        status: options.status as any,
        limit: options.limit,
      });
      return emitGovernanceSuccess(options, entries.map((entry) => entry.toJSON()));
    }

    const surface = normalizeSurface(options.surface);
    const targetId = requireTargetId(options.targetId);

    if (options.action === "show") {
      const entry = await service.show(surface, targetId);
      if (!entry) {
        return emitGovernanceError(options, "NOT_FOUND", `No governance entry found for ${surface}:${targetId}`, 1);
      }
      return emitGovernanceSuccess(options, entry.toJSON());
    }

    const command = {
      surface,
      targetId,
      actor: "user",
      reason: options.reason,
      expiresAt: options.at ? parseDate(options.at) : undefined,
      consentScopes: options.scope,
    };

    const updated = options.action === "suppress" ? await service.suppress(command) :
      options.action === "unsuppress" ? await service.unsuppress(command) :
      options.action === "invalidate" ? await service.invalidate(command) :
      options.action === "expire" ? await service.expire(command) :
      options.action === "review" ? await service.review(command) :
      options.action === "consent-grant" ? await service.grantConsent(command) :
      options.action === "consent-revoke" ? await service.revokeConsent(command) :
      null;

    if (!updated) {
      return emitGovernanceError(options, "INVALID_ACTION", `Unsupported governance action: ${options.action}`, 2);
    }
    return emitGovernanceSuccess(options, updated.toJSON());
  } catch (error) {
    return emitGovernanceError(options, "UNEXPECTED_ERROR", errorMessage(error), 2);
  } finally {
    closeDatabase(db);
  }
}

function addControlCommand(cmd: Command, name: GovernanceAction, description: string): void {
  cmd.command(name)
    .description(description)
    .argument("<targetId>", "Target memory id")
    .addOption(new Option("--surface <surface>", "Surface to control").choices(SURFACE_CHOICES).default("fact"))
    .option("--reason <reason>", "Reason for the control event")
    .option("--json", "Output as JSON")
    .action(async (targetId: string, options: Omit<GovernanceCommandOptions, "action" | "targetId">) => {
      process.exitCode = (await executeGovernanceCommand({ action: name, targetId, ...options })).exitCode;
    });
}

function emitGovernanceSuccess(options: GovernanceCommandOptions, data: unknown): CommandResult {
  if (options.json) {
    console.log(JSON.stringify({ status: "success", data }, null, 2));
  } else if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("No governed memory entries found.");
    } else {
      for (const item of data as Array<Record<string, unknown>>) {
        console.log(formatEntryLine(item));
      }
    }
  } else {
    console.log(formatEntryDetail(data as Record<string, unknown>));
  }
  return { exitCode: 0 };
}

function emitGovernanceError(
  options: GovernanceCommandOptions,
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

function formatEntryLine(entry: Record<string, unknown>): string {
  const marker = entry.blocked ? "blocked" : "active";
  return `${entry.surface}:${entry.target_id} [${entry.status}/${marker}] ${entry.project ?? "global"} via ${entry.transformation_method}`;
}

function formatEntryDetail(entry: Record<string, unknown>): string {
  return [
    `${entry.surface}:${entry.target_id}`,
    `Status: ${entry.status}${entry.blocked ? " (blocked)" : ""}`,
    `Project: ${entry.project ?? "global"}`,
    `Source events: ${(entry.source_event_ids as string[]).join(", ")}`,
    `Method: ${entry.transformation_method}`,
    `Actor: ${entry.actor}`,
    `Consent: ${entry.consent_status} ${(entry.consent_scopes as string[]).join(", ")}`,
    `Redaction: ${entry.redaction_state}`,
    entry.status_reason ? `Reason: ${entry.status_reason}` : undefined,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function normalizeSurface(surface: MemoryGovernanceSurface | undefined): MemoryGovernanceSurface {
  return assertMemoryGovernanceSurface(surface ?? "fact");
}

function requireTargetId(targetId: string | undefined): string {
  if (!targetId || !targetId.trim()) {
    throw new Error("targetId is required");
  }
  return targetId;
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Value must be a positive integer");
  }
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
