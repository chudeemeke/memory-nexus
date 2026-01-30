#!/usr/bin/env bun
/**
 * Memory-Nexus CLI Entry Point
 *
 * Cross-project context persistence for Claude Code sessions.
 * Provides commands for syncing, searching, and retrieving session context.
 */

import { Command } from "commander";
import { createSyncCommand, createSearchCommand, createListCommand, createStatsCommand, createContextCommand } from "./commands/index.js";

const program = new Command();

program
  .name("memory")
  .description("Cross-project context persistence for Claude Code sessions")
  .version("0.1.0");

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

program
  .command("show <sessionId>")
  .description("Show details for a specific session")
  .action((sessionId) => {
    console.log(`Showing session: ${sessionId}`);
    // TODO: Implement show logic
    console.log("(not yet implemented)");
  });

program
  .command("related <sessionId>")
  .description("Find sessions related to a specific session")
  .option("-n, --count <count>", "Number of related sessions", "5")
  .action((sessionId, options) => {
    console.log(`Finding sessions related to: ${sessionId}`);
    console.log(`  Count: ${options.count}`);
    // TODO: Implement related sessions logic
    console.log("(not yet implemented)");
  });

export { program };

// Run if executed directly
if (import.meta.main) {
  program.parse();
}
