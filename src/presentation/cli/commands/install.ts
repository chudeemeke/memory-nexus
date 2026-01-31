/**
 * Install Command Handler
 *
 * CLI command for installing Claude Code hooks.
 * Copies hook script and modifies settings.json.
 */

import { Command } from "commander";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
    installHooks,
    checkHooksInstalled,
    getHookScriptPath,
} from "../../../infrastructure/hooks/index.js";

/**
 * Options parsed from CLI arguments.
 */
interface InstallOptions {
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
            await executeInstallCommand(options);
        });
}

/**
 * Execute the install command with given options.
 *
 * Copies hook script and installs hooks into settings.json.
 *
 * @param options Command options from CLI
 */
export async function executeInstallCommand(options: InstallOptions): Promise<void> {
    const status = checkHooksInstalled();

    // Check if already installed
    if (status.sessionEnd && status.preCompact && !options.force) {
        console.log("Hooks are already installed.");
        console.log("Use --force to reinstall.");
        return;
    }

    // Copy hook script to ~/.memory-nexus/hooks/
    const hookScriptDest = getHookScriptPath();
    mkdirSync(dirname(hookScriptDest), { recursive: true });

    // Find built hook script (from package or relative path)
    const hookScriptSrc = findHookScriptSource();
    if (!hookScriptSrc) {
        console.error("Error: Hook script not found. Run 'bun run build:hook' first.");
        process.exitCode = 1;
        return;
    }

    copyFileSync(hookScriptSrc, hookScriptDest);
    console.log(`Copied hook script to ${hookScriptDest}`);

    // Install hooks into settings.json
    const result = installHooks();
    console.log(result.message);

    if (result.success) {
        console.log("\nHook installation complete!");
        console.log("Sessions will now sync automatically when they end.");
        console.log("\nTo check status: memory-nexus status");
        console.log("To uninstall: memory-nexus uninstall");
    } else {
        process.exitCode = 1;
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
