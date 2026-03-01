/**
 * Uninstall Command Handler
 *
 * CLI command for removing Claude Code hooks.
 * Removes hook entries from settings.json and deletes hook script.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { existsSync, unlinkSync } from "node:fs";
import {
    uninstallHooks,
    checkHooksInstalled,
    getHookScriptPath,
    restoreFromBackup,
} from "../../../infrastructure/hooks/index.js";

/**
 * Options for the uninstall command.
 */
export interface UninstallOptions {
    /** Restore settings.json from backup instead of removing hooks */
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
            const result = await executeUninstallCommand(options);
            process.exitCode = result.exitCode;
        });
}

/**
 * Execute the uninstall command programmatically.
 *
 * Removes Claude Code hooks installed by the install command. Deletes
 * hook entries from settings.json and removes the hook script file.
 * Returns exitCode 0 if hooks are not installed (idempotent).
 *
 * @param options - Uninstall command options
 * @returns CommandResult with exitCode 0 (success/not installed)
 */
export async function executeUninstallCommand(options: UninstallOptions): Promise<CommandResult> {
    const status = checkHooksInstalled();

    if (!status.sessionEnd && !status.preCompact) {
        console.log("Hooks are not installed.");
        return { exitCode: 0 };
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
    console.log("Manual sync still available: memory sync");

    return { exitCode: 0 };
}
