/**
 * Projection operations command.
 *
 * Verification is safe and non-mutating. Rebuild is explicit and requires
 * --confirm because it resets and replays derived projection tables.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { closeDatabase, initializeDatabase, getDefaultDbPath } from "../../../infrastructure/database/index.js";
import {
  readMemoryEventsWithReport,
  rebuildProjectionsWithReport,
} from "../../../infrastructure/database/event-log.js";
import { getEventsDir } from "../../../infrastructure/paths.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

const PROJECTIONS_SCHEMA_VERSION = 1;
const PROJECTIONS_EXIT_OK = 0;
const PROJECTIONS_EXIT_ERROR = 1;
const PROJECTIONS_EXIT_NOT_READY = 2;

export interface ProjectionCommandOptions {
  dbPathOverride?: string;
  eventsDirOverride?: string;
}

export interface ProjectionCliOptions {
  verify?: boolean;
  confirm?: boolean;
  json?: boolean;
}

export function createProjectionsCommand(opts: ProjectionCommandOptions = {}): Command {
  const projections = new Command("projections")
    .description("Verify and rebuild derived memory projections");

  projections.command("rebuild")
    .description("Verify or rebuild projections from the canonical event log")
    .option("--verify", "Verify event-log readiness without mutating projections")
    .option("--confirm", "Confirm projection rebuild mutation")
    .option("--json", "Output stable JSON")
    .action(async (commandOptions: ProjectionCliOptions) => {
      const result = await executeProjectionsRebuildCommand(opts, commandOptions);
      process.exitCode = result.exitCode;
    });

  return projections;
}

export async function executeProjectionsRebuildCommand(
  opts: ProjectionCommandOptions = {},
  commandOptions: ProjectionCliOptions = {},
): Promise<CommandResult> {
  try {
    const eventsDir = opts.eventsDirOverride ?? getEventsDir();
    if (commandOptions.verify === true) {
      const report = await readMemoryEventsWithReport(undefined, eventsDir);
      const data = {
        mode: "verify",
        events: report.events.length,
        invalidEvents: report.invalidEvents.length,
        ready: report.invalidEvents.length === 0,
      };
      if (commandOptions.json) {
        writeProjectionsJson("projections.rebuild", report.invalidEvents.length === 0 ? "ok" : "error", report.invalidEvents.length === 0 ? PROJECTIONS_EXIT_OK : PROJECTIONS_EXIT_ERROR, data, report.invalidEvents.map((event) => event.reason));
      } else if (report.invalidEvents.length === 0) {
        console.log("Projection rebuild verification passed.");
        console.log(`Events: ${report.events.length}`);
      } else {
        console.error(`Projection rebuild verification failed: ${report.invalidEvents.length} invalid event log line(s)`);
      }
      return { exitCode: report.invalidEvents.length === 0 ? PROJECTIONS_EXIT_OK : PROJECTIONS_EXIT_ERROR };
    }

    if (commandOptions.confirm !== true) {
      const message = "projections rebuild requires --verify for a safe check or --confirm before mutating projections";
      if (commandOptions.json) {
        writeProjectionsJson("projections.rebuild", "not_ready", PROJECTIONS_EXIT_NOT_READY, {}, [message]);
      } else {
        console.error(`Error: ${message}`);
      }
      return { exitCode: PROJECTIONS_EXIT_NOT_READY };
    }

    const dbPath = opts.dbPathOverride ?? getDefaultDbPath();
    const { db } = initializeDatabase({ path: dbPath });
    try {
      const report = await rebuildProjectionsWithReport(db, undefined, eventsDir);
      const data = {
        mode: "rebuild",
        processedEvents: report.replay.processedEvents,
        skippedDuplicateEvents: report.replay.skippedDuplicateEvents,
        invalidEvents: report.invalidEvents,
        appliedProjections: report.replay.appliedProjections,
      };
      if (commandOptions.json) {
        writeProjectionsJson("projections.rebuild", report.invalidEvents === 0 ? "ok" : "error", report.invalidEvents === 0 ? PROJECTIONS_EXIT_OK : PROJECTIONS_EXIT_ERROR, data, report.invalidEventLines.map((event) => event.reason));
      } else if (report.invalidEvents === 0) {
        console.log("Projection rebuild completed.");
        console.log(`Processed events: ${report.replay.processedEvents}`);
        console.log(`Applied projections: ${report.replay.appliedProjections.join(", ") || "none"}`);
      } else {
        console.error(`Projection rebuild completed with ${report.invalidEvents} invalid event log line(s).`);
      }
      return { exitCode: report.invalidEvents === 0 ? PROJECTIONS_EXIT_OK : PROJECTIONS_EXIT_ERROR };
    } finally {
      closeDatabase(db);
    }
  } catch (error) {
    const message = `Error rebuilding projections: ${unknownErrorMessage(error)}`;
    if (commandOptions.json) {
      writeProjectionsJson("projections.rebuild", "error", PROJECTIONS_EXIT_ERROR, {}, [message]);
    } else {
      console.error(message);
    }
    return { exitCode: PROJECTIONS_EXIT_ERROR };
  }
}

function writeProjectionsJson(
  command: string,
  status: "ok" | "not_ready" | "error",
  exitCode: number,
  data: Record<string, unknown>,
  errors: string[] = [],
): void {
  console.log(JSON.stringify({
    schemaVersion: PROJECTIONS_SCHEMA_VERSION,
    command,
    status,
    exitCode,
    data,
    errors,
  }, null, 2));
}
