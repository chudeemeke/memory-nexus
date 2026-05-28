/**
 * Remote Command Handler
 *
 * CLI command for managing multi-device private Git transport synchronization.
 * Supports set, remove, and status subcommands.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { loadConfig, saveConfig } from "../../../infrastructure/hooks/config-manager.js";
import { GitSyncer } from "../../../infrastructure/hooks/git-syncer.js";

/**
 * Options/parameters for remote subcommands.
 */
export interface RemoteCommandOptions {
    configPathOverride?: string;
    eventsDirOverride?: string;
}

/**
 * Create the remote command group for Commander.js.
 */
export function createRemoteCommand(opts: RemoteCommandOptions = {}): Command {
    const remoteCmd = new Command("remote")
        .description("Manage multi-device Git transport synchronization configuration");

    remoteCmd.command("set <repositoryUrl>")
        .description("Set remote Git repository URL and initialize events log transport repository")
        .action(async (repositoryUrl: string) => {
            const result = await executeRemoteSetCommand(repositoryUrl, opts);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("remove")
        .description("Remove remote Git synchronization URL and disable remote sync")
        .action(async () => {
            const result = await executeRemoteRemoveCommand(opts);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("status")
        .description("View remote Git synchronization status")
        .action(async () => {
            const result = await executeRemoteStatusCommand(opts);
            process.exitCode = result.exitCode;
        });

    return remoteCmd;
}

/**
 * Configure the remote sync repository.
 */
export async function executeRemoteSetCommand(
    repositoryUrl: string,
    opts: RemoteCommandOptions = {},
): Promise<CommandResult> {
    try {
        const config = loadConfig(opts.configPathOverride);
        
        // Save remote configurations
        saveConfig({
            remoteSync: {
                enabled: true,
                repositoryUrl,
                autoPush: config.remoteSync?.autoPush ?? true,
                autoPull: config.remoteSync?.autoPull ?? true,
            }
        }, opts.configPathOverride);

        const syncer = new GitSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        if (!isRepo) {
            console.log("Initializing local Git repository in events directory...");
            const initOk = await syncer.initRepo();
            if (!initOk) {
                console.error("Error: Failed to initialize Git repository locally.");
                return { exitCode: 1 };
            }
        }

        console.log(`Configuring remote origin repository URL: ${repositoryUrl}`);
        const remoteOk = await syncer.configureRemote(repositoryUrl);
        if (!remoteOk) {
            console.error("Error: Failed to configure Git remote repository origin.");
            return { exitCode: 1 };
        }

        console.log("\nSuccess: Remote synchronization configured successfully!");
        console.log("To synchronize your local facts with the remote repository, run: memory sync");

        return { exitCode: 0 };
    } catch (err: any) {
        console.error("Error setting remote:", err?.message || String(err));
        return { exitCode: 1 };
    }
}

/**
 * Remove remote sync configuration.
 */
export async function executeRemoteRemoveCommand(
    opts: RemoteCommandOptions = {},
): Promise<CommandResult> {
    try {
        const config = loadConfig(opts.configPathOverride);
        
        // Save config with remote sync disabled
        saveConfig({
            remoteSync: {
                enabled: false,
                autoPush: config.remoteSync?.autoPush ?? true,
                autoPull: config.remoteSync?.autoPull ?? true,
            }
        }, opts.configPathOverride);

        const syncer = new GitSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        if (isRepo) {
            console.log("Removing Git remote origin URL...");
            await syncer.removeRemote();
        }

        console.log("\nSuccess: Remote synchronization disabled and origin repository URL removed.");
        return { exitCode: 0 };
    } catch (err: any) {
        console.error("Error removing remote:", err?.message || String(err));
        return { exitCode: 1 };
    }
}

/**
 * Display current remote sync configurations and status.
 */
export async function executeRemoteStatusCommand(
    opts: RemoteCommandOptions = {},
): Promise<CommandResult> {
    try {
        const config = loadConfig(opts.configPathOverride);
        const remoteSync = config.remoteSync;

        console.log("Remote Sync Status");
        console.log("==================");
        console.log(`Machine ID:        ${config.machineId}`);
        console.log(`Enabled:           ${remoteSync?.enabled ? "yes" : "no"}`);
        console.log(`Repository URL:    ${remoteSync?.repositoryUrl ?? "none configured"}`);
        console.log(`Auto-Pull:         ${remoteSync?.autoPull ? "enabled" : "disabled"}`);
        console.log(`Auto-Push:         ${remoteSync?.autoPush ? "enabled" : "disabled"}`);

        const syncer = new GitSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        console.log(`Git Repository:    ${isRepo ? "initialized" : "not initialized"}`);
        
        if (isRepo) {
            const actualRemote = await syncer.getRemoteUrl();
            console.log(`Actual Git Remote: ${actualRemote ?? "none"}`);
        }

        return { exitCode: 0 };
    } catch (err: any) {
        console.error("Error gathering remote status:", err?.message || String(err));
        return { exitCode: 1 };
    }
}
