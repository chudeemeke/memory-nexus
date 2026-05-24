/**
 * Facts CLI Command Handler
 *
 * Displays active project facts or full historical lineages including superseded updates.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { shouldUseColor, green, yellow, dim } from "../formatters/color.js";

export interface FactsCommandOptions {
  project: string;
  superseded?: boolean;
  json?: boolean;
}

export interface FactsCommandDeps {
  dbPath?: string;
}

export function createFactsCommand(): Command {
  return new Command("facts")
    .description("View active facts for a project")
    .argument("<project>", "Project name or path to view facts for")
    .option("--superseded", "Show superseded facts alongside active ones in a timeline")
    .option("--json", "Output results as JSON")
    .action(async (projectArg: string, options: Omit<FactsCommandOptions, "project">) => {
      const result = await executeFactsCommand({
        project: projectArg,
        ...options
      });
      process.exitCode = result.exitCode;
    });
}

export async function executeFactsCommand(
  options: FactsCommandOptions,
  deps: FactsCommandDeps = {}
): Promise<CommandResult> {
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  let db;

  try {
    const initRes = initializeDatabase({ path: dbPath });
    db = initRes.db;
  } catch (err: any) {
    if (options.json) {
      console.log(JSON.stringify({
        status: "error",
        error: {
          code: "DB_CONNECTION_FAILED",
          message: err.message
        }
      }, null, 2));
    } else {
      console.error(`Error: Database connection failed: ${err.message}`);
    }
    return { exitCode: 1 };
  }

  try {
    const factRepo = new SqliteFactRepository(db);
    const allFacts = await factRepo.findByProject(options.project);

    // 1. JSON output mode
    if (options.json) {
      let filtered = allFacts;
      if (!options.superseded) {
        filtered = allFacts.filter((f) => f.supersededAt === null);
      }

      console.log(JSON.stringify({
        status: "success",
        data: filtered.map((f) => ({
          uuid: f.uuid,
          type: f.type,
          project: f.project,
          content: f.content,
          metadata: f.metadata,
          observed_at: f.observedAt.toISOString(),
          superseded_at: f.supersededAt ? f.supersededAt.toISOString() : null,
          superseded_by: f.supersededBy
        }))
      }, null, 2));

      return { exitCode: 0 };
    }

    // 2. Text output mode
    const useColor = shouldUseColor();
    if (!options.superseded) {
      // Filter out superseded facts
      const active = allFacts.filter((f) => f.supersededAt === null);

      console.log(`\nActive Facts for Project: ${options.project}`);
      console.log("=".repeat(30 + options.project.length));

      if (active.length === 0) {
        console.log(dim("No active facts found for this project.", useColor));
        return { exitCode: 0 };
      }

      const categories = ["decision", "learning", "preference", "friction", "observation"];
      for (const cat of categories) {
        const catFacts = active.filter((f) => f.type === cat);
        if (catFacts.length === 0) continue;

        console.log(`\n${cat.toUpperCase()}`);
        for (const f of catFacts) {
          console.log(`  - ${f.content}`);
        }
      }
    } else {
      // Display complete historical lineage timeline
      console.log(`\nFacts History Timeline for Project: ${options.project}`);
      console.log("=".repeat(35 + options.project.length));

      if (allFacts.length === 0) {
        console.log(dim("No facts history found for this project.", useColor));
        return { exitCode: 0 };
      }

      // Timeline sorted chronologically (observedAt ASC)
      const timeline = [...allFacts].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

      for (const f of timeline) {
        const dateStr = f.observedAt.toISOString().split("T")[0];
        const typeLabel = `[${f.type.toUpperCase()}]`;

        if (f.supersededAt) {
          console.log(`[${dateStr}] ${yellow(typeLabel, useColor)} (SUPERSEDED) ${f.content}`);
          console.log(`      ↳ replaced by ${f.supersededBy} on ${f.supersededAt.toISOString().split("T")[0]}`);
        } else {
          console.log(`[${dateStr}] ${green(typeLabel, useColor)} ${f.content}`);
        }
      }
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
      console.error(`Error: Facts query execution failed: ${err.message}`);
    }
    return { exitCode: 2 };
  } finally {
    closeDatabase(db);
  }
}
