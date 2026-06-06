/**
 * Remote CLI Command Tests
 *
 * Verifies set, remove, and status command execution, configuration state transitions,
 * and stderr/stdout output envelopes.
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    executeRemoteSetCommand,
    executeRemoteRemoveCommand,
    executeRemoteStatusCommand,
    executeRemotePreflightCommand,
    executeRemoteDoctorCommand,
    executeRemoteBackupCommand,
    executeRemoteRestoreCommand,
    executeRemoteRollbackCommand,
    createRemoteCommand,
} from "./remote.js";
import { GitSyncer, runGit } from "../../../infrastructure/hooks/git-syncer.js";

describe("remote command", () => {
    let testDir: string;
    let configPath: string;
    let eventsDir: string;
    let mockRemoteDir: string;
    let gitHomeDir: string;
    let gitEnv: NodeJS.ProcessEnv;
    let runIsolatedGit: typeof runGit;
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let consoleWarnSpy: ReturnType<typeof spyOn>;

    function createRealGitSyncer(eventsDirOverride?: string): GitSyncer {
        return new GitSyncer(eventsDirOverride, { runGit: runIsolatedGit });
    }

    function realGitOptions() {
        return {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
            createGitSyncer: createRealGitSyncer,
            auditRemoteEventLogs: async () => ({ eventLogFindings: 0 }),
            allowLocalPathRemote: true,
        };
    }

    beforeEach(async () => {
        // Setup unique sandbox directories
        testDir = join(
            tmpdir(),
            `remote-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });

        configPath = join(testDir, "config.json");
        eventsDir = join(testDir, "events");
        mkdirSync(eventsDir, { recursive: true });

        mockRemoteDir = join(testDir, "remote-bare");
        mkdirSync(mockRemoteDir, { recursive: true });

        gitHomeDir = join(testDir, "git-home");
        mkdirSync(gitHomeDir, { recursive: true });
        gitEnv = {
            ...process.env,
            HOME: gitHomeDir,
            USERPROFILE: gitHomeDir,
            XDG_CONFIG_HOME: join(gitHomeDir, ".config"),
        };
        runIsolatedGit = (args, cwd) => runGit(args, cwd, gitEnv);

        // Initialize bare repo
        await runIsolatedGit(["init", "--bare"], mockRemoteDir);
        await runIsolatedGit(["symbolic-ref", "HEAD", "refs/heads/main"], mockRemoteDir);

        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
        }
    });

    test("createRemoteCommand constructs Commander group correctly", () => {
        const cmd = createRemoteCommand();
        expect(cmd.name()).toBe("remote");
        expect(cmd.commands.some(c => c.name() === "set")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "remove")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "status")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "preflight")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "doctor")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "backup")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "restore")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "rollback")).toBe(true);
    });

    test("createRemoteCommand actions set process.exitCode from subcommand results", async () => {
        const originalExitCode = process.exitCode;
        try {
            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "set", mockRemoteDir]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "status"]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "preflight", mockRemoteDir, "--allow-local-path"]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "doctor", "--allow-local-path"]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "backup", join(testDir, "cmd-backups")]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand(realGitOptions()).parseAsync(["node", "memory remote", "remove"]);
            expect(process.exitCode).toBe(0);
        } finally {
            process.exitCode = originalExitCode;
        }
    });

    test("executeRemoteSetCommand initializes Git repo and configures URL", async () => {
        const result = await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });

        expect(result.exitCode).toBe(0);

        // Verify config is saved
        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed.remoteSync.enabled).toBe(true);
        expect(parsed.remoteSync.repositoryUrl).toBe(mockRemoteDir);

        // Verify git is initialized and remote matches
        const gitDir = join(eventsDir, ".git");
        expect(existsSync(gitDir)).toBe(true);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Initializing local Git repository");
        expect(output).toContain("Remote synchronization configured");
    });

    test("executeRemoteSetCommand fails when remote URL is blank", async () => {
        const result = await executeRemoteSetCommand("   ", {
            ...realGitOptions(),
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Failed to configure Git remote");
    });

    test("executeRemoteSetCommand does not save config when local git initialization fails", async () => {
        let saveCalled = false;
        const result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({
                remoteSync: { autoPush: false, autoPull: false },
            }) as any,
            saveConfig: () => {
                saveCalled = true;
            },
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => false,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        });

        expect(result.exitCode).toBe(1);
        expect(saveCalled).toBe(false);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Failed to initialize Git repository");
    });

    test("executeRemoteSetCommand preserves existing auto flags after successful setup", async () => {
        let saved: any;
        const result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({
                remoteSync: { autoPush: false, autoPull: false },
            }) as any,
            saveConfig: (config) => {
                saved = config;
            },
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => false,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        });

        expect(result.exitCode).toBe(0);
        expect(saved.remoteSync).toEqual({
            enabled: true,
            repositoryUrl: "git@example.com:repo.git",
            autoPush: false,
            autoPull: false,
        });
    });

    test("executeRemoteSetCommand defaults missing auto flags to enabled", async () => {
        let saved: any;
        const result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({}) as any,
            saveConfig: (config) => {
                saved = config;
            },
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => false,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        });

        expect(result.exitCode).toBe(0);
        expect(saved.remoteSync.autoPush).toBe(true);
        expect(saved.remoteSync.autoPull).toBe(true);
    });

    test("executeRemoteSetCommand reports config read failures", async () => {
        const result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => {
                throw new Error("config unreadable");
            },
        });

        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Error setting remote:");
    });

    test("executeRemoteSetCommand formats non-Error thrown values", async () => {
        const result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => {
                throw "config missing";
            },
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Error setting remote:");
        expect(output).toContain("config missing");
    });

    test("executeRemoteSetCommand emits stable JSON for validation, setup failures, and explicit auto flags", async () => {
        let result = await executeRemoteSetCommand("git://example/repo.git", realGitOptions(), { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]))).toMatchObject({
            command: "set",
            status: "error",
            errors: ["Failed to configure Git remote: Remote URL protocol is not supported"],
        });

        consoleLogSpy.mockClear();
        result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({}) as any,
            saveConfig: () => undefined,
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => false,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n"))
            .toContain("Failed to initialize Git repository locally");

        consoleLogSpy.mockClear();
        result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({}) as any,
            saveConfig: () => undefined,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => false,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n"))
            .toContain("Failed to configure Git remote repository origin");

        consoleLogSpy.mockClear();
        let saved: any;
        result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({}) as any,
            saveConfig: (config) => { saved = config; },
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        }, { json: true, autoPull: false, autoPush: false });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload).toMatchObject({
            command: "set",
            status: "ok",
            data: { enabled: true, repositoryUrl: "git@example.com:repo.git", autoPull: false, autoPush: false },
        });
        expect(saved.remoteSync.autoPull).toBe(false);
        expect(saved.remoteSync.autoPush).toBe(false);
    });

    test("executeRemoteRemoveCommand disables sync and clears configuration", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });

        // Now remove
        const result = await executeRemoteRemoveCommand({
            ...realGitOptions(),
        });

        expect(result.exitCode).toBe(0);

        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed.remoteSync.enabled).toBe(false);
        expect(parsed.remoteSync.repositoryUrl).toBeUndefined();
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Removing Git remote origin URL");
    });

    test("executeRemoteRemoveCommand succeeds when events directory is not a Git repo", async () => {
        const nonRepoEvents = join(testDir, "non-repo-events");
        mkdirSync(nonRepoEvents, { recursive: true });
        writeFileSync(configPath, JSON.stringify({
            remoteSync: {
                enabled: true,
                repositoryUrl: mockRemoteDir,
                autoPush: false,
                autoPull: false,
            },
        }));

        const result = await executeRemoteRemoveCommand({
            configPathOverride: configPath,
            eventsDirOverride: nonRepoEvents,
        });

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
        expect(parsed.remoteSync.enabled).toBe(false);
        expect(parsed.remoteSync.autoPush).toBe(false);
        expect(parsed.remoteSync.autoPull).toBe(false);
    });

    test("executeRemoteRemoveCommand defaults missing auto flags to enabled", async () => {
        let saved: any;
        const result = await executeRemoteRemoveCommand({
            loadConfig: () => ({}) as any,
            saveConfig: (config) => {
                saved = config;
            },
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        });

        expect(result.exitCode).toBe(0);
        expect(saved.remoteSync).toEqual({
            enabled: false,
            autoPush: true,
            autoPull: true,
        });
    });

    test("executeRemoteRemoveCommand reports config write failures", async () => {
        const result = await executeRemoteRemoveCommand({
            configPathOverride: testDir,
            eventsDirOverride: eventsDir,
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Error removing remote:");
    });

    test("executeRemoteRemoveCommand reports config read failures", async () => {
        const result = await executeRemoteRemoveCommand({
            loadConfig: () => {
                throw new Error("config unreadable");
            },
        });

        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Error removing remote:");
    });

    test("executeRemoteRemoveCommand formats non-Error thrown values", async () => {
        const result = await executeRemoteRemoveCommand({
            loadConfig: () => {
                throw "config missing";
            },
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Error removing remote:");
        expect(output).toContain("config missing");
    });

    test("executeRemoteRemoveCommand emits JSON for success and caught errors", async () => {
        let result = await executeRemoteRemoveCommand({
            loadConfig: () => ({ remoteSync: { autoPull: false, autoPush: false } }) as any,
            saveConfig: () => undefined,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        }, { json: true });

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]))).toMatchObject({
            command: "remove",
            status: "ok",
            data: { enabled: false },
        });

        consoleLogSpy.mockClear();
        result = await executeRemoteRemoveCommand({
            loadConfig: () => {
                throw "remove failed";
            },
        }, { json: true });

        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n")).toContain("remove failed");
    });

    test("executeRemoteStatusCommand renders status values correctly", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });

        const result = await executeRemoteStatusCommand({
            ...realGitOptions(),
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Enabled:           yes");
        expect(output).toContain("Git Repository:    initialized");
        expect(output).toContain("Actual Git Remote:");
    });

    test("executeRemoteStatusCommand renders disabled defaults when no remote is configured", async () => {
        const nonRepoEvents = join(testDir, "status-non-repo-events");
        mkdirSync(nonRepoEvents, { recursive: true });

        const result = await executeRemoteStatusCommand({
            configPathOverride: configPath,
            eventsDirOverride: nonRepoEvents,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Enabled:           no");
        expect(output).toContain("Repository URL:    none configured");
        expect(output).toContain("Git Repository:    not initialized");
    });

    test("executeRemoteStatusCommand renders initialized repo with no actual origin", async () => {
        const result = await executeRemoteStatusCommand({
            loadConfig: () => ({
                machineId: "machine-1",
                remoteSync: {
                    enabled: true,
                    repositoryUrl: "git@example.com:repo.git",
                    autoPull: false,
                    autoPush: true,
                },
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                getRemoteUrl: async () => null,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
            }),
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Auto-Pull:         disabled");
        expect(output).toContain("Auto-Push:         enabled");
        expect(output).toContain("Actual Git Remote: none");
    });

    test("executeRemoteStatusCommand emits stable JSON when requested", async () => {
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        consoleLogSpy.mockClear();

        const result = await executeRemoteStatusCommand({
            ...realGitOptions(),
        }, { json: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload).toMatchObject({
            schemaVersion: 1,
            command: "status",
            status: "ok",
            exitCode: 0,
            errors: [],
            warnings: [],
        });
        expect(payload.data).toMatchObject({
            enabled: true,
            repositoryUrl: mockRemoteDir,
            gitRepository: "initialized",
            actualRemoteUrl: mockRemoteDir,
        });
    });

    test("executeRemotePreflightCommand returns not-ready JSON for invalid or unsafe state", async () => {
        const result = await executeRemotePreflightCommand("git://example/repo.git", {
            ...realGitOptions(),
            loadConfig: () => ({
                machineId: "local",
                remoteSync: {
                    enabled: true,
                    repositoryUrl: "git://example/repo.git",
                    autoPull: true,
                    autoPush: true,
                },
            }) as any,
            auditRemoteEventLogs: async () => ({ eventLogFindings: 3 }),
        }, { json: true });

        expect(result.exitCode).toBe(2);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        expect(payload.status).toBe("not_ready");
        expect(payload.data.ready).toBe(false);
        expect(payload.errors.join("\n")).toContain("Machine identity must come from durable config");
        expect(payload.errors.join("\n")).toContain("Remote URL protocol is not supported");
        expect(payload.errors.join("\n")).toContain("Active event logs contain 3 likely secret finding");
    });

    test("executeRemotePreflightCommand returns ready when validation, git, and privacy checks pass", async () => {
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        consoleLogSpy.mockClear();

        const result = await executeRemotePreflightCommand(mockRemoteDir, {
            ...realGitOptions(),
        }, { json: true, allowLocalPath: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.status).toBe("ok");
        expect(payload.data.ready).toBe(true);
        expect(payload.data.eventLogFindings).toBe(0);
    });

    test("executeRemoteDoctorCommand reports not ready when remote is missing", async () => {
        const result = await executeRemoteDoctorCommand({
            ...realGitOptions(),
            loadConfig: () => ({
                machineId: "machine-1",
                remoteSync: {
                    enabled: false,
                    autoPull: true,
                    autoPush: true,
                },
            }) as any,
        }, { json: true });

        expect(result.exitCode).toBe(2);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.command).toBe("doctor");
        expect(payload.status).toBe("not_ready");
        expect(payload.errors.join("\n")).toContain("Remote repository URL is not configured");
    });

    test("executeRemoteBackupCommand snapshots config and event logs with stable JSON", async () => {
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "{\"id\":\"evt-1\"}\n");
        consoleLogSpy.mockClear();

        const backupRoot = join(testDir, "remote-backups");
        const result = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:00:00.000Z"),
        }, { json: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.command).toBe("backup");
        expect(payload.status).toBe("ok");
        expect(payload.data.backupPath).toContain("remote-sync-20260606T120000000Z");
        expect(existsSync(join(payload.data.backupPath, "manifest.json"))).toBe(true);
        expect(existsSync(join(payload.data.backupPath, "config.json"))).toBe(true);
        expect(readFileSync(join(payload.data.backupPath, "events", "events-machine-1.jsonl"), "utf-8"))
            .toContain("evt-1");
    });

    test("executeRemoteRestoreCommand requires confirmation before mutating state", async () => {
        const backupRoot = join(testDir, "restore-backups");
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        const backup = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:01:00.000Z"),
        }, { json: true });
        expect(backup.exitCode).toBe(0);
        const backupPayload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        const backupPath = String(backupPayload.data.backupPath);
        writeFileSync(configPath, JSON.stringify({
            machineId: "machine-2",
            remoteSync: {
                enabled: false,
                repositoryUrl: "https://example.invalid/changed.git",
            },
        }));
        consoleLogSpy.mockClear();

        const result = await executeRemoteRestoreCommand(backupPath, {
            ...realGitOptions(),
        }, { json: true });

        expect(result.exitCode).toBe(2);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.status).toBe("not_ready");
        expect(payload.errors.join("\n")).toContain("requires --confirm");
        expect(readFileSync(configPath, "utf-8")).toContain("changed.git");
    });

    test("executeRemoteRestoreCommand restores state and creates a rollback snapshot", async () => {
        const backupRoot = join(testDir, "restore-with-rollback");
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "before\n");
        const backup = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:02:00.000Z"),
        }, { json: true });
        expect(backup.exitCode).toBe(0);
        const backupPayload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        const backupPath = String(backupPayload.data.backupPath);
        writeFileSync(configPath, JSON.stringify({
            machineId: "machine-2",
            remoteSync: {
                enabled: false,
                repositoryUrl: "https://example.invalid/changed.git",
            },
        }));
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "after\n");
        consoleLogSpy.mockClear();

        const result = await executeRemoteRestoreCommand(backupPath, {
            ...realGitOptions(),
            backupDirOverride: backupRoot,
            now: () => new Date("2026-06-06T12:03:00.000Z"),
        }, { json: true, confirm: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.data.rollbackBackupPath).toContain("remote-sync-20260606T120300000Z");
        expect(readFileSync(configPath, "utf-8")).toContain(String(mockRemoteDir).replaceAll("\\", "\\\\"));
        expect(readFileSync(join(eventsDir, "events-machine-1.jsonl"), "utf-8")).toBe("before\n");
        expect(readFileSync(join(payload.data.rollbackBackupPath, "events", "events-machine-1.jsonl"), "utf-8"))
            .toBe("after\n");
    });

    test("executeRemoteRollbackCommand restores from an explicit rollback backup", async () => {
        const backupRoot = join(testDir, "rollback-backups");
        await executeRemoteSetCommand(mockRemoteDir, {
            ...realGitOptions(),
        });
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "rollback-state\n");
        const rollback = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:04:00.000Z"),
        }, { json: true });
        expect(rollback.exitCode).toBe(0);
        const rollbackPayload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        const rollbackPath = String(rollbackPayload.data.backupPath);
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "broken-state\n");
        consoleLogSpy.mockClear();

        const result = await executeRemoteRollbackCommand(rollbackPath, {
            ...realGitOptions(),
            backupDirOverride: backupRoot,
            now: () => new Date("2026-06-06T12:05:00.000Z"),
        }, { json: true, confirm: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.command).toBe("rollback");
        expect(readFileSync(join(eventsDir, "events-machine-1.jsonl"), "utf-8")).toBe("rollback-state\n");
    });

    test("executeRemoteStatusCommand reports config read failures", async () => {
        const result = await executeRemoteStatusCommand({
            loadConfig: () => {
                throw new Error("config unreadable");
            },
        });

        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Error gathering remote status:");
    });

    test("executeRemoteStatusCommand formats non-Error thrown values", async () => {
        const result = await executeRemoteStatusCommand({
            loadConfig: () => {
                throw "config missing";
            },
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Error gathering remote status:");
        expect(output).toContain("config missing");
    });

    test("executeRemotePreflightCommand renders text warnings and catches text and JSON failures", async () => {
        let result = await executeRemotePreflightCommand(undefined, {
            loadConfig: () => ({
                machineId: "machine-1",
                remoteSync: {
                    enabled: true,
                    repositoryUrl: "git@example.com:expected.git",
                    autoPull: false,
                    autoPush: true,
                },
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => "git@example.com:actual.git",
            }),
            auditRemoteEventLogs: async () => ({ eventLogFindings: 2 }),
        });

        expect(result.exitCode).toBe(2);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote Sync Preflight");
        expect(consoleWarnSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Configured remote URL does not match actual Git origin");
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Active event logs contain 2 likely secret finding");

        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
        result = await executeRemotePreflightCommand(undefined, {
            loadConfig: () => {
                throw "preflight failed";
            },
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n")).toContain("preflight failed");

        result = await executeRemotePreflightCommand(undefined, {
            loadConfig: () => {
                throw new Error("preflight text failed");
            },
        });
        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("preflight text failed");
    });

    test("executeRemoteDoctorCommand renders text and catches text and JSON failures", async () => {
        let result = await executeRemoteDoctorCommand({
            loadConfig: () => ({
                machineId: "machine-1",
                remoteSync: {
                    enabled: true,
                    repositoryUrl: "git@example.com:repo.git",
                    autoPull: true,
                    autoPush: true,
                },
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
            auditRemoteEventLogs: async () => ({ eventLogFindings: 0 }),
        });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote Sync Doctor");
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote configured:  yes");

        consoleLogSpy.mockClear();
        result = await executeRemoteDoctorCommand({
            loadConfig: () => {
                throw "doctor failed";
            },
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n")).toContain("doctor failed");

        result = await executeRemoteDoctorCommand({
            loadConfig: () => {
                throw new Error("doctor text failed");
            },
        });
        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("doctor text failed");
    });

    test("executeRemoteBackupCommand handles text output, duplicate backup IDs, nested event copies, and backup errors", async () => {
        const backupRoot = join(testDir, "backup-edge");
        writeFileSync(configPath, JSON.stringify({ machineId: "machine-1", remoteSync: { enabled: true } }));
        mkdirSync(join(eventsDir, ".git"), { recursive: true });
        writeFileSync(join(eventsDir, ".git", "config"), "do not copy\n");
        mkdirSync(join(eventsDir, "nested"), { recursive: true });
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "root\n");
        writeFileSync(join(eventsDir, "nested", "events-machine-2.jsonl"), "nested\n");
        mkdirSync(join(backupRoot, "remote-sync-20260606T121000000Z"), { recursive: true });

        let result = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:10:00.000Z"),
        });
        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote sync backup created.");

        consoleLogSpy.mockClear();
        result = await executeRemoteBackupCommand(backupRoot, {
            ...realGitOptions(),
            now: () => new Date("2026-06-06T12:10:00.000Z"),
        }, { json: true });

        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
        expect(payload.data.backupPath).toContain("remote-sync-20260606T121000000Z-3");
        expect(payload.data.eventFileCount).toBe(2);
        expect(existsSync(join(payload.data.backupPath, "events", ".git"))).toBe(false);
        expect(readFileSync(join(payload.data.backupPath, "events", "nested", "events-machine-2.jsonl"), "utf-8"))
            .toBe("nested\n");

        const noStateRoot = join(testDir, "backup-no-state");
        consoleLogSpy.mockClear();
        result = await executeRemoteBackupCommand(noStateRoot, {
            configPathOverride: join(testDir, "missing-config.json"),
            eventsDirOverride: join(testDir, "missing-events"),
            backupDirOverride: noStateRoot,
            now: () => new Date("2026-06-06T12:11:00.000Z"),
        });
        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Config:      not found");

        const fileInsteadOfDir = join(testDir, "backup-file");
        writeFileSync(fileInsteadOfDir, "not a directory");
        consoleLogSpy.mockClear();
        result = await executeRemoteBackupCommand(fileInsteadOfDir, realGitOptions(), { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).command).toBe("backup");

        consoleErrorSpy.mockClear();
        result = await executeRemoteBackupCommand(fileInsteadOfDir, realGitOptions());
        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("Error creating remote backup");
    });

    test("restore and rollback reject invalid backups and preserve .git while clearing state", async () => {
        const rollbackRoot = join(testDir, "restore-rollback-root");
        const invalidBackup = join(testDir, "invalid-backup");
        mkdirSync(invalidBackup, { recursive: true });
        writeFileSync(join(invalidBackup, "manifest.json"), JSON.stringify({ kind: "wrong" }));

        let result = await executeRemoteRestoreCommand(invalidBackup, {
            ...realGitOptions(),
            backupDirOverride: rollbackRoot,
        }, { json: true, confirm: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).errors.join("\n"))
            .toContain("Remote backup manifest is invalid or unsupported");

        const missingManifest = join(testDir, "missing-manifest");
        mkdirSync(missingManifest, { recursive: true });
        result = await executeRemoteRollbackCommand(missingManifest, {
            ...realGitOptions(),
            backupDirOverride: rollbackRoot,
        }, { json: true, confirm: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).errors.join("\n"))
            .toContain("Remote backup manifest.json is missing");

        const missingConfigBackup = join(testDir, "missing-config-backup");
        mkdirSync(missingConfigBackup, { recursive: true });
        writeFileSync(join(missingConfigBackup, "manifest.json"), JSON.stringify({
            schemaVersion: 1,
            kind: "memory.remoteSync.backup",
            backupId: "missing-config",
            createdAt: "2026-06-06T12:12:00.000Z",
            includesConfig: true,
            includesEvents: false,
            eventFileCount: 0,
            excludedPaths: [".git"],
        }));
        result = await executeRemoteRestoreCommand(missingConfigBackup, {
            ...realGitOptions(),
            backupDirOverride: rollbackRoot,
        }, { json: true, confirm: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).errors.join("\n"))
            .toContain("config.json is missing");

        const missingEventsBackup = join(testDir, "missing-events-backup");
        mkdirSync(missingEventsBackup, { recursive: true });
        writeFileSync(join(missingEventsBackup, "manifest.json"), JSON.stringify({
            schemaVersion: 1,
            kind: "memory.remoteSync.backup",
            backupId: "missing-events",
            createdAt: "2026-06-06T12:13:00.000Z",
            includesConfig: false,
            includesEvents: true,
            eventFileCount: 1,
            excludedPaths: [".git"],
        }));
        result = await executeRemoteRestoreCommand(missingEventsBackup, {
            ...realGitOptions(),
            backupDirOverride: rollbackRoot,
        }, { json: true, confirm: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).errors.join("\n"))
            .toContain("events directory is missing");

        const clearingBackup = join(testDir, "clearing-backup");
        mkdirSync(clearingBackup, { recursive: true });
        writeFileSync(join(clearingBackup, "manifest.json"), JSON.stringify({
            schemaVersion: 1,
            kind: "memory.remoteSync.backup",
            backupId: "clearing",
            createdAt: "2026-06-06T12:14:00.000Z",
            includesConfig: false,
            includesEvents: false,
            eventFileCount: 0,
            excludedPaths: [".git"],
        }));
        writeFileSync(configPath, JSON.stringify({ remoteSync: { enabled: true } }));
        mkdirSync(join(eventsDir, ".git"), { recursive: true });
        writeFileSync(join(eventsDir, ".git", "config"), "keep\n");
        writeFileSync(join(eventsDir, "events-machine-1.jsonl"), "delete\n");
        consoleLogSpy.mockClear();
        result = await executeRemoteRestoreCommand(clearingBackup, {
            ...realGitOptions(),
            backupDirOverride: rollbackRoot,
            now: () => new Date("2026-06-06T12:15:00.000Z"),
        }, { confirm: true });

        expect(result.exitCode).toBe(0);
        expect(existsSync(configPath)).toBe(false);
        expect(existsSync(join(eventsDir, ".git", "config"))).toBe(true);
        expect(readdirSync(eventsDir)).toEqual([".git"]);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote sync restore completed.");
    });

    test("executeRemoteCommand covers remaining user-visible diagnostic branches", async () => {
        let result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => ({}) as any,
            saveConfig: () => undefined,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => false,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        });
        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("Failed to configure Git remote repository origin");

        consoleLogSpy.mockClear();
        result = await executeRemoteSetCommand("git@example.com:repo.git", {
            loadConfig: () => {
                throw "set json failed";
            },
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n")).toContain("set json failed");

        consoleLogSpy.mockClear();
        result = await executeRemoteStatusCommand({
            loadConfig: () => ({
                machineId: "machine-1",
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
        }, { json: true });
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).data).toMatchObject({
            enabled: false,
            repositoryUrl: null,
            autoPull: false,
            autoPush: false,
            gitRepository: "not_initialized",
        });

        consoleLogSpy.mockClear();
        result = await executeRemoteStatusCommand({
            loadConfig: () => {
                throw "status json failed";
            },
        }, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).errors.join("\n")).toContain("status json failed");

        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
        result = await executeRemotePreflightCommand(undefined, {
            loadConfig: () => ({}) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
            auditRemoteEventLogs: async () => ({ eventLogFindings: 0 }),
        });
        expect(result.exitCode).toBe(2);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Repository URL:     none configured");
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Actual Git Remote:  none");

        consoleLogSpy.mockClear();
        result = await executeRemoteDoctorCommand({
            loadConfig: () => ({
                machineId: "machine-1",
                remoteSync: {
                    enabled: true,
                    repositoryUrl: "git@example.com:repo.git",
                    autoPull: false,
                    autoPush: false,
                },
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => true,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => "git@example.com:repo.git",
            }),
            auditRemoteEventLogs: async () => ({ eventLogFindings: 0 }),
        }, { json: true });
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])).status).toBe("ok");

        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
        result = await executeRemoteDoctorCommand({
            loadConfig: () => ({
                machineId: "local",
                remoteSync: {
                    enabled: false,
                    autoPull: false,
                    autoPush: false,
                },
            }) as any,
            createGitSyncer: () => ({
                isGitRepo: async () => false,
                initRepo: async () => true,
                configureRemote: async () => true,
                removeRemote: async () => true,
                getRemoteUrl: async () => null,
            }),
            auditRemoteEventLogs: async () => ({ eventLogFindings: 0 }),
        });
        expect(result.exitCode).toBe(2);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote configured:  no");
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Remote repository URL is not configured");

        const missingManifest = join(testDir, "restore-text-missing-manifest");
        mkdirSync(missingManifest, { recursive: true });
        consoleErrorSpy.mockClear();
        result = await executeRemoteRestoreCommand(missingManifest, realGitOptions());
        expect(result.exitCode).toBe(2);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("requires --confirm");

        result = await executeRemoteRestoreCommand(missingManifest, {
            ...realGitOptions(),
            backupDirOverride: join(testDir, "restore-text-rollback"),
        }, { confirm: true });
        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n"))
            .toContain("Remote backup manifest.json is missing");

        const noEventsBackup = join(testDir, "no-events-dir-backup");
        mkdirSync(noEventsBackup, { recursive: true });
        writeFileSync(join(noEventsBackup, "manifest.json"), JSON.stringify({
            schemaVersion: 1,
            kind: "memory.remoteSync.backup",
            backupId: "no-events-dir",
            createdAt: "2026-06-06T12:16:00.000Z",
            includesConfig: false,
            includesEvents: false,
            eventFileCount: 0,
            excludedPaths: [".git"],
        }));
        const absentEventsDir = join(testDir, "absent-events-dir");
        result = await executeRemoteRestoreCommand(noEventsBackup, {
            configPathOverride: join(testDir, "absent-config.json"),
            eventsDirOverride: absentEventsDir,
            backupDirOverride: join(testDir, "no-events-rollback"),
            now: () => new Date("2026-06-06T12:17:00.000Z"),
        }, { json: true, confirm: true });
        expect(result.exitCode).toBe(0);
        expect(existsSync(absentEventsDir)).toBe(false);
    });

    test("remote command default-parameter paths remain read-only before confirmation", async () => {
        let result = await executeRemoteSetCommand("git://example/repo.git", undefined, { json: true });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).errors.join("\n"))
            .toContain("Remote URL protocol is not supported");

        result = await executeRemoteStatusCommand(undefined, { json: true });
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).command).toBe("status");

        result = await executeRemotePreflightCommand("git://example/repo.git", undefined, { json: true });
        expect(result.exitCode).toBe(2);
        expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0])).command).toBe("preflight");

        result = await executeRemoteRestoreCommand(join(testDir, "unconfirmed-restore"));
        expect(result.exitCode).toBe(2);

        result = await executeRemoteRollbackCommand(join(testDir, "unconfirmed-rollback"));
        expect(result.exitCode).toBe(2);
    });
});
