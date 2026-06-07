/**
 * Profile CLI command.
 *
 * Exposes persona/procedural memory as a governed, explainable user surface.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { PersonaProfileService } from "../../../application/services/persona-profile-service.js";
import { MemoryGovernanceService } from "../../../application/services/memory-governance-service.js";
import {
  PERSONA_ENTRY_KINDS,
  type PersonaEntry,
  type PersonaEntryKind,
} from "../../../domain/entities/persona-entry.js";
import {
  closeDatabase,
  getDefaultDbPath,
  initializeDatabase,
} from "../../../infrastructure/database/index.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { SqliteFrictionRepository } from "../../../infrastructure/database/repositories/friction-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { SqlitePersonaRepository } from "../../../infrastructure/database/repositories/persona-repository.js";

export type ProfileAction = "show" | "export" | "rebuild";

export interface ProfileCommandOptions {
  action: ProfileAction;
  project?: string | undefined;
  kind?: PersonaEntryKind | undefined;
  limit?: number | undefined;
  all?: boolean | undefined;
  json?: boolean | undefined;
}

export interface ProfileCommandDeps {
  dbPath?: string | undefined;
  now?: (() => Date) | undefined;
}

const KIND_CHOICES = [...PERSONA_ENTRY_KINDS];

export function createProfileCommand(): Command {
  const command = new Command("profile")
    .description("Inspect and rebuild governed persona/procedural memory");

  command.command("show")
    .description("Show persona/procedural memory for a project")
    .argument("[project]", "Project name to show; omitted shows global persona only")
    .addOption(new Option("--kind <kind>", "Persona entry kind").choices(KIND_CHOICES))
    .addOption(new Option("--limit <n>", "Maximum entries").argParser(parsePositiveInt))
    .option("--all", "Show every project scope instead of global-only when no project is supplied")
    .option("--json", "Output as JSON")
    .action(async (project: string | undefined, options: Omit<ProfileCommandOptions, "action" | "project">) => {
      process.exitCode = (await executeProfileCommand({ action: "show", project, ...options })).exitCode;
    });

  command.command("export")
    .description("Export governed persona/procedural memory as stable JSON")
    .argument("[project]", "Project name to export; omitted exports global persona only")
    .addOption(new Option("--kind <kind>", "Persona entry kind").choices(KIND_CHOICES))
    .addOption(new Option("--limit <n>", "Maximum entries").argParser(parsePositiveInt))
    .option("--all", "Export every project scope instead of global-only when no project is supplied")
    .option("--json", "Output as JSON")
    .action(async (project: string | undefined, options: Omit<ProfileCommandOptions, "action" | "project">) => {
      process.exitCode = (await executeProfileCommand({ action: "export", project, ...options })).exitCode;
    });

  command.command("rebuild")
    .description("Rebuild persona/procedural memory from governed source facts and friction")
    .argument("[project]", "Project name to rebuild")
    .option("--all", "Rebuild all profile entries")
    .option("--json", "Output as JSON")
    .action(async (project: string | undefined, options: Omit<ProfileCommandOptions, "action" | "project">) => {
      process.exitCode = (await executeProfileCommand({ action: "rebuild", project, ...options })).exitCode;
    });

  return command;
}

export async function executeProfileCommand(
  options: ProfileCommandOptions,
  deps: ProfileCommandDeps = {},
): Promise<CommandResult> {
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  let db;

  try {
    ({ db } = initializeDatabase({ path: dbPath }));
  } catch (error) {
    return emitProfileError(options, "DB_CONNECTION_FAILED", errorMessage(error), 1);
  }

  try {
    const factRepo = new SqliteFactRepository(db);
    const frictionRepo = new SqliteFrictionRepository(db);
    const personaRepo = new SqlitePersonaRepository(db);
    const governanceRepo = new SqliteMemoryGovernanceRepository(db);
    const governancePolicy = new MemoryGovernanceService({
      repository: governanceRepo,
      ...(deps.now ? { now: deps.now } : {}),
    });

    if (options.action === "rebuild") {
      if (!options.project && !options.all) {
        return emitProfileError(options, "INVALID_ARGUMENT", "Provide a project or --all for profile rebuild.", 1);
      }
      const service = new PersonaProfileService({
        factRepo,
        frictionRepo,
        personaRepo,
        governanceRepo,
        ...(deps.now ? { now: deps.now } : {}),
      });
      const result = await service.rebuildProfile(options.project ? { project: options.project } : {});
      return emitProfileSuccess(options, {
        project: options.project ?? null,
        all: options.all === true,
        entry_count: result.entries.length,
        fact_count: result.factCount,
        friction_pattern_count: result.frictionPatternCount,
        entries: result.entries.map((entry) => entry.toJSON()),
      });
    }

    const entries = await findReadableEntries(personaRepo, options);
    const allowed = await governancePolicy.filterAllowed("persona", entries, (entry) => entry.entryId);
    const filtered = options.kind ? allowed.filter((entry) => entry.kind === options.kind) : allowed;
    const limited = filtered.slice(0, options.limit ?? filtered.length);

    if (options.action === "export") {
      return emitProfileSuccess(options, {
        schema_version: 1,
        generated_at: (deps.now?.() ?? new Date()).toISOString(),
        project: options.project ?? null,
        all: options.all === true,
        entries: limited.map((entry) => entry.toJSON()),
      });
    }

    return emitProfileSuccess(options, limited);
  } catch (error) {
    return emitProfileError(options, "UNEXPECTED_ERROR", errorMessage(error), 2);
  } finally {
    closeDatabase(db);
  }
}

async function findReadableEntries(
  personaRepo: SqlitePersonaRepository,
  options: ProfileCommandOptions,
): Promise<PersonaEntry[]> {
  const limit = options.limit ?? 100;
  if (options.project) {
    return personaRepo.findForContext(options.project, { limit });
  }
  if (options.all) {
    return personaRepo.findAll({ kind: options.kind, limit });
  }
  return personaRepo.findAll({ kind: options.kind, visibility: "global", limit });
}

function emitProfileSuccess(options: ProfileCommandOptions, data: unknown): CommandResult {
  if (options.json || options.action === "export") {
    console.log(JSON.stringify({ status: "success", data }, null, 2));
    return { exitCode: 0 };
  }

  if (options.action === "rebuild") {
    const summary = data as {
      project: string | null;
      all: boolean;
      entry_count: number;
      fact_count: number;
      friction_pattern_count: number;
    };
    console.log(`Profile rebuilt for ${summary.project ?? "all projects"}.`);
    console.log(`Entries: ${summary.entry_count} | Facts scanned: ${summary.fact_count} | Friction patterns scanned: ${summary.friction_pattern_count}`);
    return { exitCode: 0 };
  }

  const entries = data as PersonaEntry[];
  const title = options.project
    ? `Persona Profile for Project: ${options.project}`
    : options.all
      ? "Persona Profile for All Projects"
      : "Global Persona Profile";
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));

  if (entries.length === 0) {
    console.log("No governed persona entries found.");
    return { exitCode: 0 };
  }

  for (const entry of entries) {
    console.log(formatPersonaEntry(entry));
  }
  return { exitCode: 0 };
}

function emitProfileError(
  options: ProfileCommandOptions,
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

function formatPersonaEntry(entry: PersonaEntry): string {
  const scope = entry.project ? `project:${entry.project}` : entry.visibility;
  const review = `${entry.reviewStatus} after ${entry.reviewAfter.toISOString()}`;
  return [
    `\n[${entry.kind}] ${entry.content}`,
    `  scope: ${scope}`,
    `  confidence: ${entry.confidence.toFixed(2)}`,
    `  why: ${entry.why}`,
    `  review: ${review}`,
    `  controls: ${entry.controls.join(", ")}`,
    `  sources: ${entry.sourceEventIds.join(", ")}`,
  ].join("\n");
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
