/**
 * Remote Command Handler
 *
 * CLI command for managing multi-device private Git transport synchronization.
 * Supports set, remove, and status subcommands.
 */

import { Command } from "commander";
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CommandResult } from "../command-result.js";
import { loadConfig, saveConfig } from "../../../infrastructure/hooks/config-manager.js";
import { GitSyncer } from "../../../infrastructure/hooks/git-syncer.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";
import {
    validateMachineIdentity,
    validateRemoteRepositoryUrl,
} from "../../../application/services/remote-event-sync-service.js";
import { SecretAuditService } from "../../../infrastructure/security/secret-audit-service.js";
import { PatternRedactor } from "../../../infrastructure/security/pattern-redactor.js";
import { getAllLogFiles, getBackupDir, getConfigPath, getEventsDir } from "../../../infrastructure/paths.js";

const REMOTE_SCHEMA_VERSION = 1;
const REMOTE_EXIT_OK = 0;
const REMOTE_EXIT_ERROR = 1;
const REMOTE_EXIT_NOT_READY = 2;

/**
 * Options/parameters for remote subcommands.
 */
export interface RemoteCommandOptions {
    configPathOverride?: string;
    eventsDirOverride?: string;
    backupDirOverride?: string;
    loadConfig?: typeof loadConfig;
    saveConfig?: typeof saveConfig;
    createGitSyncer?: (eventsDir?: string) => Pick<GitSyncer, "isGitRepo" | "initRepo" | "configureRemote" | "removeRemote" | "getRemoteUrl">;
    auditRemoteEventLogs?: () => Promise<{ eventLogFindings: number }>;
    allowLocalPathRemote?: boolean;
    now?: () => Date;
}

export interface RemoteCliOptions {
    json?: boolean;
    allowLocalPath?: boolean;
    autoPull?: boolean;
    autoPush?: boolean;
    confirm?: boolean;
}

/**
 * Create the remote command group for Commander.js.
 */
