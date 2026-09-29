/**
 * Install Command Handler
 *
 * CLI command for installing Claude Code hooks.
 * Copies hook script and modifies settings.json.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveHookScriptSource } from "../../../infrastructure/hooks/hook-script-source.js";
import {
    installHooks,
    prepareHookInstallation,
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
 * Runtime dependencies for executeInstallCommand.
 *
 * Operational dependencies that tests substitute for isolation.
 * Defaults to resolution within the executing module's package when omitted.
 */
export interface InstallCommandDeps {
    /**
     * Override the hook script source path. When set, findHookScriptSource
     * checks only this path. Used by tests to point at a fixture file.
     */
    hookScriptSourceOverride?: string;
    /**
     * Override settings/backup/hook-script paths used by settings-manager.
     * When set, all settings-manager calls use these paths.
     */
    hookOverrides?: import("../../../infrastructure/hooks/settings-manager.js").PathOverrides;
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
export async function executeInstallCommand(
    options: InstallOptions,
    deps: InstallCommandDeps = {}
): Promise<CommandResult> {
    try {
        prepareHookInstallation(deps.hookOverrides);
    } catch {
        console.error("Error: Hook installation refused. Check settings format and ensure settings, backup and hook paths are distinct regular files or absent.");
        return { exitCode: 1 };
    }
    const status = checkHooksInstalled(deps.hookOverrides);

    // Check if already installed
    if (status.sessionEnd && status.preCompact && status.hookScriptExists && !options.force) {
        console.log("Hooks are already installed.");
        console.log("Use --force to reinstall.");
        return { exitCode: 0 };
    }

    // Resolve the package-owned asset before changing any destination.
    const hookScriptSrc = findHookScriptSource(deps.hookScriptSourceOverride);
    if (!hookScriptSrc) {
        console.error("Error: Packaged sync hook not found. Reinstall @chude/memory or rebuild the package.");
        return { exitCode: 1 };
    }

    const hookScriptDest = getHookScriptPath(deps.hookOverrides);
    mkdirSync(dirname(hookScriptDest), { recursive: true });
    copyFileSync(hookScriptSrc, hookScriptDest);
    console.log(`Copied hook script to ${hookScriptDest}`);

    // Install hooks into settings.json
    const result = installHooks(deps.hookOverrides);
    console.log(result.message);

    if (result.success) {
        console.log("\nHook installation complete!");
        console.log("Sessions will now sync automatically when they end.");
        console.log("\nTo check status: memory status");
        console.log("To uninstall: memory uninstall");

        // Check for stale memory-nexus hook references
        warnStaleHookReferences(deps.hookOverrides);
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
export function warnStaleHookReferences(
    overrides?: import("../../../infrastructure/hooks/settings-manager.js").PathOverrides,
): void {
    const settings = loadClaudeSettings(overrides);
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
 * Uses the executing module's package manifest. When `override` is provided,
 * checks only that explicit path (used by tests to point at a fixture).
 *
 * @param override Optional explicit path to use instead of candidate search
 * @returns Path to hook script or null if not found
 */
export function findHookScriptSource(override?: string): string | null {
    return resolveHookScriptSource(import.meta.dir, override);
}
