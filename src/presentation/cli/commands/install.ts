/**
 * Install Command Handler
 *
 * CLI command for installing Claude Code hooks.
 * Copies hook script and modifies settings.json.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
    installHooks,
    checkHooksInstalled,
    getHookScriptPath,
    loadClaudeSettings,
} from "../../../infrastructure/hooks/index.js";

/**
 * Options for the install command.
 */
export interface InstallOptions {
    /** Reinstall even if hooks are already installed */
    force?: boolean;
}

/**
 * Path override for testing.
 * When set, findHookScriptSource will only check this path.
 */
let testHookScriptSourceOverride: string | null = null;

/**
 * Set hook script source path override for testing.
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestHookScriptSourceOverride(path: string | null): void {
    testHookScriptSourceOverride = path;
}

/**
 * Create the install command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createInstallCommand(): Command {
    return new Command("install")
        .description("Install Claude Code hooks for automatic session sync")
        .option("-f, --force", "Reinstall even if already installed")
        .action(async (options: InstallOptions) => {
            const result = await executeInstallCommand(options);
            process.exitCode = result.exitCode;
        });
}

/**
 * Execute the install command programmatically.
 *
 * Installs Claude Code hooks for automatic session sync on session end.
 * Copies the hook script and modifies settings.json. Idempotent: returns
 * exitCode 0 if hooks are already installed. Handles its own setup.
 *
 * @param options - Install command options
 * @returns CommandResult with exitCode 0 (success/already installed) or 1 (error)
 */
export async function executeInstallCommand(options: InstallOptions): Promise<CommandResult> {
    const status = checkHooksInstalled();

    // Check if already installed
    if (status.sessionEnd && status.preCompact && !options.force) {
        console.log("Hooks are already installed.");
        console.log("Use --force to reinstall.");
        return { exitCode: 0 };
    }

    // Copy hook script to hooks directory
    const hookScriptDest = getHookScriptPath();
    mkdirSync(dirname(hookScriptDest), { recursive: true });

    // Find built hook script (from package or relative path)
    const hookScriptSrc = findHookScriptSource();
    if (!hookScriptSrc) {
        console.error("Error: Hook script not found. Run 'bun run build:hook' first.");
        return { exitCode: 1 };
    }

    copyFileSync(hookScriptSrc, hookScriptDest);
    console.log(`Copied hook script to ${hookScriptDest}`);

    // Install hooks into settings.json
    const result = installHooks();
    console.log(result.message);

    if (result.success) {
        console.log("\nHook installation complete!");
        console.log("Sessions will now sync automatically when they end.");
        console.log("\nTo check status: memory status");
        console.log("To uninstall: memory uninstall");

        // Check for stale memory-nexus hook references
        warnStaleHookReferences();
    } else {
        return { exitCode: 1 };
    }

    return { exitCode: 0 };
}

/**
 * Scan settings.json for stale memory-nexus hook references.
 *
 * After hook installation, checks if any hook commands still reference
 * the old "memory-nexus" binary name. Prints a warning to stderr if found.
 */
export function warnStaleHookReferences(): void {
    const settings = loadClaudeSettings();
    if (!settings.hooks) {
        return;
    }

    const LEGACY_MARKER = "memory-nexus";
    let hasStale = false;

    for (const hookConfigs of Object.values(settings.hooks)) {
        if (!Array.isArray(hookConfigs)) continue;
        for (const config of hookConfigs) {
            if (!config?.hooks) continue;
            for (const entry of config.hooks) {
                if (entry.command?.includes(LEGACY_MARKER)) {
                    hasStale = true;
                    break;
                }
            }
            if (hasStale) break;
        }
        if (hasStale) break;
    }

    if (hasStale) {
        console.error(
            "\nWarning: Stale memory-nexus hook references detected in settings.json."
        );
        console.error(
            "Run 'memory uninstall' then 'memory install' to clean up."
        );
    }
}

/**
 * Find the hook script source file.
 *
 * Checks common locations for the built hook script.
 * Uses test override if set.
 *
 * @returns Path to hook script or null if not found
 */
export function findHookScriptSource(): string | null {
    // Use test override if set
    if (testHookScriptSourceOverride !== null) {
        return existsSync(testHookScriptSourceOverride)
            ? testHookScriptSourceOverride
            : null;
    }

    // When running from source, look relative to this file
    // import.meta.dir points to src/presentation/cli/commands/
    const fromSource = join(import.meta.dir, "../../../../dist/sync-hook.js");

    // When running from installed package
    const fromCwd = join(process.cwd(), "dist/sync-hook.js");

    // Additional fallback for development
    const fromRoot = join(process.cwd(), "dist", "sync-hook.js");

    const candidates = [fromSource, fromCwd, fromRoot];

    return candidates.find((p) => existsSync(p)) ?? null;
}
