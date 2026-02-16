#!/usr/bin/env bun
/**
 * Memory-Nexus CLI Entry Point
 *
 * Cross-project context persistence for Claude Code sessions.
 * Provides commands for syncing, searching, and retrieving session context.
 */

import { Command } from "commander";
import pkg from "../../../package.json";
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

export { program };

// Run if executed directly
if (import.meta.main) {
  program.parse();
}