export function createRemoteCommand(opts: RemoteCommandOptions = {}): Command {
    const remoteCmd = new Command("remote")
        .description("Manage multi-device Git transport synchronization configuration");

    remoteCmd.command("set <repositoryUrl>")
        .description("Set remote Git repository URL and initialize events log transport repository")
        .option("--json", "Output stable JSON")
        .option("--allow-local-path", "Allow local path remotes for explicit test/private workflows")
        .option("--no-auto-pull", "Disable automatic pull when memory sync --remote runs")
        .option("--no-auto-push", "Disable automatic push when memory sync --remote runs")
        .action(async (repositoryUrl: string, commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteSetCommand(repositoryUrl, opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("remove")
        .description("Remove remote Git synchronization URL and disable remote sync")
        .option("--json", "Output stable JSON")
        .action(async (commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteRemoveCommand(opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("status")
        .description("View remote Git synchronization status")
        .option("--json", "Output stable JSON")
        .action(async (commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteStatusCommand(opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("preflight [repositoryUrl]")
        .description("Validate remote sync readiness without sending event logs")
        .option("--json", "Output stable JSON")
        .option("--allow-local-path", "Allow local path remotes for explicit test/private workflows")
        .action(async (repositoryUrl: string | undefined, commandOptions: RemoteCliOptions) => {
            const result = await executeRemotePreflightCommand(repositoryUrl, opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("doctor")
        .description("Diagnose remote sync configuration and privacy readiness")
        .option("--json", "Output stable JSON")
        .option("--allow-local-path", "Allow local path remotes for explicit test/private workflows")
        .action(async (commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteDoctorCommand(opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("backup [outputDir]")
        .description("Create a local backup of remote sync configuration and event logs")
        .option("--json", "Output stable JSON")
        .action(async (outputDir: string | undefined, commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteBackupCommand(outputDir, opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("restore <backupDir>")
        .description("Restore remote sync configuration and event logs from a backup")
        .option("--json", "Output stable JSON")
        .option("--confirm", "Confirm restore mutation")
        .action(async (backupDir: string, commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteRestoreCommand(backupDir, opts, commandOptions);
            process.exitCode = result.exitCode;
        });

    remoteCmd.command("rollback <backupDir>")
        .description("Rollback remote sync configuration and event logs from an explicit backup")
        .option("--json", "Output stable JSON")
        .option("--confirm", "Confirm rollback mutation")
        .action(async (backupDir: string, commandOptions: RemoteCliOptions) => {
            const result = await executeRemoteRollbackCommand(backupDir, opts, commandOptions);
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
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const load = opts.loadConfig ?? loadConfig;
        const save = opts.saveConfig ?? saveConfig;
        const createSyncer = opts.createGitSyncer ?? ((eventsDir?: string) => new GitSyncer(eventsDir));
        const config = load(opts.configPathOverride);
        const allowLocalPathRemote = commandOptions.allowLocalPath === true || opts.allowLocalPathRemote === true;
        const validation = validateRemoteRepositoryUrl(repositoryUrl, { allowLocalPathRemote });
        if (!validation.valid) {
            const message = `Failed to configure Git remote: ${validation.error}`;
            if (commandOptions.json) {
                writeRemoteJson("set", "error", REMOTE_EXIT_ERROR, {}, [message]);
            } else {
                console.error(`Error: ${message}`);
            }
            return { exitCode: REMOTE_EXIT_ERROR };
        }
        
        const syncer = createSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        if (!isRepo) {
            if (!commandOptions.json) console.log("Initializing local Git repository in events directory...");
            const initOk = await syncer.initRepo();
            if (!initOk) {
                const message = "Failed to initialize Git repository locally.";
                if (commandOptions.json) {
                    writeRemoteJson("set", "error", REMOTE_EXIT_ERROR, {}, [message]);
                } else {
                    console.error(`Error: ${message}`);
                }
                return { exitCode: REMOTE_EXIT_ERROR };
            }
        }

        if (!commandOptions.json) console.log(`Configuring remote origin repository URL: ${repositoryUrl}`);
        const remoteOk = await syncer.configureRemote(repositoryUrl);
        if (!remoteOk) {
            const message = "Failed to configure Git remote repository origin.";
            if (commandOptions.json) {
                writeRemoteJson("set", "error", REMOTE_EXIT_ERROR, {}, [message]);
            } else {
                console.error(`Error: ${message}`);
            }
            return { exitCode: REMOTE_EXIT_ERROR };
        }

        const autoPull = commandOptions.autoPull ?? config.remoteSync?.autoPull ?? true;
        const autoPush = commandOptions.autoPush ?? config.remoteSync?.autoPush ?? true;
        // Save remote configuration only after Git setup succeeds.
        save({
            remoteSync: {
                enabled: true,
                repositoryUrl,
                autoPush,
                autoPull,
            }
        }, opts.configPathOverride);

        if (commandOptions.json) {
            writeRemoteJson("set", "ok", REMOTE_EXIT_OK, {
                enabled: true,
                repositoryUrl,
                autoPull,
                autoPush,
            });
        } else {
            console.log("\nSuccess: Remote synchronization configured successfully!");
            console.log("To synchronize your local facts with the remote repository, run: memory sync --remote");
        }

        return { exitCode: REMOTE_EXIT_OK };
    } catch (err: any) {
        const message = `Error setting remote: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("set", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error setting remote:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

/**
 * Remove remote sync configuration.
 */
export async function executeRemoteRemoveCommand(
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const load = opts.loadConfig ?? loadConfig;
        const save = opts.saveConfig ?? saveConfig;
        const createSyncer = opts.createGitSyncer ?? ((eventsDir?: string) => new GitSyncer(eventsDir));
        const config = load(opts.configPathOverride);
        
        // Save config with remote sync disabled
        save({
            remoteSync: {
                enabled: false,
                autoPush: config.remoteSync?.autoPush ?? true,
                autoPull: config.remoteSync?.autoPull ?? true,
            }
        }, opts.configPathOverride);

        const syncer = createSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        if (isRepo) {
            if (!commandOptions.json) console.log("Removing Git remote origin URL...");
            await syncer.removeRemote();
        }

        if (commandOptions.json) {
            writeRemoteJson("remove", "ok", REMOTE_EXIT_OK, { enabled: false });
        } else {
            console.log("\nSuccess: Remote synchronization disabled and origin repository URL removed.");
        }
        return { exitCode: REMOTE_EXIT_OK };
    } catch (err: any) {
        const message = `Error removing remote: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("remove", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error removing remote:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

/**
 * Display current remote sync configurations and status.
 */
export async function executeRemoteStatusCommand(
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const load = opts.loadConfig ?? loadConfig;
        const createSyncer = opts.createGitSyncer ?? ((eventsDir?: string) => new GitSyncer(eventsDir));
        const config = load(opts.configPathOverride);
        const remoteSync = config.remoteSync;

        const syncer = createSyncer(opts.eventsDirOverride);
        const isRepo = await syncer.isGitRepo();
        const status: Record<string, unknown> = {
            machineId: config.machineId,
            enabled: remoteSync?.enabled === true,
            repositoryUrl: remoteSync?.repositoryUrl ?? null,
            autoPull: remoteSync?.autoPull ?? false,
            autoPush: remoteSync?.autoPush ?? false,
            gitRepository: isRepo ? "initialized" : "not_initialized",
            actualRemoteUrl: null,
        };

        if (isRepo) {
            const actualRemote = await syncer.getRemoteUrl();
            status.actualRemoteUrl = actualRemote;
        }

        if (commandOptions.json) {
            writeRemoteJson("status", "ok", REMOTE_EXIT_OK, status);
        } else {
            console.log("Remote Sync Status");
            console.log("==================");
            console.log(`Machine ID:        ${config.machineId}`);
            console.log(`Enabled:           ${remoteSync?.enabled ? "yes" : "no"}`);
            console.log(`Repository URL:    ${remoteSync?.repositoryUrl ?? "none configured"}`);
            console.log(`Auto-Pull:         ${remoteSync?.autoPull ? "enabled" : "disabled"}`);
            console.log(`Auto-Push:         ${remoteSync?.autoPush ? "enabled" : "disabled"}`);
            console.log(`Git Repository:    ${isRepo ? "initialized" : "not initialized"}`);
            if (isRepo) {
                console.log(`Actual Git Remote: ${status.actualRemoteUrl ?? "none"}`);
            }
        }

        return { exitCode: REMOTE_EXIT_OK };
    } catch (err: any) {
        const message = `Error gathering remote status: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("status", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error gathering remote status:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

export async function executeRemotePreflightCommand(
    repositoryUrl: string | undefined,
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const report = await buildRemotePreflight(repositoryUrl, opts, commandOptions);
        const exitCode = report.ready ? REMOTE_EXIT_OK : REMOTE_EXIT_NOT_READY;
        if (commandOptions.json) {
            writeRemoteJson("preflight", report.ready ? "ok" : "not_ready", exitCode, report, report.errors, report.warnings);
        } else {
            console.log("Remote Sync Preflight");
            console.log("=====================");
            console.log(`Ready:              ${report.ready ? "yes" : "no"}`);
            console.log(`Machine ID:         ${report.machineId}`);
            console.log(`Repository URL:     ${report.repositoryUrl ?? "none configured"}`);
            console.log(`Git Repository:     ${report.gitRepository}`);
            console.log(`Actual Git Remote:  ${report.actualRemoteUrl ?? "none"}`);
            console.log(`Event-log findings: ${report.eventLogFindings}`);
            for (const warning of report.warnings) console.warn(`Warning: ${warning}`);
            for (const error of report.errors) console.error(`Error: ${error}`);
        }
        return { exitCode };
    } catch (err: any) {
        const message = `Error running remote preflight: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("preflight", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error running remote preflight:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

export async function executeRemoteDoctorCommand(
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const report = await buildRemotePreflight(undefined, opts, commandOptions);
        const exitCode = report.ready ? REMOTE_EXIT_OK : REMOTE_EXIT_NOT_READY;
        if (commandOptions.json) {
            writeRemoteJson("doctor", report.ready ? "ok" : "not_ready", exitCode, report, report.errors, report.warnings);
        } else {
            console.log("Remote Sync Doctor");
            console.log("==================");
            console.log(`Ready:              ${report.ready ? "yes" : "no"}`);
            console.log(`Remote configured:  ${report.enabled ? "yes" : "no"}`);
            console.log(`Repository URL:     ${report.repositoryUrl ?? "none configured"}`);
            console.log(`Git Repository:     ${report.gitRepository}`);
            console.log(`Event-log findings: ${report.eventLogFindings}`);
            for (const warning of report.warnings) console.warn(`Warning: ${warning}`);
            for (const error of report.errors) console.error(`Error: ${error}`);
        }
        return { exitCode };
    } catch (err: any) {
        const message = `Error running remote doctor: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("doctor", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error running remote doctor:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

export async function executeRemoteBackupCommand(
    outputDir: string | undefined,
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    try {
        const snapshot = createRemoteBackupSnapshot(outputDir, opts);
        if (commandOptions.json) {
            writeRemoteJson("backup", "ok", REMOTE_EXIT_OK, { ...snapshot });
        } else {
            console.log("Remote sync backup created.");
            console.log(`Backup path: ${snapshot.backupPath}`);
            console.log(`Config:      ${snapshot.includesConfig ? "included" : "not found"}`);
            console.log(`Event files: ${snapshot.eventFileCount}`);
        }
        return { exitCode: REMOTE_EXIT_OK };
    } catch (err: any) {
        const message = `Error creating remote backup: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson("backup", "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error("Error creating remote backup:", unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

export async function executeRemoteRestoreCommand(
    backupDir: string,
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    return restoreRemoteSnapshot("restore", backupDir, opts, commandOptions);
}

export async function executeRemoteRollbackCommand(
    backupDir: string,
    opts: RemoteCommandOptions = {},
    commandOptions: RemoteCliOptions = {},
): Promise<CommandResult> {
    return restoreRemoteSnapshot("rollback", backupDir, opts, commandOptions);
}

async function restoreRemoteSnapshot(
    command: "restore" | "rollback",
    backupDir: string,
    opts: RemoteCommandOptions,
    commandOptions: RemoteCliOptions,
): Promise<CommandResult> {
    try {
        if (commandOptions.confirm !== true) {
            const message = `${command} requires --confirm before mutating config or event logs`;
            if (commandOptions.json) {
                writeRemoteJson(command, "not_ready", REMOTE_EXIT_NOT_READY, {}, [message]);
            } else {
                console.error(`Error: ${message}`);
            }
            return { exitCode: REMOTE_EXIT_NOT_READY };
        }

        const manifest = readRemoteBackupManifest(backupDir);
        const rollbackSnapshot = createRemoteBackupSnapshot(undefined, opts);
        applyRemoteBackupSnapshot(backupDir, manifest, opts);

        const data = {
            backupPath: backupDir,
            rollbackBackupPath: rollbackSnapshot.backupPath,
            restoredConfig: manifest.includesConfig,
            restoredEvents: manifest.includesEvents,
            eventFileCount: manifest.eventFileCount,
        };
        if (commandOptions.json) {
            writeRemoteJson(command, "ok", REMOTE_EXIT_OK, data);
        } else {
            console.log(`Remote sync ${command} completed.`);
            console.log(`Source backup:   ${backupDir}`);
            console.log(`Rollback backup: ${rollbackSnapshot.backupPath}`);
        }
        return { exitCode: REMOTE_EXIT_OK };
    } catch (err: any) {
        const message = `Error running remote ${command}: ${unknownErrorMessage(err)}`;
        if (commandOptions.json) {
            writeRemoteJson(command, "error", REMOTE_EXIT_ERROR, {}, [message]);
        } else {
            console.error(`Error running remote ${command}:`, unknownErrorMessage(err));
        }
        return { exitCode: REMOTE_EXIT_ERROR };
    }
}

async function buildRemotePreflight(
    repositoryUrl: string | undefined,
    opts: RemoteCommandOptions,
    commandOptions: RemoteCliOptions,
) {
    const load = opts.loadConfig ?? loadConfig;
    const createSyncer = opts.createGitSyncer ?? ((eventsDir?: string) => new GitSyncer(eventsDir));
    const audit = opts.auditRemoteEventLogs ?? auditDefaultRemoteEventLogs;
    const config = load(opts.configPathOverride);
    const remoteSync = config.remoteSync;
    const candidateUrl = repositoryUrl ?? remoteSync?.repositoryUrl;
    const warnings: string[] = [];
    const errors: string[] = [];

    const machineValidation = validateMachineIdentity(config.machineId ?? "");
    if (!machineValidation.valid) errors.push(machineValidation.error ?? "Machine identity is invalid");

    if (!candidateUrl) {
        errors.push("Remote repository URL is not configured");
    } else {
        const remoteValidation = validateRemoteRepositoryUrl(candidateUrl, {
            allowLocalPathRemote: commandOptions.allowLocalPath === true || opts.allowLocalPathRemote === true,
        });
        if (!remoteValidation.valid) errors.push(remoteValidation.error ?? "Remote URL is invalid");
    }

    const syncer = createSyncer(opts.eventsDirOverride);
    const isRepo = await syncer.isGitRepo();
    let actualRemoteUrl: string | null = null;
    if (isRepo) {
        actualRemoteUrl = await syncer.getRemoteUrl();
        if (candidateUrl && actualRemoteUrl && actualRemoteUrl !== candidateUrl) {
            warnings.push("Configured remote URL does not match actual Git origin");
        }
    }

    const auditReport = await audit();
    if (auditReport.eventLogFindings > 0) {
        errors.push(`Active event logs contain ${auditReport.eventLogFindings} likely secret finding(s)`);
    }

    return {
        schemaVersion: REMOTE_SCHEMA_VERSION,
        ready: errors.length === 0,
        enabled: remoteSync?.enabled === true,
        machineId: config.machineId ?? "",
        repositoryUrl: candidateUrl ?? null,
        autoPull: remoteSync?.autoPull ?? false,
        autoPush: remoteSync?.autoPush ?? false,
        gitRepository: isRepo ? "initialized" : "not_initialized",
        actualRemoteUrl,
        eventLogFindings: auditReport.eventLogFindings,
        warnings,
        errors,
    };
}

async function auditDefaultRemoteEventLogs(): Promise<{ eventLogFindings: number }> {
    const report = await new SecretAuditService(new PatternRedactor()).audit({
        eventLogPaths: getAllLogFiles(),
    });
    return { eventLogFindings: report.summary.eventLogFindings };
}

interface RemoteBackupManifest {
    schemaVersion: 1;
    kind: "memory.remoteSync.backup";
    backupId: string;
    createdAt: string;
    includesConfig: boolean;
    includesEvents: boolean;
    eventFileCount: number;
    excludedPaths: string[];
}

interface RemoteBackupSnapshot {
    backupId: string;
    backupPath: string;
    manifestPath: string;
    createdAt: string;
    includesConfig: boolean;
    includesEvents: boolean;
    eventFileCount: number;
    excludedPaths: string[];
}

function createRemoteBackupSnapshot(
    outputDir: string | undefined,
    opts: RemoteCommandOptions,
): RemoteBackupSnapshot {
    const now = opts.now?.() ?? new Date();
    const createdAt = now.toISOString();
    const backupId = `remote-sync-${formatBackupTimestamp(now)}`;
    const root = outputDir ?? opts.backupDirOverride ?? join(getBackupDir(), "remote-sync");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const backupPath = uniqueBackupPath(root, backupId);
    mkdirSync(backupPath, { recursive: true, mode: 0o700 });

    const configPath = opts.configPathOverride ?? getConfigPath();
    const eventsDir = opts.eventsDirOverride ?? getEventsDir();
    const backupConfigPath = join(backupPath, "config.json");
    const backupEventsDir = join(backupPath, "events");
    const includesConfig = existsSync(configPath);
    const includesEvents = existsSync(eventsDir) && statSync(eventsDir).isDirectory();
    let eventFileCount = 0;

    if (includesConfig) {
        copyFileSync(configPath, backupConfigPath);
    }
    if (includesEvents) {
        mkdirSync(backupEventsDir, { recursive: true, mode: 0o700 });
        eventFileCount = copyEventsDirectory(eventsDir, backupEventsDir);
    }

    const manifest: RemoteBackupManifest = {
        schemaVersion: REMOTE_SCHEMA_VERSION,
        kind: "memory.remoteSync.backup",
        backupId,
        createdAt,
        includesConfig,
        includesEvents,
        eventFileCount,
        excludedPaths: [".git"],
    };
    const manifestPath = join(backupPath, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

    return {
        backupId,
        backupPath,
        manifestPath,
        createdAt,
        includesConfig,
        includesEvents,
        eventFileCount,
        excludedPaths: manifest.excludedPaths,
    };
}

function applyRemoteBackupSnapshot(
    backupDir: string,
    manifest: RemoteBackupManifest,
    opts: RemoteCommandOptions,
): void {
    const configPath = opts.configPathOverride ?? getConfigPath();
    const eventsDir = opts.eventsDirOverride ?? getEventsDir();
    const backupConfigPath = join(backupDir, "config.json");
    const backupEventsDir = join(backupDir, "events");

    if (manifest.includesConfig) {
        mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
        if (!existsSync(backupConfigPath)) {
            throw new Error("Backup manifest declares config but config.json is missing");
        }
        copyFileSync(backupConfigPath, configPath);
    } else if (existsSync(configPath)) {
        rmSync(configPath, { force: true });
    }

    if (manifest.includesEvents) {
        if (!existsSync(backupEventsDir) || !statSync(backupEventsDir).isDirectory()) {
            throw new Error("Backup manifest declares events but events directory is missing");
        }
        mkdirSync(eventsDir, { recursive: true, mode: 0o700 });
        clearEventsDirectoryExceptGit(eventsDir);
        copyEventsDirectory(backupEventsDir, eventsDir);
    } else if (existsSync(eventsDir)) {
        clearEventsDirectoryExceptGit(eventsDir);
    }
}

function readRemoteBackupManifest(backupDir: string): RemoteBackupManifest {
    const manifestPath = join(backupDir, "manifest.json");
    if (!existsSync(manifestPath)) {
        throw new Error("Remote backup manifest.json is missing");
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Partial<RemoteBackupManifest>;
    if (
        manifest.schemaVersion !== REMOTE_SCHEMA_VERSION ||
        manifest.kind !== "memory.remoteSync.backup" ||
        typeof manifest.backupId !== "string" ||
        typeof manifest.createdAt !== "string" ||
        typeof manifest.includesConfig !== "boolean" ||
        typeof manifest.includesEvents !== "boolean" ||
        typeof manifest.eventFileCount !== "number" ||
        !Array.isArray(manifest.excludedPaths)
    ) {
        throw new Error("Remote backup manifest is invalid or unsupported");
    }
    return manifest as RemoteBackupManifest;
}

function copyEventsDirectory(sourceDir: string, targetDir: string): number {
    let copiedFiles = 0;
    for (const entry of readdirSync(sourceDir)) {
        if (entry === ".git") continue;
        const sourcePath = join(sourceDir, entry);
        const targetPath = join(targetDir, entry);
        const stat = statSync(sourcePath);
        if (stat.isDirectory()) {
            mkdirSync(targetPath, { recursive: true, mode: 0o700 });
            copiedFiles += copyEventsDirectory(sourcePath, targetPath);
        } else if (stat.isFile()) {
            cpSync(sourcePath, targetPath);
            copiedFiles += 1;
        }
    }
    return copiedFiles;
}

function clearEventsDirectoryExceptGit(eventsDir: string): void {
    for (const entry of readdirSync(eventsDir)) {
        if (entry === ".git") continue;
        rmSync(join(eventsDir, entry), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
}

function uniqueBackupPath(root: string, backupId: string): string {
    let candidate = join(root, backupId);
    let suffix = 2;
    while (existsSync(candidate)) {
        candidate = join(root, `${backupId}-${suffix}`);
        suffix += 1;
    }
    return candidate;
}

function formatBackupTimestamp(date: Date): string {
    return date.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function writeRemoteJson(
    command: string,
    status: "ok" | "not_ready" | "error",
    exitCode: number,
    data: Record<string, unknown>,
    errors: string[] = [],
    warnings: string[] = [],
): void {
    console.log(JSON.stringify({
        schemaVersion: REMOTE_SCHEMA_VERSION,
        command,
        status,
        exitCode,
        data,
        errors,
        warnings,
    }, null, 2));
}
