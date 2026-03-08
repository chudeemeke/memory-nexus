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

// Add sync command from module
program.addCommand(createSyncCommand());

// Add search command from module
program.addCommand(createSearchCommand());

// Add list command from module
program.addCommand(createListCommand());

// Add stats command from module
program.addCommand(createStatsCommand());

// Add context command from module
program.addCommand(createContextCommand());

// Add show command from module
program.addCommand(createShowCommand());

// Add browse command from module
program.addCommand(createBrowseCommand());

// Add related command from module
program.addCommand(createRelatedCommand());

// Hook management commands
program.addCommand(createInstallCommand());
program.addCommand(createUninstallCommand());
program.addCommand(createStatusCommand());

// Diagnostic commands
program.addCommand(createDoctorCommand());

// Maintenance commands
program.addCommand(createPurgeCommand());

// Backup commands
program.addCommand(createExportCommand());
program.addCommand(createImportCommand());

// Shell completion
program.addCommand(createCompletionCommand());

// Friction logging
program.addCommand(createFrictionCommand());

// Backfill (daily log generation from historical sessions)
program.addCommand(createBackfillCommand());

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
