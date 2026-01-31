/**
 * Uninstall Command Handler
 *
 * CLI command for removing Claude Code hooks.
 * Removes hook entries from settings.json and deletes hook script.
 */

import { Command } from "commander";
import { existsSync, unlinkSync } from "node:fs";
import {
    uninstallHooks,
    checkHooksInstalled,
    getHookScriptPath,
    restoreFromBackup,
} from "../../../infrastructure/hooks/index.js";

/**
 * Options parsed from CLI arguments.
 */
interface UninstallOptions {
    restore?: boolean;
}

/**
 * Create the uninstall command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createUninstallCommand(): Command {
    return new Command("uninstall")
        .description("Remove Claude Code hooks for automatic session sync")
        .option("-r, --restore", "Restore settings.json from backup")
        .action(async (options: UninstallOptions) => {
            await executeUninstallCommand(options);
        });
}

/**
 * Execute the uninstall command with given options.
 *
 * Removes hooks from settings.json and deletes hook script.
 *
 * @param options Command options from CLI
 */
export async function executeUninstallCommand(options: UninstallOptions): Promise<void> {
    const status = checkHooksInstalled();

    if (!status.sessionEnd && !status.preCompact) {
        console.log("Hooks are not installed.");
        return;
    }

    if (options.restore && status.backupExists) {
        const restored = restoreFromBackup();
        if (restored) {
            console.log("Restored settings.json from backup.");
        }
    } else {
        const result = uninstallHooks();
        console.log(result.message);
    }

    // Remove hook script
    const hookScriptPath = getHookScriptPath();
    if (existsSync(hookScriptPath)) {
        unlinkSync(hookScriptPath);
        console.log("Removed hook script.");
    }

    console.log("\nHooks uninstalled successfully.");
    console.log("Sessions will no longer sync automatically.");
    console.log("Manual sync still available: memory-nexus sync");
}
