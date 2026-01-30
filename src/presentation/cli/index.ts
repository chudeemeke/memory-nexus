#!/usr/bin/env bun
/**
 * Memory-Nexus CLI Entry Point
 *
 * Cross-project context persistence for Claude Code sessions.
 * Provides commands for syncing, searching, and retrieving session context.
 */

import { Command } from "commander";
import { createSyncCommand, createSearchCommand, createListCommand } from "./commands/index.js";

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

program
  .command("context <project>")
  .description("Get context for a specific project")
  .option("-n, --recent <count>", "Number of recent sessions", "5")
  .action((project, options) => {
    console.log(`Getting context for: ${project}`);
    console.log(`  Recent sessions: ${options.recent}`);
    // TODO: Implement context retrieval
    console.log("(not yet implemented)");
  });

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
