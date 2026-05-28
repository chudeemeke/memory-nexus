/**
 * Remote CLI Command Tests
 *
 * Verifies set, remove, and status command execution, configuration state transitions,
 * and stderr/stdout output envelopes.
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    executeRemoteSetCommand,
    executeRemoteRemoveCommand,
    executeRemoteStatusCommand,
    createRemoteCommand,
} from "./remote.js";
import { runGit } from "../../../infrastructure/hooks/git-syncer.js";

describe("remote command", () => {
    let testDir: string;
    let configPath: string;
    let eventsDir: string;
    let mockRemoteDir: string;
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;

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

        // Initialize bare repo
        await runGit(["init", "--bare"], mockRemoteDir);
        await runGit(["symbolic-ref", "HEAD", "refs/heads/main"], mockRemoteDir);

        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
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
    });

    test("createRemoteCommand actions set process.exitCode from subcommand results", async () => {
        const originalExitCode = process.exitCode;
        try {
            process.exitCode = undefined;
            await createRemoteCommand({
                configPathOverride: configPath,
                eventsDirOverride: eventsDir,
            }).parseAsync(["node", "memory remote", "set", mockRemoteDir]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand({
                configPathOverride: configPath,
                eventsDirOverride: eventsDir,
            }).parseAsync(["node", "memory remote", "status"]);
            expect(process.exitCode).toBe(0);

            process.exitCode = undefined;
            await createRemoteCommand({
                configPathOverride: configPath,
                eventsDirOverride: eventsDir,
            }).parseAsync(["node", "memory remote", "remove"]);
            expect(process.exitCode).toBe(0);
        } finally {
            process.exitCode = originalExitCode;
        }
    });

    test("executeRemoteSetCommand initializes Git repo and configures URL", async () => {
        const result = await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
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
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Failed to configure Git remote");
    });

    test("executeRemoteSetCommand does not save config when local git initialization fails", async () => {
        let saveCalled = false;
        const result = await executeRemoteSetCommand("git@example/repo.git", {
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
        const result = await executeRemoteSetCommand("git@example/repo.git", {
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
            repositoryUrl: "git@example/repo.git",
            autoPush: false,
            autoPull: false,
        });
    });

    test("executeRemoteSetCommand defaults missing auto flags to enabled", async () => {
        let saved: any;
        const result = await executeRemoteSetCommand("git@example/repo.git", {
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
        const result = await executeRemoteSetCommand("git@example/repo.git", {
            loadConfig: () => {
                throw new Error("config unreadable");
            },
        });

        expect(result.exitCode).toBe(1);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
            .toContain("Error setting remote:");
    });

    test("executeRemoteSetCommand formats non-Error thrown values", async () => {
        const result = await executeRemoteSetCommand("git@example/repo.git", {
            loadConfig: () => {
                throw "config missing";
            },
        });

        expect(result.exitCode).toBe(1);
        const output = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
        expect(output).toContain("Error setting remote:");
        expect(output).toContain("config missing");
    });

    test("executeRemoteRemoveCommand disables sync and clears configuration", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        // Now remove
        const result = await executeRemoteRemoveCommand({
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
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

    test("executeRemoteStatusCommand renders status values correctly", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        const result = await executeRemoteStatusCommand({
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
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
                    repositoryUrl: "git@example/repo.git",
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
});
