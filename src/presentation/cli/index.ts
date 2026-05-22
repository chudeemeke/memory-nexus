#!/usr/bin/env bun
/**
 * Memory CLI Entry Point
 *
 * Cross-project context persistence for Claude Code sessions.
 * Provides commands for syncing, searching, and retrieving session context.
 */

import { Command } from "commander";
import pkg from "../../../package.json";
import { isMigrationPending, migrateFromLegacy } from "../../infrastructure/migration.js";
import {
  createSyncCommand,
  createSearchCommand,
  createListCommand,
  createStatsCommand,
  createContextCommand,
  createRelatedCommand,
  createShowCommand,
  createBrowseCommand,
  createQueryCommand,
  createInstallCommand,
  createUninstallCommand,
  createStatusCommand,
  createDoctorCommand,
  createPurgeCommand,
  createCompletionCommand,
  createExportCommand,
  createImportCommand,
  createFrictionCommand,
  createBackfillCommand,
} from "./commands/index.js";

const program = new Command();

program
  .name("memory")
  .description("Cross-project context persistence for Claude Code sessions")
  .version(pkg.version);

// CLI-01: labeled help groups via Commander.js v14 .commandsGroup().
// Do NOT enable program.configureHelp({ sortSubcommands: true }) — would
// defeat the deliberate group ordering below.

// Query Commands — read surfaces (CLI-02 envelope consumers in Plan 02).
program.commandsGroup("Query Commands:");
program.addCommand(createQueryCommand());
program.addCommand(createSearchCommand());
program.addCommand(createContextCommand());
program.addCommand(createShowCommand());
program.addCommand(createListCommand());
program.addCommand(createRelatedCommand());
program.addCommand(createStatsCommand());

// Data Commands — sync, backfill, backup, maintenance.
program.commandsGroup("Data Commands:");
program.addCommand(createSyncCommand());
program.addCommand(createBackfillCommand());
program.addCommand(createExportCommand());
program.addCommand(createImportCommand());
program.addCommand(createPurgeCommand());

// System Commands — hooks, diagnostics, completion. `browse` lives here
// per research §Open Q1 (interactive launcher, not a query surface).
program.commandsGroup("System Commands:");
program.addCommand(createInstallCommand());
program.addCommand(createUninstallCommand());
program.addCommand(createStatusCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createCompletionCommand());
program.addCommand(createBrowseCommand());

// Feedback Commands — friction logging.
program.commandsGroup("Feedback Commands:");
program.addCommand(createFrictionCommand());

export { program };

// Run if executed directly
if (import.meta.main) {
  // ORDERING CONTRACT: migration MUST complete before program.parse()
  // dispatches to any command action that calls initializeDatabase().
  // isMigrationPending() is a lightweight check that avoids running
  // the full migration logic on every invocation when no legacy data exists.
  if (isMigrationPending()) {
    migrateFromLegacy();
  }
  program.parse();
}
